/**
 * 药食同源食材白名单（项目已审核名单 · 节选）。
 *
 * 作用：把「茶方里能出现哪些食材」变成一份可校验的配置，
 * 而不是散落在茶方数据里靠人工记忆。上线前跑 server/scripts/eval.js
 * 就会校验「所有茶方食材 ⊆ 本名单」，出现名单外食材直接报错。
 *
 * 收录范围：节选自国家卫健委《既是食品又是中药材的物质目录》及后续增补、
 * 试点物质名单中本项目实际用到的品种，每味均控制在日常养生参考剂量内使用。
 * 说明：目录会更新，正式上线前请按最新版本再核对一次，并交由中医师复核配伍。
 */

const ITEMS = [
  { name: '玫瑰花', category: '花类', part: '花蕾' },
  { name: '菊花', category: '花类', part: '头状花序' },
  { name: '金银花', category: '花类', part: '花蕾' },
  { name: '桂花', category: '花类', part: '花' },
  { name: '茉莉花', category: '花类', part: '花' },
  { name: '陈皮', category: '果类', part: '果皮', alias: '橘皮' },
  { name: '枸杞子', category: '果类', part: '果实' },
  { name: '桑椹', category: '果类', part: '果穗' },
  { name: '山楂', category: '果类', part: '果实' },
  { name: '桂圆肉', category: '果类', part: '假种皮', alias: '龙眼肉' },
  { name: '红枣', category: '果类', part: '果实', alias: '大枣' },
  { name: '乌梅', category: '果类', part: '近成熟果实' },
  { name: '佛手', category: '果类', part: '果实' },
  { name: '荷叶', category: '叶类', part: '叶' },
  { name: '玉米须', category: '其他', part: '花柱及柱头' },
  { name: '蒲公英', category: '全草类', part: '全草' },
  { name: '赤小豆', category: '种子类', part: '种子' },
  { name: '薏苡仁', category: '种子类', part: '种仁' },
  { name: '莲子', category: '种子类', part: '种子' },
  { name: '百合', category: '根茎类', part: '肉质鳞叶', alias: '百合（干）' },
  { name: '山药', category: '根茎类', part: '根茎', alias: '山药（干）' },
  { name: '生姜', category: '根茎类', part: '根茎', alias: '姜' },
  { name: '肉桂', category: '皮类', part: '树皮' },
  { name: '茯苓', category: '菌类', part: '菌核' },
  { name: '黄芪', category: '根类', part: '根', note: '试点物质，用量从轻' },
  { name: '党参', category: '根类', part: '根', note: '试点物质，用量从轻' },
  { name: '麦冬', category: '根类', part: '块根' },
  { name: '玉竹', category: '根茎类', part: '根茎' }
];

const NAME_SET = {};
ITEMS.forEach(function (i) {
  NAME_SET[i.name] = i;
  if (i.alias) NAME_SET[i.alias] = i;
});

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

module.exports = {
  items: ITEMS,
  total: ITEMS.length,
  has: has,
  find: find,
  normalize: normalize
};
