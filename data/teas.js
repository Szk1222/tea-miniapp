/**
 * 养生茶方库
 * 全部食材均取自《按照传统既是食品又是中药材的物质目录》（药食同源目录），
 * 用量为日常养生参考剂量，不构成任何医疗建议。
 */

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
    effects: ['疏肝和胃，日常调和气血', '理气健脾，改善饭后胀气', '性质平和，四季皆宜长期饮用'],
    scenes: ['四季日常', '饭后胀气', '办公代茶'],
    season: ['春', '夏', '秋', '冬'],
    brew: {
      water: '450ml 沸水（95℃以上）',
      tools: '玻璃杯 / 保温杯',
      time: '8 分钟',
      steps: ['食材快速冲洗，沥干备用', '注入沸水，加盖焖泡 8 分钟', '可续水 2–3 次，当日饮完'],
      best: '上午 9–11 点或下午 3–5 点',
      frequency: '每周 3–5 次'
    },
    caution: ['孕妇饮用前请先咨询医师', '口舌干燥明显时适当减少频次'],
    tags: ['温和', '日常', '舒心']
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
      steps: ['菊花、枸杞、桑椹一同放入杯中', '注入沸水焖泡 8 分钟', '待温后饮用，可续水 2 次'],
      best: '上午与午后分次饮用',
      frequency: '每周 4 次'
    },
    caution: ['脾胃虚寒、容易腹泻者减少频次', '桑椹含糖，血糖偏高者注意用量'],
    tags: ['明目', '清润', '办公']
  },

  /* ---------------- 气虚质 ---------------- */
  {
    id: 'huangqi-dangshen',
    name: '黄芪党参茶',
    constitution: 'qixu',
    subtitle: '益气固表 · 缓解气短乏力、易出汗',
    tone: 2,
    nature: '性温',
    taste: '甘润微温',
    ingredients: [
      { name: '黄芪', amount: '6g', role: '补气固表' },
      { name: '党参', amount: '5g', role: '健脾益气' },
      { name: '红枣', amount: '2 枚', role: '补中养血' }
    ],
    effects: ['缓解气短乏力、说话没劲', '健脾益肺，改善白天易出虚汗', '性质温和，适合长期小量调理'],
    scenes: ['办公日常', '换季易感冒', '久坐乏力'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '500ml 沸水',
      tools: '养生壶 / 玻璃杯',
      time: '焖泡 10 分钟',
      steps: ['红枣去核，与黄芪、党参一同冲洗', '沸水冲泡并加盖焖 10 分钟', '可反复续水 2–3 次，当日饮完'],
      best: '上午 9–11 点（脾胃当令时段）',
      frequency: '每周 3–4 次'
    },
    caution: ['感冒发热、咽喉肿痛期间请暂停', '口干舌燥、容易上火者酌减', '血压偏高者饮用前请咨询医师'],
    tags: ['补气', '日常', '温和']
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
      { name: '山药（干）', amount: '10g', role: '健脾益气' },
      { name: '莲子', amount: '6g', role: '补脾止泻' },
      { name: '红枣', amount: '2 枚', role: '补中养血' }
    ],
    effects: ['健脾养胃，改善食欲偏差', '补而不燥，适合脾胃偏弱人群', '口感清甜，可作为日常代茶'],
    scenes: ['早餐后', '食欲不振', '大便偏稀'],
    season: ['秋', '冬'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['山药、莲子提前用温水泡 30 分钟', '加清水煮沸后转小火煮 15 分钟', '连同枣片一起饮用，可续煮 1 次'],
      best: '早餐后半小时',
      frequency: '每周 4–5 次'
    },
    caution: ['腹胀、便秘明显者减少频次', '血糖偏高者注意红枣用量'],
    tags: ['健脾', '温和', '清甜']
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
      steps: ['生姜切薄片，红枣去核撕开', '全部食材放入杯中注入沸水', '加盖焖 10 分钟，温热时饮用'],
      best: '早上或上午饮用',
      frequency: '每周 3–5 次'
    },
    caution: ['阴虚火旺、容易上火者不宜', '睡前不建议饮用', '胃部急性不适期间请暂缓'],
    tags: ['暖身', '温润', '秋冬']
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
    effects: ['温阳暖身，改善畏寒肢冷', '温润心脾，适合冬季饮用', '甘甜顺口，较易长期坚持'],
    scenes: ['冬季', '畏寒体质', '经期怕冷'],
    season: ['冬'],
    brew: {
      water: '450ml 沸水',
      tools: '保温杯',
      time: '焖泡 8–10 分钟',
      steps: ['肉桂轻拍裂开，与桂圆、枸杞同放杯中', '注入沸水加盖焖 8–10 分钟', '饮完可续水 1 次，肉桂不回煮'],
      best: '上午饮用',
      frequency: '每周 2–3 次'
    },
    caution: ['肉桂用量宜轻，不宜长期大量饮用', '口干、便秘、易上火者请勿饮用', '孕妇及哺乳期请勿饮用'],
    tags: ['温阳', '冬季', '暖饮']
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
      steps: ['三味食材一同冲洗后放入杯中', '注入沸水加盖焖 10 分钟', '全天分次小口饮用，可续水 2 次'],
      best: '上午至傍晚分次饮用',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、易腹泻者请酌减', '风寒感冒期间请暂停饮用'],
    tags: ['滋阴', '润燥', '熬夜']
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
    effects: ['养阴润肺，舒缓咽部干痒', '滋阴养血，改善皮肤干燥', '清甜顺口，适合干燥季节常饮'],
    scenes: ['秋季干燥', '睡眠偏浅', '皮肤干燥'],
    season: ['秋', '冬'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['百合温水泡软后与桑椹、枸杞同放', '注入沸水焖泡 10 分钟', '可续水 2 次，百合可一并食用'],
      best: '下午至傍晚',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、大便稀软者少饮', '血糖偏高者注意桑椹用量'],
    tags: ['润燥', '秋季', '清甜']
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
      { name: '赤小豆', amount: '10g', role: '利水消肿' },
      { name: '薏苡仁', amount: '10g', role: '健脾祛湿' },
      { name: '茯苓', amount: '6g', role: '健脾渗湿' }
    ],
    effects: ['健脾祛湿，缓解身体沉重感', '利水渗湿，改善晨起面部浮肿', '适合多雨季节与久坐人群'],
    scenes: ['雨季祛湿', '晨起浮肿', '身体沉重'],
    season: ['春', '夏'],
    brew: {
      water: '700ml 清水',
      tools: '养生壶',
      time: '煮 20 分钟',
      steps: ['赤小豆、薏苡仁提前浸泡 2 小时', '加清水煮沸后转小火煮 20 分钟', '滤出茶汤饮用，可续煮 1 次'],
      best: '上午饮用',
      frequency: '每周 4–5 次'
    },
    caution: ['孕妇请勿饮用（含薏苡仁）', '体质偏干、便秘者减少频次', '经期女性建议暂缓'],
    tags: ['祛湿', '季节', '清淡']
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
    scenes: ['餐后解腻', '胸闷痰多', '体重管理'],
    season: ['夏', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['荷叶撕小片，与陈皮、山楂一同放入杯中', '注入沸水焖泡 8 分钟', '餐后温饮，可续水 2 次'],
      best: '餐后半小时',
      frequency: '每周 4–5 次'
    },
    caution: ['胃酸过多者请勿空腹饮用', '孕妇慎用山楂', '脾胃虚寒者减少频次'],
    tags: ['解腻', '化痰', '餐后']
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
      steps: ['食材冲洗后放入杯中', '注入稍凉一点的沸水（85–90℃）', '焖泡 6–8 分钟，温饮不冰镇'],
      best: '午后饮用',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒、经期女性不宜', '不建议长期连续大量饮用', '空腹时请勿饮用'],
    tags: ['清热', '夏季', '清爽']
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
      { name: '陈皮', amount: '2g', role: '理气和胃' }
    ],
    effects: ['清热利湿，舒缓小便偏黄', '利湿消肿，改善下肢困重', '配伍陈皮，清而不伤胃'],
    scenes: ['湿热体质', '小便偏黄', '下肢沉重'],
    season: ['夏'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['玉米须用清水冲净，与其余食材同放', '注入沸水焖泡 10 分钟', '上午至午后分次饮用'],
      best: '上午至午后',
      frequency: '每周 3 次'
    },
    caution: ['脾胃虚寒、易腹泻者不宜', '孕妇请勿饮用', '不宜长期连续饮用'],
    tags: ['利湿', '清爽', '夏季']
  },

  /* ---------------- 血瘀质 ---------------- */
  {
    id: 'meigui-shanzha',
    name: '玫瑰山楂茶',
    constitution: 'xueyu',
    subtitle: '行气活血 · 改善面色晦暗与饭后闷胀',
    tone: 4,
    nature: '性温',
    taste: '酸甜微温',
    ingredients: [
      { name: '玫瑰花', amount: '3g', role: '疏肝行气' },
      { name: '山楂', amount: '6g', role: '活血消食' },
      { name: '陈皮', amount: '3g', role: '理气健脾' }
    ],
    effects: ['行气活血，改善面色晦暗', '消食化滞，缓解饭后闷胀', '花香愉悦，有助舒缓情绪'],
    scenes: ['面色晦暗', '饭后闷胀', '情绪不畅'],
    season: ['春', '秋'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['山楂略拍裂，与玫瑰花、陈皮同放杯中', '注入沸水焖泡 8 分钟', '餐后温饮，可续水 2 次'],
      best: '餐后半小时',
      frequency: '每周 3–4 次'
    },
    caution: ['孕妇请勿饮用（含山楂、玫瑰）', '胃酸过多者请餐后饮用', '经期量多者建议暂缓'],
    tags: ['活血', '消食', '舒心']
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
      { name: '枸杞子', amount: '5g', role: '滋补肝肾' }
    ],
    effects: ['疏肝理气，改善情绪郁结', '温润行血，缓解手足不温', '香气怡人，适合日常代茶'],
    scenes: ['情绪郁结', '手足不温', '日常办公'],
    season: ['秋', '冬'],
    brew: {
      water: '400ml 沸水（85–90℃）',
      tools: '玻璃杯',
      time: '6 分钟',
      steps: ['桂花与玫瑰花不宜久泡', '注入 85–90℃ 热水焖 6 分钟', '香气散尽即可弃渣'],
      best: '下午饮用',
      frequency: '每周 3–4 次'
    },
    caution: ['孕妇慎用玫瑰与桂花', '经期量多者建议暂缓', '口舌干燥者减少频次'],
    tags: ['行气', '芬芳', '日常']
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
      { name: '陈皮', amount: '3g', role: '理气健脾' }
    ],
    effects: ['疏肝解郁，缓解胸闷想叹气', '理气和胃，改善食欲不振', '清香微甘，有助舒缓紧张情绪'],
    scenes: ['压力较大', '胸闷叹气', '情绪低落'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '450ml 沸水',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['佛手、陈皮冲洗后与玫瑰同放', '注入沸水加盖焖 8 分钟', '分次温饮，可续水 2 次'],
      best: '上午与午后各一次',
      frequency: '每周 4 次'
    },
    caution: ['孕妇慎用', '口舌干燥者减少玫瑰用量', '胃部不适时请餐后饮用'],
    tags: ['解郁', '舒心', '压力']
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
      { name: '红枣', amount: '3 枚', role: '补中养血' }
    ],
    effects: ['理气安神，改善入睡困难', '养阴润燥，舒缓心浮气躁', '花香柔和，适合睡前放松'],
    scenes: ['入睡困难', '心烦易怒', '睡前放松'],
    season: ['春', '夏', '秋'],
    brew: {
      water: '450ml 热水（85–90℃）',
      tools: '玻璃杯',
      time: '8 分钟',
      steps: ['百合温水泡软，红枣去核', '注入 85–90℃ 热水焖 8 分钟', '睡前 1 小时温热小口饮用'],
      best: '睡前 1 小时',
      frequency: '每周 3–4 次'
    },
    caution: ['脾胃虚寒者不宜饮凉茶汤', '血糖偏高者注意红枣用量', '夜尿频繁者睡前少饮'],
    tags: ['安神', '睡前', '花香']
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
      { name: '山药（干）', amount: '10g', role: '健脾益气' },
      { name: '莲子', amount: '6g', role: '补脾固本' }
    ],
    effects: ['益气固本，改善体质偏弱', '健脾养胃，减少换季不适', '平和温润，适合长期饮用打底'],
    scenes: ['换季易感冒', '体质偏弱', '日常调养'],
    season: ['春', '秋', '冬'],
    brew: {
      water: '600ml 清水',
      tools: '养生壶',
      time: '煮 15 分钟',
      steps: ['山药、莲子提前温水泡 30 分钟', '加水煮沸后小火煮 15 分钟', '连汤带料一同食用更佳'],
      best: '早餐后',
      frequency: '每周 4–5 次'
    },
    caution: ['腹胀、便秘者减少频次', '血糖偏高者注意红枣用量', '初次饮用建议从半量开始'],
    tags: ['固本', '温和', '换季']
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
    effects: ['生津润喉，缓解咽部干痒', '消食和中，改善食欲不佳', '酸甘适口，成分简单不易刺激'],
    scenes: ['过敏高发季', '咽部干痒', '食欲不佳'],
    season: ['春', '秋'],
    brew: {
      water: '500ml 沸水',
      tools: '玻璃杯 / 养生壶',
      time: '焖泡 10 分钟',
      steps: ['乌梅、山楂略冲洗，与陈皮同放', '注入沸水焖泡 10 分钟', '待温后小口饮用，可续水 2 次'],
      best: '餐后饮用',
      frequency: '每周 3 次'
    },
    caution: ['胃酸过多、胃部不适者请勿空腹饮用', '孕妇慎用山楂', '不宜长期连续饮用'],
    tags: ['生津', '润喉', '温和']
  }
];

const MAP = {};
TEAS.forEach(function (t) {
  MAP[t.id] = t;
});

function byConstitution(cid) {
  return TEAS.filter(function (t) { return t.constitution === cid; });
}

module.exports = {
  list: TEAS,
  map: MAP,
  get: function (id) { return MAP[id] || null; },
  byConstitution: byConstitution,
  total: TEAS.length
};
