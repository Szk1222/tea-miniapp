/**
 * 九种基本体质数据
 * 依据国家中医药管理局《中医体质分类与判定》标准整理，仅用于日常养生参考
 */

const CONSTITUTIONS = [
  {
    id: 'pinghe',
    name: '平和质',
    short: '阴阳调和',
    icon: 'scale',
    color: '#4C9A6A',
    soft: '#E7F3EC',
    brief: '阴阳气血调和，体态适中，面色红润，精力充沛，是最理想的体质状态。',
    features: ['精力充沛，不易疲劳', '睡眠与食欲良好', '适应环境变化能力强', '性格随和，情绪平稳'],
    causes: '先天禀赋良好，后天饮食有节、作息规律、情志舒畅，脏腑功能协调。',
    principle: '平和调养，顺时令而养，不宜大补大泻。',
    teaAdvice: '以性质平和的茶饮为主，随四季略作加减，保持均衡即可。',
    life: ['规律作息，尽量在 23 点前入睡', '饮食多样而清淡，少食生冷肥腻', '每周 3–5 次中等强度运动', '保持心情舒畅，避免长期熬夜'],
    keywords: ['气色好', '体质不错', '想调养', '日常养生']
  },
  {
    id: 'qixu',
    name: '气虚质',
    short: '气短乏力',
    icon: 'wind',
    color: '#C2A24A',
    soft: '#F7F1DE',
    brief: '元气不足，容易疲乏、气短，说话声音低弱，稍活动就容易出汗。',
    features: ['容易疲乏，精神不振', '说话声音低弱、懒得说话', '稍微活动就出虚汗', '抵抗力偏弱，换季易感冒'],
    causes: '先天不足，或后天饮食失调、劳累过度、久病耗气，导致脾肺功能偏弱。',
    principle: '益气健脾，缓缓补之，忌峻补与生冷。',
    teaAdvice: '适合温和的补气类茶饮，用量宜轻，长期小量更合适。',
    life: ['避免过度劳累与剧烈运动', '三餐规律，早餐不可省', '适当食用山药、小米、红枣等', '注意保暖，避免久居潮湿之地'],
    keywords: ['乏力', '没劲', '疲劳', '气短', '容易累', '出虚汗', '懒得说话', '容易感冒']
  },
  {
    id: 'yangxu',
    name: '阳虚质',
    short: '畏寒肢冷',
    icon: 'sun',
    color: '#CE8552',
    soft: '#FAEFE5',
    brief: '阳气不足，畏寒怕冷，手脚发凉，喜热饮食，精神容易倦怠。',
    features: ['手脚发凉，比别人怕冷', '喜欢吃热的东西，不喜冷饮', '腹部、腰膝容易发凉', '大便偏稀，小便清长'],
    causes: '先天阳气偏弱，或长期贪凉饮冷、久居空调环境、过度耗损阳气。',
    principle: '温补阳气，忌寒凉生冷，宜温润缓补。',
    teaAdvice: '适合偏温性的茶饮，建议上午或白天饮用。',
    life: ['少吃生冷瓜果与冰饮', '注意腰腹、足部保暖', '适当晒背，多接触阳光', '可选择八段锦、快走等温和运动'],
    keywords: ['怕冷', '手脚凉', '手脚冰凉', '畏寒', '阳虚', '暖身', '冬天难受']
  },
  {
    id: 'yinxu',
    name: '阴虚质',
    short: '口燥咽干',
    icon: 'moon',
    color: '#B4738F',
    soft: '#F7EBF0',
    brief: '阴液不足，容易口燥咽干、手足心热，性情偏急躁，睡眠偏浅。',
    features: ['手心脚心发热，午后更明显', '口干咽燥，总想喝水', '夜间容易出汗（盗汗）', '面色偏红，皮肤偏干'],
    causes: '先天禀赋偏燥，或长期熬夜、嗜食辛辣、情志过极，耗伤阴液。',
    principle: '滋阴润燥，忌辛辣温燥，宜清补缓养。',
    teaAdvice: '适合滋阴润燥类茶饮，避免长时间高温久煮。',
    life: ['尽量在 23 点前入睡，减少熬夜', '少吃辛辣煎炸与羊肉狗肉等温燥食物', '可适量食用银耳、梨、桑椹', '避免大汗淋漓的剧烈运动'],
    keywords: ['口干', '眼干', '熬夜', '盗汗', '手心热', '阴虚', '咽干', '皮肤干']
  },
  {
    id: 'tanshi',
    name: '痰湿质',
    short: '形体困重',
    icon: 'cloud',
    color: '#6C8BA3',
    soft: '#EAF0F4',
    brief: '痰湿凝聚，形体偏胖、腹部松软，容易困倦沉重，面部油脂偏多。',
    features: ['身体沉重，容易困倦', '腹部松软、容易发胖', '大便黏腻，容易粘马桶', '喉咙常有痰，胸口发闷'],
    causes: '多因饮食肥甘厚味、久坐少动、脾运不健，导致水湿停聚。',
    principle: '健脾祛湿，化痰理气，忌甜腻与生冷。',
    teaAdvice: '适合祛湿健脾类茶饮，建议白天饮用，避免睡前。',
    life: ['减少甜食、油炸与含糖饮料', '每天保持 30 分钟以上活动', '居室注意通风除湿', '三餐定时，晚餐不宜过饱'],
    keywords: ['湿气', '祛湿', '痰湿', '沉重', '粘马桶', '水肿', '虚胖', '舌苔厚', '减肥', '体重', '瘦身']
  },
  {
    id: 'shire',
    name: '湿热质',
    short: '面垢油光',
    icon: 'flame',
    color: '#C06B57',
    soft: '#FAEDE9',
    brief: '湿热内蕴，面部容易出油长痘，口苦口臭，身体困重，易烦躁。',
    features: ['面部油光，容易长痘', '口苦口干、口腔易溃疡', '大便黏滞或干结', '容易烦躁、急躁易怒'],
    causes: '多因嗜食辛辣油腻、烟酒过度，或久居湿热环境，湿热交蒸于内。',
    principle: '清热利湿，忌辛辣油腻与酒。',
    teaAdvice: '适合清凉利湿类茶饮，性偏寒凉，不宜长期连续大量饮用。',
    life: ['少食辛辣、烧烤、油炸食品', '戒烟限酒，作息规律', '保持衣物干爽，避免闷热', '适度运动出汗有助排湿'],
    keywords: ['上火', '口苦', '口臭', '长痘', '湿热', '油腻', '溃疡', '烦躁']
  },
  {
    id: 'xueyu',
    name: '血瘀质',
    short: '面色晦暗',
    icon: 'activity',
    color: '#8B6BA8',
    soft: '#F1ECF7',
    brief: '血行不畅，面色偏暗、容易出现瘀斑，口唇颜色偏暗，易有固定痛点。',
    features: ['面色晦暗，容易有黑眼圈', '皮肤易出现瘀青、色斑', '口唇颜色偏暗', '女性容易痛经、经血有块'],
    causes: '多因气机不畅、寒凝血脉、久坐少动或外伤之后，血行受阻。',
    principle: '行气活血，温通为助，忌久坐与寒凉。',
    teaAdvice: '适合行气活血类茶饮，建议餐后饮用。',
    life: ['避免久坐，每小时起身活动', '注意保暖，尤其腹部与下肢', '保持心情舒畅，气行则血行', '可做拉伸、慢跑等有氧运动'],
    keywords: ['面色暗', '血瘀', '淤青', '痛经', '黑眼圈', '色斑', '瘀斑']
  },
  {
    id: 'qiyu',
    name: '气郁质',
    short: '情绪郁结',
    icon: 'compass',
    color: '#6E7BB5',
    soft: '#ECEEF9',
    brief: '气机郁滞，情绪偏敏感，容易紧张焦虑、多愁善感，常感胸闷想叹气。',
    features: ['情绪低落，容易闷闷不乐', '容易紧张焦虑、多愁善感', '常感胸闷，喜欢叹气', '咽喉有异物感，睡眠偏浅'],
    causes: '多因情志不遂、思虑过度，肝失疏泄，气机运行不畅。',
    principle: '疏肝理气，调畅情志，忌压抑与久坐不动。',
    teaAdvice: '适合芳香疏肝类茶饮，气味芬芳，有助放松。',
    life: ['培养兴趣爱好，主动倾诉与社交', '规律运动，帮助疏泄情绪', '睡前减少使用手机等屏幕', '避免长期独处与过度思虑'],
    keywords: ['情绪', '压力', '郁闷', '叹气', '焦虑', '气郁', '紧张', '心情差', '失眠多梦', '睡不好', '入睡困难', '多梦', '早醒', '睡不踏实']
  },
  {
    id: 'tebing',
    name: '特禀质',
    short: '容易过敏',
    icon: 'shield',
    color: '#5FA79C',
    soft: '#E8F4F2',
    brief: '先天禀赋特殊，常见过敏体质，容易对季节、食物、气味等产生不适反应。',
    features: ['换季或接触花粉易过敏', '容易起红疹、皮肤发痒', '常打喷嚏、鼻痒鼻塞', '体质偏弱，适应力较差'],
    causes: '先天禀赋不足，卫外功能偏弱，对外界刺激反应较为敏感。',
    principle: '益气固表，避风避敏，重在稳步调养。',
    teaAdvice: '选择成分简单的温和茶饮，初次饮用建议少量尝试。',
    life: ['明确自身过敏原并主动规避', '外出注意防护，换季减少接触花粉', '保持居室清洁、被褥常晒', '不宜过早尝试成分复杂的偏方'],
    keywords: ['过敏', '鼻炎', '荨麻疹', '红疹', '体质差', '打喷嚏', '皮肤痒']
  }
];

const MAP = {};
const IDS = [];

function rebuildMap() {
  Object.keys(MAP).forEach(function (k) { delete MAP[k]; });
  CONSTITUTIONS.forEach(function (c) { MAP[c.id] = c; });
}
function rebuildIds() {
  IDS.length = 0;
  CONSTITUTIONS.forEach(function (c) { IDS.push(c.id); });
}
rebuildMap();
rebuildIds();

/**
 * 内容覆盖：就地改写 CONSTITUTIONS / MAP / IDS，全部保持引用不变 ——
 * 服务端工具枚举与规则引擎评分都持有 ids 的引用，换成新数组它们会读到旧值。
 * @param {Array} next 体质数组；非法或为空时保持原样
 * @returns {number} 覆盖后的条数
 */
function applyOverride(next) {
  if (!Array.isArray(next) || !next.length) return CONSTITUTIONS.length;
  CONSTITUTIONS.length = 0;
  Array.prototype.push.apply(CONSTITUTIONS, next);
  rebuildMap();
  rebuildIds();
  return CONSTITUTIONS.length;
}

/**
 * 兜底占位体质。
 *
 * 为什么需要：内容可被管理后台远程修改，而用户的体质档案存在本机。
 * 管理员删掉一个体质后，历史档案里的 constitutionId 就成了悬空引用 ——
 * 展示路径上直接 constitutions.get(id).name 会抛异常、整页白屏。
 * 所以展示类调用一律走 getOr()，只有「校验 id 是否合法」的场景才用 get()。
 */
const FALLBACK = {
  id: '',
  name: '未知体质',
  short: '',
  icon: 'leaf',
  color: '#93A099',
  soft: '#F1EFE8',
  brief: '这份体质档案对应的体质已从内容库中移除，建议重新做一次测评。',
  features: [],
  causes: '',
  principle: '',
  teaAdvice: '',
  life: [],
  keywords: []
};

module.exports = {
  list: CONSTITUTIONS,
  map: MAP,
  get: function (id) {
    return MAP[id] || null;
  },
  /** 展示用取值：未知 id 返回占位对象，绝不返回 null */
  getOr: function (id) {
    return MAP[id] || Object.assign({}, FALLBACK, { id: id || '' });
  },
  ids: IDS,
  applyOverride: applyOverride
};
