/**
 * 管理端接口（内容管理后台）。
 *
 * 鉴权模型（有意保持最小，够用且可审计）：
 *   - 微信云托管：私有链路注入 OpenID，匹配 ADMIN_OPENIDS 白名单
 *   - 本地浏览器：可选 ADMIN_TOKEN，接口要求 Authorization: Bearer <token>
 *   - 令牌用 timingSafeEqual 比较，避免时序侧信道
 *   - 登录失败按 IP 限流并锁定，防在线爆破
 *   - ADMIN_TOKEN 为空 → 所有管理接口 403，防止「忘了配」变成裸奔
 *   没有做多账号 / 角色 / 令牌过期 —— 单人或小团队运营够用；
 *   一旦需要多人协作与权限分级，这里要换成账号体系（见 README 的后续规划）。
 *
 * 路由：
 *   POST /api/admin/login             校验令牌
 *   GET  /api/admin/overview          概览（版本、内容条数、索引、审计、存储）
 *   GET  /api/admin/schema            字段描述（管理端据此渲染表单）
 *   GET  /api/admin/content/:type     读取某类内容
 *   PUT  /api/admin/content/:type     发布某类内容（整体替换）
 *   GET  /api/admin/journal           最近的内容变更记录
 *   POST /api/admin/rollback          回滚到上一版
 *   POST /api/admin/reseed            用内置数据重新播种
 *   GET  /api/admin/audit             审计留痕（落盘版，可跨重启）
 *   GET  /api/admin/raw-audit         仅内存的最近审计（排查用）
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const cfg = require('./config.js');
const content = require('./content.js');
const schema = require('./content-schema.js');
const safety = require('./safety.js');
const auditStore = require('./audit-store.js');
const rag = require('./rag.js');
const session = require('./session.js');
const http = require('./http-util.js');

const ADMIN_HTML = path.join(__dirname, '..', 'public', 'admin.html');

/* ---------------- 登录限流 ---------------- */

const LOGIN_STATE = new Map();

/** 客户端 IP：统一走 http-util，避免与限流器取到不同的值 */
function clientIp(req) {
  return http.clientIp(req);
}

function loginLockRemain(ip) {
  const st = LOGIN_STATE.get(ip);
  if (!st || !st.until) return 0;
  const left = st.until - Date.now();
  if (left <= 0) { LOGIN_STATE.delete(ip); return 0; }
  return left;
}

function noteLoginFail(ip) {
  const st = LOGIN_STATE.get(ip) || { fails: 0, until: 0 };
  st.fails += 1;
  if (st.fails >= cfg.admin.maxLoginFails) {
    st.until = Date.now() + cfg.admin.lockMs;
    st.fails = 0;
    console.warn('[admin] 登录失败次数过多，已锁定 ' + ip + ' ' + Math.round(cfg.admin.lockMs / 1000) + ' 秒');
  }
  LOGIN_STATE.set(ip, st);
}

function noteLoginOk(ip) {
  LOGIN_STATE.delete(ip);
}

/* ---------------- 令牌比较 ---------------- */

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function tokenFrom(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

function adminReady() {
  return !!cfg.admin.token || cfg.admin.openids.length > 0;
}

function cloudIdentity(req) {
  if (cfg.session.identityMode !== 'cloudbase') return '';
  const openid = String(req.headers['x-wx-openid'] || '').trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(openid) ? openid : '';
}

function isCloudAdmin(req) {
  const id = cloudIdentity(req);
  return !!id && cfg.admin.openids.indexOf(id) !== -1;
}

function adminActor(req, fallback) {
  if (!isCloudAdmin(req)) return fallback || clientIp(req);
  return 'wx:' + crypto.createHash('sha256').update(cloudIdentity(req)).digest('hex').slice(0, 12);
}

/** @returns {null|{status:number, body:object}} null 表示鉴权通过 */
function authGuard(req) {
  if (!adminReady()) {
    return {
      status: 403,
      body: {
        ok: false,
        error: '管理端未启用',
        hint: '请在云托管私有服务中配置 ADMIN_OPENIDS 和持久化存储'
      }
    };
  }
  if (!isCloudAdmin(req) && !(cfg.admin.token && safeEqual(tokenFrom(req), cfg.admin.token))) {
    return { status: 401, body: { ok: false, error: '令牌无效或已过期，请重新登录' } };
  }
  return null;
}

/* ---------------- 概览 ---------------- */

function overview() {
  const meta = content.meta();
  return {
    ok: true,
    content: meta,
    index: { chunks: rag._state.chunks.length, vocab: Object.keys(rag._state.idf).length },
    session: session.stats(),
    audit: auditStore.stats(),
    storage: { backend: cfg.storage.backend, dir: cfg.storage.backend === 'file' ? cfg.storage.dir : undefined },
    model: { provider: cfg.llm.baseUrl, model: cfg.llm.model, configured: !!cfg.llm.apiKey },
    guard: {
      loginLockThreshold: cfg.admin.maxLoginFails,
      loginLockMs: cfg.admin.lockMs
    }
  };
}

/* ---------------- 路由 ---------------- */

function readAdminHtml() {
  try {
    return fs.readFileSync(ADMIN_HTML, 'utf8');
  } catch (e) {
    return null;
  }
}

function sendAdminError(res, error) {
  if (error.status === 400 || error.status === 413) {
    return http.sendJSON(res, error.status, { ok: false, error: error.message });
  }
  console.error('[admin] 请求失败：' + error.message);
  return http.sendJSON(res, 503, { ok: false, error: '内容存储暂不可用，请稍后重试' });
}

/**
 * @param {object} req
 * @param {object} res
 * @param {URL} url
 * @returns {boolean|Promise<boolean>} true 表示已接管该请求
 */
function route(req, res, url) {
  const pathname = url.pathname;

  /* 管理页面本身不鉴权：它只是个静态外壳，真正的数据都要带令牌才能拿 */
  if (pathname === '/admin' || pathname === '/admin/') {
    if (!cfg.admin.token) return http.sendText(res, 404, '管理网页未启用'), true;
    const html = readAdminHtml();
    if (html === null) return http.sendText(res, 500, 'admin.html 缺失，请确认 server/public/admin.html 已随镜像发布'), true;
    return http.sendHTML(res, 200, html), true;
  }

  if (pathname.indexOf('/api/admin/') !== 0) return false;

  if (pathname === '/api/admin/status' && req.method === 'GET') {
    const identity = cloudIdentity(req);
    return http.sendJSON(res, identity ? 200 : 401, {
      ok: !!identity,
      authorized: isCloudAdmin(req),
      openid: identity || undefined
    }), true;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, http.corsHeaders());
    return res.end(), true;
  }

  /* 登录接口在鉴权之外，但要限流 */
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const left = loginLockRemain(ip);
    if (left > 0) {
      return http.sendJSON(res, 429, {
        ok: false,
        error: '尝试次数过多，请 ' + Math.ceil(left / 1000) + ' 秒后重试'
      }), true;
    }
    if (!cfg.admin.token) return http.sendJSON(res, 403, { ok: false, error: '浏览器令牌登录未启用' }), true;

    return http.readBody(req, 8 * 1024).then(function (body) {
      if (safeEqual(body.token, cfg.admin.token)) {
        noteLoginOk(ip);
        safety.audit('admin:login', { ip: ip }, { ok: true });
        return http.sendJSON(res, 200, { ok: true, content: content.meta() });
      }
      noteLoginFail(ip);
      safety.audit('admin:login', { ip: ip }, { ok: false });
      const remain = Math.ceil(loginLockRemain(ip) / 1000);
      return http.sendJSON(res, 401, {
        ok: false,
        error: remain > 0 ? '令牌错误，已锁定 ' + remain + ' 秒' : '令牌错误'
      });
    }).catch(function (e) {
      return http.sendJSON(res, 400, { ok: false, error: e.message });
    }), true;
  }

  const denied = authGuard(req);
  if (denied) return http.sendJSON(res, denied.status, denied.body), true;

  /* ---- 以下均需有效令牌 ---- */

  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    return http.sendJSON(res, 200, overview()), true;
  }

  if (pathname === '/api/admin/schema' && req.method === 'GET') {
    const cons = content.getType('constitutions') || [];
    return http.sendJSON(res, 200, {
      ok: true,
      schema: schema.publicSchema(cons.map(function (c) { return { id: c.id, name: c.name }; })),
      types: require('../../utils/content-overlay.js').TYPES
    }), true;
  }

  if (pathname === '/api/admin/journal' && req.method === 'GET') {
    return Promise.resolve(content.recentJournal(Math.min(200, Number(url.searchParams.get('n') || 30))))
      .then(function (items) { http.sendJSON(res, 200, { ok: true, items: items }); })
      .catch(function (e) { sendAdminError(res, e); }), true;
  }

  if (pathname === '/api/admin/audit' && req.method === 'GET') {
    const n = Math.min(500, Number(url.searchParams.get('n') || 50));
    return http.sendJSON(res, 200, { ok: true, items: auditStore.recent(n), stats: auditStore.stats() }), true;
  }

  /**
   * 内存环形缓冲里的最近审计（未落盘的那部分，排查用）。
   * 原先这是一个**无需令牌**的公开接口 `/api/agent/audit`，而条目里的 input
   * 就是用户输入的原文 —— 等于把线上用户的健康类对话片段公开在互联网上。
   * 现已下线，只保留这个带鉴权的版本。
   */
  if (pathname === '/api/admin/raw-audit' && req.method === 'GET') {
    const n = Math.min(500, Number(url.searchParams.get('n') || 50));
    return http.sendJSON(res, 200, { ok: true, items: safety.recentAudit(n) }), true;
  }

  if (pathname === '/api/admin/rollback' && req.method === 'POST') {
    return http.readBody(req, 8 * 1024).then(async function (body) {
      const r = await content.rollback(adminActor(req, body.actor || 'admin'));
      safety.audit('admin:rollback', {}, r);
      return http.sendJSON(res, r.ok ? 200 : 409, r.ok ? Object.assign({ ok: true }, r) : r);
    }).catch(function (e) { return sendAdminError(res, e); }), true;
  }

  if (pathname === '/api/admin/reseed' && req.method === 'POST') {
    return http.readBody(req, 8 * 1024).then(async function (body) {
      if (body.confirm !== 'RESEED') {
        return http.sendJSON(res, 400, { ok: false, error: '需要 body.confirm = "RESEED" 才会执行，避免误触' });
      }
      const r = await content.reseed(adminActor(req, body.actor || 'admin'));
      safety.audit('admin:reseed', {}, r);
      return http.sendJSON(res, r.ok ? 200 : 500, r.ok ? Object.assign({ ok: true }, r) : r);
    }).catch(function (e) { return sendAdminError(res, e); }), true;
  }

  const m = /^\/api\/admin\/content\/([a-z]+)$/.exec(pathname);
  if (m) {
    const type = m[1];
    const types = require('../../utils/content-overlay.js').TYPES;
    if (types.indexOf(type) < 0) {
      return http.sendJSON(res, 404, { ok: false, error: '未知内容类型：' + type, allowed: types }), true;
    }

    if (req.method === 'GET') {
      return http.sendJSON(res, 200, {
        ok: true,
        type: type,
        version: content.meta().version,
        value: content.getType(type)
      }), true;
    }

    if (req.method === 'PUT') {
      return http.readBody(req, 4 * 1024 * 1024).then(async function (body) {
        const value = body.value !== undefined ? body.value : body;
        const actor = adminActor(req, body.actor || clientIp(req));
        const r = await content.save(type, value, actor, body.baseVersion);
        safety.audit('admin:save:' + type, { actor: actor }, {
          ok: r.ok, version: r.version, count: r.count,
          errors: (r.errors || []).map(function (e) { return e.path + ' ' + e.message; }).slice(0, 10)
        });
        return http.sendJSON(res, r.ok ? 200 : (r.conflict ? 409 : 422), r.ok ? Object.assign({ ok: true, type: type }, r) : r);
      }).catch(function (e) { return sendAdminError(res, e); }), true;
    }
  }

  return http.sendJSON(res, 404, { ok: false, error: '管理接口不存在：' + pathname }), true;
}

module.exports = {
  route: route,
  overview: overview,
  authGuard: authGuard,
  _loginState: LOGIN_STATE
};
