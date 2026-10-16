/**
 * 内容字段描述与校验（仅服务端使用）。
 *
 * 一份定义、三处复用：
 *   1) 管理端页面按 SCHEMA 自动渲染表单 —— 加字段只需改这里
 *   2) 服务端保存前按 SCHEMA 做结构校验
 *   3) 合规扫描复用 safety.js 的同一份风控词表 —— 保证「后台改出来的文案」
 *      与「模型输出的净化标准」完全一致，不会出现后台能发、模型不许说的话
 *
 * 校验分两级：
 *   errors   —— 阻断保存，内容一定有问题（缺必填、id 重复、食材不在药食同源目录…）
 *   warnings —— 允许保存，但提示复核（出现疾病名、用药量偏大…）
 */

const safety = require('./safety.js');
const CATALOG = require('../../data/catalog.js');
const CONSTITUTIONS = require('../../data/constitutions.js');

/** 违禁词扫描前先剔除的合规免责表述，避免「不具备治疗资质」被误判 */
const DISCLAIM_PHRASES = [
  '不具备医疗诊断与治疗资质',
  '不具备医疗诊断和治疗资质',
  '不具备医疗资质',
  '不替代专业医疗建议',
  '不替代药物治疗',
  '不能替代药物',
  '不可替代药物',
  '不构成任何医疗建议',
  '请及时前往正规医疗机构就诊',
  '请及时就医',
  // 「主治医师」是职务名，与「主治（适应症）」同形不同义。
  // 风控词表里「主治」要替换成「适用方向」，但不该把「咨询主治医师」也一起拦掉，
  // 否则每处就医引导都得绕开这个词——反而促使用户看到更含糊的表述。
  '主治医师',
  '主治医生'
];

/**
 * 内容侧额外红线。
 * 这些词不在模型的输出净化表里（模型那边是「改写」，内容这边要求「不许写」），
 * 属于医疗类目的硬性广告法风险：宣称替代药品、宣称无副作用/人人适用。
 */
const EXTRA_BANNED = [
  { words: ['替代药物', '替代西药', '替代用药', '替代药品', '代替药物', '代替药品'], to: '辅助日常养生' },
  { words: ['无副作用', '没有副作用', '零副作用', '绝无副作用'], to: '因人而异' },
  { words: ['人人适用', '所有人都能喝', '人人可喝', '包治百病'], to: '需辨证施用' }
];

/** 疾病名：出现本身不违规（合规上反而需要识别特殊人群），仅在正文里提示复核 */
const DISEASE_RE = /(癌|肿瘤|白血病|尿毒症|肝硬化|糖尿病|高血压|冠心病|心梗|中风|抑郁症?|焦虑症?)/;

/** 单味食材日常养生参考剂量上限（g），超出告警，严重超出阻断 */
const DOSE_WARN = 10;
const DOSE_BLOCK = 30;

/* ---------------- 安全字段的共享枚举 ---------------- */

/** 禁忌人群分组键：与 data/teas.js 的 hitContraindications 一一对应 */
const GROUPS = [
  'pregnant', 'lactating', 'child', 'menstruation', 'hypertension', 'diabetes',
  'kidney', 'anticoagulant', 'lithium', 'thyroid', 'immunosuppressant', 'sedative',
  'gout', 'preop', 'glucoseDrug', 'diuretic'
];

/** 禁忌等级：由重到轻 */
const LEVELS = ['禁用', '忌用', '慎用', '减量', '咨询医师'];

/** 用药交互键：与 data/teas.js 的 DRUG_NOTES 一一对应 */
const DRUG_KEYS = ['thyroid', 'anticoagulant', 'lithium', 'glucoseDrug', 'immunosuppressant', 'sedative', 'diuretic'];

/** 月经情况取值：与 data/questions.js 的 BASIC.menses 保持一致 */
const MENSES = ['规律', '不太规律', '痛经明显', '经量偏多', '经量偏少', '已停经/不适用'];

/* ---------------- 字段描述 ---------------- */

const SCHEMA = {
  teas: {
    label: '茶方库',
    desc: '小程序茶方列表与详情页的数据源，也是服务端推荐工具的取数来源。',
    root: {
      type: 'objectArray', min: 1, item: { titleKey: 'name', subtitleKey: 'subtitle', fields: [
        { key: 'id', label: 'ID', type: 'string', required: true, slug: true, hint: '英文小写与短横线，创建后不建议修改（用户收藏记录依赖它）' },
        { key: 'name', label: '茶方名', type: 'string', required: true, max: 20 },
        { key: 'constitution', label: '对应体质', type: 'enum', required: true, options: { ref: 'constitutions' } },
        { key: 'subtitle', label: '副标题', type: 'string', required: true, max: 40 },
        { key: 'tone', label: '卡片色阶', type: 'number', min: 1, max: 6, hint: '1–6，控制卡片配图的深浅' },
        { key: 'nature', label: '性味', type: 'string', required: true, max: 12 },
        { key: 'taste', label: '口感', type: 'string', max: 16 },
        { key: 'ingredients', label: '配方', type: 'objectArray', required: true, min: 1, max: 10,
          item: { titleKey: 'name', fields: [
            { key: 'name', label: '食材', type: 'string', required: true, catalog: true },
            { key: 'amount', label: '用量', type: 'string', required: true, dose: true, hint: '如 3g / 3–5g' },
            { key: 'role', label: '作用', type: 'string' }
          ] } },
        { key: 'effects', label: '功效说明', type: 'stringArray', required: true, min: 1, max: 6, maxItemLen: 40 },
        { key: 'scenes', label: '适用场景', type: 'stringArray', required: true, min: 1, max: 6, maxItemLen: 16 },
        { key: 'season', label: '适宜季节', type: 'stringArray', enum: ['春', '夏', '秋', '冬'] },
        { key: 'brew', label: '冲泡方法', type: 'group', required: true, fields: [
          { key: 'water', label: '水量水温', type: 'string', required: true },
          { key: 'tools', label: '器具', type: 'string' },
          { key: 'time', label: '时长', type: 'string' },
          { key: 'steps', label: '步骤', type: 'stringArray', required: true, min: 1, max: 6, maxItemLen: 40 },
          { key: 'best', label: '最佳时段', type: 'string' },
          { key: 'frequency', label: '建议频次', type: 'string' }
        ] },
        { key: 'caution', label: '注意事项', type: 'stringArray', required: true, min: 1, max: 6, maxItemLen: 50 },
        { key: 'tags', label: '标签', type: 'stringArray', max: 6, maxItemLen: 8 },
        { key: 'dosageBasis', label: '剂量口径', type: 'string', max: 12, hint: '本库统一为「代茶饮用量」，不展示药用量' },
        { key: 'usageCap', label: '用量上限', type: 'string', max: 24, hint: '如「≤8g/味 · ≤20g/日」' },
        { key: 'sugarContent', label: '含糖食材', type: 'boolean', hint: '红枣/桂圆/桑椹等，供血糖人群动态提示' },
        { key: 'isPilot', label: '含试点物质', type: 'boolean', hint: '黄芪/党参 = true，非全国通用食材' },
        { key: 'drugInteraction', label: '用药交互', type: 'stringArray', max: 6,
          enum: DRUG_KEYS, hint: '命中后由端上按 DRUG_NOTES 给出「间隔多久、找谁」的提示' },
        { key: 'sharedIngredient', label: '跨方共用食材', type: 'stringArray', max: 6, maxItemLen: 10,
          hint: '同日多饮时的叠加提醒' },
        { key: 'courseLimit', label: '疗程上限', type: 'group', fields: [
          { key: 'maxWeeks', label: '连续上限（周）', type: 'number', min: 1, max: 12 },
          { key: 'restWeeks', label: '停饮间隔（周）', type: 'number', min: 1, max: 12 }
        ] },
        { key: 'contraindications', label: '禁忌人群', type: 'objectArray', max: 8,
          item: { idKey: '__none__', titleKey: 'keyword', fields: [
            { key: 'group', label: '人群分组', type: 'enum', required: true, options: { list: GROUPS } },
            { key: 'level', label: '等级', type: 'enum', required: true, options: { list: LEVELS } },
            { key: 'reason', label: '原因', type: 'string', required: true, max: 40 },
            { key: 'keyword', label: '展示词', type: 'string', required: true, max: 10 },
            { key: 'mensesOnly', label: '仅当月经为', type: 'enum', options: { list: MENSES },
              hint: '留空＝无条件命中。仅「经量多者暂缓」这类条件性提醒才填，否则会把部分人的提醒错标成全员禁忌' }
          ] } }
      ] }
    }
  },

  constitutions: {
    label: '体质库',
    desc: '九种体质的文案、配色与养生建议。id 与量表打分、茶方归属强关联，改动需谨慎。',
    root: {
      type: 'objectArray', min: 1, item: { titleKey: 'name', subtitleKey: 'short', fields: [
        { key: 'id', label: 'ID', type: 'string', required: true, slug: true, hint: '英文小写，量表与茶方都按它关联，不要改' },
        { key: 'name', label: '体质名', type: 'string', required: true, max: 8 },
        { key: 'short', label: '一句话特征', type: 'string', required: true, max: 12 },
        { key: 'icon', label: '图标名', type: 'string', required: true, hint: '见 utils/icons.js 的图标名' },
        { key: 'color', label: '主色', type: 'string', required: true, color: true },
        { key: 'soft', label: '浅底色', type: 'string', required: true, color: true },
        { key: 'brief', label: '体质简述', type: 'text', required: true, max: 120 },
        { key: 'features', label: '典型表现', type: 'stringArray', required: true, min: 1, max: 8, maxItemLen: 30 },
        { key: 'causes', label: '成因', type: 'text', max: 200 },
        { key: 'principle', label: '调理原则', type: 'text', required: true, max: 100 },
        { key: 'teaAdvice', label: '茶饮建议', type: 'text', required: true, max: 100 },
        { key: 'life', label: '起居建议', type: 'stringArray', min: 1, max: 8, maxItemLen: 40 },
        { key: 'keywords', label: '识别关键词', type: 'stringArray', min: 1, max: 20, maxItemLen: 10,
          hint: '用户口语命中这些词即判定为该体质，改动会直接影响对话识别' },
        { key: 'bodyFeature', label: '形体特征', type: 'text', max: 60, hint: '对齐国标的「形体」维度' },
        { key: 'psych', label: '心理特征', type: 'text', max: 60 },
        { key: 'tongue', label: '舌象', type: 'text', max: 40, hint: '禁用疾病预测措辞，只描述可自察的现象' },
        { key: 'pulse', label: '脉象', type: 'text', max: 40, hint: '一律附「自摸仅作参考，不能替代面诊」' },
        { key: 'adaptability', label: '环境适应', type: 'text', max: 60 },
        { key: 'tendencyNotice', label: '日常留意方向', type: 'stringArray', max: 5, maxItemLen: 40,
          hint: '只用「注意/宜/可」的方向性表述，禁止「易患某病/防治某病」' },
        { key: 'keyPoints', label: '速辨要点', type: 'stringArray', max: 5, maxItemLen: 30 }
      ] }
    }
  },

  questions: {
    label: '体质量表',
    desc: '测评题目与基础信息选项。选项分值决定体质判定结果，服务端规则引擎与被测端共用同一份。',
    root: { type: 'group', fields: [
      { key: 'list', label: '题目', type: 'objectArray', required: true, min: 1, max: 30,
        item: { titleKey: 'title', fields: [
          { key: 'id', label: 'ID', type: 'string', required: true, slug: true },
          { key: 'title', label: '题干', type: 'string', required: true, max: 60 },
          { key: 'hint', label: '辅助说明', type: 'string', max: 40 },
          { key: 'options', label: '选项', type: 'objectArray', required: true, min: 2, max: 6,
            item: { titleKey: 'label', fields: [
              { key: 'label', label: '选项文案', type: 'string', required: true, max: 60 },
              { key: 'scores', label: '计分', type: 'numberMap', required: true, options: { ref: 'constitutions' }, min: 0, max: 5,
                hint: '体质 id → 分值，至少填一项' }
            ] } }
        ] } },
      { key: 'basic', label: '基础信息选项', type: 'group', fields: [
        { key: 'genders', label: '性别', type: 'stringArray', required: true, min: 1 },
        { key: 'ages', label: '年龄段', type: 'stringArray', required: true, min: 1 },
        { key: 'conditions', label: '既往情况', type: 'stringArray', required: true, min: 1 },
        { key: 'drugs', label: '在用西药', type: 'stringArray', min: 1,
          hint: '最关键的用药安全开关，决定能否推山楂/玫瑰花草类、利尿类；改动需与 tea.contraindications 保持对应' },
        { key: 'supplements', label: '在用补充剂', type: 'stringArray', min: 1 },
        { key: 'stages', label: '特殊阶段', type: 'stringArray', required: true, min: 1 },
        { key: 'allergens', label: '过敏原', type: 'stringArray', min: 1 },
        { key: 'menses', label: '月经情况', type: 'stringArray', min: 1, hint: '仅女性显示，补全血瘀/气郁判定线索' },
        { key: 'tastes', label: '口味偏好', type: 'stringArray', required: true, min: 1 }
      ] }
    ] }
  },

  knowledge: {
    label: '食材与常识',
    desc: '药食同源食材科普与茶饮常识问答，同时作为对话检索语料与风控依据。',
    root: { type: 'group', fields: [
      { key: 'ingredients', label: '食材科普', type: 'objectArray', required: true, min: 1,
        item: { titleKey: 'name', subtitleKey: 'effect', fields: [
          { key: 'id', label: 'ID', type: 'string', required: true, slug: true },
          { key: 'name', label: '食材名', type: 'string', required: true, max: 10 },
          { key: 'nature', label: '性味', type: 'string', required: true },
          { key: 'meridian', label: '归经', type: 'string' },
          { key: 'effect', label: '主要作用', type: 'string', required: true, max: 30 },
          { key: 'use', label: '适用人群', type: 'text', max: 100 },
          { key: 'caution', label: '注意事项', type: 'text', max: 100 },
          /* ---- 安全卡：缺了这些，采了慢病名也无法筛方 ---- */
          { key: 'doseDailyMax', label: '每日上限', type: 'string', max: 20, hint: '如「≤6g」' },
          { key: 'doseForm', label: '形态换算', type: 'string', max: 60, hint: '干品克数与鲜品的折算，避免用户自购混淆' },
          { key: 'drugInteraction', label: '用药交互', type: 'stringArray', max: 4, enum: DRUG_KEYS },
          { key: 'chronicFlag', label: '需留意慢病', type: 'stringArray', max: 4, enum: GROUPS },
          { key: 'nutrients', label: '营养标签', type: 'group', fields: [
            { key: 'sugar', label: '含糖', type: 'boolean' },
            { key: 'potassium', label: '钾', type: 'enum', options: { list: ['low', 'mid', 'high'] } },
            { key: 'vitaminK', label: '维生素K', type: 'enum', options: { list: ['low', 'mid', 'high'] } },
            { key: 'oxalate', label: '草酸', type: 'enum', options: { list: ['low', 'mid', 'high'] } }
          ] },
          { key: 'courseLimit', label: '疗程上限', type: 'string', max: 40 },
          { key: 'specialPop', label: '特殊人群', type: 'group', fields: [
            { key: 'child', label: '儿童', type: 'string', max: 30 },
            { key: 'pregnant', label: '孕期', type: 'string', max: 30 },
            { key: 'preop', label: '术前', type: 'string', max: 30 }
          ] },
          { key: 'allergen', label: '过敏提示', type: 'string', max: 40 },
          { key: 'evidenceLevel', label: '证据强度', type: 'string', max: 30,
            hint: '如「传统应用为主，现代证据有限」，避免 effect 被读成疗效' }
        ] } },
      { key: 'faq', label: '茶饮常识', type: 'objectArray', min: 1,
        item: { titleKey: 'q', fields: [
          { key: 'q', label: '问题', type: 'string', required: true, max: 60 },
          { key: 'a', label: '回答', type: 'text', required: true, max: 300 }
        ] } }
    ] }
  },

  catalog: {
    label: '药食同源目录',
    desc: '食材合规白名单。茶方里出现的每一味食材都必须在此目录内，否则会被校验拦下。',
    root: {
      type: 'objectArray', min: 1, item: { titleKey: 'name', subtitleKey: 'category', fields: [
        { key: 'name', label: '食材名', type: 'string', required: true, max: 10 },
        { key: 'category', label: '分类', type: 'string', required: true, max: 10 },
        { key: 'part', label: '使用部位', type: 'string', max: 10 },
        { key: 'alias', label: '别名', type: 'string', max: 10 },
        { key: 'usageCap', label: '每日代茶上限', type: 'string', max: 16 },
        { key: 'contraindicatedGroups', label: '禁忌人群', type: 'stringArray', max: 6, enum: GROUPS },
        { key: 'drugInteraction', label: '用药交互', type: 'stringArray', max: 4, enum: DRUG_KEYS },
        { key: 'sugarContent', label: '含糖', type: 'boolean' },
        { key: 'isPilot', label: '试点物质', type: 'boolean', hint: '黄芪/党参 = true，必须配 note 兜底文案' },
        { key: 'catVersion', label: '目录版本', type: 'string', max: 60 },
        { key: 'note', label: '目录批注', type: 'text', max: 200, hint: '试点物质的合规说明写在这里' }
      ] }
    }
  }
};

/**
 * 供管理端渲染表单用的纯数据（去掉函数、把 ref 解析成可选值与可读标签）。
 * 之所以要 labels：体质下拉如果只显示 pinghe / yangxu 这种 id，运营根本认不出来。
 * @param {Array<{id:string,name:string}>} [constitutions] 体质 id 与名称；不传则取当前生效内容
 */
function publicSchema(constitutions) {
  const list = (constitutions && constitutions.length)
    ? constitutions
    : CONSTITUTIONS.ids.map(function (id) {
        const c = CONSTITUTIONS.get(id);
        return { id: id, name: c ? c.name : id };
      });
  const clone = JSON.parse(JSON.stringify(SCHEMA));

  function fill(node) {
    if (!node || typeof node !== 'object') return;
    if (node.options && node.options.ref === 'constitutions') {
      node.options.values = list.map(function (c) { return c.id; });
      node.options.labels = {};
      list.forEach(function (c) { node.options.labels[c.id] = c.name; });
    }
    if (Array.isArray(node.fields)) node.fields.forEach(fill);
    if (node.item) fill(node.item);
  }

  Object.keys(clone).forEach(function (type) { fill(clone[type].root); });
  return clone;
}

/* ---------------- 校验 ---------------- */

function isBlank(v) {
  return v === undefined || v === null || v === '';
}

function addError(ctx, path, message) { ctx.errors.push({ path: path, message: message }); }
function addWarn(ctx, path, message) { ctx.warnings.push({ path: path, message: message }); }

/**
 * 解析字段的可选值：静态 options.list 或按 ref 指向当前体质 id 白名单。
 * 必须走这个函数，否则 enum / numberMap 的取值校验会退化成「不校验」。
 */
function allowedValues(field, ctx) {
  const o = field.options;
  if (!o) return [];
  if (o.ref === 'constitutions') return ctx.ids;
  if (Array.isArray(o.list)) return o.list;
  if (Array.isArray(o.values)) return o.values;
  return [];
}

function checkPrimitive(field, value, path, ctx) {
  if (field.type === 'string' || field.type === 'text') {
    if (typeof value !== 'string') return addError(ctx, path, field.label + ' 必须是文本');
    const t = value.trim();
    if (!t) { if (field.required) addError(ctx, path, field.label + ' 不能为空'); return; }
    if (field.max && t.length > field.max) addError(ctx, path, field.label + ' 超过 ' + field.max + ' 字（当前 ' + t.length + '）');
    if (field.slug && !/^[a-z0-9][a-z0-9-]*$/.test(t)) addError(ctx, path, field.label + ' 只能用英文小写字母、数字与短横线');
    if (field.color && !/^#[0-9a-fA-F]{6}$/.test(t)) addError(ctx, path, field.label + ' 需为 #RRGGBB 格式');
    if (field.catalog && !(ctx.catalogNames ? ctx.catalogNames.has(t) : CATALOG.has(t))) addError(ctx, path, '「' + t + '」不在药食同源目录内，请先在「药食同源目录」中收录');
    if (field.dose) checkDose(t, path, ctx);
    return;
  }

  if (field.type === 'number') {
    const n = Number(value);
    if (isNaN(n)) return addError(ctx, path, field.label + ' 必须是数字');
    if (field.min !== undefined && n < field.min) addError(ctx, path, field.label + ' 不能小于 ' + field.min);
    if (field.max !== undefined && n > field.max) addError(ctx, path, field.label + ' 不能大于 ' + field.max);
    return;
  }

  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') addError(ctx, path, field.label + ' 只能是 true / false');
    return;
  }

  if (field.type === 'enum') {
    const allowed = allowedValues(field, ctx);
    if (allowed.length && allowed.indexOf(value) < 0) {
      addError(ctx, path, field.label + ' 取值「' + value + '」不在允许范围内（' + allowed.join('/') + '）');
    }
    return;
  }
}

function checkDose(text, path, ctx) {
  const nums = String(text).match(/\d+(?:\.\d+)?/g);
  if (!nums) return addWarn(ctx, path, '用量「' + text + '」未能解析出克数，请确认写法（如 3g / 3–5g）');
  const max = Math.max.apply(null, nums.map(Number));
  if (max > DOSE_BLOCK) addError(ctx, path, '单味用量 ' + max + 'g 明显超出日常养生参考剂量（上限 ' + DOSE_BLOCK + 'g）');
  else if (max > DOSE_WARN) addWarn(ctx, path, '单味用量 ' + max + 'g 高于常用参考剂量（3–10g），请确认');
}

function walk(field, value, path, ctx) {
  if (isBlank(value)) {
    if (field.required) addError(ctx, path, field.label + ' 不能为空');
    return;
  }

  if (field.type === 'string' || field.type === 'text' || field.type === 'number' || field.type === 'enum' || field.type === 'boolean') {
    return checkPrimitive(field, value, path, ctx);
  }

  if (field.type === 'stringArray') {
    if (!Array.isArray(value)) return addError(ctx, path, field.label + ' 必须是数组');
    if (field.required && !value.length) addError(ctx, path, field.label + ' 不能为空');
    if (field.min && value.length < field.min) addError(ctx, path, field.label + ' 至少 ' + field.min + ' 项');
    if (field.max && value.length > field.max) addError(ctx, path, field.label + ' 最多 ' + field.max + ' 项');
    value.forEach(function (v, i) {
      const p = path + '[' + i + ']';
      if (typeof v !== 'string' || !v.trim()) { addError(ctx, p, field.label + ' 第 ' + (i + 1) + ' 项不能为空'); return; }
      if (field.maxItemLen && v.length > field.maxItemLen) addError(ctx, p, field.label + ' 第 ' + (i + 1) + ' 项超过 ' + field.maxItemLen + ' 字');
      if (field.enum && field.enum.indexOf(v) < 0) addError(ctx, p, field.label + ' 取值「' + v + '」不合法');
    });
    return;
  }

  if (field.type === 'numberMap') {
    if (typeof value !== 'object' || Array.isArray(value)) return addError(ctx, path, field.label + ' 必须是对象');
    const keys = Object.keys(value);
    if (!keys.length) return addError(ctx, path, field.label + ' 至少填一项');
    const allowed = allowedValues(field, ctx);
    keys.forEach(function (k) {
      const p = path + '.' + k;
      if (allowed.length && allowed.indexOf(k) < 0) { addError(ctx, p, '未知体质 id：' + k); return; }
      const n = Number(value[k]);
      if (isNaN(n)) return addError(ctx, p, '分值必须是数字');
      if (field.min !== undefined && n < field.min) addError(ctx, p, '分值不能小于 ' + field.min);
      if (field.max !== undefined && n > field.max) addError(ctx, p, '分值不能大于 ' + field.max);
    });
    return;
  }

  if (field.type === 'group') {
    if (typeof value !== 'object' || Array.isArray(value)) return addError(ctx, path, field.label + ' 必须是对象');
    field.fields.forEach(function (f) {
      walk(f, value[f.key], path ? path + '.' + f.key : f.key, ctx);
    });
    return;
  }

  if (field.type === 'objectArray') {
    if (!Array.isArray(value)) return addError(ctx, path, field.label + ' 必须是数组');
    if (field.required && !value.length) addError(ctx, path, field.label + ' 不能为空');
    if (field.min && value.length < field.min) addError(ctx, path, field.label + ' 至少 ' + field.min + ' 条');
    if (field.max && value.length > field.max) addError(ctx, path, field.label + ' 最多 ' + field.max + ' 条');

    const seen = {};
    value.forEach(function (item, i) {
      const p = path ? path + '[' + i + ']' : '[' + i + ']';
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        addError(ctx, p, field.label + ' 第 ' + (i + 1) + ' 条不是合法对象');
        return;
      }
      field.item.fields.forEach(function (f) {
        walk(f, item[f.key], p + '.' + f.key, ctx);
      });
      const idKey = field.item.idKey === undefined ? 'id' : field.item.idKey;
      const idVal = item[idKey];
      if (typeof idVal === 'string' && idVal) {
        if (seen[idVal] !== undefined) addError(ctx, p + '.' + idKey, 'ID「' + idVal + '」与第 ' + (seen[idVal] + 1) + ' 条重复');
        else seen[idVal] = i;
      }
    });
    return;
  }

  addError(ctx, path, '未知字段类型：' + field.type);
}

/** 递归扫描所有字符串叶子，做医疗违禁词与疾病名检查 */
function scanCompliance(value, path, ctx) {
  if (typeof value === 'string') return scanText(value, path, ctx);
  if (Array.isArray(value)) {
    value.forEach(function (v, i) { scanCompliance(v, path + '[' + i + ']', ctx); });
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(function (k) { scanCompliance(value[k], path + '.' + k, ctx); });
  }
}

function scanText(text, path, ctx) {
  let probe = text;
  DISCLAIM_PHRASES.forEach(function (p) { probe = probe.split(p).join(''); });

  function scanWords(words, to) {
    words.forEach(function (w) {
      const i = probe.indexOf(w);
      if (i < 0) return;
      // 否定语境（如「不治疗疾病」）不算违规：看命中词前 6 个字
      const before = probe.slice(Math.max(0, i - 6), i);
      if (/[不非无勿免别未]/.test(before)) return;
      addError(ctx, path, '出现医疗违禁表述「' + w + '」，请改用「' + to + '」等养生表述');
    });
  }

  safety.WORD_MAP.forEach(function (group) { scanWords(group.words, group.to); });
  EXTRA_BANNED.forEach(function (group) { scanWords(group.words, group.to); });

  const m = probe.match(DISEASE_RE);
  if (m) {
    addWarn(ctx, path, '出现疾病名「' + m[0] + '」，请确认语境是「特殊人群风险提示」而非疗效宣称');
  }
}

/**
 * 校验某一类内容的完整 payload。
 * @param {string} type teas | constitutions | questions | knowledge | catalog
 * @param {*} value
 * @param {object} [opts] { ids } 体质 id 白名单，默认取当前生效内容
 * @returns {{ok:boolean, errors:Array, warnings:Array, count:number}}
 */
function validate(type, value, opts) {
  const entry = SCHEMA[type];
  if (!entry) return { ok: false, errors: [{ path: '', message: '未知内容类型：' + type }], warnings: [], count: 0 };

  const ctx = {
    errors: [],
    warnings: [],
    ids: (opts && opts.ids) || CONSTITUTIONS.ids.slice(),
    catalogNames: opts && opts.catalogNames
  };

  walk(entry.root, value, '', ctx);

  // 结构没问题才做合规扫描：结构错乱时扫描路径没有意义，反而刷屏
  if (!ctx.errors.length) scanCompliance(value, '', ctx);

  const count = Array.isArray(value) ? value.length
    : (value && value.list ? value.list.length : (value && value.ingredients ? value.ingredients.length : 1));

  return { ok: !ctx.errors.length, errors: ctx.errors, warnings: ctx.warnings, count: count };
}

module.exports = {
  SCHEMA: SCHEMA,
  publicSchema: publicSchema,
  validate: validate,
  DISCLAIM_PHRASES: DISCLAIM_PHRASES,
  DOSE_WARN: DOSE_WARN,
  DOSE_BLOCK: DOSE_BLOCK
};
