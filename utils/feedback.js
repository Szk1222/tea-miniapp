/**
 * 用户体感反馈（端上）
 *
 * 定位：把「喝完之后的真实感受」变成可被推荐逻辑消费的信号。
 *
 * 三条设计约束（都很关键，改动前务必读一遍）：
 * 1) **本地优先、隐私最小化**：体感属于健康敏感信息，默认只存本机，键名 `tl_feedback_v1`
 *    （前缀 `tl_feedback_` 与 store.clearAll() 的批量清理规则一致，清除数据时一并删掉）。
 *    只有在用户「已开启 AI 增强且单独同意」时，才把**最小化后的结构化反馈**上送，
 *    自由描述按用户在该页的显式选择决定是否随行（见 shouldUploadNote）。
 * 2) **只影响排序，不影响安全档位**：反馈加权只改 engine 的权重项，不参与风险分级。
 *    「禁用/忌用」永远不进推荐池 —— 这条铁律不会被反馈打破（见 engine.recommendFull）。
 * 3) **不承诺疗效**：所有体感词都是主观感受描述（「睡得更沉」「更清爽」），
 *    不是功效宣称，也不会被当作效果承诺展示给他人。
 */

const KEY = 'tl_feedback_v1';
const MAX_RECORDS = 200;

/** 总体感受：三档，够用且不需要用户思考 */
const EFFECTS = [
  { id: 'better', label: '有改善', hint: '喝完感觉还不错' },
  { id: 'same', label: '变化不大', hint: '喝下来没什么特别感觉' },
  { id: 'worse', label: '不太舒服', hint: '喝完有不太舒服的反应' }
];

/**
 * 细分体感。
 * tags 对应 engine.ADJUST_RULES 里那套关注点标签，用来把「感受」翻译成「可加的权重」。
 * good=false 的项命中时反过来降权，并触发安全提示。
 */
const FEELINGS = [
  { id: 'sleep', label: '睡得更沉', tags: ['sleep'], good: true },
  { id: 'energy', label: '更有精神', tags: ['tired'], good: true },
  { id: 'digest', label: '胃口更舒服', tags: ['damp'], good: true },
  { id: 'warm', label: '身体更暖', tags: ['cold'], good: true },
  { id: 'refresh', label: '更清爽', tags: ['damp', 'heat'], good: true },
  { id: 'dry', label: '口干缓解', tags: ['dry'], good: true },
  { id: 'calm', label: '情绪更放松', tags: ['mood'], good: true },
  { id: 'bloat', label: '喝完有点胀气', tags: ['damp'], good: false },
  { id: 'hot', label: '有点上火', tags: ['heat'], good: false },
  { id: 'coldfeel', label: '腹部发凉', tags: ['cold'], good: false },
  { id: 'nausea', label: '胃部不适', tags: [], good: false }
];

/** 口味感受：直接影响「换配方」时的偏好 */
const TASTES = [
  { id: 'like', label: '挺好喝' },
  { id: 'meh', label: '一般' },
  { id: 'dislike', label: '不太喜欢' }
];

const EFFECT_MAP = {};
EFFECTS.forEach(function (e) { EFFECT_MAP[e.id] = e; });
const FEELING_MAP = {};
FEELINGS.forEach(function (f) { FEELING_MAP[f.id] = f; });
const TASTE_MAP = {};
TASTES.forEach(function (t) { TASTE_MAP[t.id] = t; });

const GOOD_TAG_SET = {};
FEELINGS.forEach(function (f) {
  if (f.good) f.tags.forEach(function (t) { GOOD_TAG_SET[t] = 1; });
});
/** 感受标签 → 该标签对应的关注方向（用于把「感受」翻译成人能读懂的一句话） */
const TAG_LABEL = {
  sleep: '睡眠', tired: '精力', damp: '祛湿/消化', cold: '怕冷', heat: '上火/燥热',
  dry: '口干', mood: '情绪'
};

/* ---------------- 读写 ---------------- */

function read() {
  try {
    const v = wx.getStorageSync(KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function write(list) {
  try {
    wx.setStorageSync(KEY, list.slice(0, MAX_RECORDS));
    return true;
  } catch (e) {
    return false;
  }
}

function uid() {
  return 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------------- 纯函数层 ----------------
 * 下面这些函数**不碰存储**，只操作传入的记录数组。这么切的原因：
 * 服务端（Node）也要用同一套语义来解释体感记录 —— 它 require 得到本模块，
 * 但 read()/write() 依赖 wx.*。把「语义」和「存储」分开，两端才能共用一份实现，
 * 不必在 server/ 里再抄一遍（抄一遍就一定会随版本漂移）。 */

/** 自由描述净化：体感描述最终可能进入模型提示词，必须去掉换行与控制字符并限长 */
function cleanNote(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')   // 控制字符（含 \n \r \t）→ 空格
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 200);
}

/**
 * 把一条（可能来自外部/不可信来源的）记录规范化为内部结构。
 * 非法枚举一律降级为安全默认，绝不原样透传。
 * @returns {{teaId:string,teaName:string,constitutionId:string,effect:string,
 *            feelings:string[],taste:string,note:string,uploadNote:boolean}}
 */
function normalize(rec) {
  const r = rec || {};
  return {
    teaId: String(r.teaId || '').slice(0, 64),
    teaName: String(r.teaName || '').slice(0, 40),
    constitutionId: String(r.constitutionId || '').slice(0, 32),
    effect: EFFECT_MAP[r.effect] ? r.effect : 'same',
    feelings: (Array.isArray(r.feelings) ? r.feelings : []).filter(function (f) { return !!FEELING_MAP[f]; }),
    taste: TASTE_MAP[r.taste] ? r.taste : '',
    note: cleanNote(r.note).slice(0, 200),
    // 自由描述是否允许随 AI 增强上送（默认不上送，需用户显式勾选）
    uploadNote: !!r.uploadNote
  };
}

/**
 * 净化一批外来记录（服务端接收上行数据时用）。
 * @returns {Array} 规范化且限量的记录数组
 */
function sanitizeIncoming(list, limit) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, limit || 20).map(normalize);
}

/** 把一组记录折算成推荐权重增量（纯函数，见 biasFor 的说明） */
function biasFromList(records, constitutionId) {
  const boost = {};
  const penalty = {};
  const dislike = {};
  const all = (records || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

  all.forEach(function (r) {
    const sameC = !constitutionId || !r.constitutionId || r.constitutionId === constitutionId;
    if (!sameC) return;
    if (r.teaId) {
      if (r.effect === 'better') boost[r.teaId] = (boost[r.teaId] || 0) + 2;
      else if (r.effect === 'worse') penalty[r.teaId] = (penalty[r.teaId] || 0) + 6;
    }
    if (r.taste === 'dislike' && r.teaId) dislike[r.teaId] = true;
    (r.feelings || []).forEach(function (fid) {
      const f = FEELING_MAP[fid];
      if (!f) return;
      // 感受只对「同体质」的茶方生效，避免跨体质串味
      f.tags.forEach(function (tag) {
        if (f.good) boost['#tag:' + tag] = (boost['#tag:' + tag] || 0) + 1;
        else penalty['#tag:' + tag] = (penalty['#tag:' + tag] || 0) + 2;
      });
    });
  });

  return { boost: boost, penalty: penalty, dislikedTeas: Object.keys(dislike) };
}

/** 把一组记录描述过的感受汇总成一句人话 */
function summaryFromList(records) {
  const recs = (records || []).slice(0, 3);
  if (!recs.length) return '';
  const tags = {};
  recs.forEach(function (r) {
    (r.feelings || []).forEach(function (fid) {
      const f = FEELING_MAP[fid];
      if (!f) return;
      f.tags.forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    });
  });
  const words = Object.keys(tags).map(function (t) { return TAG_LABEL[t] || t; });
  const effect = recs[0].effect;
  const head = effect === 'better' ? '整体感觉不错' : effect === 'worse' ? '出现过不太舒服的反应' : '整体变化不大';
  return head + (words.length ? '，关注到' + words.slice(0, 3).join('、') + '的变化' : '');
}

/* ---------------- 对外接口 ---------------- */

/** 全部记录，按时间倒序 */
function list() {
  return read().slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
}

function listOfTea(teaId) {
  return list().filter(function (r) { return r.teaId === teaId; });
}

function latestOfTea(teaId) {
  return listOfTea(teaId)[0] || null;
}

function count() {
  return read().length;
}

/**
 * 新增一条体感记录。
 * @param {{teaId:string, teaName:string, constitutionId:string, effect:string,
 *          feelings:string[], taste:string, note:string, uploadNote:boolean}} rec
 * @returns {object} 规范化后的记录
 */
function add(rec) {
  const rec2 = Object.assign({ id: uid(), at: Date.now() }, normalize(rec));
  const all = read();
  all.unshift(rec2);
  write(all);
  return rec2;
}

function remove(id) {
  write(read().filter(function (r) { return r.id !== id; }));
}

function clear() {
  return write([]);
}

/** 统计：供首页/我的页展示「已记录 N 次」 */
function stats() {
  const all = read();
  const better = all.filter(function (r) { return r.effect === 'better'; }).length;
  const worse = all.filter(function (r) { return r.effect === 'worse'; }).length;
  return { total: all.length, better: better, worse: worse, lastAt: all.length ? all[all.length - 1].at : 0 };
}

/* ---------------- 反馈 → 推荐权重 ---------------- */

/**
 * 把历史体感折算成推荐权重增量。
 *
 * 为什么要「只加权重、不动风险档位」：
 * engine.recommendFull 的排序是「风险档位优先，再按权重」的二级排序。
 * 反馈只参与第二级，所以无论如何都不会把「忌用」的茶方抬进推荐池，
 * 也不会让用户在安全上没有保障。
 *
 * @param {string} [constitutionId] 只统计与该体质相关的记录（不影响其它体质的推荐）
 * @returns {{boost:object, penalty:object, dislikedTeas:string[]}}
 */
function biasFor(constitutionId) {
  return biasFromList(list(), constitutionId);
}

/**
 * 供 engine.scoreTea 使用：把「茶方 id 加成」与「标签加成」一起算成权重增量。
 * 结果做 [-20, 20] 钳制：反馈累计再多也不能盖过体质（+30）这类结构性加分，
 * 否则长期使用后推荐会被个别记录带偏。
 * @param {object} tea
 * @param {object} bias biasFor() 的返回值
 */
function weightDelta(tea, bias) {
  if (!tea || !bias) return 0;
  let d = 0;
  if (bias.boost && bias.boost[tea.id]) d += bias.boost[tea.id];
  if (bias.penalty && bias.penalty[tea.id]) d -= bias.penalty[tea.id];
  const tags = tea.tags || [];
  tags.forEach(function (t) {
    if (bias.boost && bias.boost['#tag:' + t]) d += bias.boost['#tag:' + t];
    if (bias.penalty && bias.penalty['#tag:' + t]) d -= bias.penalty['#tag:' + t];
  });
  if (d > 20) d = 20;
  if (d < -20) d = -20;
  return d;
}

/** 把记录里描述过的感受汇总成一句人话（给顾问引用，也用于详情页展示） */
function summaryText(teaId) {
  return summaryFromList(teaId ? listOfTea(teaId) : list());
}

/**
 * 上送用的最小化摘要（不含自由描述，除非 uploadNote 显式开启）。
 * 上行链路只在「用户已开启 AI 增强并单独同意」时被调用。
 */
function minimalSummary(limit) {
  return list().slice(0, limit || 6).map(function (r) {
    const o = {
      teaId: r.teaId,
      teaName: r.teaName,
      effect: r.effect,
      feelings: r.feelings
    };
    if (r.uploadNote && r.note) o.note = cleanNote(r.note, 120);
    return o;
  });
}

/** 总体感受的中文短标签（服务端渲染文本、端上展示共用，避免两处各写一份） */
function effectLabel(id) {
  const e = EFFECT_MAP[id];
  return e ? e.label : '变化不大';
}

/** 细分体感 id 数组 → 中文标签数组（未知 id 静默丢弃） */
function feelingLabels(ids) {
  return (ids || []).map(function (id) {
    const f = FEELING_MAP[id];
    return f ? f.label : '';
  }).filter(Boolean);
}

module.exports = {
  KEY: KEY,
  EFFECTS: EFFECTS,
  FEELINGS: FEELINGS,
  TASTES: TASTES,
  EFFECT_MAP: EFFECT_MAP,
  FEELING_MAP: FEELING_MAP,
  TASTE_MAP: TASTE_MAP,
  TAG_LABEL: TAG_LABEL,
  cleanNote: cleanNote,
  normalize: normalize,
  sanitizeIncoming: sanitizeIncoming,
  biasFromList: biasFromList,
  summaryFromList: summaryFromList,
  effectLabel: effectLabel,
  feelingLabels: feelingLabels,
  list: list,
  listOfTea: listOfTea,
  latestOfTea: latestOfTea,
  count: count,
  add: add,
  remove: remove,
  clear: clear,
  stats: stats,
  biasFor: biasFor,
  weightDelta: weightDelta,
  summaryText: summaryText,
  minimalSummary: minimalSummary
};
