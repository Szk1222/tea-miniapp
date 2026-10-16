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

function keyOf(id, owner) {
  const safeId = String(id || '').slice(0, 100);
  return String(owner || 'legacy') + ':' + safeId;
}

function create(id, owner) {
  const s = {
    id: id,
    createdAt: now(),
    updatedAt: now(),
    // feedback：用户上送的最小化体感记录（见 utils/feedback.js）。
    // 只活在会话内存里、随 TTL 一起消失，**刻意不落盘** —— 体感属健康敏感信息。
    ctx: { profile: null, lastTeas: [], flags: {}, feedback: [] },
    messages: []
  };
  evictIfNeeded();
  SESSIONS.set(keyOf(id, owner), s);
  return s;
}

function get(id, owner) {
  const key = id || 'anonymous';
  const storageKey = keyOf(key, owner);
  const s = SESSIONS.get(storageKey);
  if (!s) return create(key, owner);
  s.updatedAt = now();
  return s;
}

function remove(id, owner) {
  if (!id) return false;
  return SESSIONS.delete(keyOf(id, owner));
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

/**
 * 合并一批体感记录到会话上下文（限量，新的在前）。
 * @returns {number} 合并后会话里保留的记录数
 */
function putFeedback(session, records) {
  if (!session || !records || !records.length) return (session && session.ctx.feedback || []).length;
  const cur = session.ctx.feedback || [];
  const merged = records.concat(cur).slice(0, 20);
  session.ctx.feedback = merged;
  session.updatedAt = now();
  return merged.length;
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
  remove: remove,
  history: history,
  push: push,
  prune: prune,
  putFeedback: putFeedback,
  stats: stats
};
