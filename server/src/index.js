/**
 * 茶历方 Agent 服务入口（HTTP 使用 Node 内置模块；MySQL 存储使用 mysql2）。
 *
 * 接口一览
 *   公开
 *   GET  /health                     健康检查 + 索引与内容版本
 *   GET  /api/content                内容下发（小程序启动时按版本号拉取）
 *   POST /api/agent/chat             流式对话（text/event-stream）
 *   POST /api/agent/chat.json        非流式对话（便于联调 / 小程序降级）
 *   POST /api/agent/assess           体质量表评分（服务端复核）
 *   POST /api/agent/recommend        直接按条件取茶方
 *   POST /api/agent/feedback         记录喝茶体感（会话内，不落盘）
 *   POST /api/agent/retrieve         RAG 检索调试（展示召回与打分）
 *   GET  /api/agent/knowledge        食材科普查询
 *
 *   管理端（需 Authorization: Bearer <ADMIN_TOKEN>，详见 src/admin.js）
 *   GET  /admin                       管理页面
 *   POST /api/admin/login             登录
 *   GET  /api/admin/overview          概览
 *   GET  /api/admin/schema            字段描述
 *   GET  /api/admin/content/:type     读取某类内容
 *   PUT  /api/admin/content/:type     发布某类内容
 *   GET  /api/admin/journal           内容变更记录
 *   POST /api/admin/rollback          回滚上一版
 *   POST /api/admin/reseed            重新播种
 *   GET  /api/admin/audit             审计留痕（落盘版）
 *   GET  /api/admin/raw-audit         仅内存的最近审计（排查用）
 *
 * 注意：原先的 GET /api/agent/audit 已下线 —— 它无需令牌即返回用户输入原文。
 *       需要该视图请走带鉴权的 /api/admin/raw-audit。
 */
const http = require('http');
const { URL } = require('url');

const cfg = require('./config.js');
const llm = require('./llm.js');
const prompt = require('./prompt.js');
const tools = require('./tools.js');
const safety = require('./safety.js');
const session = require('./session.js');
const rag = require('./rag.js');
const content = require('./content.js');
const admin = require('./admin.js');
const httpUtil = require('./http-util.js');
const ratelimit = require('./ratelimit.js');

const engine = require('../../utils/engine.js');
const agent = require('../../utils/agent.js');
const feedback = require('../../utils/feedback.js');
const knowledgePush = require('../../utils/knowledge-push.js');
const CONSTITUTIONS = require('../../data/constitutions.js');
const TEAS = require('../../data/teas.js');
const KNOWLEDGE = require('../../data/knowledge.js');

const STARTED_AT = Date.now();

/* ---------------- 通用工具 ---------------- */

function sendJSON(res, status, data) {
  return httpUtil.sendJSON(res, status, data);
}

function readBody(req, limit) {
  return httpUtil.readBody(req, limit || 256 * 1024);
}

function requestOwner(req) {
  if (cfg.session.identityMode !== 'cloudbase') return '';
  // 只可在微信云托管私有链路、公网访问关闭时信任此网关注入的头。
  const openid = String(req.headers['x-wx-openid'] || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(openid)) {
    const e = new Error('缺少微信云托管用户身份');
    e.status = 401;
    throw e;
  }
  return openid;
}

function publicCtx(ctx) {
  return { lastTeas: ctx.lastTeas || [], flags: ctx.flags || {} };
}

/**
 * 把一次 RAG 命中的 chunk 映射成「科普推送」条目。
 * 只认能跳到详情页的三种类型（食材 / 体质 / 常识）；茶方命中不推 ——
 * 茶方本身已经以卡片形式出现在对话里了，再推一次是噪音。
 * @returns {null|{kind:string,id:string,title:string,desc:string,tag:string}}
 */
function hitToPushItem(hit) {
  if (!hit) return null;
  const meta = hit.meta || {};
  if (hit.type === 'ingredient' && meta.ingredientId) {
    const ing = KNOWLEDGE.ingredients.filter(function (i) { return i.id === meta.ingredientId; })[0];
    if (!ing) return null;
    return { kind: 'ingredient', id: ing.id, title: ing.name, desc: ing.effect, tag: ing.nature };
  }
  if (hit.type === 'constitution' && meta.constitutionId) {
    const c = CONSTITUTIONS.get(meta.constitutionId);
    if (!c) return null;
    return { kind: 'constitution', id: c.id, title: c.name, desc: c.short || c.brief, tag: '体质' };
  }
  if (hit.type === 'faq' && hit.docId) {
    const idx = String(hit.docId).split(':')[1];
    if (idx === undefined || idx === '') return null;
    const f = KNOWLEDGE.faq[Number(idx)];
    if (!f) return null;
    const a = String(f.a || '');
    return { kind: 'faq', id: String(idx), title: f.q, desc: a.slice(0, 60) + (a.length > 60 ? '…' : ''), tag: '常识' };
  }
  return null;
}

/**
 * 本轮结束后的科普推送。
 *
 * 为什么由服务端主导：服务端掌握**本轮真实检索过什么**（search_knowledge 的命中），
 * 比端上按「体质 + 关键词」猜要准。端上保留同一套挑选器作为本地模式的兜底
 * （utils/knowledge-push.js 是两端共用的同一份实现），且端上在收到服务端推送后
 * 不会再补推（见 pages/chat/chat.js 的 _serverPushed），避免重复两条。
 */
function buildKnowledgePush(ctx, input, hits) {
  const items = [];
  const keys = [];
  const seen = {};

  function put(it, key) {
    if (!it || !it.id || seen[it.kind + ':' + it.id]) return;
    if (items.length >= 3) return;
    seen[it.kind + ':' + it.id] = 1;
    items.push(it);
    keys.push(key);
  }

  (hits || []).forEach(function (h) {
    put(hitToPushItem(h), h.kind + ':' + h.id);
  });

  const auto = knowledgePush.build({
    teas: ctx.lastTeas || [],
    constitutionId: (ctx.profile && ctx.profile.constitutionId) || '',
    keywords: [input || '']
  });
  if (auto) auto.items.forEach(function (it) { put(it, it.kind + ':' + it.id); });

  if (!items.length) return null;
  return {
    type: 'knowledge',
    title: '顺带了解',
    subtitle: '这些内容和你刚聊到的话题有关',
    items: items,
    topicKey: keys.join('|')
  };
}

/**
 * 服务端侧的「档案最小化」二次兜底。
 *
 * 端上已经做了同样的裁剪（utils/agent-remote.js 的 minimalProfile），但不能只靠端上：
 * 旧版本客户端、被篡改的请求都可能直接塞进完整的 basic（性别/年龄/孕期/慢性病/过敏史）。
 * 服务端不能因为「客户端应该已经处理过」就把敏感字段原样带进 prompt 送给模型。
 *
 * 之所以保留 risk 标记而不是一并丢掉：下游要靠它决定
 * 「是否必须先做风险提示、是否不给具体配方」，删了等于把合规安全网一起删掉。
 */
function stripSensitiveProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  if (p.constitutionId) out.constitutionId = p.constitutionId;
  if (p.secondaryId) out.secondaryId = p.secondaryId;
  if (typeof p.percent === 'number') out.percent = p.percent;
  if (p.levelText) out.levelText = p.levelText;

  const risk = {};
  // 新客户端：直接给的就是标记
  if (p.risk && typeof p.risk === 'object') {
    ['stage', 'chronic', 'allergy'].forEach(function (k) {
      if (p.risk[k]) risk[k] = true;
    });
  }
  // 旧客户端：给的是原值 —— 就地降维成标记，原值一律丢弃。
  // 不能只是「删掉 basic 了事」：那会把「先做风险提示、不给具体配方」的
  // 合规安全网一起删掉，旧版本用户反而失去保护。
  const b = p.basic;
  if (b && typeof b === 'object') {
    if (b.stage && b.stage !== '无') risk.stage = true;
    if (Array.isArray(b.conditions) && b.conditions.filter(function (x) {
      return x && x !== '以上都没有';
    }).length) risk.chronic = true;
    if (b.allergy) risk.allergy = true;
  }
  if (Object.keys(risk).length) out.risk = risk;
  return out;
}

/* ---------------- 核心：Agent 编排 ---------------- */

/**
 * @param {object} body  { sessionId, message, profile, context }
 * @param {{onDelta:Function, onBlock:Function, onMeta:Function, signal:AbortSignal}} sink
 */
async function runAgent(body, sink, owner) {
  const t0 = Date.now();
  const input = String(body.message || '').trim().slice(0, 500);
  const session_ = session.get(body.sessionId, owner);
  const ctx = session_.ctx;

  // 档案一律先做最小化裁剪，绝不把端上可能带过来的敏感字段直接塞进 prompt
  const safeProfile = stripSensitiveProfile(body.profile);
  if (safeProfile && safeProfile.constitutionId) ctx.profile = safeProfile;
  if (body.context) {
    if (Array.isArray(body.context.lastTeas)) ctx.lastTeas = body.context.lastTeas;
    if (body.context.flags) ctx.flags = Object.assign({}, ctx.flags, body.context.flags);
    // 体感记录同样不信任端上：枚举降级、控制字符剔除、限长后才进会话与提示词
    if (Array.isArray(body.context.feedback)) {
      session.putFeedback(session_, feedback.sanitizeIncoming(body.context.feedback, 20));
    }
  }

  const meta = {
    model: cfg.llm.model,
    mode: 'llm',
    sessionId: session_.id,
    retrieval: rag._state.embeddings ? 'hybrid' : 'sparse',
    chunks: rag._state.chunks.length
  };
  sink.onMeta && sink.onMeta(meta);

  if (!input) {
    sink.onBlock({ type: 'text', text: '你可以直接说说最近的感受，比如「总是没力气」「手脚冰凉」或者「最近老睡不好」。' });
    return { ctx: publicCtx(ctx), meta: meta, text: '' };
  }

  /* ---- 第一层：入站风控，命中即短路，不进模型 ---- */
  const blocked = safety.preCheck(input, ctx);
  if (blocked) {
    safety.audit('preCheck', { input: input }, blocked.reason);
    blocked.blocks.forEach(function (b) { sink.onBlock(b); });
    meta.mode = 'safety-short-circuit';
    meta.blocked = blocked.kind;
    meta.latencyMs = Date.now() - t0;
    return { ctx: publicCtx(ctx), meta: meta, text: blocked.blocks[0].text || '' };
  }

  /* ---- 组装消息 ---- */
  const hints = safety.riskHints(input, ctx);
  const system = prompt.SYSTEM_PROMPT +
    '\n\n【运行时上下文】\n' + prompt.runtimeContext(ctx) +
    (hints.length
      ? '\n\n注意：本轮检测到风险信号（' + hints.join('、') + '），请先调用 flag_risk 输出风险提示，再决定后续动作。'
      : '');

  const messages = [{ role: 'system', content: system }]
    .concat(session.history(session_))
    .concat([{ role: 'user', content: input }]);

  const sanitizer = safety.makeStreamSanitizer(function (txt) { sink.onDelta(txt); });
  const blocks = [];
  const calledTools = [];
  const retrievedHits = [];
  let fullText = '';
  let rounds = 0;
  let usedFallback = false;
  let reasoningChars = 0;

  try {
    while (rounds <= cfg.llm.maxToolRounds) {
      const r = await llm.chatStream({
        messages: messages,
        tools: tools.TOOLS,
        onDelta: function (d) { sanitizer.push(d); },
        signal: sink.signal
      });
      sanitizer.flush();
      if (r.content) fullText += r.content;
      reasoningChars += r.reasoningChars || 0;

      if (!r.toolCalls.length) break;

      messages.push({
        role: 'assistant',
        content: r.content || '',
        tool_calls: r.toolCalls.map(function (c) {
          return { id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } };
        })
      });

      for (let i = 0; i < r.toolCalls.length; i++) {
        const tc = r.toolCalls[i];
        const out = await tools.run(tc.name, tc.arguments, ctx);
        calledTools.push({ name: tc.name, ok: !!(out.result && out.result.ok) });
        // 记录本轮真正检索到的知识：结束时的科普推送优先推这些（比猜更准）
        if (tc.name === 'search_knowledge' && out.result && Array.isArray(out.result.hits)) {
          out.result.hits.forEach(function (h) { retrievedHits.push(h); });
        }
        out.blocks.forEach(function (b) {
          blocks.push(b);
          sink.onBlock(b);
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify(out.result).slice(0, 4000)
        });
      }
      rounds += 1;
    }

    // 工具轮次用尽仍未收口 → 强制一次「不带工具」的总结，保证有自然语言回答
    if (rounds > cfg.llm.maxToolRounds) {
      const final = await llm.chatStream({
        messages: messages.concat([{ role: 'system', content: '请基于上面的工具结果直接用中文回答用户，不要再调用工具。' }]),
        tools: [],
        onDelta: function (d) { sanitizer.push(d); },
        signal: sink.signal
      });
      sanitizer.flush();
      fullText += final.content || '';
      reasoningChars += final.reasoningChars || 0;
    }
  } catch (e) {
    safety.audit('llm:error', { input: input }, e.message);
    if (!fullText && !blocks.length) {
      // 模型不可用 → 回落本地规则引擎，用户侧无感
      usedFallback = true;
      const local = agent.respond(input, { profile: ctx.profile, lastTeas: ctx.lastTeas, flags: ctx.flags });
      ctx.lastTeas = local.ctx.lastTeas || ctx.lastTeas;
      ctx.flags = local.ctx.flags || ctx.flags;
      local.messages.forEach(function (m) {
        blocks.push(m);
        sink.onBlock(m);
      });
      meta.mode = 'local-fallback';
      meta.fallbackReason = e.message;
    } else {
      sink.onBlock({ type: 'text', text: '刚才的回答被中断了，你可以再问一次。' });
      meta.mode = 'llm-partial';
    }
  }

  /* ---- 出站：补免责声明 ---- */
  const hasNotice = blocks.some(function (b) {
    return b.type === 'notice' && String(b.text).indexOf(agent.DISCLAIMER) > -1;
  });
  // 只要本轮给了建议或查了知识（blocks 或工具调用非空），就必须补免责声明
  if ((blocks.length || calledTools.length) && !hasNotice && !usedFallback) {
    sink.onBlock({ type: 'notice', text: agent.DISCLAIMER, tone: 'warn' });
  }

  /* ---- 出站：科普推送（联动知识库）----
   * 放在最后一屏之后，作为「顺带了解」递到用户手边。
   * 本地兜底模式刻意不推：那种情况下端上会用同一份挑选器自己补推，
   * 服务端再插一条就重复了。 */
  if (!usedFallback && (blocks.length || calledTools.length)) {
    const kb = buildKnowledgePush(ctx, input, retrievedHits);
    const blk = tools.knowledgeBlock(kb);
    if (blk) {
      blocks.push(blk);
      sink.onBlock(blk);
    }
  }

  /* ---- 会话记忆 ---- */
  session.push(session_, 'user', input);
  if (fullText) session.push(session_, 'assistant', fullText);

  const cleanText = sanitizer.flush();
  meta.rounds = rounds;
  meta.tools = calledTools;
  meta.reasoningChars = reasoningChars;
  meta.sanitized = cleanText && cleanText.replaced ? cleanText.replaced : [];
  meta.latencyMs = Date.now() - t0;
  safety.audit('chat', { input: input, tools: calledTools }, { mode: meta.mode, blocks: blocks.map(function (b) { return b.type; }) });

  return { ctx: publicCtx(ctx), meta: meta, text: fullText };
}

/* ---------------- 路由 ---------------- */

async function handleChat(req, res, stream) {
  const owner = requestOwner(req);
  const body = await readBody(req);
  if (cfg.session.identityMode === 'cloudbase' && !body.sessionId) {
    const e = new Error('缺少会话标识');
    e.status = 400;
    throw e;
  }

  if (!stream) {
    const collected = { blocks: [], text: '', meta: null, ctx: null };
    const out = await runAgent(body, {
      onMeta: function (m) { collected.meta = m; },
      onDelta: function (d) { collected.text += d; },
      onBlock: function (b) { collected.blocks.push(b); }
    }, owner);
    collected.ctx = out.ctx;
    collected.meta = out.meta || collected.meta;
    if (!collected.text && !collected.blocks.length && out.text) collected.text = out.text;
    return sendJSON(res, 200, { ok: true, ...collected });
  }

  res.writeHead(200, Object.assign({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  }, httpUtil.corsHeaders()));

  const ac = new AbortController();
  let closed = false;
  // IncomingMessage 的 close 在 POST 请求体读取完成后也会触发；
  // 只有响应连接关闭才表示客户端离开，不能在正常生成开始前取消模型。
  res.on('close', function () {
    if (!res.writableEnded) { closed = true; ac.abort(); }
  });

  const write = function (event, data) {
    if (closed) return;
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };

  try {
    const out = await runAgent(body, {
      signal: ac.signal,
      onMeta: function (m) { write('meta', m); },
      onDelta: function (d) { write('delta', { text: d }); },
      onBlock: function (b) { write('block', b); }
    }, owner);
    write('done', { ctx: out.ctx, meta: out.meta });
  } catch (e) {
    write('error', { message: e.message || '服务异常' });
  }
  res.end();
}

function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, httpUtil.corsHeaders());
    return res.end();
  }

  /* ---- 管理端（含 /admin 页面）先接管，避免和业务路由抢路径 ---- */
  if (admin.route(req, res, url)) return;

  /* ---- 内容下发：小程序启动时按版本号增量拉取 ---- */
  if (path === '/api/content' && req.method === 'GET') {
    if (!ratelimit.guard(req, res, 'api')) return;
    return sendJSON(res, 200, content.payloadFor(url.searchParams.get('version')));
  }

  if (path === '/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      ok: true,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      provider: cfg.llm.baseUrl,
      model: cfg.llm.model,
      thinking: cfg.llm.thinking || 'auto',
      llmConfigured: !!cfg.llm.apiKey,
      index: { chunks: rag._state.chunks.length, vocab: Object.keys(rag._state.idf).length },
      retrieval: rag._state.embeddings ? 'hybrid(vector+keyword)' : 'sparse(tf-idf)',
      knowledge: { constitutions: CONSTITUTIONS.list.length, teas: TEAS.total },
      content: content.meta(),
      session: session.stats(),
      rateLimit: ratelimit.stats()
    });
  }

  if (path === '/api/agent/chat' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'chat')) return;
    return handleChat(req, res, true).catch(function (e) { if (!res.headersSent) sendJSON(res, e.status || 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/chat.json' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'chat')) return;
    return handleChat(req, res, false).catch(function (e) { if (!res.headersSent) sendJSON(res, e.status || 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/session' && req.method === 'DELETE') {
    if (!ratelimit.guard(req, res, 'api')) return;
    let owner;
    try { owner = requestOwner(req); }
    catch (e) { return sendJSON(res, e.status || 401, { ok: false, error: e.message }); }
    return readBody(req).then(function (body) {
      if (!body.sessionId) return sendJSON(res, 400, { ok: false, error: '缺少会话标识' });
      session.remove(body.sessionId, owner);
      return sendJSON(res, 200, { ok: true });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/assess' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'api')) return;
    return readBody(req).then(function (body) {
      const answers = body.answers;
      if (!Array.isArray(answers) || !answers.length) {
        return sendJSON(res, 400, { ok: false, error: 'answers 必须是数组，元素为题项得分 0-4' });
      }
      const r = engine.analyze(answers);
      safety.audit('assess', { count: answers.length }, { main: r.main, percent: r.percent });
      return sendJSON(res, 200, { ok: true, result: r });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/feedback' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'chat')) return;
    let owner;
    try { owner = requestOwner(req); }
    catch (e) { return sendJSON(res, e.status || 401, { ok: false, error: e.message }); }
    return readBody(req).then(function (body) {
      // 端上只在「已开启 AI 增强 + 单独同意」时才会走到这里；
      // 服务端仍然按不可信输入处理：枚举降级、控制字符剔除、限长。
      const rec = feedback.normalize(body || {});
      if (!rec.teaId && !rec.teaName) {
        return sendJSON(res, 400, { ok: false, error: '缺少茶方标识' });
      }
      if (cfg.session.identityMode === 'cloudbase' && !body.sessionId) return sendJSON(res, 400, { ok: false, error: '缺少会话标识' });
      const s = session.get(body.sessionId, owner);
      const total = session.putFeedback(s, [rec]);
      const score = feedback.biasFromList(s.ctx.feedback, rec.constitutionId);
      // 留痕只记结构化字段：自由描述属用户原话，不写进审计日志
      safety.audit('feedback', {
        teaId: rec.teaId, effect: rec.effect,
        feelings: rec.feelings.length, hasNote: !!rec.note, taste: rec.taste
      }, { total: total });
      return sendJSON(res, 200, {
        ok: true,
        count: total,
        preference: {
          favorTeas: Object.keys(score.boost).filter(function (k) { return k.indexOf('#tag:') !== 0; }),
          avoidTeas: (score.dislikedTeas || []).concat(Object.keys(score.penalty).filter(function (k) { return k.indexOf('#tag:') !== 0; }))
        }
      });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/recommend' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'api')) return;
    return readBody(req).then(function (body) {
      const cid = body.constitution_id || 'pinghe';
      if (!CONSTITUTIONS.get(cid)) return sendJSON(res, 400, { ok: false, error: '未知体质 id' });
      const list = engine.recommend(cid, {
        season: body.season || engine.seasonOf(),
        limit: Math.min(3, Math.max(1, body.count || 2)),
        exclude: body.exclude_ids || []
      });
      return sendJSON(res, 200, {
        ok: true,
        season: body.season || engine.seasonOf(),
        teas: list.map(function (t) {
          return { id: t.id, name: t.name, subtitle: t.subtitle, nature: t.nature, effects: t.effects, scenes: t.scenes };
        })
      });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/retrieve' && req.method === 'POST') {
    if (!ratelimit.guard(req, res, 'api')) return;
    return readBody(req).then(function (body) {
      return rag.retrieve(body.query || '', { topK: body.top_k || ctxTopK() }).then(function (r) {
        return sendJSON(res, 200, { ok: true, mode: r.mode, query: r.query, hits: r.hits });
      });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/knowledge' && req.method === 'GET') {
    if (!ratelimit.guard(req, res, 'api')) return;
    const q = url.searchParams.get('q') || '';
    return sendJSON(res, 200, {
      ok: true,
      ingredients: require('../../data/knowledge.js').ingredients.filter(function (i) {
        return !q || i.name.indexOf(q) > -1;
      })
    });
  }

  sendJSON(res, 404, { ok: false, error: '接口不存在：' + path });
}

function ctxTopK() { return cfg.retriever.topK; }

/* ---------------- 启动 ---------------- */

const server = http.createServer(async function (req, res) {
  try {
    // MySQL 多实例发布后，本实例按短 TTL 检查版本；数据库不可用时不继续返回旧内容。
    await content.sync();
    const maybe = route(req, res);
    if (maybe && typeof maybe.catch === 'function') {
      maybe.catch(function (e) {
        console.error('[request] ' + e.message);
        if (!res.headersSent) sendJSON(res, 500, { ok: false, error: '服务暂不可用，请稍后重试' });
        else res.end();
      });
    }
  } catch (e) {
    console.error('[request] ' + e.message);
    if (!res.headersSent) sendJSON(res, 503, { ok: false, error: '内容服务暂不可用，请稍后重试' });
    else res.end();
  }
});

async function start() {
  if (process.env.NODE_ENV === 'production' && cfg.session.identityMode !== 'cloudbase') {
    throw new Error('生产环境必须设置 SESSION_IDENTITY_MODE=cloudbase，并关闭服务公网访问');
  }
  if (process.env.NODE_ENV === 'production' && !cfg.llm.apiKey) {
    throw new Error('生产环境缺少 LLM_API_KEY，AI 增强无法提供服务');
  }
  // 先加载内容：会把管理后台发布过的内容覆盖到 data/*.js，并重建检索索引。
  // 顺序不能反 —— 索引必须建立在「最终生效的内容」之上。
  await content.init();
  if (cfg.embedding.enabled) {
    console.log('向量检索已启用，索引构建在后台进行');
  }

  setInterval(function () {
    const n = session.prune();
    if (n) console.log('清理过期会话 ' + n + ' 个');
  }, 5 * 60 * 1000).unref();

  server.listen(cfg.port, cfg.host, function () {
    console.log('茶历方 Agent 服务 → http://' + cfg.host + ':' + cfg.port);
    console.log('模型：' + cfg.llm.model + (cfg.llm.apiKey ? '' : '（未配置 LLM_API_KEY，将走本地规则兜底）'));
    console.log('管理入口：' + (cfg.admin.openids.length ? '小程序私有链路（OpenID 白名单）'
      : (cfg.admin.token ? '本地浏览器 /admin' : '未启用')));
  });
}

if (require.main === module) {
  start().catch(function (e) {
    console.error('[startup] ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { runAgent: runAgent, server: server };
