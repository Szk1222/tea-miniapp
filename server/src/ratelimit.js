/**
 * 进程内限流器（固定窗口计数）。
 *
 * 存在意义：对话接口会调用大模型，而模型额度记在**开发者账号**上。
 * 限额的目标是控制模型调用成本，不代替云平台防护或账单告警。
 *
 * 已知局限（部署时必须知道）：
 *   1. **单进程、内存态**。多实例部署时各限各的，阈值等价于乘以实例数；
 *      要精确全局限流，请放到 Nginx（limit_req）或共享存储（Redis）。
 *   2. 云托管私有链路按网关注入的 OpenID 限流，要求服务关闭公网访问；
 *      旧式自建代理模式按 IP，必须由代理覆写 X-Forwarded-For。
 *   3. 固定窗口在窗口边界存在最多 2 倍突发，对本场景（防刷量）足够。
 */
const cfg = require('./config.js');

/** key = `${ip}|${bucket}` → { count, resetAt } */
const BUCKETS = new Map();

/** 从请求中取客户端 IP。优先级：反向代理写入的头 → 直连地址 */
function clientIp(req) {
  if (cfg.session.identityMode === 'cloudbase') {
    const openid = String(req.headers['x-wx-openid'] || '');
    return /^[A-Za-z0-9_-]{8,128}$/.test(openid) ? 'wx:' + openid : 'wx:missing';
  }
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** 淘汰过期窗口；若仍超出跟踪上限，按插入顺序丢弃最旧的一批 */
function sweep() {
  const now = Date.now();
  BUCKETS.forEach(function (b, k) {
    if (b.resetAt <= now) BUCKETS.delete(k);
  });
  const over = BUCKETS.size - cfg.rateLimit.maxTrackedIps;
  if (over > 0) {
    const it = BUCKETS.keys();
    for (let i = 0; i < over; i++) {
      const k = it.next();
      if (k.done) break;
      BUCKETS.delete(k.value);
    }
  }
}

/**
 * 记一次访问。
 * @param {string} ip
 * @param {string} bucket 接口组名，不同组独立计数
 * @param {number} limit 窗口内上限
 * @returns {{ok:boolean, remaining:number, retryAfterSec:number}}
 */
function hit(ip, bucket, limit) {
  if (!cfg.rateLimit.enabled) {
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
  const windowMs = cfg.rateLimit.windowMs;
  const key = ip + '|' + bucket;
  const now = Date.now();

  let b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    BUCKETS.set(key, b);
    // 每次新建窗口顺手做一次清理，避免额外定时器
    if (BUCKETS.size > cfg.rateLimit.maxTrackedIps) sweep();
  }
  b.count += 1;

  return {
    ok: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000))
  };
}

/**
 * 路由侧的限流闸门：超限直接回 429 并返回 false，调用方据此短路。
 * @param {object} req
 * @param {object} res
 * @param {'chat'|'api'} group
 * @returns {boolean} true = 放行
 */
function guard(req, res, group) {
  const limit = group === 'chat' ? cfg.rateLimit.chatMax : cfg.rateLimit.apiMax;
  const r = hit(clientIp(req), group, limit);
  if (r.ok) return true;

  res.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(r.retryAfterSec),
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({
    ok: false,
    error: '请求过于频繁，请 ' + r.retryAfterSec + ' 秒后再试',
    retryAfterSec: r.retryAfterSec
  }));
  return false;
}

function stats() {
  return {
    tracked: BUCKETS.size,
    enabled: cfg.rateLimit.enabled,
    windowMs: cfg.rateLimit.windowMs,
    chatMax: cfg.rateLimit.chatMax,
    apiMax: cfg.rateLimit.apiMax
  };
}

module.exports = {
  clientIp: clientIp,
  hit: hit,
  guard: guard,
  stats: stats,
  _buckets: BUCKETS,
  _sweep: sweep
};
