/**
 * 简化版体质测评量表（10 题 · 约 90 秒）
 * 参考《中医体质分类与判定》量表改编简化，仅用于日常养生方向参考，不作为医疗诊断依据。
 * 每题为单选，选项携带对应体质的加权分。
 */

const QUESTIONS = [
  {
    id: 'q1',
    title: '这段时间，你的精力状态如何？',
    hint: '回想最近两周的整体感受',
    options: [
      { label: '精力充沛，一天下来也不太容易疲惫', scores: { pinghe: 3 } },
      { label: '容易疲乏，说话声音偏小、没什么力气', scores: { qixu: 3 } },
      { label: '下午容易犯困，身体发沉、懒得动', scores: { tanshi: 3 } },
      { label: '精神比较紧绷，容易心慌、静不下来', scores: { qiyu: 2, yinxu: 1 } }
    ]
  },
  {
    id: 'q2',
    title: '你平时更怕冷还是更怕热？',
    hint: '对比周围人，问问自己的真实感受',
    options: [
      { label: '不怕冷也不怕热，比较适中', scores: { pinghe: 3 } },
      { label: '手脚发凉，比别人更怕冷', scores: { yangxu: 3 } },
      { label: '手心脚心发热、怕热，午后更明显', scores: { yinxu: 3 } },
      { label: '面部容易出油长痘，常觉得口苦', scores: { shire: 3 } }
    ]
  },
  {
    id: 'q3',
    title: '你的出汗情况是？',
    hint: '包括运动、日常与睡眠时的状态',
    options: [
      { label: '运动后微微出汗，很快就能恢复', scores: { pinghe: 3 } },
      { label: '稍微活动就出汗，白天也容易出虚汗', scores: { qixu: 3 } },
      { label: '睡觉时容易出汗，醒来后汗就停了', scores: { yinxu: 3 } },
      { label: '不太容易出汗，皮肤偏干、易有淤青', scores: { xueyu: 3 } }
    ]
  },
  {
    id: 'q4',
    title: '你的排便情况更接近哪一种？',
    hint: '观察最近一个月的常态即可',
    options: [
      { label: '规律成形，基本每天一次', scores: { pinghe: 3 } },
      { label: '偏稀、不成形，吃凉的就容易腹泻', scores: { yangxu: 2, qixu: 2 } },
      { label: '黏腻不畅，容易粘马桶', scores: { tanshi: 3 } },
      { label: '偏干结，排便需要用力', scores: { yinxu: 3 } }
    ]
  },
  {
    id: 'q5',
    title: '你的睡眠状态怎么样？',
    hint: '以最近两周的入睡与醒来感受为准',
    options: [
      { label: '入睡快、睡得沉，醒来清爽有精神', scores: { pinghe: 3 } },
      { label: '躺下很久睡不着，好不容易睡着又多梦', scores: { yinxu: 2, qiyu: 2 } },
      { label: '睡多睡少都不解乏，醒来仍然觉得累', scores: { qixu: 3 } },
      { label: '睡得浅，容易惊醒，对环境敏感', scores: { tebing: 2, qiyu: 2 } }
    ]
  },
  {
    id: 'q6',
    title: '面对压力时，你的情绪更偏向？',
    hint: '想想最近一次心情波动的样子',
    options: [
      { label: '情绪平稳，遇事不太容易波动', scores: { pinghe: 3 } },
      { label: '容易紧张焦虑、多愁善感，常想叹气', scores: { qiyu: 3 } },
      { label: '容易急躁、烦闷，遇事容易上头', scores: { shire: 3 } },
      { label: '情绪容易低落，对事情提不起兴趣', scores: { qiyu: 2, xueyu: 1 } }
    ]
  },
  {
    id: 'q7',
    title: '你的面色与皮肤状态是？',
    hint: '可以对着镜子观察一下',
    options: [
      { label: '肤色红润有光泽，看起来健康', scores: { pinghe: 3 } },
      { label: '偏白或偏黄，看起来没什么血色', scores: { qixu: 2, yangxu: 1 } },
      { label: '面色偏暗，容易有黑眼圈或色斑', scores: { xueyu: 3 } },
      { label: '容易过敏，遇风会起红疹、皮肤发痒', scores: { tebing: 3 } }
    ]
  },
  {
    id: 'q8',
    title: '你的体型体态更接近？',
    hint: '以长期状态为准，不必纠结体重数字',
    options: [
      { label: '体型匀称，肌肉结实有力', scores: { pinghe: 3 } },
      { label: '腹部松软，比较容易发胖', scores: { tanshi: 3 } },
      { label: '偏瘦，怎么吃都不太容易长肉', scores: { yinxu: 2, qixu: 1 } },
      { label: '肌肉松软，总感觉力气不够', scores: { qixu: 3 } }
    ]
  },
  {
    id: 'q9',
    title: '你的口腔与咽喉感受是？',
    hint: '留意平时喝水前后的差别',
    options: [
      { label: '口不干不苦，咽喉舒适', scores: { pinghe: 3 } },
      { label: '常年口干咽燥，总想喝水', scores: { yinxu: 3 } },
      { label: '口苦口臭，口腔容易长溃疡', scores: { shire: 3 } },
      { label: '喉咙总像有痰，胸口偶尔发闷', scores: { tanshi: 3 } }
    ]
  },
  {
    id: 'q10',
    title: '你对季节与环境变化的适应如何？',
    hint: '结合换季、空调房、出差等场景',
    options: [
      { label: '换季、换环境都适应得不错', scores: { pinghe: 3 } },
      { label: '怕风、容易感冒，遇冷就打喷嚏', scores: { qixu: 2, tebing: 2 } },
      { label: '冬天特别难熬，全身发冷、手脚冰', scores: { yangxu: 3 } },
      { label: '换季容易过敏，鼻痒、皮肤痒', scores: { tebing: 3 } }
    ]
  }
];

/** 基础信息步骤（不含体质计分，用于安全提示与偏好） */
const BASIC = {
  genders: ['女', '男'],
  ages: ['18 岁以下', '18–30 岁', '31–45 岁', '46–60 岁', '60 岁以上'],
  conditions: ['高血压', '糖尿病', '肝肾疾病', '甲状腺问题', '以上都没有'],
  stages: ['无', '备孕中', '孕期', '哺乳期', '经期'],
  tastes: ['喜清淡', '偏甜', '偏苦涩能接受', '不喜欢药材味', '都可以']
};

/**
 * 内容覆盖：就地改写 QUESTIONS 与 BASIC。
 * BASIC 是常量对象，逐键替换而非换引用，避免已持有它的模块读到旧值。
 * @param {{list:Array, basic:object}} next 量表内容；字段缺失时保留原值
 * @returns {number} 覆盖后的题目数
 */
function applyOverride(next) {
  const list = next && next.list;
  if (Array.isArray(list) && list.length) {
    QUESTIONS.length = 0;
    Array.prototype.push.apply(QUESTIONS, list);
    module.exports.total = QUESTIONS.length;
  }
  const basic = next && next.basic;
  if (basic && typeof basic === 'object' && !Array.isArray(basic)) {
    Object.keys(basic).forEach(function (k) {
      if (Array.isArray(basic[k]) && basic[k].length) BASIC[k] = basic[k];
    });
  }
  return QUESTIONS.length;
}

module.exports = {
  list: QUESTIONS,
  basic: BASIC,
  total: QUESTIONS.length,
  applyOverride: applyOverride
};
