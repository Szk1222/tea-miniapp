/**
 * 规则引擎：体质评分 / 判定 / 茶方匹配
 * 采用「硬规则 + 固定映射」实现，避免生成式模型在体质判定上出现偏差。
 */

const constitutions = require('../data/constitutions.js');
const teas = require('../data/teas.js');
const questions = require('../data/questions.js');
const feedback = require('./feedback.js');

/* ---------- 每套体质的理论最高分（用于计算倾向度百分比） ---------- */
const MAX_SCORE = {};

/**
 * 重算理论最高分。
 * 量表或体质库被管理后台的内容覆盖后必须调用，否则 MAX_SCORE 仍是内置数据的
 * 结果，percentOf 会算出偏离 100% 的百分比。
 * @returns {object} 体质 id → 理论最高分
 */
function reload() {
  Object.keys(MAX_SCORE).forEach(function (k) { delete MAX_SCORE[k]; });
  constitutions.ids.forEach(function (id) { MAX_SCORE[id] = 0; });
  questions.list.forEach(function (q) {
    const per = {};
    q.options.forEach(function (o) {
      Object.keys(o.scores).forEach(function (k) {
        per[k] = Math.max(per[k] || 0, o.scores[k]);
      });
    });
    Object.keys(per).forEach(function (k) {
      MAX_SCORE[k] = (MAX_SCORE[k] || 0) + per[k];
    });
  });
  return MAX_SCORE;
}
reload();

/* ---------- 评分 ---------- */
function score(answers) {
  const s = {};
  constitutions.ids.forEach(function (id) { s[id] = 0; });
  (answers || []).forEach(function (optIdx, qi) {
    const q = questions.list[qi];
    if (!q || optIdx === null || typeof optIdx === 'undefined' || optIdx < 0) return;
    const opt = q.options[optIdx];
    if (!opt) return;
    Object.keys(opt.scores).forEach(function (k) {
      s[k] = (s[k] || 0) + opt.scores[k];
    });
  });
  return s;
}

function percentOf(id, raw) {
  const max = MAX_SCORE[id] || 1;
  return Math.min(100, Math.round((raw / max) * 100));
}

/* ---------- 判定主导体质 ---------- */
function resolve(rawScores) {
  const raw = rawScores || {};
  // 以「相对倾向度」比较（raw / 该体质理论最高分），避免平和质因题量大而被高估
  const ranked = constitutions.ids.map(function (id) {
    const r = raw[id] || 0;
    const max = MAX_SCORE[id] || 1;
    return {
      id: id,
      name: constitutions.map[id].name,
      color: constitutions.map[id].color,
      raw: r,
      ratio: max ? r / max : 0,
      percent: percentOf(id, r)
    };
  }).sort(function (a, b) { return b.ratio - a.ratio || b.raw - a.raw || a.id.localeCompare(b.id); });

  const total = ranked.reduce(function (a, b) { return a + b.raw; }, 0);
  const pinghe = ranked.filter(function (x) { return x.id === 'pinghe'; })[0];
  const others = ranked.filter(function (x) { return x.id !== 'pinghe'; });

  let main;
  if (!total || (pinghe && pinghe.ratio >= others[0].ratio)) {
    main = pinghe;
  } else {
    main = others[0];
  }

  let secondary = null;
  if (main.id !== 'pinghe') {
    const rest = ranked.filter(function (x) { return x.id !== main.id && x.id !== 'pinghe'; });
    if (rest.length && rest[0].ratio >= Math.max(0.2, main.ratio * 0.6)) secondary = rest[0];
  }

  const topPercent = main.percent;
  let level = '平和';
  let levelText = '状态较为均衡';
  if (main.id !== 'pinghe') {
    if (topPercent >= 60) { level = '明显'; levelText = '倾向比较明显'; }
    else if (topPercent >= 35) { level = '偏颇'; levelText = '有一定倾向'; }
    else { level = '轻度'; levelText = '倾向较轻'; }
  }

  const ranking = ranked.map(function (x) {
    return { id: x.id, name: x.name, color: x.color, raw: x.raw, percent: x.percent };
  });

  return {
    main: main.id,
    mainName: main.name,
    secondary: secondary ? secondary.id : '',
    secondaryName: secondary ? secondary.name : '',
    percent: topPercent,
    level: level,
    levelText: levelText,
    ranking: ranking,
    answeredAt: Date.now()
  };
}

function analyze(answers) {
  return resolve(score(answers));
}

/* ---------- 季节 ---------- */
function seasonOf(date) {
  const m = (date || new Date()).getMonth() + 1;
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

function seasonName(s) {
  return { '春': '春季', '夏': '夏季', '秋': '秋季', '冬': '冬季' }[s] || '当季';
}

/* ---------- 茶方匹配 ---------- */
function scoreTea(tea, opt) {
  let sc = 100;
  const season = opt.season;
  if (season && tea.season && tea.season.indexOf(season) > -1) sc += 14;
  if (opt.exclude && opt.exclude.indexOf(tea.id) > -1) sc -= 400;
  if (opt.preferTags) {
    opt.preferTags.forEach(function (t) {
      if (tea.tags && tea.tags.indexOf(t) > -1) sc += 8;
    });
  }
  if (tea.constitution === opt.primary) sc += 30;
  if (tea.constitution === opt.secondary) sc += 10;
  // 用户历史体感：只调权重、不碰风险档位（见文件头）
  if (opt.feedback) sc += feedback.weightDelta(tea, opt.feedback);
  return sc;
}

/* ---------------- 推荐：风险分级 ----------------
 * 「禁用 / 忌用」是「不该喝」，不是「少喝一点」—— 它们**不进推荐池**。
 * 「慎用 / 减量 / 咨询医师」仍可推荐，但排序必须让它们靠后。
 *
 * 为什么不能只用「权重 − 惩罚分」单值排序：体质匹配 +30、季节匹配 +14 是结构加分，
 * 而惩罚分再大也可能被抵消。曾出现「忌用茶方排在慎用茶方之前、甚至排第一」的
 * 自相矛盾结果（推荐区推荐它、下面又标它忌用）。故改为**风险档位优先**的二级排序。
 * ------------------------------------------------------------------ */

/** 命中即排除出推荐池 */
const RISK_BLOCKED = ['禁用', '忌用'];

/** 风险档位：数字越大越靠后。仅在未被 RISK_BLOCKED 排除时才有意义 */
function riskTier(level) {
  if (!level) return 0;
  if (level === '慎用') return 3;
  if (level === '减量') return 2;
  return 1; // 咨询医师
}

/**
 * 为体质推荐茶方（含被排除项，供页面分区展示）。
 *
 * @param {string} primary 主导体质 id
 * @param {object} opt { secondary, season, limit, exclude, preferTags, basic }
 * @returns {{picks:Array, blocked:Array}} blocked 为命中禁用/忌用而被排除的茶方
 */
function recommendFull(primary, opt) {
  opt = opt || {};
  const limit = opt.limit || 3;
  const season = opt.season || seasonOf();

  const blocked = [];
  const pool = [];

  teas.list.forEach(function (t) {
    if (opt.exclude && opt.exclude.indexOf(t.id) > -1) return;
    const sameP = t.constitution === primary;
    const sameS = opt.secondary && t.constitution === opt.secondary;
    if (!sameP && !sameS) return;

    const risk = opt.basic ? riskOf(t, opt.basic) : null;
    const level = risk ? risk.level : '';
    if (RISK_BLOCKED.indexOf(level) > -1) {
      blocked.push({ tea: t, risk: risk });
      return;
    }
    pool.push({
      tea: t,
      tier: riskTier(level),
      weight: scoreTea(t, {
        primary: primary,
        secondary: opt.secondary,
        season: season,
        preferTags: opt.preferTags,
        feedback: opt.feedback
      })
    });
  });

  const byTierThenWeight = function (a, b) {
    return a.tier - b.tier || b.weight - a.weight;
  };
  pool.sort(byTierThenWeight);

  const picks = pool.slice(0, limit).map(function (x) { return x.tea; });

  // 兜底：主推不足时用平和质温和茶补齐（同样先剔除禁用/忌用）
  if (picks.length < limit) {
    const extra = [];
    teas.byConstitution('pinghe').forEach(function (t) {
      if (opt.exclude && opt.exclude.indexOf(t.id) > -1) return;
      if (picks.some(function (r) { return r.id === t.id; })) return;
      if (extra.some(function (r) { return r.id === t.id; })) return;
      const risk = opt.basic ? riskOf(t, opt.basic) : null;
      const level = risk ? risk.level : '';
      if (RISK_BLOCKED.indexOf(level) > -1) {
        blocked.push({ tea: t, risk: risk });
        return;
      }
      extra.push({
        tea: t,
        tier: riskTier(level),
        weight: scoreTea(t, {
          primary: 'pinghe',
          secondary: '',
          season: season,
          preferTags: opt.preferTags,
          feedback: opt.feedback
        })
      });
    });
    extra.sort(byTierThenWeight);
    extra.forEach(function (x) {
      if (picks.length < limit) picks.push(x.tea);
    });
  }

  return { picks: picks, blocked: blocked };
}

/** 只取推荐列表（多数调用方用这个） */
function recommend(primary, opt) {
  return recommendFull(primary, opt).picks;
}

/** 通过 id 列表取茶方详情 */
function picks(ids) {
  return (ids || []).map(function (id) { return teas.map[id]; }).filter(Boolean);
}

/** 搜索 */
function search(kw) {
  const k = (kw || '').trim();
  if (!k) return teas.list.slice();
  const lower = k.toLowerCase();
  return teas.list.filter(function (t) {
    const text = [
      t.name, t.subtitle, t.nature, t.taste,
      t.tags.join(' '),
      t.scenes.join(' '),
      t.effects.join(' '),
      t.ingredients.map(function (i) { return i.name; }).join(' ')
    ].join(' ');
    if (text.toLowerCase().indexOf(lower) > -1) return true;
    const c = constitutions.map[t.constitution];
    return c && (c.name.indexOf(k) > -1 || c.short.indexOf(k) > -1);
  });
}

/** 关键词 → 体质。
 *  除了口语关键词，也认体质名本身（「我更像阳虚质」）——
 *  症状鉴别问句的快捷选项会用它回传用户选择，不认名字就落不到对应体质上。 */
function constitutionByKeyword(text) {
  const t = text || '';
  let best = null;
  constitutions.list.forEach(function (c) {
    let hit = 0;
    c.keywords.forEach(function (k) {
      if (t.indexOf(k) > -1) hit += k.length;
    });
    if (c.name && t.indexOf(c.name) > -1) hit += 6;
    if (c.short && c.short.length >= 3 && t.indexOf(c.short) > -1) hit += 3;
    if (hit > 0 && (!best || hit > best.hit)) best = { id: c.id, hit: hit };
  });
  return best ? best.id : '';
}

/* ---------------- 症状 → 体质 → 茶方（统一映射表） ----------------
 * 背景（审计 5.3）：同一个「睡不好」，量表分给阴虚/气虚/特禀，关键词全挂气郁，
 * 茶方又分散在气郁(16) 与阴虚(8)，三处入口各说各话。
 * 这里收敛成一份表：命中后**先返回鉴别要点**，让上层回跳到量表题或给出鉴别问句，
 * 而不是跳过鉴别直接下结论。
 * ------------------------------------------------------------------ */

const SYMPTOM_MAP = [
  {
    id: 'sleep',
    label: '睡眠不佳',
    keywords: ['失眠', '睡不着', '入睡困难', '难以入睡', '多梦', '睡不好', '睡不踏实', '睡得浅', '易醒', '早醒', '半夜醒', '睡不够', '睡眠差', '睡眠不好', '睡眠浅'],
    candidates: [
      { constitution: 'yinxu', distinguish: '伴手足心热、盗汗、口干咽燥', teas: ['baihe-sangshen', 'gouqi-maidong'] },
      { constitution: 'qiyu', distinguish: '伴情绪低落、胸闷叹气、白天紧张', teas: ['moli-baihe', 'meigui-foshou'] },
      { constitution: 'qixu', distinguish: '睡够时间却仍不解乏、白天没劲', teas: ['shanyao-lianzi'] }
    ]
  },
  {
    id: 'cold',
    label: '畏寒怕冷',
    keywords: ['怕冷', '怕凉', '手脚凉', '手脚冰凉', '手脚发凉', '畏寒', '怕风寒', '暖身', '腹部发凉', '肚子凉', '腰凉', '容易冷', '比别人怕冷', '一见风就冷'],
    candidates: [
      { constitution: 'yangxu', distinguish: '喜热饮、大便偏稀、精神倦怠', teas: ['jiangzao-nuanyang', 'rougui-guiyuan'] },
      { constitution: 'qixu', distinguish: '兼疲乏气短、说话没劲', teas: ['huangqi-dangshen', 'shanyao-lianzi'] },
      { constitution: 'xueyu', distinguish: '面色偏暗、唇色暗、易有瘀青', teas: ['meigui-guihua'] }
    ]
  },
  {
    id: 'damp',
    label: '湿重困重',
    keywords: ['湿气', '湿气重', '祛湿', '身体沉', '身体沉重', '沉重', '粘马桶', '大便黏', '大便粘', '浮肿', '水肿', '舌苔厚腻', '困倦', '没胃口', '困重', '头昏沉'],
    candidates: [
      { constitution: 'tanshi', distinguish: '腹型偏胖、舌苔白腻、痰多胸闷', teas: ['hongdou-yimi', 'chenpi-heye'] },
      { constitution: 'shire', distinguish: '面油长痘、口苦口臭、舌苔黄腻', teas: ['jinyinhua-juhua', 'pugongying-yumixu'] }
    ]
  },
  {
    id: 'heat',
    label: '上火燥热',
    keywords: ['上火', '口苦', '口臭', '长痘', '起痘', '痘痘', '痤疮', '口腔溃疡', '嘴破', '溃疡', '嗓子疼', '咽喉痛', '脸油', '脸出油', '出油', '燥热', '爱出汗'],
    candidates: [
      { constitution: 'shire', distinguish: '大便黏滞或干结、舌苔黄腻', teas: ['jinyinhua-juhua', 'pugongying-yumixu'] },
      { constitution: 'yinxu', distinguish: '伴口干咽燥、手足心热、盗汗', teas: ['gouqi-maidong'] }
    ]
  },
  {
    id: 'tired',
    label: '疲乏无力',
    keywords: ['没力气', '没劲', '乏力', '疲劳', '容易累', '很累', '总觉得累', '气短', '懒得说话', '不想说话', '出虚汗', '精神差', '打不起精神', '容易疲惫'],
    candidates: [
      { constitution: 'qixu', distinguish: '稍动即出汗、说话声音低弱、换季易感冒', teas: ['huangqi-dangshen', 'shanyao-lianzi'] },
      { constitution: 'tanshi', distinguish: '伴身体沉重、腹部松软、大便黏腻', teas: ['hongdou-yimi'] },
      { constitution: 'qiyu', distinguish: '伴情绪低落、对事情提不起兴趣', teas: ['meigui-foshou'] }
    ]
  },
  {
    id: 'dry',
    label: '口干眼干',
    keywords: ['口干', '嘴干', '咽干', '嗓子干', '喉咙干', '眼干', '眼睛干', '眼睛干痒', '眼涩', '眼睛涩', '眼睛发痒', '眼屎', '总想喝水', '老想喝水', '皮肤干', '皮肤干燥', '嘴唇干', '鼻子干', '口燥', '干痒'],
    candidates: [
      { constitution: 'yinxu', distinguish: '伴手足心热、夜间出汗、舌红少苔', teas: ['gouqi-maidong', 'baihe-sangshen'] },
      { constitution: 'shire', distinguish: '伴口苦口臭、面油长痘', teas: ['jinyinhua-juhua'] }
    ]
  },
  {
    id: 'mood',
    label: '情绪郁结',
    keywords: ['情绪', '情绪差', '情绪低落', '心情差', '心情不好', '压力', '压力大', '郁闷', '压抑', '叹气', '爱叹气', '焦虑', '紧张', '烦躁', '易怒', '爱生气', '容易生气', '胸闷', '胸胁胀', '提不起兴趣', '开心不起来'],
    candidates: [
      { constitution: 'qiyu', distinguish: '常感胸闷、喜欢叹气、咽喉有异物感', teas: ['meigui-foshou', 'moli-baihe'] },
      { constitution: 'xueyu', distinguish: '面色晦暗、唇色偏暗、易有瘀青', teas: ['meigui-shanzha'] }
    ]
  },
  {
    id: 'stool',
    label: '排便异常',
    keywords: ['便溏', '大便稀', '拉稀', '不成形', '腹泻', '便秘', '排便用力', '大便干', '大便干结', '排便不畅', '几天没排便', '大便黏', '粘马桶'],
    candidates: [
      { constitution: 'yangxu', distinguish: '偏稀、吃凉的就容易腹泻', teas: ['jiangzao-nuanyang'] },
      { constitution: 'qixu', distinguish: '偏稀但伴疲乏、食欲偏差', teas: ['shanyao-lianzi'] },
      { constitution: 'yinxu', distinguish: '偏干结、排便需要用力', teas: ['gouqi-maidong'] },
      { constitution: 'tanshi', distinguish: '黏腻不畅、容易粘马桶', teas: ['chenpi-heye'] }
    ]
  },
  {
    id: 'allergy',
    label: '过敏倾向',
    keywords: ['过敏', '鼻炎', '荨麻疹', '红疹', '打喷嚏', '皮肤痒', '身上痒', '鼻痒', '换季过敏', '易过敏'],
    candidates: [
      { constitution: 'tebing', distinguish: '换季或接触花粉/尘螨时加重', teas: ['dazao-shanyao', 'wumei-shanzha'] }
    ]
  }
];

/**
 * 按症状文本匹配统一映射表。
 * @param {string} text 用户原话
 * @returns {null|object} 命中的条目（含候选体质与鉴别要点）
 */
function symptomGuide(text) {
  const t = text || '';
  let best = null;
  let bestHit = 0;
  SYMPTOM_MAP.forEach(function (item) {
    let hit = 0;
    item.keywords.forEach(function (k) { if (t.indexOf(k) > -1) hit += k.length; });
    if (hit > bestHit) { best = item; bestHit = hit; }
  });
  return best;
}

/**
 * 「自定义症状」分析：在 symptomGuide 之上加一层兜底。
 *
 * 背景：用户补充的症状常常不在 SYMPTOM_MAP 的口语词里（例如「眼睛干痒」「总想发脾气」），
 * 直接判定为「没听懂」会让这个入口形同虚设。这里做两级降级：
 *   1) 命中统一症状表 → 返回候选体质与鉴别要点（与 symptomGuide 一致，但多带 matched 词）
 *   2) 未命中 → 退回体质识别关键词（constitutions.keywords），给出最贴近的体质方向
 *   3) 仍未命中 → 返回 null，交给上层（对话页/服务端 RAG）去知识库检索
 *
 * @param {string} text
 * @returns {null|{id:string,label:string,candidates:Array,matched:string[],source:string}}
 */
function symptomAnalyze(text) {
  const t = (text || '').trim();
  if (!t) return null;

  let best = null;
  let bestHit = 0;
  const matched = [];
  SYMPTOM_MAP.forEach(function (item) {
    const hits = item.keywords.filter(function (k) { return t.indexOf(k) > -1; });
    const hit = hits.reduce(function (a, k) { return a + k.length; }, 0);
    if (hit > bestHit) { best = item; bestHit = hit; }
  });
  if (best) {
    SYMPTOM_MAP.forEach(function (item) {
      if (item !== best) return;
      item.keywords.forEach(function (k) { if (t.indexOf(k) > -1) matched.push(k); });
    });
    return { id: best.id, label: best.label, candidates: best.candidates, matched: matched, source: 'symptom' };
  }

  const cid = constitutionByKeyword(t);
  if (cid) {
    const c = constitutions.getOr(cid);
    const pool = teas.byConstitution(cid).slice(0, 3).map(function (x) { return x.id; });
    return {
      id: 'constitution',
      label: c.name,
      candidates: [{ constitution: cid, distinguish: c.short || '', teas: pool }],
      matched: [],
      source: 'constitution'
    };
  }

  return null;
}

/* ---------------- 安全：茶方风险标注 ---------------- */

/** 取风险等级在 LEVEL_ORDER 中的严格度（数字越大越严重） */
function levelRank(level) {
  const i = teas.LEVEL_ORDER.indexOf(level);
  return i < 0 ? -1 : (teas.LEVEL_ORDER.length - i);
}

/**
 * 计算某款茶方对给定基础信息的风险。
 * @param {object} tea 茶方
 * @param {object} basic profile.basic（含 drugs/conditions/stage/age）
 * @returns {null|{level:string, items:Array, drugNotes:Array}} 无命中返回 null
 */
function riskOf(tea, basic) {
  if (!tea || !basic) return null;
  const items = teas.hitContraindications(tea, basic);
  const keys = tea.drugInteraction || [];
  const drugNotes = [];
  const groups = [];
  (basic.drugs || []).forEach(function (d) {
    if (d.indexOf('抗凝') > -1) groups.push('anticoagulant');
    if (d.indexOf('降糖') > -1) groups.push('glucoseDrug');
    if (d.indexOf('甲状腺') > -1) groups.push('thyroid');
    if (d.indexOf('免疫抑制') > -1) groups.push('immunosuppressant');
    if (d.indexOf('镇静') > -1 || d.indexOf('抗抑郁') > -1) groups.push('sedative');
  });
  if (basic.stage === '孕期') groups.push('pregnant');
  if (basic.stage === '哺乳期') groups.push('lactating');
  // 甲状腺用药与「全库通用」提示：只要在服甲状腺药就提示间隔 ≥4 小时
  if (groups.indexOf('thyroid') > -1) {
    drugNotes.push(teas.DRUG_NOTES.thyroid);
  }
  groups.forEach(function (g) {
    if (g === 'thyroid') return; // 已在上面统一提示
    if (keys.indexOf(g) > -1 && teas.DRUG_NOTES[g]) drugNotes.push(teas.DRUG_NOTES[g]);
  });
  if (!items.length && !drugNotes.length) return null;
  let level = '';
  items.forEach(function (c) {
    if (!level || levelRank(c.level) > levelRank(level)) level = c.level;
  });
  if (!level) level = '咨询医师';
  return { level: level, items: items, drugNotes: drugNotes };
}

/** 由基础信息推导出「需要联动禁忌」的布尔标记（服务端最小化上行时用） */
function riskFlags(basic) {
  const b = basic || {};
  const flags = { stage: false, chronic: false, allergy: false };
  flags.stage = b.stage === '孕期' || b.stage === '哺乳期' || b.stage === '备孕中' || b.stage === '近期拟手术';
  flags.chronic = !!(b.drugs && b.drugs.some(function (d) { return d.indexOf('以上都没有') === -1; })) ||
    !!(b.conditions && b.conditions.some(function (c) { return c !== '以上都没有'; }));
  flags.allergy = !!(b.allergy && b.allergy.trim()) ||
    !!(b.allergens && b.allergens.some(function (a) { return a !== '以上都没有'; }));
  return flags;
}

module.exports = {
  MAX_SCORE: MAX_SCORE,
  reload: reload,
  score: score,
  resolve: resolve,
  analyze: analyze,
  seasonOf: seasonOf,
  seasonName: seasonName,
  recommend: recommend,
  recommendFull: recommendFull,
  RISK_BLOCKED: RISK_BLOCKED,
  riskTier: riskTier,
  picks: picks,
  search: search,
  constitutionByKeyword: constitutionByKeyword,
  SYMPTOM_MAP: SYMPTOM_MAP,
  symptomGuide: symptomGuide,
  symptomAnalyze: symptomAnalyze,
  riskOf: riskOf,
  riskFlags: riskFlags
};
