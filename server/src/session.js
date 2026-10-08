/**
 * 会话管理：多轮上下文 + 滑动窗口 + 过期回收。
 * 进程内存储，够单机部署用；要横向扩展换成 Redis 即可（接口保持不变）。
 */
const cfg = require('./config.js');

const SESSIONS = new Map();

function now() { return Date.now(); }

/**
 * 会话数兜底回收。
 *
 * 为什么必须有：sessionId 完全由客户端提供，而 get() 对任何未知 id 都会新建会话。
 * 在没有上限的情况下，构造海量随机 sessionId 就能把进程内存打满
 * （TTL 30 分钟才回收，攻击者只要跑得比回收快即可）。
 */
function evictIfNeeded() {
  const max = cfg.session.maxSessions;
  if (SESSIONS.size <= max) return;
  prune();
  if (SESSIONS.size <= max) return;
  // 仍超限 → 按最后活跃时间淘汰最旧的一批（一次淘汰 10%，避免每次请求都全量排序）
  const entries = Array.from(SESSIONS.entries()).sort(function (a, b) {
    return a[1].updatedAt - b[1].updatedAt;
  });
  const drop = Math.max(1, Math.floor(max * 0.1));
  for (let i = 0; i < drop && i < entries.length; i++) SESSIONS.delete(entries[i][0]);
}

function create(id) {
  const s = {
    id: id,
    createdAt: now(),
    updatedAt: now(),
    ctx: { profile: null, lastTeas: [], flags: {} },
    messages: []
  };
  evictIfNeeded();
  SESSIONS.set(id, s);
  return s;
}

function get(id) {
  const key = id || 'anonymous';
  const s = SESSIONS.get(key);
  if (!s) return create(key);
  s.updatedAt = now();
  return s;
}

/** 滑动窗口：只保留最近 N 轮，控制 token 成本与上下文噪声 */
function history(session) {
  return session.messages.slice(-cfg.session.maxTurns * 2);
}

function push(session, role, content) {
  if (!content) return;
  session.messages.push({ role: role, content: content });
  if (session.messages.length > cfg.session.maxTurns * 2 + 4) {
    session.messages = session.messages.slice(-cfg.session.maxTurns * 2);
  }
}

function prune() {
  const deadline = now() - cfg.session.ttlMs;
  let removed = 0;
  SESSIONS.forEach(function (s, k) {
    if (s.updatedAt < deadline) { SESSIONS.delete(k); removed += 1; }
  });
  return removed;
}

function stats() {
  return {
    sessions: SESSIONS.size,
    ttlMs: cfg.session.ttlMs,
    maxTurns: cfg.session.maxTurns,
    maxSessions: cfg.session.maxSessions
  };
}

module.exports = {
  get: get,
  history: history,
  push: push,
  prune: prune,
  stats: stats
};
