/**
 * 审计日志落盘（JSONL，按天分文件）。
 *
 * safety.js 里的 AUDIT 是内存环形缓冲（500 条），进程一重启就没了 ——
 * 对「留痕」这个诉求等于不存在。这里补上持久化：
 *   - 追加写 server/storage/audit-YYYY-MM-DD.jsonl
 *   - 启动时清理超过保留天数的旧文件
 *   - recent(n) 从最新的文件往前读，凑够 n 条
 *
 * 写入用同步接口：单次对话只产生个位数条记录，同步写的阻塞可以忽略，
 * 换来的是「进程被 kill 也不会丢日志」。
 */

const fs = require('fs');
const path = require('path');
const cfg = require('./config.js');

const DIR = cfg.storage.dir;
const DAY_MS = 24 * 60 * 60 * 1000;

let ready = false;

function ensureDir() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    ready = true;
  } catch (e) {
    console.warn('[audit] 存储目录不可用，审计日志将只留在内存：' + e.message);
    ready = false;
  }
  return ready;
}

function dayKey(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function fileOf(day) {
  return path.join(DIR, 'audit-' + day + '.jsonl');
}

/** 追加一条审计记录；落盘失败不影响主流程 */
function append(item) {
  if (!ready && !ensureDir()) return false;
  try {
    fs.appendFileSync(fileOf(dayKey()), JSON.stringify(item) + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

/** 按天倒序列出已有审计文件 */
function listFiles() {
  if (!ready && !ensureDir()) return [];
  try {
    return fs.readdirSync(DIR)
      .filter(function (f) { return /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f); })
      .sort()
      .reverse()
      .map(function (f) { return path.join(DIR, f); });
  } catch (e) {
    return [];
  }
}

/** 读最近 n 条审计记录（新的在前会反转成时间正序返回） */
function recent(n) {
  const limit = Math.max(1, Math.min(2000, Number(n) || 50));
  const files = listFiles();
  const collected = [];

  for (let fi = 0; fi < files.length && collected.length < limit; fi++) {
    let lines;
    try {
      lines = fs.readFileSync(files[fi], 'utf8').split('\n');
    } catch (e) {
      continue;
    }
    for (let i = lines.length - 1; i >= 0 && collected.length < limit; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try { collected.push(JSON.parse(line)); } catch (e) { /* 跳过坏行 */ }
    }
  }

  return collected.reverse();
}

/** 清理超过保留天数的审计文件，返回删除数量 */
function prune() {
  if (!cfg.storage.auditRetentionDays || cfg.storage.auditRetentionDays <= 0) return 0;
  const deadline = Date.now() - cfg.storage.auditRetentionDays * DAY_MS;
  let removed = 0;
  listFiles().forEach(function (f) {
    const m = f.match(/audit-(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!m) return;
    const t = Date.parse(m[1] + 'T00:00:00Z');
    if (isNaN(t) || t >= deadline) return;
    try { fs.unlinkSync(f); removed += 1; } catch (e) { /* ignore */ }
  });
  if (removed) console.log('[audit] 清理过期审计文件 ' + removed + ' 个');
  return removed;
}

function stats() {
  const files = listFiles();
  let lines = 0;
  let bytes = 0;
  files.forEach(function (f) {
    try {
      const st = fs.statSync(f);
      bytes += st.size;
      lines += fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length;
    } catch (e) { /* ignore */ }
  });
  return {
    dir: DIR,
    writable: ready || ensureDir(),
    files: files.length,
    lines: lines,
    bytes: bytes,
    retentionDays: cfg.storage.auditRetentionDays
  };
}

module.exports = {
  append: append,
  recent: recent,
  prune: prune,
  stats: stats,
  ensureDir: ensureDir,
  _dir: DIR
};
