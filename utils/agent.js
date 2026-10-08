/**
 * 养生顾问对话引擎
 * 架构：规则引擎（意图识别 + 固定映射）为骨架，文案模板负责自然语言表达。
 * 关键点：体质判定与茶方匹配全部走硬规则，避免生成式内容出现专业偏差。
 * 合规风控：医疗敏感意图拦截 → 统一话术引导就医；特殊人群前置风险提示。
 */

const engine = require('./engine.js');
const constitutions = require('../data/constitutions.js');
const teas = require('../data/teas.js');
const knowledge = require('../data/knowledge.js');

const DISCLAIMER = '本建议仅作日常养生参考，不替代专业医疗建议。';

const SAFETY_TEXT =
  '温馨提示：本助手仅提供日常养生茶饮建议，不具备医疗诊断与治疗资质。' +
  '如果您有明确的身体不适或疾病问题，请及时前往正规医疗机构就诊。';

/* ---------------- 风控词库 ---------------- */

// 医疗诊疗意图（命中即走统一安全话术）
const MEDICAL_RULES = [
  { re: /(治疗|治好|治愈|根治|疗效|痊愈|药到病除|吃药能好)/, tag: 'cure' },
  { re: /(吃什么药|用什么药|买药|开点药|开药|开个方|处方|药方|偏方)/, tag: 'drug' },
  { re: /(确诊|是不是得|是不是有|会不会是).{0,8}(癌|肿瘤|糖尿病|高血压|心脏病|肝病|肾病|中风|抑郁)/, tag: 'diagnose' },
  { re: /(癌|肿瘤|白血病|尿毒症|肝硬化|肺结核|中风|心梗)/, tag: 'disease' },
  { re: /(高烧|持续发热|咳血|便血|吐血|昏迷|呼吸困难|剧烈疼痛|疼得|痛得厉害)/, tag: 'emergency' },
  { re: /(我得了|我这是不是|帮我诊断|诊断一下|看看我是什么病)/, tag: 'diagnose' },
  { re: /(得了什么病|是什么病|是不是有病|啥病|我是不是得病|身体是不是出问题)/, tag: 'diagnose' },
  { re: /(病情|病程|化验单|检查报告|指标异常|转氨酶|血糖高不高)/, tag: 'report' }
];

// 特殊人群
const SPECIAL_RULES = [
  { re: /(怀孕|孕期|孕妇|备孕|哺乳|喂奶|月子|产后)/, key: 'stage', level: 'high', text: '你提到的特殊阶段需要格外谨慎。孕期、哺乳期与产后属于敏感时期，含有药材成分的茶饮请先咨询产科或中医师后再决定是否饮用，本助手不会为这一阶段给出具体配方。' },
  { re: /(小孩|儿童|宝宝|婴儿|十几岁|上小学|上初中)/, key: 'child', level: 'high', text: '14 岁以下儿童身体尚在发育，不建议饮用含药材成分的养生茶，日常以温开水、淡粥为主即可。' },
  { re: /(高血压|糖尿病|血糖高|肝肾|肝功能|肾功能|心脏病|甲状腺|长期服药|慢性病|降压药|降糖药|降脂药|长期吃药|正在吃药|服药|用药)/, key: 'chronic', level: 'mid', text: '你有提到基础健康情况，部分药食同源食材可能与用药或身体状况相互影响。建议在饮用任何茶饮前先咨询你的主治医师。' },
  { re: /(过敏|荨麻疹|皮疹|吃了会痒|过敏史)/, key: 'allergy', level: 'mid', text: '你提到过敏情况，建议先从成分最单一、且此前确定不过敏的食材开始，初次只喝小半杯，观察 24 小时没有不适再正常饮用。' }
];

// 追问 / 调整
const ADJUST_RULES = [
  { re: /(换成|换一|换点|换个别|别的|其他|再来|还有吗|还有其他|不喜欢|不爱喝|喝腻|新推荐)/, tag: 'more' },
  { re: /(熬夜|加班|睡眠不足|通宵)/, tag: 'stayup' },
  { re: /(上火|燥热|口腔溃疡|长痘)/, tag: 'heat' },
  { re: /(失眠|睡不着|入睡|多梦|睡不好)/, tag: 'sleep' },
  { re: /(怕冷|手脚凉|手脚冰凉|暖身|畏寒)/, tag: 'cold' },
  { re: /(湿气|祛湿|沉重|浮肿|粘马桶)/, tag: 'damp' },
  { re: /(减肥|体重|瘦身|消脂|胖)/, tag: 'weight' },
  { re: /(气色|脸色|面色|养颜|皮肤干)/, tag: 'skin' },
  { re: /(没力气|乏力|疲劳|累|没劲|气短)/, tag: 'tired' },
  { re: /(口干|咽干|喝水多|眼干)/, tag: 'dry' }
];

// 追问标签 → 兜底体质（用户未测评时按最贴近的方向给建议）
const TAG_FALLBACK = {
  damp: 'tanshi',
  weight: 'tanshi',
  cold: 'yangxu',
  heat: 'shire',
  sleep: 'qiyu',
  stayup: 'yinxu',
  dry: 'yinxu',
  tired: 'qixu',
  skin: 'pinghe'
};

const SEASON_WORDS = [
  { re: /(春天|春季|春夏|回暖)/, s: '春', name: '春季', tip: '春季重在疏肝理气、舒展气机，适合气味芬芳、性质平和的茶饮。' },
  { re: /(夏天|夏季|暑热|三伏|天气热)/, s: '夏', name: '夏季', tip: '夏季湿热并重，适合清爽利湿的茶饮，但不宜过度贪凉。' },
  { re: /(秋天|秋季|秋燥|干燥)/, s: '秋', name: '秋季', tip: '秋季燥气当令，重在滋阴润燥，适合甘润类茶饮。' },
  { re: /(冬天|冬季|寒冷|入冬)/, s: '冬', name: '冬季', tip: '冬季阳气内敛，适合温润暖身的茶饮，建议白天饮用。' }
];

const GREET_RE = /^(你好|您好|hi|hello|嗨|在吗|在不在|早上好|下午好|晚上好)/i;
const THANKS_RE = /(谢谢|感谢|多谢|辛苦)/;
const ASSESS_RE = /(测评|测一测|测试|测一下|检测|体质测试|开始测|怎么测)/;
const MY_TYPE_RE = /(我是什么体质|我的体质|体质结果|上次结果|我属于)/;
const HELP_RE = /(你是什么|你是谁|能做什么|会什么|介绍一下|功能|怎么用|帮助)/;
const TRUST_RE = /(靠谱|可信|资质|免责|安全吗|专业吗|准确)/;

/* ---------------- 消息工厂 ---------------- */

let seq = 0;
function make(type, payload) {
  seq += 1;
  return Object.assign({ id: 'm' + Date.now().toString(36) + '_' + seq, type: type }, payload || {});
}

function t(text, opt) {
  return make('text', Object.assign({ text: text, stream: true }, opt || {}));
}
function notice(text, tone) {
  return make('notice', { text: text, tone: tone || 'warn' });
}
function teasMsg(ids) {
  return make('teas', { teas: ids });
}
function chips(items) {
  return make('chips', { items: items });
}
function cta(title, desc, action, label) {
  return make('cta', { title: title, desc: desc, action: action, label: label || '去测评' });
}

const DEFAULT_CHIPS = [
  { label: '开始体质测评', action: 'assess' },
  { label: '最近湿气重', text: '最近总觉得身体沉、湿气重' },
  { label: '手脚总是冰凉', text: '手脚总是冰凉，特别怕冷' },
  { label: '入睡困难多梦', text: '晚上入睡困难，还老是做梦' },
  { label: '吃完饭就胀气', text: '吃完饭容易胀气，消化不太好' }
];

/* ---------------- 主入口 ---------------- */

/**
 * @param {string} input 用户输入
 * @param {object} ctx   { profile, lastTeas:[], flags:{} }
 * @returns {{messages:Array, ctx:object}}
 */
function respond(input, ctx) {
  const text = (input || '').trim();
  const state = Object.assign({ profile: null, lastTeas: [], flags: {}, asked: 0 }, ctx || {});
  const messages = [];

  if (!text) {
    return { messages: [t('你可以直接说说最近的感受，比如「总是没力气」「手脚冰凉」或者「最近老睡不好」。')], ctx: state };
  }

  /* 1. 医疗红线优先拦截 */
  if (hitMedical(text)) {
    messages.push(notice(SAFETY_TEXT, 'danger'));
    messages.push(t('如果你愿意，也可以告诉我最近在睡眠、胃口、体力方面的日常感受，我可以在「日常养生」范围内给你一些茶饮方向的参考。', { small: true }));
    messages.push(chips([
      { label: '我最近总觉得累', text: '我最近总觉得累，没什么力气' },
      { label: '睡不好多梦', text: '最近睡不好，总是做梦' },
      { label: '只想了解体质知识', action: 'knowledge' }
    ]));
    return { messages: messages, ctx: state };
  }

  /* 2. 特殊人群风险前置 */
  let specialHit = null;
  SPECIAL_RULES.forEach(function (r) {
    if (r.re.test(text) && !state.flags[r.key]) {
      state.flags[r.key] = true;
      if (!specialHit) specialHit = r;
    }
  });
  if (specialHit) {
    messages.push(notice(specialHit.text, specialHit.level === 'high' ? 'danger' : 'warn'));
    if (specialHit.level === 'high') {
      messages.push(t('这一阶段日常以温和饮食为主就好。如果你想了解九种体质的基础知识，我可以先带你看一看。', { small: true }));
      messages.push(chips([
        { label: '看看体质科普', action: 'knowledge' },
        { label: '了解九种体质', action: 'knowledge' }
      ]));
      return { messages: messages, ctx: state };
    }
  }

  /* 3. 问候 / 感谢 / 身份 */
  if (GREET_RE.test(text) && text.length <= 12) {
    return { messages: welcome(state), ctx: state };
  }
  if (THANKS_RE.test(text) && text.length <= 12) {
    messages.push(t('不客气。养生茶的调理节奏是温和而缓慢的，坚持比用力更重要。有新的感受随时来问我。'));
    messages.push(t(DISCLAIMER, { small: true }));
    messages.push(chips(DEFAULT_CHIPS.slice(1)));
    return { messages: messages, ctx: state };
  }
  if (HELP_RE.test(text)) {
    return { messages: introSelf(state), ctx: state };
  }
  if (TRUST_RE.test(text)) {
    messages.push(t('我们的体质判定参考国家中医药管理局《中医体质分类与判定》标准做了简化改编，茶方食材全部限定在药食同源目录内，用量取日常养生参考剂量。\n\n它适合用来了解自己的养生方向，但不等同于专业辨识，也不替代任何医疗建议。'));
    messages.push(chips(DEFAULT_CHIPS));
    return { messages: messages, ctx: state };
  }

  /* 4. 测评意图 */
  if (ASSESS_RE.test(text)) {
    messages.push(t('好，我们用 10 道选择题做一次快速测评，大约 1 分半钟。全程只在本机记录，不会上传。'));
    messages.push(cta('中医体质快速测评', '10 道题 · 约 90 秒 · 生成你的体质档案', 'assess', '开始测评'));
    return { messages: messages, ctx: state };
  }

  /* 5. 查询我的体质 */
  if (MY_TYPE_RE.test(text)) {
    if (state.profile && state.profile.constitutionId) {
      const c = constitutions.getOr(state.profile.constitutionId);
      messages.push(t('根据你上次的测评，主导体质是「' + c.name + '」，' + state.profile.levelText + '。'));
      messages.push(t(c.brief + '\n\n调理思路：' + c.principle));
      const list = engine.recommend(c.id, { season: engine.seasonOf(), limit: 2 });
      messages.push(teasMsg(list.map(function (x) { return x.id; })));
      messages.push(t(DISCLAIMER, { small: true }));
      messages.push(chips([
        { label: '重新测评', action: 'assess' },
        { label: '看看我的档案', action: 'profile' },
        { label: '换一批茶方', text: '还有别的茶方推荐吗' }
      ]));
    } else {
      messages.push(t('你还没有生成体质档案。做完一次快速测评，我就能按你的体质来配茶了。'));
      messages.push(cta('中医体质快速测评', '10 道题 · 约 90 秒 · 生成你的体质档案', 'assess', '开始测评'));
    }
    return { messages: messages, ctx: state };
  }

  /* 6. 口味偏好：不喜欢某味食材 → 直接换配方 */
  const dislike = /(不喜欢|不爱喝|喝腻|受不了|讨厌|害怕|抵触|不想喝)/.test(text) ? matchIngredient(text) : null;
  if (dislike) {
    const cid = (state.profile && state.profile.constitutionId) || 'pinghe';
    const exclude = teas.list.filter(function (t) {
      return t.ingredients.some(function (i) { return i.name.indexOf(dislike.name) > -1; });
    }).map(function (t) { return t.id; });
    messages.push(t('没问题。「' + dislike.name + '」在这 ' + exclude.length + ' 款茶方里都有用到，我已经把它们排除了。'));
    messages.push(t('给你两个替换思路：如果只是不喜欢它的味道，可以把用量减半，或与其他食材同泡以弱化气味；如果是身体不太适应，我们直接换成方向相近的配方就好。'));
    return finishRecommend(messages, state, cid, {
      season: engine.seasonOf(),
      limit: 2,
      exclude: exclude,
      silentIntro: true,
      intro: '下面这两款都不含' + dislike.name + '，调理方向相近。'
    });
  }

  /* 7. 食材科普问答 */
  const ing = matchIngredient(text);
  if (ing) {
    messages.push(t('「' + ing.name + '」' + ing.nature + '，' + ing.meridian + '，主要作用是' + ing.effect + '。'));
    messages.push(t(ing.use + '。\n\n需要留意：' + ing.caution + '。'));
    const related = teas.list.filter(function (x) {
      return x.ingredients.some(function (i) { return i.name.indexOf(ing.name) > -1; });
    }).slice(0, 2);
    if (related.length) {
      messages.push(t('含' + ing.name + '的茶方有这几款，可以点开看看搭配：'));
      messages.push(teasMsg(related.map(function (x) { return x.id; })));
    }
    messages.push(t(DISCLAIMER, { small: true }));
    messages.push(chips(DEFAULT_CHIPS));
    return { messages: messages, ctx: state };
  }

  /* 7. 快捷常识问答 */
  const faq = matchFaq(text);
  if (faq) {
    messages.push(t(faq.a));
    messages.push(t(DISCLAIMER, { small: true }));
    messages.push(chips(DEFAULT_CHIPS));
    return { messages: messages, ctx: state };
  }

  /* 8. 季节方向 */
  const seasonHit = SEASON_WORDS.filter(function (x) { return x.re.test(text); })[0];
  if (seasonHit) {
    const cid = (state.profile && state.profile.constitutionId) || engine.constitutionByKeyword(text) || 'pinghe';
    messages.push(t(seasonHit.tip));
    return finishRecommend(messages, state, cid, { season: seasonHit.s, limit: 2, intro: '结合' + seasonHit.name + '，我给你挑了这两款。' });
  }

  /* 9. 追问 / 口味偏好 / 加减味 */
  const adjust = ADJUST_RULES.filter(function (x) { return x.re.test(text); });
  const isMore = adjust.some(function (x) { return x.tag === 'more'; });

  if (isMore) {
    const cid = (state.profile && state.profile.constitutionId) || engine.constitutionByKeyword(text) || 'pinghe';
    messages.push(t('好，给你换一批，尽量避开刚才推荐过的组合。'));
    return finishRecommend(messages, state, cid, {
      season: engine.seasonOf(),
      limit: 2,
      exclude: state.lastTeas.slice(0, 2),
      silentIntro: true
    });
  }

  if (adjust.length) {
    const tags = adjust.map(function (x) { return x.tag; });
    let cid = (state.profile && state.profile.constitutionId) || engine.constitutionByKeyword(text);
    if (!cid) {
      for (let i = 0; i < tags.length; i++) {
        if (TAG_FALLBACK[tags[i]]) { cid = TAG_FALLBACK[tags[i]]; break; }
      }
    }
    if (cid) {
      const tips = [];
      if (tags.indexOf('stayup') > -1) tips.push('经常熬夜可以在一款茶方里加入枸杞子 5g 或麦冬 5g，滋阴润燥，不容易伤津。');
      if (tags.indexOf('heat') > -1) tips.push('如果同时容易上火，建议把偏温的食材减半，或改成餐后温饮、降低频次。');
      if (tags.indexOf('sleep') > -1) tips.push('入睡困难时，建议把茶饮时间提前到睡前 1 小时以上，避免夜间频繁起夜。');
      if (tags.indexOf('cold') > -1) tips.push('怕冷的话，可以固定用生姜 2 片 + 红枣 3 枚作为基础，再视情况搭配。');
      if (tags.indexOf('damp') > -1) tips.push('祛湿类茶方建议放在上午饮用，同时减少甜食与冰饮，效果会更稳定。');
      if (tags.indexOf('weight') > -1) tips.push('体重管理更适合从「减少含糖饮料 + 餐后一杯陈皮荷叶茶」这样的小习惯开始。');
      if (tags.indexOf('skin') > -1) tips.push('气色与皮肤状态更依赖作息，建议先把入睡时间提前半小时，再配合温和茶饮。');
      if (tags.indexOf('tired') > -1) tips.push('容易疲乏时，补气类茶方建议小量长期，而不是一次加足量。');
      if (tags.indexOf('dry') > -1) tips.push('口干咽燥时，优先选择麦冬、玉竹、百合这类甘润食材，避免过烫饮用。');
      const c = constitutions.getOr(cid);
      messages.push(t('结合你说的「' + cleanKeyword(text) + '」，方向上还是偏「' + c.name + '」的调理思路。'));
      if (tips.length) messages.push(t(tips.join('\n\n')));
      return finishRecommend(messages, state, cid, {
        season: engine.seasonOf(),
        limit: 2,
        silentIntro: true,
        intro: '这两款更贴合你提到的方向，也考虑了当季与口感。'
      });
    }
  }

  /* 10. 体质关键词 → 直接推荐 */
  const kwCid = engine.constitutionByKeyword(text);
  if (kwCid) {
    return finishRecommend(messages, state, kwCid, { season: engine.seasonOf(), limit: 2 });
  }

  /* 11. 兜底引导 */
  messages.push(t('我暂时没能从这个描述里找到对应的养生方向。你可以换一种说法，比如「最近总觉得累」「手脚冰凉」「吃完容易胀气」「睡得浅容易醒」。'));
  messages.push(t('也可以直接做一次快速测评，我会按你的体质来配茶。'));
  messages.push(cta('中医体质快速测评', '10 道题 · 约 90 秒 · 生成你的体质档案', 'assess', '开始测评'));
  messages.push(chips(DEFAULT_CHIPS));
  return { messages: messages, ctx: state };
}

/* ---------------- 组装推荐 ---------------- */

function finishRecommend(messages, state, cid, opt) {
  opt = opt || {};
  const c = constitutions.getOr(cid);
  const list = engine.recommend(cid, {
    season: opt.season || engine.seasonOf(),
    limit: opt.limit || 2,
    exclude: opt.exclude || []
  });

  if (!opt.silentIntro) {
    if (!state.profile) {
      messages.push(t('听起来更接近「' + c.name + '」的日常养生方向。' + c.brief));
    } else {
      messages.push(t('结合你的「' + c.name + '」体质，' + (opt.intro || '我给你挑了这两款当季更合适的茶方。')));
    }
  } else if (opt.intro) {
    messages.push(t(opt.intro));
  }

  messages.push(teasMsg(list.map(function (x) { return x.id; })));

  const warn = [];
  if (c.id === 'shire') warn.push('偏凉性的茶饮不建议连续长期饮用');
  if (c.id === 'yangxu') warn.push('建议放在白天饮用，睡前不建议');
  if (c.id === 'xueyu') warn.push('经期量多时请先暂停');
  const base = warn.length ? warn.join('；') + '。' : '';
  messages.push(notice(base + DISCLAIMER, 'warn'));

  if (!state.profile) {
    messages.push(cta('补充一次体质测评', '可以让后续推荐更贴合你的兼夹体质与季节变化', 'assess', '去测评'));
  } else {
    messages.push(chips([
      { label: '换一批茶方', text: '还有别的茶方推荐吗' },
      { label: '看更多茶方', action: 'tea' },
      { label: '我的体质档案', action: 'profile' },
      { label: '重新测评', action: 'assess' }
    ]));
  }

  state.lastTeas = list.map(function (x) { return x.id; });
  return { messages: messages, ctx: state };
}

/* ---------------- 开场 ---------------- */

function welcome(state) {
  const msgs = [];
  if (state.profile && state.profile.constitutionId) {
    const c = constitutions.getOr(state.profile.constitutionId);
    msgs.push(t('欢迎回来。你的体质档案是「' + c.name + '」，今天是' + engine.seasonName(engine.seasonOf()) + '。'));
    msgs.push(t('想聊点什么？可以问我当季该喝什么，也可以直接说最近的身体感受。'));
  } else {
    msgs.push(t('你好，我是茶历方的养生顾问。我按中医体质学说，帮你从药食同源的食材里挑适合的日常茶饮。'));
    msgs.push(t('你可以直接描述最近的感受，也可以先做一次快速测评，让推荐更贴合你的体质。'));
  }
  msgs.push(t(DISCLAIMER + '我不会涉及任何疾病诊断与用药建议。', { small: true }));
  msgs.push(chips(DEFAULT_CHIPS));
  return msgs;
}

function introSelf(state) {
  const msgs = [];
  msgs.push(t('我可以做这几件事：\n\n· 通过 10 道题帮你判断主导体质\n· 按体质 + 当季 + 你的口味挑茶方\n· 给出配方克重、冲泡方法、饮用频次与注意点\n· 解答药食同源食材与茶饮常识\n\n所有推荐都只针对日常养生，不涉及疾病与用药。'));
  msgs.push(chips(DEFAULT_CHIPS));
  return msgs;
}

/** 首屏欢迎语（页面加载时使用） */
function greeting(ctx) {
  return welcome(Object.assign({ profile: null, lastTeas: [], flags: {} }, ctx || {}));
}

/* ---------------- 工具 ---------------- */

function hitMedical(text) {
  return MEDICAL_RULES.some(function (r) { return r.re.test(text); });
}

function matchIngredient(text) {
  let found = null;
  knowledge.ingredients.forEach(function (i) {
    if (text.indexOf(i.name) > -1) {
      if (!found || i.name.length > found.name.length) found = i;
    }
  });
  return found;
}

function matchFaq(text) {
  const keys = [
    { k: ['每天', '天天喝', '长期喝', '可以常喝'], i: 0 },
    { k: ['什么时候喝', '什么时间', '几点喝', '时间喝'], i: 1 },
    { k: ['经期', '月经', '大姨妈'], i: 2 },
    { k: ['怀孕', '孕期', '哺乳', '喂奶'], i: 3 },
    { k: ['隔夜', '第二天', '放一夜', '放多久'], i: 4 },
    { k: ['混着', '一起泡', '搭配泡', '能一起'], i: 5 },
    { k: ['测评准', '准不准', '准吗', '靠谱吗', '准不准确'], i: 6 },
    { k: ['多久见效', '喝多久', '多长时间有效', '有效果吗'], i: 7 },
    { k: ['一直喝', '长期同一款', '换着喝'], i: 8 },
    { k: ['不舒服', '拉肚子', '喝了难受', '过敏怎么办'], i: 9 }
  ];
  for (let i = 0; i < keys.length; i++) {
    const m = keys[i];
    if (m.k.some(function (x) { return text.indexOf(x) > -1; })) {
      return knowledge.faq[m.i];
    }
  }
  return null;
}

function cleanKeyword(text) {
  return text.replace(/[，。！？、,.!?\s]/g, '').slice(0, 8);
}

/* 特殊人群提示文案表：客户端与服务端共用同一份，避免两端话术不一致 */
const NOTICE_TEXT = {};
SPECIAL_RULES.forEach(function (r) { NOTICE_TEXT[r.key] = r.text; });

module.exports = {
  respond: respond,
  greeting: greeting,
  welcome: welcome,
  hitMedical: hitMedical,
  DISCLAIMER: DISCLAIMER,
  SAFETY_TEXT: SAFETY_TEXT,
  DEFAULT_CHIPS: DEFAULT_CHIPS,
  // 以下导出供 Agent 服务端（server/）复用同一套风控词库与标签映射
  MEDICAL_RULES: MEDICAL_RULES,
  SPECIAL_RULES: SPECIAL_RULES,
  ADJUST_RULES: ADJUST_RULES,
  TAG_FALLBACK: TAG_FALLBACK,
  SEASON_WORDS: SEASON_WORDS,
  NOTICE_TEXT: NOTICE_TEXT
};
