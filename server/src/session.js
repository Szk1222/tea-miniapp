/**
 * 会话管理：多轮上下文 + 滑动窗口 + 过期回收。
 * 进程内存储，够单机部署用；要横向扩展换成 Redis 即可（接口保持不变）。
 */
const cfg = require('./config.js');

const SESSIONS = new Map();

function now() { return Date.now(); }

function create(id) {
  const s = {
    id: id,
    createdAt: now(),
    updatedAt: now(),
    ctx: { profile: null, lastTeas: [], flags: {} },
    messages: []
  };
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
  return { sessions: SESSIONS.size, ttlMs: cfg.session.ttlMs, maxTurns: cfg.session.maxTurns };
}

module.exports = {
  get: get,
  history: history,
  push: push,
  prune: prune,
  stats: stats
};
