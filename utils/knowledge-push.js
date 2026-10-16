/**
 * 「对话结束自动推送科普」的内容挑选器。
 *
 * 意图：一轮回答给完茶方/体质结论后，顺势把**同主题的科普**递到用户手边，
 * 把「推荐」和「知识库」串起来 —— 用户看完结论常常想知道「为什么是这几味」。
 *
 * 三条约束：
 * 1) 只从 data/knowledge.js 取内容（与知识库共用同一份来源，不新造事实）。
 * 2) 只挑「相关」的：优先推荐茶方的配方食材 → 再体质 → 再常识问答；凑不出就不推。
 * 3) 去重靠调用方：每个条目都带稳定 id，页面用 topicKey 记住已推过的主题。
 */

const knowledge = require('../data/knowledge.js');
const constitutions = require('../data/constitutions.js');
const teas = require('../data/teas.js');

/** 常见疑问词：用它们从用户原话里挑 FAQ，命中率比整句匹配高得多 */
const FAQ_HINTS = [
  '经期', '孕期', '哺乳', '每天', '天天', '时间', '几点', '隔夜', '第二天', '混', '一起泡',
  '西药', '吃药', '服药', '间隔', '抗凝', '甲状腺', '免疫', '安神', '血压', '血糖', '肝肾', '痛风',
  '手术', '选购', '存放', '保存', '剂量', '多少', '复测', '会变', '兼夹', '舌象', '准', '测'
];

function ingredientCard(ing) {
  if (!ing) return null;
  return {
    kind: 'ingredient',
    id: ing.id,
    title: ing.name,
    desc: ing.effect,
    tag: ing.nature
  };
}

function constitutionCard(cid) {
  const c = constitutions.getOr(cid);
  if (!c || !c.id || !constitutions.get(cid)) return null;
  return {
    kind: 'constitution',
    id: c.id,
    title: c.name,
    desc: c.short || c.brief,
    tag: '体质'
  };
}

function faqCard(idx) {
  const f = knowledge.faq[idx];
  if (!f) return null;
  return {
    kind: 'faq',
    id: String(idx),
    title: f.q,
    desc: String(f.a || '').slice(0, 60) + (String(f.a || '').length > 60 ? '…' : ''),
    tag: '常识'
  };
}

/** 按用户原话挑一条最相关的常识问答 */
function pickFaq(text) {
  const t = String(text || '');
  if (!t) return null;
  const hints = FAQ_HINTS.filter(function (h) { return t.indexOf(h) > -1; });
  const pool = knowledge.faq || [];
  for (let h = 0; h < hints.length; h++) {
    const kw = hints[h];
    for (let i = 0; i < pool.length; i++) {
      if ((pool[i].q || '').indexOf(kw) > -1 || (pool[i].a || '').indexOf(kw) > -1) {
        return { card: faqCard(i), key: 'faq:' + i };
      }
    }
  }
  return null;
}

/**
 * 组装一条科普推送块。
 * @param {object} ctx
 *   teas         Array<茶方对象或 id>，本轮的推荐结果
 *   constitutionId 体质 id
 *   keywords     Array<string> 用户原话中的关键词（用于挑常识问答）
 * @returns {null|{type:string,title:string,subtitle:string,items:Array,topicKey:string}}
 */
function build(ctx) {
  const c = ctx || {};
  const items = [];
  const keys = [];

  // 1) 推荐茶方的配方食材（最多 2 味）—— 这是用户最可能想深挖的点
  const seenIng = {};
  const teaList = (c.teas || []).map(function (t) {
    return typeof t === 'string' ? teas.get(t) : t;
  }).filter(Boolean);

  for (let i = 0; i < teaList.length && items.length < 2; i++) {
    const ings = teaList[i].ingredients || [];
    for (let j = 0; j < ings.length && items.length < 2; j++) {
      const name = ings[j].name;
      if (seenIng[name]) continue;
      seenIng[name] = 1;
      const card = ingredientCard(knowledge.findIngredient(name));
      if (card) { items.push(card); keys.push('ing:' + card.id); }
    }
  }

  // 2) 体质科普
  if (items.length < 3 && c.constitutionId) {
    const card = constitutionCard(c.constitutionId);
    if (card) { items.push(card); keys.push('con:' + card.id); }
  }

  // 3) 常识问答（有明确疑问词时才推，避免打扰）
  if (items.length < 3 && c.keywords && c.keywords.length) {
    const faq = pickFaq(c.keywords.join(' '));
    if (faq) { items.push(faq.card); keys.push(faq.key); }
  }

  if (!items.length) return null;

  return {
    type: 'knowledge',
    title: '顺带了解',
    subtitle: teaList.length ? '这些内容和你刚看的茶方有关' : '补充一点相关的小知识',
    items: items,
    topicKey: keys.join('|')
  };
}

/** 便捷入口：按单款茶方推（茶详情页/对话里点了某款茶时用） */
function forTea(tea) {
  const t = typeof tea === 'string' ? teas.get(tea) : tea;
  if (!t) return null;
  return build({ teas: [t], constitutionId: t.constitution });
}

/** 便捷入口：按体质推 */
function forConstitution(cid, keywords) {
  return build({ constitutionId: cid, keywords: keywords || [] });
}

module.exports = {
  build: build,
  forTea: forTea,
  forConstitution: forConstitution,
  _pickFaq: pickFaq
};
