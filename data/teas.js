/**
 * 养生茶方库
 * 全部食材均取自《按照传统既是食品又是中药材的物质目录》（药食同源目录），
 * 用量为日常养生参考剂量，不构成任何医疗建议。
 *
 * 安全字段说明（见 docs/knowledge-base-audit.md 4.3.5）：
 *   contraindications  禁忌人群：{ group, level, reason, keyword }
 *                      level 枚举：禁用 / 忌用 / 慎用 / 减量 / 咨询医师
 *                      group 枚举：pregnant lactating child menstruation hypertension
 *                                  diabetes kidney anticoagulant lithium thyroid
 *                                  immunosuppressant sedative gout preop
 *   drugInteraction    用药交互键，配合下方 DRUG_NOTES 给出「间隔多久、找谁」的提示
 *   sugarContent       含糖滋补食材（红枣/桂圆/桑椹等），供血糖人群动态提示
 *   isPilot            含试点物质（黄芪/党参），非全国通用药食同源食材
 *   usageCap           单味与全方每日用量上限
 *   courseLimit        连续饮用上限与停饮间隔
 *   sharedIngredient   与其它茶方共用的食材，用于同日多饮的叠加提醒
 *   dosageBasis        剂量口径：本库一律按「代茶饮用量」，不展示药用量
 */

/** 用药交互统一话术：茶饮类只能告诉用户「什么时候该问、该找谁」，不给剂量建议 */
const DRUG_NOTES = {
  thyroid: '正在服用左甲状腺素等甲状腺药：饮茶与服药间隔 ≥4 小时。',
  anticoagulant: '正在服用抗凝/抗血小板药（华法林、阿司匹林、氯吡格雷等）：本茶含行气类食材，饮用前请咨询主治医师；拟手术者请提前 2 周停饮。',
  lithium: '正在服用锂盐：本茶有利水渗湿类食材，可能影响锂的排出，请勿自行饮用，先咨询精神科医师。',
  glucoseDrug: '正在服用降糖药或胰岛素：含糖食材可能影响血糖波动，饮用前请咨询医师，且不可用茶饮替代降糖方案。',
  immunosuppressant: '正在服用免疫抑制剂（环孢素、他克莫司等）：本茶含补益类食材，饮用前请咨询主治医师。',
  sedative: '正在服用镇静催眠或抗抑郁药：饮用时间与服药间隔 ≥1 小时，不建议自行加用安神类食材。',
  diuretic: '正在服用利尿剂：本茶有利水渗湿类食材，叠加可能增加电解质波动，请咨询医师。'
};

/** 通用提示：所有茶方都适用于这一条，故单独维护，避免 18 处重复 */
const DRUG_NOTE_GENERAL = '养生茶与西药建议间隔 ≥1 小时；左甲状腺素、铁剂、钙剂间隔 ≥4 小时。';

/** 禁忌等级由重到轻，用于取最严提示 */
const LEVEL_ORDER = ['禁用', '忌用', '慎用', '减量', '咨询医师'];

const COMMON_INGREDIENTS = ['陈皮', '枸杞子', '红枣', '玫瑰花', '山楂'];

function sharedOf(names) {
  return names.filter(function (n) { return COMMON_INGREDIENTS.indexOf(n) > -1; });
}

const TEAS = [
  /* ---------------- 平和质 ---------------- */
  {
    id: 'meigui-chenpi',
    name: '玫瑰陈皮茶',
    constitution: 'pinghe',
    subtitle: '疏肝和胃 · 四季皆宜的日常代茶',
    tone: 1,
    nature: '性平',
    taste: '清香微甘',
    ingredients: [
      { name: '玫瑰花', amount: '3g', role: '疏肝理气' },
      { name: '陈皮', amount: '3g', role: '理气健脾' },
      { name: '枸杞子', amount: '5g', role: '滋补肝肾' }
    ],
    effects: ['疏肝和胃，日常调和气血', '理气健脾，改善饭后胀气', '性质平和，四季皆宜日常饮用'],
    scenes: ['四季日常', '饭后胀气', '办公代茶'],
    season: ['春', '夏', '秋', '冬'],
    brew: {
      water: '450ml 沸水（95℃以上）',
      tools: '玻璃杯 / 保温杯',
      time: '8 分钟',
      steps: ['食材快速冲洗，沥干备用', '注入沸水，加盖焖泡 8 分钟', '可续水 2–3 次，当日饮完', '剩余茶汤不留过夜'],
      best: '上午 9–11 点或下午 3–5 点',
      frequency: '每周 3–4 次'
    },
    caution: ['孕期饮用前请先咨询医师', '口舌干燥明显时适当减少频次', '经期量多者建议暂缓'],
    tags: ['温和', '日常', '舒心'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['玫瑰花', '陈皮', '枸杞子']),
    drugInteraction: ['thyroid', 'anticoagulant'],
    contraindications: [
      { group: 'pregnant', level: '忌用', reason: '含玫瑰花（行气类）', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '含玫瑰花，经量多者暂缓', keyword: '经期', mensesOnly: '经量偏多' },
      { group: 'anticoagulant', level: '慎用', reason: '含行气类食材', keyword: '抗凝药' },
      { group: 'diabetes', level: '减量', reason: '含枸杞子，注意总量', keyword: '血糖' }
    ]
  },
  {
    id: 'juhua-sangshen',
    name: '杞菊桑椹茶',
    constitution: 'pinghe',
    subtitle: '滋养肝肾 · 长时间用眼的舒缓之选',
    tone: 3,
    nature: '性平微凉',
    taste: '甘润清香',
    ingredients: [
      { name: '枸杞子', amount: '5g', role: '滋补肝肾' },
      { name: '菊花', amount: '3g', role: '清肝明目' },
      { name: '桑椹', amount: '5g', role: '滋阴补血' }
    ],
    effects: ['滋养肝肾，缓解用眼疲劳', '清肝明目，适合长时间看屏幕', '甘润清香，可作日常代茶'],
    scenes: ['长时间用眼', '屏幕办公', '眼干眼涩'],
    season: ['春', '夏', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['菊花、枸杞、桑椹一同放入杯中', '注入沸水焖泡 8 分钟', '待温后饮用，可续水 2 次', '剩余茶汤不留过夜'],
      best: '上午与午后分次饮用',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、容易腹泻者减少频次', '桑椹含糖，血糖偏高者注意用量', '经期女性建议暂缓'],
    tags: ['明目', '清润', '办公'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['枸杞子']),
    drugInteraction: ['thyroid', 'glucoseDrug'],
    contraindications: [
      { group: 'diabetes', level: '减量', reason: '含桑椹（含糖）', keyword: '血糖' },
      { group: 'pregnant', level: '慎用', reason: '含菊花，性偏凉', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '含菊花，偏凉性', keyword: '经期' },
      { group: 'glucoseDrug', level: '咨询医师', reason: '含糖食材与降糖方案叠加', keyword: '降糖药' }
    ]
  },

  /* ---------------- 气虚质 ---------------- */
  {
    id: 'huangqi-dangshen',
    name: '黄芪党参茶',
    constitution: 'qixu',
    subtitle: '温和打底 · 传统上用于日常补益方向',
    tone: 2,
    nature: '性温',
    taste: '甘润微温',
    ingredients: [
      { name: '黄芪', amount: '6g', role: '传统用于益气固表' },
      { name: '党参', amount: '5g', role: '传统用于健脾益气' },
      { name: '红枣', amount: '2 枚', role: '补中养血' }
    ],
    effects: ['传统上用于气短乏力、说话没劲的日常调理方向', '健脾益肺方向，白天易出虚汗时可作日常代茶', '性质温和，建议长期小量而非一次加足量'],
    scenes: ['办公日常', '换季易感冒', '久坐乏力'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '500ml 沸水',
      tools: '养生壶 / 玻璃杯',
      time: '焖泡 10 分钟',
      steps: ['红枣去核，与黄芪、党参一同冲洗', '沸水冲泡并加盖焖 10 分钟', '可反复续水 2–3 次，当日饮完', '剩余茶汤不留过夜'],
      best: '上午 9–11 点（脾胃当令时段）',
      frequency: '每周 3 次'
    },
    caution: [
      '含试点物质（黄芪、党参），非全国通用食材',
      '非试点地区、孕期哺乳期、14 岁以下不建议饮用',
      '血压偏高者饮用前请咨询医师',
      '感冒发热、咽喉肿痛期间请暂停',
      '口干舌燥、容易上火者酌减'
    ],
    tags: ['补益', '日常', '温和'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: true,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: sharedOf(['红枣']),
    drugInteraction: ['thyroid', 'immunosuppressant'],
    contraindications: [
      { group: 'pregnant', level: '忌用', reason: '含试点物质（黄芪、党参）', keyword: '孕期' },
      { group: 'lactating', level: '忌用', reason: '含试点物质（黄芪、党参）', keyword: '哺乳期' },
      { group: 'child', level: '忌用', reason: '14 岁以下不建议使用含试点物质方', keyword: '儿童' },
      { group: 'immunosuppressant', level: '禁用', reason: '补益类食材与免疫抑制剂叠加', keyword: '免疫抑制剂' },
      { group: 'hypertension', level: '咨询医师', reason: '含黄芪、党参', keyword: '高血压' },
      { group: 'preop', level: '咨询医师', reason: '含补益类食材', keyword: '术前' }
    ]
  },
  {
    id: 'shanyao-lianzi',
    name: '山药莲子茶',
    constitution: 'qixu',
    subtitle: '健脾养胃 · 补而不燥的温和之选',
    tone: 2,
    nature: '性平',
    taste: '平和甘淡',
    ingredients: [
      { name: '山药（干）', amount: '8g', role: '健脾益气' },
      { name: '莲子', amount: '6g', role: '补脾止泻' },
      { name: '芡实', amount: '6g', role: '健脾固涩' }
    ],
    effects: ['健脾养胃，改善食欲偏差', '补而不燥，适合脾胃偏弱人群', '口味清淡，可作为日常代茶'],
    scenes: ['早餐后', '食欲不振', '大便偏稀'],
    season: ['秋', '冬'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['山药、莲子提前用温水泡 30 分钟', '加清水煮沸后转小火煮 15 分钟', '连同枣片一起饮用，可续煮 1 次', '当日饮完，剩余茶汤不留过夜'],
      best: '早餐后半小时',
      frequency: '每周 3–4 次'
    },
    caution: ['腹胀、便秘明显者减少频次', '经期女性建议暂缓'],
    tags: ['健脾', '温和', '清淡'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含中药材，孕期请先咨询', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '含芡实，固涩类，经期建议暂缓', keyword: '经期' }
    ]
  },

  /* ---------------- 阳虚质 ---------------- */
  {
    id: 'jiangzao-nuanyang',
    name: '姜枣暖阳茶',
    constitution: 'yangxu',
    subtitle: '温中散寒 · 缓解手脚发凉、腹部怕冷',
    tone: 4,
    nature: '性温',
    taste: '辛甘温热',
    ingredients: [
      { name: '生姜', amount: '3 片', role: '温中散寒' },
      { name: '红枣', amount: '4 枚', role: '补中益气' },
      { name: '桂圆肉', amount: '6g', role: '温补心脾' }
    ],
    effects: ['温暖手足，缓解畏寒怕冷', '温中散寒，改善腹部发凉', '适合秋冬季节与空调环境'],
    scenes: ['秋冬季节', '手脚冰凉', '腹部怕冷'],
    season: ['秋', '冬'],
    brew: {
      water: '500ml 沸水',
      tools: '保温杯',
      time: '焖泡 10 分钟',
      steps: ['生姜切薄片，红枣去核撕开', '全部食材放入杯中注入沸水', '加盖焖 10 分钟，温热时饮用', '当日饮完，剩余茶汤不留过夜'],
      best: '早上或上午饮用',
      frequency: '每周 2–3 次'
    },
    caution: [
      '阴虚火旺、容易上火者不宜',
      '睡前不建议饮用',
      '含桂圆、红枣，血糖偏高者请减量',
      '孕期、哺乳期请先咨询医师'
    ],
    tags: ['暖身', '温润', '秋冬'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 2 },
    sharedIngredient: sharedOf(['红枣']),
    drugInteraction: ['thyroid', 'glucoseDrug'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含桂圆肉、生姜', keyword: '孕期' },
      { group: 'lactating', level: '慎用', reason: '含桂圆肉', keyword: '哺乳期' },
      { group: 'diabetes', level: '减量', reason: '含桂圆、红枣（含糖）', keyword: '血糖' },
      { group: 'hypertension', level: '咨询医师', reason: '含生姜、桂圆肉', keyword: '高血压' },
      { group: 'menstruation', level: '慎用', reason: '经量多者暂缓', keyword: '经期', mensesOnly: '经量偏多' }
    ]
  },
  {
    id: 'rougui-guiyuan',
    name: '肉桂桂圆茶',
    constitution: 'yangxu',
    subtitle: '温阳暖身 · 冬季畏寒体质的暖饮',
    tone: 4,
    nature: '性热',
    taste: '甘辛温热',
    ingredients: [
      { name: '肉桂', amount: '2g', role: '温阳散寒' },
      { name: '桂圆肉', amount: '6g', role: '补益心脾' },
      { name: '枸杞子', amount: '5g', role: '滋补肝肾' }
    ],
    effects: ['温阳暖身，改善畏寒肢冷', '温润心脾，适合冬季饮用', '甘甜顺口，较易坚持'],
    scenes: ['冬季', '畏寒体质', '经期怕冷'],
    season: ['冬'],
    brew: {
      water: '450ml 沸水',
      tools: '保温杯',
      time: '焖泡 8–10 分钟',
      steps: ['肉桂轻拍裂开，与桂圆、枸杞同放杯中', '注入沸水加盖焖 8–10 分钟', '饮完可续水 1 次，肉桂不回煮', '当日饮完，剩余茶汤不留过夜'],
      best: '上午饮用',
      frequency: '每周 2 次'
    },
    caution: [
      '肉桂用量宜轻，不宜长期大量饮用',
      '口干、便秘、易上火者请勿饮用',
      '孕期及哺乳期请勿饮用',
      '正在服用抗凝药或拟手术者请先咨询医师'
    ],
    tags: ['温阳', '冬季', '暖饮'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 2 },
    sharedIngredient: sharedOf(['枸杞子']),
    drugInteraction: ['thyroid', 'anticoagulant', 'glucoseDrug'],
    contraindications: [
      { group: 'pregnant', level: '禁用', reason: '含肉桂', keyword: '孕期' },
      { group: 'lactating', level: '禁用', reason: '含肉桂', keyword: '哺乳期' },
      { group: 'diabetes', level: '减量', reason: '含桂圆肉、枸杞子（含糖）', keyword: '血糖' },
      { group: 'hypertension', level: '咨询医师', reason: '含肉桂', keyword: '高血压' },
      { group: 'anticoagulant', level: '慎用', reason: '含肉桂，可能影响凝血相关指标', keyword: '抗凝药' },
      { group: 'preop', level: '慎用', reason: '含肉桂，术前请提前停饮', keyword: '术前' }
    ]
  },

  /* ---------------- 阴虚质 ---------------- */
  {
    id: 'gouqi-maidong',
    name: '枸杞麦冬茶',
    constitution: 'yinxu',
    subtitle: '滋阴润燥 · 缓解口干咽燥与夜间出汗',
    tone: 3,
    nature: '性微寒',
    taste: '甘润微寒',
    ingredients: [
      { name: '枸杞子', amount: '6g', role: '滋补肝肾' },
      { name: '麦冬', amount: '6g', role: '养阴生津' },
      { name: '玉竹', amount: '5g', role: '养阴润燥' }
    ],
    effects: ['滋阴润燥，缓解口干咽燥', '养阴安神，改善夜间易出汗', '适合长期用嗓、经常熬夜人群'],
    scenes: ['熬夜后', '口干咽燥', '长期用嗓'],
    season: ['春', '夏', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '焖泡 10 分钟',
      steps: ['三味食材一同冲洗后放入杯中', '注入沸水加盖焖 10 分钟', '全天分次小口饮用，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '上午至傍晚分次饮用',
      frequency: '每周 3 次'
    },
    caution: ['脾胃虚寒、易腹泻者请酌减', '风寒感冒期间请暂停饮用'],
    tags: ['滋阴', '润燥', '熬夜'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['枸杞子']),
    drugInteraction: ['thyroid'],
    contraindications: [
      { group: 'diabetes', level: '减量', reason: '含枸杞子，注意总量', keyword: '血糖' },
      { group: 'pregnant', level: '慎用', reason: '含中药材，孕期请先咨询', keyword: '孕期' }
    ]
  },
  {
    id: 'baihe-sangshen',
    name: '百合桑椹茶',
    constitution: 'yinxu',
    subtitle: '养阴润肺 · 干燥季节的清甜滋养',
    tone: 3,
    nature: '性微寒',
    taste: '甘润清甜',
    ingredients: [
      { name: '百合（干）', amount: '6g', role: '养阴润肺' },
      { name: '桑椹', amount: '6g', role: '滋阴补血' },
      { name: '枸杞子', amount: '5g', role: '滋补肝肾' }
    ],
    effects: ['养阴润肺，舒缓咽部干痒', '滋阴养血，改善皮肤干燥', '清甜顺口，适合干燥季节饮用'],
    scenes: ['秋季干燥', '睡眠偏浅', '皮肤干燥'],
    season: ['秋', '冬'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['百合温水泡软后与桑椹、枸杞同放', '注入沸水焖泡 10 分钟', '可续水 2 次，百合可一并食用', '当日饮完，剩余茶汤不留过夜'],
      best: '下午至傍晚',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、大便稀软者少饮', '血糖偏高者注意桑椹用量'],
    tags: ['润燥', '秋季', '清甜'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['枸杞子']),
    drugInteraction: ['thyroid', 'glucoseDrug'],
    contraindications: [
      { group: 'diabetes', level: '减量', reason: '含桑椹（含糖）', keyword: '血糖' },
      { group: 'glucoseDrug', level: '咨询医师', reason: '含糖食材与降糖方案叠加', keyword: '降糖药' }
    ]
  },

  /* ---------------- 痰湿质 ---------------- */
  {
    id: 'hongdou-yimi',
    name: '红豆薏米茶',
    constitution: 'tanshi',
    subtitle: '健脾祛湿 · 缓解身体沉重与晨起浮肿',
    tone: 2,
    nature: '性平',
    taste: '平淡微甘',
    ingredients: [
      { name: '赤小豆', amount: '8g', role: '利水消肿' },
      { name: '薏苡仁', amount: '8g', role: '健脾祛湿' },
      { name: '茯苓', amount: '6g', role: '健脾渗湿' }
    ],
    effects: ['健脾祛湿，缓解身体沉重感', '利水渗湿，改善晨起面部浮肿', '适合多雨季节与久坐人群'],
    scenes: ['雨季祛湿', '晨起浮肿', '身体沉重'],
    season: ['春', '夏'],
    brew: {
      water: '700ml 清水',
      tools: '养生壶',
      time: '煮 20 分钟',
      steps: ['赤小豆、薏苡仁提前浸泡 2 小时', '加清水煮沸后转小火煮 20 分钟', '滤出茶汤饮用，可续煮 1 次', '当日饮完，剩余茶汤不留过夜'],
      best: '上午饮用',
      frequency: '每周 3 次'
    },
    caution: [
      '孕妇请勿饮用（含薏苡仁）',
      '体质偏干、便秘者减少频次',
      '经期女性建议暂缓',
      '正在服用利尿剂或锂盐者请先咨询医师'
    ],
    tags: ['祛湿', '季节', '清淡'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'lithium', 'diuretic'],
    contraindications: [
      { group: 'pregnant', level: '禁用', reason: '含薏苡仁', keyword: '孕期' },
      { group: 'lithium', level: '禁用', reason: '利水渗湿类食材可能影响锂的排出', keyword: '锂盐' },
      { group: 'kidney', level: '咨询医师', reason: '限钾限水人群需评估', keyword: '肾功能' },
      { group: 'menstruation', level: '慎用', reason: '性偏渗利，经期暂缓', keyword: '经期' },
      { group: 'gout', level: '慎用', reason: '注意总饮用量', keyword: '痛风' }
    ]
  },
  {
    id: 'chenpi-heye',
    name: '陈皮荷叶茶',
    constitution: 'tanshi',
    subtitle: '理气化痰 · 餐后解腻的清香之选',
    tone: 1,
    nature: '性平',
    taste: '微苦回甘',
    ingredients: [
      { name: '陈皮', amount: '3g', role: '理气化痰' },
      { name: '荷叶', amount: '3g', role: '清暑化湿' },
      { name: '山楂', amount: '5g', role: '消食化滞' }
    ],
    effects: ['理气化痰，改善胸闷痰多', '消食化滞，缓解饭后腹胀', '清新爽口，餐后饮用较舒适'],
    scenes: ['餐后解腻', '胸闷痰多', '饮食清淡期'],
    season: ['夏', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['荷叶撕小片，与陈皮、山楂一同放入杯中', '注入沸水焖泡 8 分钟', '餐后温饮，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '餐后半小时',
      frequency: '每周 3 次'
    },
    caution: ['胃酸过多者请勿空腹饮用', '孕妇慎用山楂', '脾胃虚寒者减少频次'],
    tags: ['解腻', '化痰', '餐后'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['陈皮', '山楂']),
    drugInteraction: ['thyroid', 'anticoagulant'],
    contraindications: [
      { group: 'pregnant', level: '忌用', reason: '含山楂', keyword: '孕期' },
      { group: 'anticoagulant', level: '慎用', reason: '含山楂，行气消食类', keyword: '抗凝药' },
      { group: 'menstruation', level: '慎用', reason: '含山楂、荷叶，经期暂缓', keyword: '经期' },
      { group: 'kidney', level: '咨询医师', reason: '含荷叶', keyword: '肾功能' }
    ]
  },

  /* ---------------- 湿热质 ---------------- */
  {
    id: 'jinyinhua-juhua',
    name: '金银花菊花茶',
    constitution: 'shire',
    subtitle: '清热利湿 · 缓解口苦口臭与面部油光',
    tone: 1,
    nature: '性寒',
    taste: '苦甘清凉',
    ingredients: [
      { name: '金银花', amount: '3g', role: '清热解毒' },
      { name: '菊花', amount: '3g', role: '清肝明目' },
      { name: '荷叶', amount: '3g', role: '清热利湿' }
    ],
    effects: ['清解湿热，缓解口苦口臭', '清肝明目，改善面部油光', '适合夏季暑热与熬夜之后'],
    scenes: ['夏季暑热', '面部油腻', '熬夜之后'],
    season: ['夏'],
    brew: {
      water: '450ml 沸水（85–90℃）',
      tools: '玻璃杯',
      time: '6–8 分钟',
      steps: ['食材冲洗后放入杯中', '注入稍凉一点的沸水（85–90℃）', '焖泡 6–8 分钟，温饮不冰镇', '当日饮完，剩余茶汤不留过夜'],
      best: '午后饮用',
      frequency: '每周 2–3 次'
    },
    caution: ['脾胃虚寒、经期女性不宜', '不建议长期连续大量饮用', '空腹时请勿饮用'],
    tags: ['清热', '夏季', '清爽'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '性偏寒凉', keyword: '孕期' },
      { group: 'menstruation', level: '忌用', reason: '性偏寒凉，经期不宜', keyword: '经期' },
      { group: 'child', level: '慎用', reason: '14 岁以下不建议饮用含药材茶饮', keyword: '儿童' },
      { group: 'kidney', level: '咨询医师', reason: '含荷叶', keyword: '肾功能' }
    ]
  },
  {
    id: 'pugongying-yumixu',
    name: '蒲公英玉米须茶',
    constitution: 'shire',
    subtitle: '清利湿热 · 舒缓困重与小便偏黄',
    tone: 1,
    nature: '性寒',
    taste: '微苦回甘',
    ingredients: [
      { name: '蒲公英', amount: '5g', role: '清热解毒' },
      { name: '玉米须', amount: '5g', role: '利湿消肿' },
      { name: '茯苓', amount: '3g', role: '理中利湿' }
    ],
    effects: ['清热利湿，舒缓小便偏黄', '利湿消肿，改善下肢困重', '配伍茯苓，利湿而不伤中'],
    scenes: ['湿热体质', '小便偏黄', '下肢沉重'],
    season: ['夏'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['玉米须用清水冲净，与其余食材同放', '注入沸水焖泡 10 分钟', '上午至午后分次饮用', '当日饮完，剩余茶汤不留过夜'],
      best: '上午至午后',
      frequency: '每周 2 次'
    },
    caution: [
      '脾胃虚寒、易腹泻者不宜',
      '孕妇请勿饮用',
      '不宜长期连续饮用',
      '正在服用利尿剂、锂盐或降压药者请先咨询医师'
    ],
    tags: ['利湿', '清爽', '夏季'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'lithium', 'diuretic'],
    contraindications: [
      { group: 'lithium', level: '禁用', reason: '利水渗湿类食材可能影响锂的排出', keyword: '锂盐' },
      { group: 'pregnant', level: '禁用', reason: '含蒲公英、玉米须', keyword: '孕期' },
      { group: 'kidney', level: '咨询医师', reason: '含玉米须，限钾限水者需评估', keyword: '肾功能' },
      { group: 'hypertension', level: '咨询医师', reason: '与降压药叠加需评估', keyword: '高血压' },
      { group: 'menstruation', level: '忌用', reason: '性偏寒凉，经期不宜', keyword: '经期' }
    ]
  },

  /* ---------------- 血瘀质 ---------------- */
  {
    id: 'meigui-shanzha',
    name: '玫瑰山楂茶',
    constitution: 'xueyu',
    subtitle: '理气助行 · 清香解腻的餐后饮',
    tone: 4,
    nature: '性温',
    taste: '酸甜微温',
    ingredients: [
      { name: '玫瑰花', amount: '3g', role: '疏肝行气' },
      { name: '山楂', amount: '6g', role: '消食和中' },
      { name: '陈皮', amount: '3g', role: '理气健脾' }
    ],
    effects: ['理气助行，舒展日常气机', '消食化滞，缓解饭后闷胀', '花香愉悦，有助舒缓情绪'],
    scenes: ['面色晦暗', '饭后闷胀', '情绪不畅'],
    season: ['春', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['山楂略拍裂，与玫瑰花、陈皮同放杯中', '注入沸水焖泡 8 分钟', '餐后温饮，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '餐后半小时',
      frequency: '每周 3 次'
    },
    caution: [
      '本茶为日常饮品，不替代任何医疗手段',
      '孕妇请勿饮用（含山楂、玫瑰）',
      '胃酸过多者请餐后饮用',
      '经期量多者、正在服用抗凝药者请先咨询医师'
    ],
    tags: ['理气', '消食', '舒心'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['玫瑰花', '山楂', '陈皮']),
    drugInteraction: ['thyroid', 'anticoagulant'],
    contraindications: [
      { group: 'pregnant', level: '禁用', reason: '含山楂、玫瑰花', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '行气类食材，经量多者暂缓', keyword: '经期', mensesOnly: '经量偏多' },
      { group: 'anticoagulant', level: '慎用', reason: '含行气类食材', keyword: '抗凝药' },
      { group: 'preop', level: '慎用', reason: '拟手术者请提前 2 周停饮', keyword: '术前' }
    ]
  },
  {
    id: 'meigui-guihua',
    name: '玫瑰桂花茶',
    constitution: 'xueyu',
    subtitle: '疏肝温通 · 香气怡人的日常行气饮',
    tone: 4,
    nature: '性温',
    taste: '香甜微温',
    ingredients: [
      { name: '玫瑰花', amount: '3g', role: '疏肝解郁' },
      { name: '桂花', amount: '2g', role: '温中散寒' },
      { name: '桑椹', amount: '5g', role: '滋阴养血' }
    ],
    effects: ['疏肝理气，改善情绪郁结', '温润和中，缓解手足不温', '香气怡人，适合日常代茶'],
    scenes: ['情绪郁结', '手足不温', '日常办公'],
    season: ['秋', '冬'],
    brew: {
      water: '400ml 沸水（85–90℃）',
      tools: '玻璃杯',
      time: '6 分钟',
      steps: ['桂花与玫瑰花不宜久泡', '注入 85–90℃ 热水焖 6 分钟', '香气散尽即可弃渣', '当日饮完，剩余茶汤不留过夜'],
      best: '下午饮用',
      frequency: '每周 3 次'
    },
    caution: ['孕妇慎用玫瑰与桂花', '经期量多者建议暂缓', '口舌干燥者减少频次', '正在服用抗凝药者请先咨询医师'],
    tags: ['行气', '芬芳', '日常'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: sharedOf(['玫瑰花']),
    drugInteraction: ['thyroid', 'anticoagulant', 'glucoseDrug'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含玫瑰花、桂花', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '行气类食材，经量多者暂缓', keyword: '经期', mensesOnly: '经量偏多' },
      { group: 'anticoagulant', level: '慎用', reason: '含行气类食材', keyword: '抗凝药' },
      { group: 'diabetes', level: '减量', reason: '含桑椹（含糖）', keyword: '血糖' }
    ]
  },

  /* ---------------- 气郁质 ---------------- */
  {
    id: 'meigui-foshou',
    name: '玫瑰佛手茶',
    constitution: 'qiyu',
    subtitle: '疏肝解郁 · 缓解胸闷与爱叹气的习惯',
    tone: 3,
    nature: '性温',
    taste: '清香微苦',
    ingredients: [
      { name: '玫瑰花', amount: '3g', role: '疏肝解郁' },
      { name: '佛手', amount: '3g', role: '疏肝理气' },
      { name: '砂仁', amount: '2g', role: '芳香化湿开胃' }
    ],
    effects: ['疏肝解郁，缓解胸闷想叹气', '芳香化湿，改善胸闷食欲不振', '清香微甘，有助舒缓紧张情绪'],
    scenes: ['压力较大', '胸闷叹气', '情绪低落'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['砂仁轻拍裂开，与佛手、玫瑰同放', '注入沸水加盖焖 8 分钟', '分次温饮，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '上午与午后各一次',
      frequency: '每周 3 次'
    },
    caution: ['孕妇慎用', '口舌干燥者减少玫瑰用量', '胃部不适时请餐后饮用', '正在服用抗凝药者请先咨询医师'],
    tags: ['解郁', '舒心', '压力'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['玫瑰花']),
    drugInteraction: ['thyroid', 'anticoagulant', 'sedative'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含玫瑰花、佛手、砂仁', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '行气类食材，经量多者暂缓', keyword: '经期', mensesOnly: '经量偏多' },
      { group: 'anticoagulant', level: '慎用', reason: '含行气类食材', keyword: '抗凝药' },
      { group: 'sedative', level: '慎用', reason: '情绪相关用药请与饮茶间隔 ≥1 小时', keyword: '镇静药' }
    ]
  },
  {
    id: 'moli-baihe',
    name: '茉莉百合茶',
    constitution: 'qiyu',
    subtitle: '理气安神 · 睡前 1 小时的放松茶',
    tone: 3,
    nature: '性平',
    taste: '花香甘润',
    ingredients: [
      { name: '茉莉花', amount: '3g', role: '理气开郁' },
      { name: '百合（干）', amount: '6g', role: '养阴安神' },
      { name: '桑椹', amount: '5g', role: '滋阴养血' }
    ],
    effects: ['理气安神，改善入睡困难', '养阴润燥，舒缓心浮气躁', '花香柔和，适合睡前放松'],
    scenes: ['入睡困难', '心烦易怒', '睡前放松'],
    season: ['春', '夏', '秋'],
    brew: {
      water: '450ml 热水（85–90℃）',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['百合温水泡软后与茉莉、桑椹同放', '注入 85–90℃ 热水焖 8 分钟', '睡前 1 小时温热小口饮用', '当日饮完，剩余茶汤不留过夜'],
      best: '睡前 1 小时',
      frequency: '每周 3–4 次'
    },
    caution: [
      '脾胃虚寒者不宜饮凉茶汤',
      '含桑椹，血糖偏高者注意用量',
      '夜尿频繁者睡前少饮',
      '正在服用镇静催眠药者请与服药间隔 ≥1 小时'
    ],
    tags: ['安神', '睡前', '花香'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'sedative', 'glucoseDrug'],
    contraindications: [
      { group: 'sedative', level: '慎用', reason: '含安神类食材，避免与镇静药叠加', keyword: '镇静药' },
      { group: 'diabetes', level: '减量', reason: '含桑椹（含糖）', keyword: '血糖' },
      { group: 'pregnant', level: '慎用', reason: '含茉莉花、百合', keyword: '孕期' }
    ]
  },

  /* ---------------- 特禀质 ---------------- */
  {
    id: 'dazao-shanyao',
    name: '大枣山药茶',
    constitution: 'tebing',
    subtitle: '益气固本 · 换季时节的温和打底',
    tone: 2,
    nature: '性平',
    taste: '甘平温润',
    ingredients: [
      { name: '红枣', amount: '3 枚', role: '补中益气' },
      { name: '山药（干）', amount: '8g', role: '健脾益气' },
      { name: '茯苓', amount: '6g', role: '健脾渗湿' }
    ],
    effects: ['益气固本，改善体质偏弱', '健脾养胃，减少换季不适', '平和温润，适合长期饮用打底'],
    scenes: ['换季易感冒', '体质偏弱', '日常调养'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['山药、莲子提前温水泡 30 分钟', '加水煮沸后小火煮 15 分钟', '连汤带料一同食用更佳', '当日饮完，剩余茶汤不留过夜'],
      best: '早餐后',
      frequency: '每周 3–4 次'
    },
    caution: [
      '腹胀、便秘者减少频次',
      '血糖偏高者注意红枣用量',
      '初次饮用建议从半量开始',
      '过敏体质者请确认对所用食材无过敏史'
    ],
    tags: ['固本', '温和', '换季'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: sharedOf(['红枣']),
    drugInteraction: ['thyroid', 'glucoseDrug'],
    contraindications: [
      { group: 'diabetes', level: '减量', reason: '含红枣（含糖）', keyword: '血糖' },
      { group: 'glucoseDrug', level: '咨询医师', reason: '含糖食材与降糖方案叠加', keyword: '降糖药' },
      { group: 'pregnant', level: '慎用', reason: '含中药材，孕期请先咨询', keyword: '孕期' }
    ]
  },
  {
    id: 'wumei-shanzha',
    name: '乌梅山楂茶',
    constitution: 'tebing',
    subtitle: '生津润喉 · 舒缓换季时的咽部干痒',
    tone: 4,
    nature: '性平',
    taste: '酸甘适口',
    ingredients: [
      { name: '乌梅', amount: '5g', role: '敛肺生津' },
      { name: '山楂', amount: '5g', role: '消食化滞' },
      { name: '陈皮', amount: '3g', role: '理气健脾' }
    ],
    effects: ['生津润喉，缓解咽部干痒', '消食和中，改善食欲不佳', '酸甘适口，成分简单较温和'],
    scenes: ['过敏高发季', '咽部干痒', '食欲不佳'],
    season: ['春', '秋'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['乌梅、山楂略冲洗，与陈皮同放', '注入沸水焖泡 10 分钟', '待温后小口饮用，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '餐后饮用',
      frequency: '每周 2–3 次'
    },
    caution: ['胃酸过多、胃部不适者请勿空腹饮用', '孕妇慎用山楂', '不宜长期连续饮用'],
    tags: ['生津', '润喉', '温和'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: sharedOf(['山楂', '陈皮']),
    drugInteraction: ['thyroid', 'anticoagulant'],
    contraindications: [
      { group: 'pregnant', level: '忌用', reason: '含山楂', keyword: '孕期' },
      { group: 'anticoagulant', level: '慎用', reason: '含山楂，行气消食类', keyword: '抗凝药' },
      { group: 'menstruation', level: '慎用', reason: '含山楂，经期暂缓', keyword: '经期' }
    ]
  },

  /* ---------------- 季节空档补充方（审计 4.3.6） ----------------
   * 补的是「季节 × 体质」的空白格，不是再加同质化的第二方：
   *   A 长夏化湿饮   —— 长夏/梅雨只有 1 个纯化湿方，且茶 9 偏寒，寒湿型接不住
   *   B 夏季清补生津 —— 夏季寒凉方扎堆（11/12 标「脾胃虚寒不宜」），7–8 月无人接
   *   C 秋燥润肺饮   —— 秋燥过载但典型润燥方少，且需要血糖友好
   *   D 冬季温阳轻补 —— 替代茶 6：降肉桂到 1g、去桂圆，减少升糖与偏热
   *   E 安神代茶     —— 睡眠方向缺一款「不碰镇静药交互」的温和方
   * ------------------------------------------------------------ */
  {
    id: 'biandou-fuling',
    name: '长夏化湿饮',
    constitution: 'tanshi',
    subtitle: '健脾化湿 · 梅雨长夏的温和之选',
    tone: 2,
    nature: '性平微温',
    taste: '甘淡微辛',
    ingredients: [
      { name: '白扁豆', amount: '6g', role: '健脾化湿' },
      { name: '茯苓', amount: '6g', role: '健脾渗湿' },
      { name: '陈皮', amount: '3g', role: '理气化湿' },
      { name: '生姜', amount: '2 片', role: '温中散寒' }
    ],
    effects: ['健脾化湿，缓解长夏身体困重', '温而不寒，脾胃偏虚者也可选', '配伍生姜，化湿而不伤中'],
    scenes: ['梅雨长夏', '身体困重', '寒湿偏重'],
    season: ['夏'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['白扁豆提前浸泡 1 小时', '与其余食材同煮，沸后小火 15 分钟', '滤汤温热饮用，豆可一并食用', '当日饮完，剩余茶汤不留过夜'],
      best: '上午饮用',
      frequency: '每周 3 次'
    },
    caution: ['白扁豆必须充分煮透后再饮用', '腹胀明显者减少频次', '孕期请先咨询医师', '正在服用利尿剂或锂盐者请先咨询医师'],
    tags: ['化湿', '长夏', '温和'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: sharedOf(['陈皮']),
    drugInteraction: ['thyroid', 'lithium', 'diuretic'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含白扁豆、陈皮', keyword: '孕期' },
      { group: 'lithium', level: '慎用', reason: '含茯苓等渗湿类食材', keyword: '锂盐' },
      { group: 'kidney', level: '咨询医师', reason: '渗湿类食材，限水者需评估', keyword: '肾功能' },
      { group: 'menstruation', level: '慎用', reason: '经期建议暂缓', keyword: '经期' }
    ]
  },
  {
    id: 'wumei-maidong',
    name: '夏季清补生津饮',
    constitution: 'pinghe',
    subtitle: '清补生津 · 夏季出汗偏多的解渴之选',
    tone: 3,
    nature: '性平微凉',
    taste: '酸甘清润',
    ingredients: [
      { name: '乌梅', amount: '5g', role: '生津敛汗' },
      { name: '麦冬', amount: '6g', role: '养阴生津' },
      { name: '荷叶', amount: '3g', role: '清暑化湿' }
    ],
    effects: ['生津解渴，适合夏季出汗偏多', '清而不寒，脾胃偏虚者也可少量', '酸甘相配，口感清润好入口'],
    scenes: ['夏季暑热', '出汗偏多', '口干不解渴'],
    season: ['夏'],
    brew: {
      water: '450ml 沸水（90℃左右）',
      tools: '玻璃杯',
      time: '焖泡 10 分钟',
      steps: ['三味食材冲洗后放入杯中', '注入 90℃ 左右热水焖 10 分钟', '温饮不冰镇，可续水 1 次', '当日饮完，剩余茶汤不留过夜'],
      best: '午后至傍晚',
      frequency: '每周 3 次'
    },
    caution: ['胃酸过多者请餐后饮用', '脾胃虚寒、易腹泻者减少频次', '经期女性建议暂缓', '正在服用利尿剂或锂盐者请先咨询医师'],
    tags: ['生津', '夏季', '清补'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'lithium', 'diuretic'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含荷叶、麦冬，性偏凉', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '性偏凉，经期建议暂缓', keyword: '经期' },
      { group: 'lithium', level: '慎用', reason: '含荷叶，渗利类', keyword: '锂盐' },
      { group: 'kidney', level: '咨询医师', reason: '含荷叶', keyword: '肾功能' }
    ]
  },
  {
    id: 'sangye-baihe',
    name: '秋燥润肺饮',
    constitution: 'yinxu',
    subtitle: '清肺润燥 · 秋季咽部干痒的甘润饮',
    tone: 3,
    nature: '性平微凉',
    taste: '甘润清甜',
    ingredients: [
      { name: '桑叶', amount: '3g', role: '清肺润燥' },
      { name: '百合（干）', amount: '6g', role: '养阴润肺' },
      { name: '罗汉果', amount: '5g', role: '润肺利咽（约 1/4 个）' }
    ],
    effects: ['清肺润燥，缓解秋燥咽干', '甜味来自罗汉果甜苷，不额外加糖', '甘润顺口，适合干燥季节'],
    scenes: ['秋季干燥', '咽部干痒', '用嗓较多'],
    season: ['秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['百合温水泡软后与桑叶、罗汉果同放', '注入沸水焖泡 10 分钟', '温饮，可续水 2 次', '当日饮完，剩余茶汤不留过夜'],
      best: '上午至午后',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、易腹泻者减少频次', '经期女性建议暂缓', '孕期请先咨询医师', '血糖偏高者仍应注意整体饮食'],
    tags: ['润燥', '秋季', '清甜'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'glucoseDrug'],
    contraindications: [
      { group: 'pregnant', level: '慎用', reason: '含桑叶，性偏凉', keyword: '孕期' },
      { group: 'menstruation', level: '慎用', reason: '含桑叶，经期建议暂缓', keyword: '经期' },
      { group: 'diabetes', level: '咨询医师', reason: '虽用甜苷代糖，仍建议先咨询', keyword: '血糖' },
      { group: 'kidney', level: '咨询医师', reason: '含桑叶，需评估', keyword: '肾功能' }
    ]
  },
  {
    id: 'shanyao-rougui',
    name: '冬季温阳轻补饮',
    constitution: 'yangxu',
    subtitle: '温阳轻补 · 比热性方更平和的冬季暖饮',
    tone: 4,
    nature: '性温',
    taste: '辛甘温润',
    ingredients: [
      { name: '山药（干）', amount: '6g', role: '健脾益气' },
      { name: '肉桂', amount: '1g', role: '温阳散寒' },
      { name: '红枣', amount: '2 枚', role: '补中益气' },
      { name: '生姜', amount: '2 片', role: '温中散寒' }
    ],
    effects: ['温阳暖身，比热性方更平和', '降肉桂、去桂圆，清甜不腻', '适合作为冬季日常的温和暖饮'],
    scenes: ['冬季畏寒', '手脚发凉', '想要温和暖饮'],
    season: ['冬'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['山药温水泡 30 分钟，红枣去核', '加清水与肉桂、生姜同煮 15 分钟', '温热时饮用，可续煮 1 次', '当日饮完，剩余茶汤不留过夜'],
      best: '上午饮用',
      frequency: '每周 2–3 次'
    },
    caution: ['肉桂用量宜轻，1g 即可', '口干、便秘、易上火者请勿饮用', '孕期与哺乳期请勿饮用', '正在服用抗凝药或拟手术者请先咨询医师'],
    tags: ['温阳', '冬季', '温和'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: true,
    isPilot: false,
    courseLimit: { maxWeeks: 2, restWeeks: 2 },
    sharedIngredient: sharedOf(['红枣']),
    drugInteraction: ['thyroid', 'anticoagulant', 'glucoseDrug'],
    contraindications: [
      { group: 'pregnant', level: '禁用', reason: '含肉桂', keyword: '孕期' },
      { group: 'lactating', level: '禁用', reason: '含肉桂', keyword: '哺乳期' },
      { group: 'diabetes', level: '减量', reason: '含红枣（含糖）', keyword: '血糖' },
      { group: 'hypertension', level: '咨询医师', reason: '含肉桂、生姜', keyword: '高血压' },
      { group: 'anticoagulant', level: '慎用', reason: '含肉桂，可能影响凝血相关指标', keyword: '抗凝药' },
      { group: 'preop', level: '慎用', reason: '含肉桂，术前请提前停饮', keyword: '术前' }
    ]
  },
  {
    id: 'baihe-fuling',
    name: '安神代茶',
    constitution: 'qiyu',
    subtitle: '养阴宁心 · 睡前 1 小时的温和安神饮',
    tone: 3,
    nature: '性平',
    taste: '甘润微清',
    ingredients: [
      { name: '百合（干）', amount: '6g', role: '养阴安神' },
      { name: '茯苓', amount: '6g', role: '健脾宁心' },
      { name: '莲子', amount: '6g', role: '养心安神' }
    ],
    effects: ['养阴宁心，睡前 1 小时温热小口饮用', '不含咖啡因类食材，晚间饮用负担小', '暂不含酸枣仁，避开与镇静药的交互'],
    scenes: ['睡前放松', '入睡偏浅', '心神不宁'],
    season: ['春', '夏', '秋', '冬'],
    brew: {
      water: '500ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['百合、莲子温水泡软', '加清水与茯苓同煮 15 分钟', '滤汤温饮，百合与莲子可一并食用', '当日饮完，剩余茶汤不留过夜'],
      best: '睡前 1 小时',
      frequency: '每周 3–4 次'
    },
    caution: [
      '睡前 1 小时饮用，量不宜多',
      '夜尿频繁者睡前少饮',
      '正在服用镇静催眠药者请与服药间隔 ≥1 小时',
      '脾胃虚寒、大便稀软者减少频次'
    ],
    tags: ['安神', '睡前', '平和'],
    dosageBasis: '代茶饮用量',
    usageCap: '≤8g/味 · ≤20g/日',
    sugarContent: false,
    isPilot: false,
    courseLimit: { maxWeeks: 4, restWeeks: 1 },
    sharedIngredient: [],
    drugInteraction: ['thyroid', 'sedative', 'lithium', 'diuretic'],
    contraindications: [
      { group: 'sedative', level: '慎用', reason: '含安神类食材，避免与镇静药叠加', keyword: '镇静药' },
      { group: 'pregnant', level: '慎用', reason: '含百合、茯苓', keyword: '孕期' },
      { group: 'kidney', level: '咨询医师', reason: '含茯苓，限水者需评估', keyword: '肾功能' },
      { group: 'lithium', level: '慎用', reason: '含茯苓，渗湿类', keyword: '锂盐' }
    ]
  }
];

const MAP = {};

function rebuildMap() {
  Object.keys(MAP).forEach(function (k) { delete MAP[k]; });
  TEAS.forEach(function (t) { MAP[t.id] = t; });
}
rebuildMap();

function byConstitution(cid) {
  return TEAS.filter(function (t) { return t.constitution === cid; });
}

/**
 * 取某款茶方针对给定「风险标记」的禁忌条目。
 *
 * 条件性禁忌：条目可带 `mensesOnly`（如「经量偏多」），只有 basic.menses 与之一致时才算命中。
 * 起因：5 条理由写着「经量多者暂缓」的条目原来是无条件命中，导致任何经期用户
 * 都被全库拦下（连平和质都挑不出一款干净的），把「条件性提醒」错当成了「全员禁忌」。
 *
 * @param {object} tea
 * @param {{drugs?:Array,conditions?:Array,stage?:string,age?:string,menses?:string}} basic 端上采集的基础信息
 * @returns {Array} 命中的禁忌条目
 */
function hitContraindications(tea, basic) {
  if (!tea || !basic) return [];
  const groups = [];
  if (basic.stage === '孕期') groups.push('pregnant');
  if (basic.stage === '哺乳期') groups.push('lactating');
  if (basic.stage === '近期拟手术') groups.push('preop');
  if (basic.stage === '经期') groups.push('menstruation');
  if (basic.age === '18 岁以下') groups.push('child');
  (basic.conditions || []).forEach(function (c) {
    if (c === '高血压') groups.push('hypertension');
    if (c === '糖尿病') groups.push('diabetes');
    if (c === '肝肾疾病') groups.push('kidney');
    if (c === '甲状腺问题') groups.push('thyroid');
    if (c === '冠心病/心衰') groups.push('hypertension');
    if (c === '痛风/高尿酸') groups.push('gout');
  });
  (basic.drugs || []).forEach(function (d) {
    if (d.indexOf('抗凝') > -1) groups.push('anticoagulant');
    if (d.indexOf('降糖') > -1) groups.push('diabetes', 'glucoseDrug');
    if (d.indexOf('甲状腺') > -1) groups.push('thyroid');
    if (d.indexOf('降压') > -1) groups.push('hypertension');
    if (d.indexOf('免疫抑制') > -1) groups.push('immunosuppressant');
    if (d.indexOf('镇静') > -1 || d.indexOf('抗抑郁') > -1) groups.push('sedative');
  });
  if (!groups.length) return [];
  return (tea.contraindications || []).filter(function (c) {
    if (groups.indexOf(c.group) === -1) return false;
    // 条件性禁忌：不满足附加条件就不算命中
    if (c.mensesOnly && basic.menses !== c.mensesOnly) return false;
    return true;
  });
}

/**
 * 内容覆盖：用管理后台下发的茶方库替换内置数据。
 *
 * 必须「就地改写」TEAS 与 MAP，不能换成新数组/新对象 ——
 * 页面与服务端到处持有 teas.list、teas.map 的引用（如 teas.map[id]），
 * 一旦替换引用，它们会永远读到旧数据。
 *
 * @param {Array} next 茶方数组；非法或为空时保持原样
 * @returns {number} 覆盖后的条数
 */
function applyOverride(next) {
  if (!Array.isArray(next) || !next.length) return TEAS.length;
  TEAS.length = 0;
  Array.prototype.push.apply(TEAS, next);
  rebuildMap();
  module.exports.total = TEAS.length;
  return TEAS.length;
}

module.exports = {
  list: TEAS,
  map: MAP,
  get: function (id) { return MAP[id] || null; },
  byConstitution: byConstitution,
  hitContraindications: hitContraindications,
  DRUG_NOTES: DRUG_NOTES,
  DRUG_NOTE_GENERAL: DRUG_NOTE_GENERAL,
  LEVEL_ORDER: LEVEL_ORDER,
  total: TEAS.length,
  applyOverride: applyOverride
};
