/**
 * 内容覆盖层（服务端与小程序端共用，纯逻辑，不依赖任何平台 API）。
 *
 * 职责：把「一份内容快照」应用到内置数据模块上，并负责刷新所有派生缓存。
 *
 * 为什么要这一层：
 *   data/*.js 既是内置兜底数据，也是端上打包内容。管理后台改了内容后要让它生效，
 *   有两条路 —— 一是改造 20 多处消费点改成异步取数，二是让数据模块支持就地覆盖。
 *   这里选后者：apply() 之后，所有 teaware 消费点（engine / agent / tools / prompt /
 *   corpus / 各页面）读到的都是新内容，一行调用点都不用改。
 *
 * 派生缓存清单（漏一个就会出现「大部分对了、某个百分比不对」的诡异问题）：
 *   - utils/engine.js 的 MAX_SCORE（体质理论最高分 → 影响倾向度百分比）
 *   - 服务端工具定义的工具枚举（由 tools.js 自行按 version 惰性重建）
 *   - 服务端 RAG 索引（通过 onApply 注册监听器重建）
 */

const teas = require('../data/teas.js');
const constitutions = require('../data/constitutions.js');
const questions = require('../data/questions.js');
const knowledge = require('../data/knowledge.js');
const catalog = require('../data/catalog.js');
const engine = require('./engine.js');

/** 可管理的内容类型 */
const TYPES = ['teas', 'constitutions', 'questions', 'knowledge', 'catalog'];

/** 内容版本号：每次成功覆盖 +1；0 表示仍是内置数据 */
let version = 0;
let updatedAt = 0;
let lastCounts = null;

const listeners = [];

/**
 * 取当前生效内容的深拷贝，结构即管理后台的 payload 结构。
 * 深拷贝是必须的：调用方（管理端编辑、客户端上传）会改这份数据，
 * 直接给引用会把线上内容改坏。
 */
function snapshot() {
  return JSON.parse(JSON.stringify({
    teas: teas.list,
    constitutions: constitutions.list,
    questions: { list: questions.list, basic: questions.basic },
    knowledge: { ingredients: knowledge.ingredients, faq: knowledge.faq },
    catalog: catalog.items
  }));
}

/** 只取某一类内容（深拷贝） */
function snapshotOf(type) {
  if (TYPES.indexOf(type) < 0) return null;
  return snapshot()[type];
}

/** 当前生效内容的统计信息 */
function stats() {
  return {
    version: version,
    updatedAt: updatedAt,
    counts: {
      teas: teas.total,
      constitutions: constitutions.list.length,
      questions: questions.total,
      ingredients: knowledge.ingredients.length,
      faq: knowledge.faq.length,
      catalog: catalog.total
    }
  };
}

function getVersion() {
  return version;
}

/** 注册「内容已变更」监听器，返回取消注册的函数 */
function onApply(fn) {
  if (typeof fn !== 'function') return function () {};
  listeners.push(fn);
  return function () {
    const i = listeners.indexOf(fn);
    if (i > -1) listeners.splice(i, 1);
  };
}

/**
 * 应用一份内容快照。payload 中缺失或非法的类型会保持原值，不会清空。
 * @param {object} payload { teas, constitutions, questions, knowledge, catalog }
 * @param {object} [meta]  { version, updatedAt } 用于对齐服务端记录的版本号
 * @returns {{version:number, updatedAt:number, counts:object}}
 */
function apply(payload, meta) {
  if (!payload || typeof payload !== 'object') return stats();

  const counts = {
    teas: teas.applyOverride(payload.teas),
    constitutions: constitutions.applyOverride(payload.constitutions),
    questions: questions.applyOverride(payload.questions),
    knowledge: knowledge.applyOverride(payload.knowledge),
    catalog: catalog.applyOverride(payload.catalog)
  };

  // 派生缓存必须跟着重算，否则体质判定百分比会以旧量表为基数
  engine.reload();

  const m = meta || {};
  version = typeof m.version === 'number' && m.version > 0 ? m.version : version + 1;
  updatedAt = m.updatedAt || Date.now();
  lastCounts = counts;

  const info = { version: version, updatedAt: updatedAt, counts: counts };
  listeners.slice().forEach(function (fn) {
    try { fn(info); } catch (e) { /* 单个监听器异常不影响内容生效 */ }
  });
  return info;
}

module.exports = {
  TYPES: TYPES,
  apply: apply,
  snapshot: snapshot,
  snapshotOf: snapshotOf,
  stats: stats,
  getVersion: getVersion,
  onApply: onApply
};
