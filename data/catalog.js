/**
 * 药食同源食材白名单（项目已审核名单 · 节选）。
 *
 * 作用：把「茶方里能出现哪些食材」变成一份可校验的配置，
 * 而不是散落在茶方数据里靠人工记忆。上线前跑 server/scripts/eval.js
 * 就会校验「所有茶方食材 ⊆ 本名单」，出现名单外食材直接报错。
 *
 * 字段说明（见 docs/knowledge-base-audit.md 4.5）：
 *   usageCap              每日代茶用量上限
 *   contraindicatedGroups 该食材本身的禁忌人群（茶方禁忌的底层依据）
 *   isPilot               是否为「按照传统既是食品又是中药材的物质管理」试点物质
 *   sugarContent          是否含糖（红枣/桂圆/桑椹等），供血糖提示
 *   drugInteraction       已知需提示的用药交互键
 *   catVersion            目录版本与批注
 *
 * 收录范围：节选自国家卫健委《既是食品又是中药材的物质目录》及后续增补、
 * 试点物质名单中本项目实际用到的品种，每味均控制在日常养生参考剂量内使用。
 * 说明：目录会更新，正式上线前请按最新版本再核对一次，并交由中医师复核配伍。
 */

const CAT_VERSION = '药食同源目录 2026-10 校对版（含试点物质批注）';

const ITEMS = [
  { name: '玫瑰花', category: '花类', part: '花蕾', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation'], drugInteraction: ['anticoagulant'], catVersion: CAT_VERSION },
  { name: '菊花', category: '花类', part: '头状花序', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation'], catVersion: CAT_VERSION },
  { name: '金银花', category: '花类', part: '花蕾', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation', 'child'], catVersion: CAT_VERSION },
  { name: '桂花', category: '花类', part: '花', usageCap: '≤3g/日', contraindicatedGroups: ['pregnant'], catVersion: CAT_VERSION },
  { name: '茉莉花', category: '花类', part: '花', usageCap: '≤3g/日', contraindicatedGroups: ['pregnant'], catVersion: CAT_VERSION },
  { name: '陈皮', category: '果类', part: '果皮', alias: '橘皮', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '枸杞子', category: '果类', part: '果实', usageCap: '≤6g/日', contraindicatedGroups: [], sugarContent: true, catVersion: CAT_VERSION },
  { name: '桑椹', category: '果类', part: '果穗', usageCap: '≤6g/日', contraindicatedGroups: ['diabetes'], sugarContent: true, catVersion: CAT_VERSION },
  { name: '山楂', category: '果类', part: '果实', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation'], drugInteraction: ['anticoagulant'], catVersion: CAT_VERSION },
  { name: '桂圆肉', category: '果类', part: '假种皮', alias: '龙眼肉', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'lactating', 'diabetes'], sugarContent: true, catVersion: CAT_VERSION },
  { name: '红枣', category: '果类', part: '果实', alias: '大枣', usageCap: '≤3 枚/日', contraindicatedGroups: ['diabetes'], sugarContent: true, catVersion: CAT_VERSION },
  { name: '乌梅', category: '果类', part: '近成熟果实', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '佛手', category: '果类', part: '果实', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant'], catVersion: CAT_VERSION },
  { name: '荷叶', category: '叶类', part: '叶', usageCap: '≤6g/日', contraindicatedGroups: ['menstruation', 'kidney'], catVersion: CAT_VERSION },
  { name: '玉米须', category: '其他', part: '花柱及柱头', usageCap: '≤6g/日', contraindicatedGroups: ['kidney', 'lithium'], drugInteraction: ['lithium', 'diuretic'], catVersion: CAT_VERSION },
  { name: '蒲公英', category: '全草类', part: '全草', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation'], catVersion: CAT_VERSION },
  { name: '赤小豆', category: '种子类', part: '种子', usageCap: '≤8g/日', contraindicatedGroups: ['kidney'], catVersion: CAT_VERSION },
  { name: '薏苡仁', category: '种子类', part: '种仁', usageCap: '≤8g/日', contraindicatedGroups: ['pregnant', 'lithium'], drugInteraction: ['lithium'], catVersion: CAT_VERSION },
  { name: '莲子', category: '种子类', part: '种子', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '百合', category: '根茎类', part: '肉质鳞叶', alias: '百合（干）', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '山药', category: '根茎类', part: '根茎', alias: '山药（干）', usageCap: '≤8g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '生姜', category: '根茎类', part: '根茎', alias: '姜', usageCap: '≤3 片/日', contraindicatedGroups: ['pregnant'], catVersion: CAT_VERSION },
  { name: '肉桂', category: '皮类', part: '树皮', usageCap: '≤2g/日', contraindicatedGroups: ['pregnant', 'lactating', 'hypertension'], drugInteraction: ['anticoagulant'], catVersion: CAT_VERSION },
  { name: '茯苓', category: '菌类', part: '菌核', usageCap: '≤6g/日', contraindicatedGroups: ['kidney'], catVersion: CAT_VERSION },
  {
    name: '黄芪',
    category: '根类',
    part: '根',
    isPilot: true,
    usageCap: '≤6g/日',
    contraindicatedGroups: ['pregnant', 'lactating', 'child', 'immunosuppressant'],
    drugInteraction: ['immunosuppressant'],
    catVersion: CAT_VERSION,
    note: '试点物质：仅限试点省份按规定使用，单味 ≤6g 代茶饮用，不用于治疗；非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。'
  },
  {
    name: '党参',
    category: '根类',
    part: '根',
    isPilot: true,
    usageCap: '≤6g/日',
    contraindicatedGroups: ['pregnant', 'lactating', 'child', 'immunosuppressant'],
    drugInteraction: ['immunosuppressant'],
    catVersion: CAT_VERSION,
    note: '试点物质：仅限试点省份按规定使用，单味 ≤6g 代茶饮用，不用于治疗；非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。'
  },
  { name: '麦冬', category: '根类', part: '块根', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '玉竹', category: '根茎类', part: '根茎', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },

  /* ---- 2026-10 增补：补长夏化湿 / 夏季清补 / 秋燥 / 安神 四个空档 ---- */
  { name: '白扁豆', category: '种子类', part: '种子', usageCap: '≤6g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '芡实', category: '种子类', part: '种仁', usageCap: '≤8g/日', contraindicatedGroups: [], catVersion: CAT_VERSION },
  { name: '砂仁', category: '果类', part: '成熟果实', usageCap: '≤3g/日', contraindicatedGroups: ['pregnant'], catVersion: CAT_VERSION },
  { name: '桑叶', category: '叶类', part: '叶', usageCap: '≤6g/日', contraindicatedGroups: ['pregnant', 'menstruation'], catVersion: CAT_VERSION },
  { name: '罗汉果', category: '果类', part: '果实', usageCap: '≤5g/日', contraindicatedGroups: [], catVersion: CAT_VERSION, note: '甜味来自罗汉果甜苷，不提供蔗糖类糖分，可作为血糖人群的甜味替代方向。' },
  { name: '黑芝麻', category: '种子类', part: '种子', usageCap: '≤8g/日', contraindicatedGroups: [], sugarContent: false, catVersion: CAT_VERSION, note: '油脂含量较高，大便稀软者减量。' },
  { name: '酸枣仁', category: '种子类', part: '种子', usageCap: '≤6g/日', contraindicatedGroups: ['sedative'], drugInteraction: ['sedative'], catVersion: CAT_VERSION, note: '与镇静催眠类药存在叠加可能，正在服药者请先咨询医师；本项目暂不用于茶方。' }
];

const NAME_SET = {};

function rebuildSet() {
  Object.keys(NAME_SET).forEach(function (k) { delete NAME_SET[k]; });
  ITEMS.forEach(function (i) {
    NAME_SET[i.name] = i;
    if (i.alias) NAME_SET[i.alias] = i;
  });
}
rebuildSet();

/** 归一化食材名（茶方里可能带「（干）」这类后缀） */
function normalize(name) {
  return String(name || '').replace(/[（(].*?[)）]/g, '').trim();
}

function find(name) {
  const n = normalize(name);
  if (NAME_SET[n]) return NAME_SET[n];
  const key = Object.keys(NAME_SET).filter(function (k) {
    return k.indexOf(n) > -1 || n.indexOf(k) > -1;
  })[0];
  return key ? NAME_SET[key] : null;
}

function has(name) {
  return !!find(name);
}

/** 目录中所有试点物质名（供内容校验与前端标注使用） */
function pilots() {
  return ITEMS.filter(function (i) { return !!i.isPilot; }).map(function (i) { return i.name; });
}

/**
 * 内容覆盖：就地改写 ITEMS（药食同源白名单）并重建名称索引。
 * @param {Array|{items:Array}} next 目录条目；非法或为空时保持原样
 * @returns {number} 覆盖后的条数
 */
function applyOverride(next) {
  const items = Array.isArray(next) ? next : (next && next.items);
  if (!Array.isArray(items) || !items.length) return ITEMS.length;
  ITEMS.length = 0;
  Array.prototype.push.apply(ITEMS, items);
  rebuildSet();
  module.exports.total = ITEMS.length;
  return ITEMS.length;
}

module.exports = {
  items: ITEMS,
  total: ITEMS.length,
  has: has,
  find: find,
  normalize: normalize,
  pilots: pilots,
  CAT_VERSION: CAT_VERSION,
  applyOverride: applyOverride
};
