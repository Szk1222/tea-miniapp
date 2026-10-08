/**
 * 内容中心（服务端唯一入口）。
 *
 * 职责边界：
 *   - 持久化：server/storage/content.json（原子写 + 上一版备份，支持回滚）
 *   - 校验：结构 + 合规 + 跨类型交叉引用（三个都过才允许发布）
 *   - 发布：写入运行时覆盖层 → 重建 RAG 索引 → 递增内容版本号
 *
 * 版本号语义：全局单调递增，客户端拿它做增量判断（版本相同就不下发内容）。
 *
 * 为什么发布时要重建 RAG 索引：
 *   corpus.build() 是从 data/*.js 现读的，覆盖层改了内容后，索引里的 chunk 还是旧的，
 *   表现为「茶方改了，但对话里检索到的还是旧文案」。所以每次发布必须重建。
 */

const fs = require('fs');
const path = require('path');

const cfg = require('./config.js');
const overlay = require('../../utils/content-overlay.js');
const schema = require('./content-schema.js');
const rag = require('./rag.js');
const auditStore = require('./audit-store.js');

const DIR = cfg.storage.dir;
const FILE = path.join(DIR, 'content.json');
const PREV = path.join(DIR, 'content.prev.json');
const DOC_SCHEMA = 1;
const JOURNAL_MAX = 200;

/** 当前生效的内容文档 { schemaVersion, version, updatedAt, updatedBy, payload } */
let doc = null;
/** 最近的内容变更记录（同时落审计日志，这里只是给管理端一个快速视图） */
let journal = [];

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function readDoc(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || !raw.payload) return null;
    return raw;
  } catch (e) {
    return null;
  }
}

/** 原子写：先写 .tmp 再 rename，避免断电/崩溃留下半截文件 */
function writeAtomic(file, obj) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function seedDoc() {
  return {
    schemaVersion: DOC_SCHEMA,
    version: 1,
    updatedAt: Date.now(),
    updatedBy: 'seed',
    payload: overlay.snapshot()
  };
}

/** 全类型校验；运行时已应用新内容，因此 ref / 白名单校验读到的是最新值 */
function checkAll(payload) {
  const errors = [];
  const warnings = [];
  overlay.TYPES.forEach(function (type) {
    if (!payload[type]) return;
    const r = schema.validate(type, payload[type]);
    r.errors.forEach(function (e) { errors.push({ type: type, path: type + e.path, message: e.message }); });
    r.warnings.forEach(function (w) { warnings.push({ type: type, path: type + w.path, message: w.message }); });
  });
  return { errors: errors, warnings: warnings };
}

function pushJournal(entry) {
  journal.push(entry);
  if (journal.length > JOURNAL_MAX) journal = journal.slice(-JOURNAL_MAX);
  auditStore.append({
    at: new Date(entry.at).toISOString(),
    stage: 'content:' + entry.action,
    input: { type: entry.type, actor: entry.actor, version: entry.version },
    output: { ok: entry.ok, count: entry.count, errors: entry.errors || [] }
  });
}

/**
 * 启动：读盘（没有就播种）→ 应用到运行时 → 建索引
 * @returns {{version:number, updatedAt:number, counts:object}}
 */
function init() {
  ensureDir();
  doc = readDoc(FILE);
  if (!doc) {
    doc = seedDoc();
    writeAtomic(FILE, doc);
    console.log('[content] 首次启动：已用内置内容播种 ' + FILE);
  }
  const info = overlay.apply(doc.payload, { version: doc.version, updatedAt: doc.updatedAt });
  const idx = rag.buildIndex();
  if (cfg.embedding.enabled) {
    rag.buildEmbeddings(false).catch(function (e) {
      console.warn('[content] 向量索引构建失败，退化为关键词检索：' + e.message);
    });
  }
  auditStore.prune();
  console.log('[content] 内容已加载 v' + doc.version
    + '（茶方 ' + info.counts.teas + ' / 体质 ' + info.counts.constitutions
    + ' / 题目 ' + info.counts.questions + ' / 索引 ' + idx.chunks + ' chunk）'
    + (doc.updatedBy && doc.updatedBy !== 'seed' ? '，最后修改：' + doc.updatedBy : ''));
  return info;
}

function meta() {
  const s = overlay.stats();
  return {
    version: doc ? doc.version : 0,
    updatedAt: doc ? doc.updatedAt : 0,
    updatedBy: doc ? doc.updatedBy : '',
    seeded: !!(doc && doc.updatedBy === 'seed'),
    counts: s.counts,
    journalSize: journal.length,
    hasRollback: !!readDoc(PREV)
  };
}

function getAll() {
  return doc ? clone(doc.payload) : overlay.snapshot();
}

function getType(type) {
  if (overlay.TYPES.indexOf(type) < 0) return null;
  return doc ? clone(doc.payload[type]) : overlay.snapshotOf(type);
}

/**
 * 发布某一类内容。
 * @param {string} type
 * @param {*} value 该类内容的完整新值（整体替换，不做字段级合并）
 * @param {string} actor 操作人标识，用于留痕
 * @returns {{ok:boolean, errors?:Array, warnings?:Array, version?:number, count?:number, index?:object}}
 */
function save(type, value, actor) {
  if (!doc) init();
  if (overlay.TYPES.indexOf(type) < 0) {
    return { ok: false, errors: [{ path: '', message: '未知内容类型：' + type }] };
  }

  const prevPayload = doc.payload;
  const next = clone(prevPayload);
  next[type] = clone(value);

  /* 1) 结构 + 合规校验。ref 白名单取「本次提交后」的体质 id，
        这样新增体质的同时调整茶方归属也能一次提交成功。 */
  const nextIds = Array.isArray(next.constitutions)
    ? next.constitutions.map(function (c) { return c.id; })
    : undefined;
  const check = schema.validate(type, next[type], { ids: nextIds });
  if (!check.ok) {
    pushJournal({ at: Date.now(), action: 'reject', type: type, actor: actor, ok: false, version: doc.version, errors: check.errors });
    return { ok: false, errors: check.errors, warnings: check.warnings, count: check.count };
  }

  /* 2) 先落到运行时（不递增版本、不重建索引），让交叉校验读到新内容 */
  overlay.apply(next, { version: doc.version, updatedAt: doc.updatedAt });

  /* 3) 全量交叉校验：删掉一个体质/一味目录食材，会让既有茶方与量表失效 */
  const all = checkAll(next);
  if (all.errors.length) {
    overlay.apply(prevPayload, { version: doc.version, updatedAt: doc.updatedAt });
    pushJournal({ at: Date.now(), action: 'reject', type: type, actor: actor, ok: false, version: doc.version, errors: all.errors });
    return {
      ok: false,
      errors: all.errors,
      warnings: dedupeWarnings(all.warnings),
      count: check.count,
      hint: '本次修改会让其他内容失效，已自动还原'
    };
  }

  /* 4) 备份上一版 → 落盘 → 正式发布 */
  try {
    writeAtomic(PREV, doc);
    const newDoc = {
      schemaVersion: DOC_SCHEMA,
      version: doc.version + 1,
      updatedAt: Date.now(),
      updatedBy: actor || 'admin',
      payload: next
    };
    writeAtomic(FILE, newDoc);
    doc = newDoc;
  } catch (e) {
    overlay.apply(prevPayload, { version: doc.version, updatedAt: doc.updatedAt });
    pushJournal({ at: Date.now(), action: 'error', type: type, actor: actor, ok: false, version: doc.version, errors: [{ path: '', message: '写盘失败：' + e.message }] });
    return { ok: false, errors: [{ path: '', message: '写盘失败，已还原：' + e.message }] };
  }

  const info = overlay.apply(doc.payload, { version: doc.version, updatedAt: doc.updatedAt });
  const idx = rag.buildIndex();
  if (cfg.embedding.enabled) {
    rag.buildEmbeddings(false).catch(function () { /* 失败则退化为关键词检索 */ });
  }

  const warnings = dedupeWarnings(all.warnings);
  pushJournal({
    at: doc.updatedAt, action: 'publish', type: type, actor: doc.updatedBy,
    ok: true, version: doc.version, count: check.count, warnings: warnings.length
  });

  return {
    ok: true,
    version: doc.version,
    updatedAt: doc.updatedAt,
    count: check.count,
    warnings: warnings,
    counts: info.counts,
    index: idx
  };
}

function dedupeWarnings(list) {
  const seen = {};
  const out = [];
  (list || []).forEach(function (w) {
    const k = (w.path || '') + '|' + w.message;
    if (seen[k]) return;
    seen[k] = 1;
    out.push(w);
  });
  return out;
}

/** 回滚到上一版（版本号继续递增，客户端才会感知到变化） */
function rollback(actor) {
  if (!doc) init();
  const prev = readDoc(PREV);
  if (!prev) return { ok: false, error: '没有可回滚的上一版' };

  const current = doc;
  const restored = {
    schemaVersion: DOC_SCHEMA,
    version: current.version + 1,
    updatedAt: Date.now(),
    updatedBy: (actor || 'admin') + '(rollback)',
    payload: prev.payload
  };

  try {
    writeAtomic(PREV, current);
    writeAtomic(FILE, restored);
    doc = restored;
  } catch (e) {
    return { ok: false, error: '回滚写盘失败：' + e.message };
  }

  const info = overlay.apply(doc.payload, { version: doc.version, updatedAt: doc.updatedAt });
  const idx = rag.buildIndex();
  if (cfg.embedding.enabled) rag.buildEmbeddings(false).catch(function () {});

  pushJournal({ at: doc.updatedAt, action: 'rollback', type: '*', actor: restored.updatedBy, ok: true, version: doc.version });
  return { ok: true, version: doc.version, updatedAt: doc.updatedAt, counts: info.counts, index: idx };
}

/** 丢弃本地改动、重新用内置数据播种（慎用，会覆盖后台所有编辑） */
function reseed(actor) {
  if (!doc) init();
  const current = doc;
  const seeded = seedDoc();
  seeded.version = current.version + 1;
  seeded.updatedBy = (actor || 'admin') + '(reseed)';
  try {
    writeAtomic(PREV, current);
    writeAtomic(FILE, seeded);
    doc = seeded;
  } catch (e) {
    return { ok: false, error: '写盘失败：' + e.message };
  }
  const info = overlay.apply(doc.payload, { version: doc.version, updatedAt: doc.updatedAt });
  const idx = rag.buildIndex();
  if (cfg.embedding.enabled) rag.buildEmbeddings(false).catch(function () {});
  pushJournal({ at: doc.updatedAt, action: 'reseed', type: '*', actor: seeded.updatedBy, ok: true, version: doc.version });
  return { ok: true, version: doc.version, counts: info.counts, index: idx };
}

function recentJournal(n) {
  return journal.slice(-(n || 30)).reverse();
}

/** 给小程序端的内容包：版本相同则不下发 payload，省流量 */
function payloadFor(clientVersion) {
  const v = Number(clientVersion);
  if (v && doc && v === doc.version) {
    return { ok: true, unchanged: true, version: doc.version };
  }
  return {
    ok: true,
    unchanged: false,
    version: doc ? doc.version : 0,
    updatedAt: doc ? doc.updatedAt : 0,
    payload: getAll()
  };
}

module.exports = {
  init: init,
  meta: meta,
  getAll: getAll,
  getType: getType,
  save: save,
  rollback: rollback,
  reseed: reseed,
  recentJournal: recentJournal,
  payloadFor: payloadFor,
  _file: FILE
};
