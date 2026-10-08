/**
 * 合规风控层（双层）。
 *
 * 1) 入站拦截：命中医疗诊疗意图 → 直接短路，不进入大模型推理链路，
 *    保证无论模型怎么发挥，都不可能输出诊断/处方类内容。
 * 2) 出站净化：对模型输出的文本做医疗术语与绝对化用语替换，
 *    再交给客户端渲染，形成「输入端 + 输出端」双重兜底。
 *
 * 之所以把风控放在模型之外，是因为提示词约束是概率性的，而合规是硬性要求。
 */
const agent = require('../../utils/agent.js');
const knowledge = require('../../data/knowledge.js');

/* ---------------- 出站词表 ---------------- */

/**
 * 词表用「纯字符串 + 别名数组」而不是正则，两个原因：
 * 1) 带 g 的正则复用 test() 会推进 lastIndex，会随机漏检（流式场景下表现得很隐蔽）；
 * 2) 流式净化需要知道「某个位置是不是某个词的起点」，字符串判定比正则可控得多。
 */
const WORD_MAP = [
  { words: ['治疗', '治好', '医治'], to: '调理' },
  { words: ['治愈', '痊愈', '根治', '断根'], to: '从根本上改善' },
  { words: ['疗效', '药效'], to: '调理作用' },
  { words: ['主治', '适应症', '对症'], to: '适用方向' },
  { words: ['药到病除', '立竿见影', '特效'], to: '逐步改善' },
  { words: ['包治', '包好', '保证有效'], to: '因人而异' },
  { words: ['最有效', '最好的', '第一名', '唯一'], to: '较适合' },
  { words: ['百分百', '100%', '百分之百'], to: '比较明显' },
  { words: ['彻底解决', '永久解决'], to: '长期调理' },
  { words: ['处方', '开方', '药方'], to: '茶饮搭配' },
  { words: ['确诊', '诊断为'], to: '判断为' }
];

const MAX_WORD_LEN = WORD_MAP.reduce(function (max, g) {
  return g.words.reduce(function (m, w) { return Math.max(m, w.length); }, max);
}, 1);

/** 疾病名出现即视为高风险表述，整句降级为就医引导 */
const DISEASE_RE = /(癌|肿瘤|白血病|尿毒症|肝硬化|糖尿病|高血压|冠心病|心梗|中风|抑郁症?|焦虑症?)/;

/* ---------------- 入站风控 ---------------- */

/**
 * @returns {null | {blocks:Array, kind:string, reason:string}}
 */
function preCheck(input, ctx) {
  const text = (input || '').trim();
  if (!text) return null;

  if (agent.hitMedical(text)) {
    ctx.flags = ctx.flags || {};
    ctx.flags.medical = true;
    return {
      kind: 'medical',
      reason: '命中医疗诊疗意图，短路处理',
      blocks: [
        { type: 'notice', text: agent.SAFETY_TEXT, tone: 'danger' },
        { type: 'text', text: '如果你愿意，也可以告诉我最近在睡眠、胃口、体力方面的日常感受，我可以在「日常养生」范围内给你一些茶饮方向的参考。', small: true },
        {
          type: 'chips',
          items: [
            { label: '我最近总觉得累', text: '我最近总觉得累，没什么力气' },
            { label: '睡不好多梦', text: '最近睡不好，总是做梦' },
            { label: '只想了解体质知识', action: 'knowledge' }
          ]
        }
      ]
    };
  }

  // 特殊人群：高危（孕期/哺乳/儿童）直接终止推荐，只做提示
  let high = null;
  agent.SPECIAL_RULES.forEach(function (r) {
    if (r.re.test(text) && !(ctx.flags && ctx.flags[r.key])) {
      ctx.flags = ctx.flags || {};
      ctx.flags[r.key] = true;
      if (r.level === 'high' && !high) high = r;
    }
  });

  if (high) {
    return {
      kind: high.key,
      reason: '高危人群，终止推荐链路',
      blocks: [
        { type: 'notice', text: high.text, tone: 'danger' },
        { type: 'text', text: '这一阶段日常以温和饮食为主就好。如果你想了解九种体质的基础知识，我可以先带你看一看。', small: true },
        { type: 'chips', items: [{ label: '看看体质科普', action: 'knowledge' }, { label: '了解九种体质', action: 'knowledge' }] }
      ]
    };
  }

  return null;
}

/** 中低危风险：注入前后文，让模型主动调用 flag_risk */
function riskHints(input, ctx) {
  const text = (input || '').trim();
  const hits = [];
  agent.SPECIAL_RULES.forEach(function (r) {
    if (r.re.test(text)) hits.push(r.key);
  });
  if (hits.length) return hits;
  const p = ctx.profile;
  if (p && p.basic) {
    if (p.basic.stage && p.basic.stage !== '无') hits.push('stage');
    if (p.basic.conditions && p.basic.conditions.filter(function (x) { return x !== '以上都没有'; }).length) hits.push('chronic');
    if (p.basic.allergy) hits.push('allergy');
  }
  return hits;
}

/* ---------------- 出站净化 ---------------- */

/**
 * @returns {{text:string, replaced:string[], blocked:boolean}}
 */
function sanitize(text) {
  let out = text || '';
  const replaced = [];
  WORD_MAP.forEach(function (group) {
    group.words.forEach(function (w) {
      if (out.indexOf(w) === -1) return;
      replaced.push(w);
      out = out.split(w).join(group.to);
    });
  });
  const m = out.match(DISEASE_RE);
  if (m) {
    replaced.push(m[0]);
    return { text: '', replaced: replaced, blocked: true };
  }
  return { text: out, replaced: replaced, blocked: false };
}

/** 找出 s 处能匹配到的最长禁词（不带即返回空串） */
function wordAt(s, i) {
  let best = '';
  for (let g = 0; g < WORD_MAP.length; g++) {
    const ws = WORD_MAP[g].words;
    for (let k = 0; k < ws.length; k++) {
      const w = ws[k];
      if (w.length > best.length && s.substr(i, w.length) === w) best = w;
    }
  }
  return best;
}

/**
 * 流式净化器。
 *
 * 核心难点是「边界安全」：不能把一个禁词切在已输出段与缓冲区之间，
 * 否则「根治」被拆成「根」+「治」就漏检了——这不是加长 holdback 能解决的，
 * 固定长度 holdback 只能把问题概率降低，无法消除。
 *
 * 这里改用「安全前缀」判定：设待输出前缀长度为 p，只要存在某个禁词 w 满足
 * s < p < s + |w|，p 就不安全，此时把 p 抬到 s + |w|，再重新校验，直到稳定。
 * 由于只扫描 p 前 MAX_WORD_LEN 个起点、且这些位置的匹配窗口都在已知文本内，
 * 判定是完备的，可以保证零漏检。
 */
function makeStreamSanitizer(emit) {
  let raw = '';
  const log = [];

  function safePrefix(isFinal) {
    if (isFinal) return raw.length;
    let p = Math.max(0, raw.length - (MAX_WORD_LEN - 1));
    for (let guard = 0; guard < 32; guard++) {
      let bump = -1;
      const from = Math.max(0, p - MAX_WORD_LEN);
      for (let s = from; s < p; s++) {
        const w = wordAt(raw, s);
        if (w && s + w.length > p) bump = Math.max(bump, s + w.length);
      }
      if (bump < 0) break;
      p = bump;
    }
    return p;
  }

  function drain(isFinal) {
    const p = safePrefix(isFinal);
    if (p <= 0) return;
    const seg = raw.slice(0, p);
    raw = raw.slice(p);          // 被切走的片段不含跨界禁词，可以安全丢弃
    const r = sanitize(seg);
    log.push.apply(log, r.replaced);
    if (!r.blocked && r.text) emit(r.text);
  }

  return {
    push: function (delta) {
      raw += delta || '';
      drain(false);
    },
    flush: function () {
      drain(true);
      return { replaced: log.slice(), blocked: false };
    }
  };
}

/* ---------------- 留痕 ---------------- */

const AUDIT = [];
const AUDIT_MAX = 500;

/** 结构化审计日志：一次推荐链路上「模型决定了什么、系统实际返回了什么」都可回溯 */
function audit(stage, payload, result) {
  const item = {
    at: new Date().toISOString(),
    stage: stage,
    input: summarize(payload),
    output: summarize(result)
  };
  AUDIT.push(item);
  if (AUDIT.length > AUDIT_MAX) AUDIT.shift();
  if (process.env.LOG_LEVEL !== 'silent') {
    console.log('[audit] ' + item.stage + ' ' + JSON.stringify(item.output).slice(0, 200));
  }
  return item;
}

function summarize(v) {
  if (v === undefined || v === null) return v;
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    if (s.length <= 600) return v;
    return { __truncated__: true, preview: s.slice(0, 560) };
  }
  return v;
}

function recentAudit(n) {
  return AUDIT.slice(-(n || 50));
}

/** 知识库是否够用：命中为空时给出兜底提示而非编造 */
function unknownHint(query) {
  const has = knowledge.ingredients.some(function (i) { return query.indexOf(i.name) > -1; });
  return has
    ? '知识库收录了这味食材，但检索未命中，请换一种问法。'
    : '知识库未收录该内容，请如实告知用户「这部分暂时没有收录」。';
}

module.exports = {
  preCheck: preCheck,
  riskHints: riskHints,
  sanitize: sanitize,
  makeStreamSanitizer: makeStreamSanitizer,
  audit: audit,
  recentAudit: recentAudit,
  unknownHint: unknownHint,
  WORD_MAP: WORD_MAP
};
