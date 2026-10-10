/**
 * 养生知识库：药食同源食材科普 + 茶饮常识问答
 * 内容仅用于日常养生参考，不涉及任何疾病治疗表述。
 *
 * 食材字段分两张卡（见 docs/knowledge-base-audit.md 4.4）：
 *   「中医属性卡」nature / meridian / effect / use / caution —— 原有字段
 *   「安全卡」    doseDailyMax / doseForm / drugInteraction / chronicFlag /
 *                nutrients / courseLimit / specialPop / allergen / evidenceLevel
 *
 * 为什么必须有安全卡：用户会把「单味 3–10g」当成「每次」，同日多方叠加即超量；
 * 而抗凝药、甲状腺药、免疫抑制剂、锂盐这些最高危的交互，原先全库零提示。
 */

/** 药食同源食材科普 */
const INGREDIENTS = [
  {
    id: 'huangqi', name: '黄芪', nature: '甘，微温', meridian: '归脾、肺经', effect: '补气固表、利水消肿',
    use: '传统上用于日常补益方向，适合容易疲乏、白天易出虚汗的人群作代茶饮',
    caution: '感冒发热、咽痛期间暂停；血压偏高者请咨询医师',
    doseDailyMax: '≤6g', doseForm: '干品 6g（约 4–5 片）',
    drugInteraction: ['immunosuppressant'], chronicFlag: ['hypertension', 'immunosuppressant'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '根茎类，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'dangshen', name: '党参', nature: '甘，平', meridian: '归脾、肺经', effect: '健脾益肺、养血生津',
    use: '性质平和的补益食材，适合脾胃偏弱、食欲不振者作代茶饮',
    caution: '气滞腹胀明显者不宜多饮；血压偏高者请咨询医师',
    doseDailyMax: '≤6g', doseForm: '干品 6g',
    drugInteraction: ['immunosuppressant'], chronicFlag: ['immunosuppressant'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '根茎类，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'gouqi', name: '枸杞子', nature: '甘，平', meridian: '归肝、肾经', effect: '滋补肝肾、益精明目',
    use: '最适合长时间用眼、经常熬夜的人群日常代茶',
    caution: '外感发热期间暂停饮用',
    doseDailyMax: '≤6g', doseForm: '干果 6g（约 20 粒）',
    drugInteraction: ['thyroid', 'glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: true, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '果实类，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'juhua', name: '菊花', nature: '甘、苦，微寒', meridian: '归肺、肝经', effect: '清肝明目、疏散风热',
    use: '眼干眼涩、面部油光偏多时可搭配饮用',
    caution: '脾胃虚寒、容易腹泻者减少用量；经期与孕期建议暂缓',
    doseDailyMax: '≤6g', doseForm: '干花 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期建议暂缓', preop: '术前请暂停' },
    allergen: '菊科花类，花粉过敏者注意交叉反应',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'meigui', name: '玫瑰花', nature: '甘、微苦，温', meridian: '归肝、脾经', effect: '疏肝解郁、和血调经',
    use: '情绪郁结、容易叹气、压力大时的常用芳香食材',
    caution: '孕妇慎用；经期量多者建议暂缓；服抗凝药者先咨询医师',
    doseDailyMax: '≤6g', doseForm: '干花蕾 6g（约 8–10 朵）',
    drugInteraction: ['anticoagulant'], chronicFlag: ['anticoagulant'],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期慎用', preop: '术前请暂停' },
    allergen: '蔷薇科花类，花粉过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'chenpi', name: '陈皮', nature: '苦、辛，温', meridian: '归脾、肺经', effect: '理气健脾、燥湿化痰',
    use: '饭后胀气、喉咙有痰时最适合搭配的食材',
    caution: '舌红少津、口干明显者不宜多用',
    doseDailyMax: '≤6g', doseForm: '干果皮 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '柑橘类果皮，柑橘过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'shanzha', name: '山楂', nature: '酸、甘，微温', meridian: '归脾、胃、肝经', effect: '消食化滞、行气散瘀',
    use: '吃油腻后腹胀、食欲不佳时的常用食材',
    caution: '胃酸过多者请餐后饮用；孕妇慎用；服抗凝药者先咨询医师',
    doseDailyMax: '≤6g', doseForm: '干片 6g',
    drugInteraction: ['anticoagulant'], chronicFlag: ['anticoagulant'],
    nutrients: { sugar: true, potassium: 'high', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期忌用', preop: '术前请暂停' },
    allergen: '蔷薇科果实，花粉过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'hongzao', name: '红枣', nature: '甘，温', meridian: '归脾、胃经', effect: '补中益气、养血安神',
    use: '性质温和的日常食材，可与多数茶饮搭配；传统上属补益类',
    caution: '血糖偏高者注意用量；腹胀者不宜多食',
    doseDailyMax: '≤3 枚（约 10g）', doseForm: '干枣 3 枚 ≈ 鲜枣 5 枚',
    drugInteraction: ['glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: true, potassium: 'high', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '建议少量', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '鼠李科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，现代营养学含糖量数据明确'
  },
  {
    id: 'guiyuan', name: '桂圆肉', nature: '甘，温', meridian: '归心、脾经', effect: '补益心脾、养血安神',
    use: '手脚发凉、睡眠偏浅时可少量搭配',
    caution: '易上火、口干者不宜；孕妇请勿饮用；血糖偏高者减量',
    doseDailyMax: '≤6g', doseForm: '干果肉 6g',
    drugInteraction: ['glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: true, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期忌用', preop: '术前请暂停' },
    allergen: '无患子科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，现代营养学含糖量数据明确'
  },
  {
    id: 'shanyao', name: '山药', nature: '甘，平', meridian: '归脾、肺、肾经', effect: '健脾益胃、生津益肺',
    use: '补而不燥，是脾胃偏弱人群的日常打底食材',
    caution: '腹胀、便秘明显者减少频次',
    doseDailyMax: '≤8g（干品）', doseForm: '干山药 8g ≈ 鲜山药 80g，自购请勿混用',
    drugInteraction: ['thyroid', 'glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '建议少量', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '薯蓣科根茎，少数人接触生品易手痒',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'lianzi', name: '莲子', nature: '甘、涩，平', meridian: '归脾、肾、心经', effect: '补脾止泻、养心安神',
    use: '大便偏稀、睡眠不安时可与山药同用',
    caution: '腹胀、便秘者不宜多食',
    doseDailyMax: '≤6g', doseForm: '干莲子 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '建议少量', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '睡莲科种子，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'yimi', name: '薏苡仁', nature: '甘、淡，微寒', meridian: '归脾、胃、肺经', effect: '健脾渗湿、清热排脓',
    use: '多雨季节身体沉重、晨起浮肿时的常用食材',
    caution: '孕妇请勿食用；体质偏干者减少频次；服利尿剂或锂盐者先咨询医师',
    doseDailyMax: '≤8g', doseForm: '生品 8g；炒用偏温，寒湿体质可优先炒薏苡仁',
    drugInteraction: ['lithium', 'diuretic'], chronicFlag: ['lithium', 'kidney'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期忌用', preop: '术前请暂停' },
    allergen: '禾本科种仁，麸质敏感者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'chixiaodou', name: '赤小豆', nature: '甘、酸，平', meridian: '归心、小肠经', effect: '利水消肿、解毒排脓',
    use: '常与薏苡仁搭配，用于日常祛湿方向',
    caution: '尿频者不宜多饮；体质偏瘦者适量；肾功能异常者先咨询医师',
    doseDailyMax: '≤8g', doseForm: '干豆 8g',
    drugInteraction: ['lithium', 'diuretic'], chronicFlag: ['lithium', 'kidney'],
    nutrients: { sugar: false, potassium: 'high', vitaminK: 'low', oxalate: 'mid' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '豆科，豆类过敏者注意',
    evidenceLevel: '传统应用为主，现代营养学钾含量数据明确'
  },
  {
    id: 'fuling', name: '茯苓', nature: '甘、淡，平', meridian: '归心、肺、脾、肾经', effect: '利水渗湿、健脾宁心',
    use: '性味平和，适合湿气偏重人群长期少量使用',
    caution: '阴虚津少者不宜单用大量；限水人群请咨询医师',
    doseDailyMax: '≤6g', doseForm: '干块 6g',
    drugInteraction: ['lithium', 'diuretic', 'thyroid'], chronicFlag: ['lithium', 'kidney'],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '菌类，真菌过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'heye', name: '荷叶', nature: '苦，平', meridian: '归肝、脾、胃经', effect: '清暑化湿、升发清阳',
    use: '夏季暑热、餐后解腻时的清爽食材',
    caution: '脾胃虚寒者不宜长期饮用；经期与孕期建议暂缓',
    doseDailyMax: '≤6g', doseForm: '干叶 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期建议暂缓', preop: '术前请暂停' },
    allergen: '睡莲科叶片，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'jinyinhua', name: '金银花', nature: '甘，寒', meridian: '归肺、心、胃经', effect: '清热解毒、疏散风热',
    use: '夏季暑热、熬夜之后感觉燥热时可用',
    caution: '脾胃虚寒、经期女性不宜；不宜长期连续饮用',
    doseDailyMax: '≤6g', doseForm: '干花蕾 6g',
    drugInteraction: ['thyroid', 'anticoagulant'], chronicFlag: ['anticoagulant'],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期建议暂缓', preop: '术前请暂停' },
    allergen: '忍冬科花类，花粉过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'maidong', name: '麦冬', nature: '甘、微苦，微寒', meridian: '归心、肺、胃经', effect: '养阴生津、润肺清心',
    use: '口干咽燥、经常熬夜人群的常用润燥食材',
    caution: '脾胃虚寒、易腹泻者请酌减',
    doseDailyMax: '≤6g', doseForm: '干块根 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '百合科块根，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'yuzhu', name: '玉竹', nature: '甘，微寒', meridian: '归肺、胃经', effect: '养阴润燥、生津止渴',
    use: '秋冬干燥季节与麦冬搭配，口感甘润',
    caution: '痰湿偏重、腹胀者不宜多用',
    doseDailyMax: '≤6g', doseForm: '干根茎 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '百合科根茎，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'baihe', name: '百合', nature: '甘，微寒', meridian: '归心、肺经', effect: '养阴润肺、清心安神',
    use: '睡眠偏浅、咽部干痒时可作日常搭配',
    caution: '风寒咳嗽、脾胃虚寒者不宜',
    doseDailyMax: '≤6g（干品）', doseForm: '干百合 6g ≈ 鲜百合 30g',
    drugInteraction: ['thyroid', 'sedative'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '百合科鳞叶，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'sangshen', name: '桑椹', nature: '甘，寒', meridian: '归心、肝、肾经', effect: '滋阴补血、生津润肠',
    use: '皮肤干燥、易感燥热时的清甜食材',
    caution: '大便稀软者不宜多食；血糖偏高者注意用量',
    doseDailyMax: '≤6g（干品）', doseForm: '干桑椹 6g',
    drugInteraction: ['glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: true, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '桑科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，现代营养学含糖量数据明确'
  },
  {
    id: 'shengjiang', name: '生姜', nature: '辛，微温', meridian: '归肺、脾、胃经', effect: '温中散寒、化痰止咳',
    use: '手脚发凉、腹部怕冷时的经典温性食材',
    caution: '阴虚火旺、易上火者不宜；睡前不建议饮用；服抗凝药者先咨询医师',
    doseDailyMax: '≤3 片', doseForm: '鲜姜 3 片（约 6g）',
    drugInteraction: ['anticoagulant'], chronicFlag: ['anticoagulant'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '建议少量', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '姜科根茎，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'rougui', name: '肉桂', nature: '辛、甘，大热', meridian: '归肾、脾、心、肝经', effect: '温阳散寒、暖脾胃',
    use: '冬季畏寒明显时少量使用即可',
    caution: '用量宜轻；口干便秘、孕妇与哺乳期请勿饮用；服抗凝药者先咨询医师',
    doseDailyMax: '≤2g', doseForm: '桂皮 2g',
    drugInteraction: ['anticoagulant', 'glucoseDrug'], chronicFlag: ['hypertension', 'anticoagulant'],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'mid', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 2 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期与哺乳期禁用', preop: '术前请暂停' },
    allergen: '樟科树皮，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'pugongying', name: '蒲公英', nature: '苦、甘，寒', meridian: '归肝、胃经', effect: '清热解毒、消肿散结',
    use: '面部容易出油长痘、口干口苦时可短期搭配',
    caution: '性偏寒凉，脾胃虚寒、容易腹泻者不宜长期饮用；孕期请勿饮用',
    doseDailyMax: '≤6g', doseForm: '干全草 6g',
    drugInteraction: ['lithium', 'diuretic'], chronicFlag: ['lithium', 'kidney'],
    nutrients: { sugar: false, potassium: 'high', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期忌用', preop: '术前请暂停' },
    allergen: '菊科全草，花粉过敏者注意交叉反应',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'yumixu', name: '玉米须', nature: '甘，平', meridian: '归膀胱、肝、胆经', effect: '利水渗湿、清解湿热',
    use: '身体困重、晨起浮肿时常用的利湿食材',
    caution: '尿频明显者减少用量；服利尿剂、锂盐或降压药者请先咨询医师',
    doseDailyMax: '≤6g', doseForm: '干花柱 6g',
    drugInteraction: ['lithium', 'diuretic'], chronicFlag: ['lithium', 'hypertension', 'kidney'],
    nutrients: { sugar: false, potassium: 'high', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期忌用', preop: '术前请暂停' },
    allergen: '禾本科花柱，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'guihua', name: '桂花', nature: '辛，温', meridian: '归肺、脾、肾经', effect: '温中散寒、化痰散瘀',
    use: '口气偏重、胃部怕凉时少量搭配，香气宜人',
    caution: '体质偏热、容易上火者不宜多用；孕期慎用',
    doseDailyMax: '≤3g', doseForm: '干花 3g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期慎用', preop: '术前请暂停' },
    allergen: '木犀科花类，花粉过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'foshou', name: '佛手', nature: '辛、苦、酸，温', meridian: '归肝、脾、胃、肺经', effect: '疏肝理气、和胃化痰',
    use: '情绪不畅伴着胸口发闷、饭后胀气时的常用芳香食材',
    caution: '气虚明显者不宜久用；孕妇慎用',
    doseDailyMax: '≤6g', doseForm: '干片 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期慎用', preop: '术前请暂停' },
    allergen: '芸香科果实，柑橘类过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'molihua', name: '茉莉花', nature: '辛、甘，温', meridian: '归脾、胃、肝经', effect: '理气开郁、和中化湿',
    use: '压力大、精神紧张时用来舒缓情绪的芳香食材',
    caution: '体质偏热者不宜多饮；孕妇慎用',
    doseDailyMax: '≤3g', doseForm: '干花 3g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期慎用', preop: '术前请暂停' },
    allergen: '木犀科花类，花粉过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'wumei', name: '乌梅', nature: '酸、涩，平', meridian: '归肝、脾、肺、大肠经', effect: '生津止渴、敛肺涩肠',
    use: '口干烦渴、夏季出汗多时的酸味食材，常用于生津',
    caution: '胃酸过多者餐后少量饮用；感冒初期不宜',
    doseDailyMax: '≤6g', doseForm: '干果 6g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '蔷薇科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },

  /* ---------- 2026-10 增补：补长夏化湿 / 夏季清补 / 秋燥 / 安神 四个空档 ---------- */
  {
    id: 'baibiandou', name: '白扁豆', nature: '甘，微温', meridian: '归脾、胃经', effect: '健脾化湿、和中消暑',
    use: '长夏梅雨、身体困重且不适合用偏寒祛湿食材时的温和之选',
    caution: '需充分煮透后再饮用；腹胀明显者减少频次',
    doseDailyMax: '≤6g', doseForm: '干豆 6g（需煮透，不宜生用）',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '豆科种子，豆类过敏者注意',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'qianshi', name: '芡实', nature: '甘、涩，平', meridian: '归脾、肾经', effect: '益肾固精、健脾止泻',
    use: '大便偏稀、身体困重时，常与山药、莲子组成「健脾三味」',
    caution: '腹胀、便秘者不宜多食',
    doseDailyMax: '≤8g', doseForm: '干种仁 8g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '睡莲科种仁，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'sharen', name: '砂仁', nature: '辛，温', meridian: '归脾、胃、肾经', effect: '化湿开胃、温脾止泻',
    use: '湿阻中焦、饭后胀闷、食欲不佳时的芳香化湿食材，用量宜轻',
    caution: '阴虚火旺者不宜；孕期慎用；气味易挥发，不宜久煮',
    doseDailyMax: '≤3g', doseForm: '干果实 3g（后下，不宜久煮）',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期慎用', preop: '术前请暂停' },
    allergen: '姜科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'sangye', name: '桑叶', nature: '甘、苦，寒', meridian: '归肺、肝经', effect: '疏散风热、清肺润燥',
    use: '秋燥咽干、夏季暑热后咽部不适时的清淡之选',
    caution: '脾胃虚寒、经期女性不宜；孕期建议暂缓',
    doseDailyMax: '≤6g', doseForm: '干叶 6g',
    drugInteraction: ['thyroid', 'glucoseDrug'], chronicFlag: ['diabetes'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期建议暂缓', preop: '术前请暂停' },
    allergen: '桑科叶片，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  },
  {
    id: 'luohanguo', name: '罗汉果', nature: '甘，凉', meridian: '归肺、大肠经', effect: '清热润肺、利咽开音',
    use: '咽部干痒、想要清甜口感时的甜味替代方向（甜味来自罗汉果甜苷）',
    caution: '性偏凉，脾胃虚寒者少量；血糖偏高者仍应注意整体饮食',
    doseDailyMax: '≤5g（约 1/4 个）', doseForm: '干果 5g ≈ 1/4 个',
    drugInteraction: ['glucoseDrug', 'thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'low', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '葫芦科果实，一般不易致敏',
    evidenceLevel: '传统应用为主，甜苷成分的现代研究较明确'
  },
  {
    id: 'heizhima', name: '黑芝麻', nature: '甘，平', meridian: '归肝、肾、大肠经', effect: '补益精血、润燥滑肠',
    use: '秋季干燥、皮肤与发质偏干时的润养食材',
    caution: '油脂含量较高，大便稀软、腹胀者减量',
    doseDailyMax: '≤8g', doseForm: '炒熟种子 8g',
    drugInteraction: ['thyroid'], chronicFlag: [],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'mid' },
    courseLimit: '连续不超过 4 周，停 1 周',
    specialPop: { child: '建议少量', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '芝麻过敏者禁用（属常见致敏食物）',
    evidenceLevel: '传统应用为主，现代营养学脂肪酸数据明确'
  },
  {
    id: 'suanzaoren', name: '酸枣仁', nature: '甘、酸，平', meridian: '归肝、胆、心经', effect: '养心补肝、宁心安神',
    use: '传统上用于睡眠不安的方向；本项目茶方暂未使用该食材，仅作科普收录',
    caution: '正在服用镇静催眠或抗抑郁药者请先咨询医师；本项目茶方未使用该食材',
    doseDailyMax: '≤6g', doseForm: '炒制种子 6g',
    drugInteraction: ['sedative'], chronicFlag: ['sedative'],
    nutrients: { sugar: false, potassium: 'mid', vitaminK: 'low', oxalate: 'low' },
    courseLimit: '连续不超过 2 周，停 1 周',
    specialPop: { child: '14 岁以下不建议', pregnant: '孕期请先咨询医师', preop: '术前请暂停' },
    allergen: '鼠李科种子，一般不易致敏',
    evidenceLevel: '传统应用为主，现代证据有限'
  }
];

/**
 * 茶饮常识问答。
 *
 * ⚠️ 前 10 条的顺序被 utils/agent.js 的 matchFaq() 按索引引用，
 * 新增内容一律**追加在末尾**，如需插入必须同步改 matchFaq 的索引映射。
 */
const FAQ = [
  {
    q: '养生茶可以每天喝吗？',
    a: '不建议把所有茶方都当成每日必饮。日常养生更推荐「喝几天、停一停」的节奏，同一款茶每周 3–5 次以内更稳妥；进补类、偏温或偏凉的茶更要注意控制频次，身体出现明显不适时请暂停饮用。'
  },
  {
    q: '一天中什么时间喝比较好？',
    a: '补益、温阳类茶饮建议放在上午，顺应脾胃运化；滋阴润燥类适合上午至傍晚；安神类可放在睡前 1 小时左右。一般不建议空腹饮用偏酸或偏寒凉的茶，也不建议睡前大量饮水。'
  },
  {
    q: '经期可以喝养生茶吗？',
    a: '经期应避免偏寒凉的茶饮（如含荷叶、金银花、蒲公英的配方），也应暂停有行气作用的玫瑰、山楂类茶方。经期建议以温热、温和的白开水或性质平和的茶饮为主。'
  },
  {
    q: '孕期、哺乳期能喝吗？',
    a: '孕期与哺乳期属于特殊阶段，任何含药材成分的茶饮都建议先咨询产科或中医师后再决定，包括常见的红枣、桂圆、山楂、薏苡仁。本助手不会为特殊人群给出具体配方建议。'
  },
  {
    q: '泡好的茶可以放到第二天吗？',
    a: '不建议。药食同源食材冲泡后久置容易滋生细菌，风味与成分也会发生变化。建议当日冲泡当日喝完，夏季更应控制在数小时内。'
  },
  {
    q: '几款茶可以混在一起泡吗？',
    a: '不建议自行叠加。不同食材的性味、归经不同，随意组合可能相互牵制。如果想调整口味，可以在同一茶方内替换个别食材，或间隔开时间分别饮用。'
  },
  {
    q: '体质测评的结果准吗？',
    a: '本测评是基于《中医体质分类与判定》量表简化改编的自评工具，适合用来了解自己的养生方向，但它不等同于专业辨识。若想获得更准确的判断，建议到正规医疗机构请中医师面诊。'
  },
  {
    q: '喝多久能感受到变化？',
    a: '养生茶属于日常饮食的一部分，作用是温和、缓慢的长期调理，不是速效方案。建议以 2–4 周为一个观察周期，重点体会睡眠、精神、胃口等日常感受的变化。'
  },
  {
    q: '同一款茶可以一直喝下去吗？',
    a: '不建议长期不间断地只喝一款。随着季节更替和身体状态变化，适合的茶方也会变化。更推荐每 2–4 周根据当季与自身感受做一次微调，给身体留出停一停的时间。'
  },
  {
    q: '喝了之后觉得不舒服怎么办？',
    a: '请立即停用并观察。如果出现腹痛腹泻、心慌、皮疹、明显头晕乏力等情况，请及时前往正规医疗机构就诊。本助手仅提供日常养生茶饮参考，不具备医疗诊断与治疗资质。'
  },

  /* ---------- 安全出口类：用药 / 慢病 / 特殊人群 ---------- */
  {
    q: '养生茶能和西药一起喝吗？',
    a: '建议错开时间：养生茶与西药间隔 ≥1 小时；若在服用左甲状腺素、铁剂、钙剂，间隔 ≥4 小时。这样做主要是避免食材成分影响药物吸收。正在长期服药的人，饮用前最好把配方给主治医师或药师看一眼。'
  },
  {
    q: '高血压人群适合喝哪种茶？',
    a: '可以优先考虑性质平和的配方，如玫瑰陈皮茶、陈皮荷叶茶、金银花菊花茶、玫瑰佛手茶。需要注意：含黄芪、党参的配方，含肉桂的配方，以及含薏苡仁、玉米须、蒲公英等利水渗湿类配方，饮用前请先咨询医师，尤其正在服用降压药或利尿剂时。'
  },
  {
    q: '血糖偏高的人怎么选茶？',
    a: '优先避开含红枣、桂圆肉、桑椹、枸杞子用量较大的配方，可选陈皮荷叶茶、金银花菊花茶、玫瑰佛手茶、乌梅山楂茶这类口感偏清淡的。需要强调的是：任何茶饮都不能替代降糖方案，调整饮食前请咨询医师。'
  },
  {
    q: '有肝肾疾病能喝养生茶吗？',
    a: '建议先咨询主治医师再做决定。肝肾功能异常、需要限钾或限水的人群，对含食材的饮品耐受度与常人有差别，尤其是利水渗湿类（薏苡仁、赤小豆、玉米须、茯苓）。我们不为此类情况给出具体配方建议。'
  },
  {
    q: '在吃甲状腺药能喝养生茶吗？',
    a: '可以喝，但要错开时间：建议与左甲状腺素等甲状腺药间隔 ≥4 小时。另外本知识库不收录海藻、昆布这类高碘食材，配方中也不会出现，避免与甲状腺相关用药互相影响。'
  },
  {
    q: '儿童、青少年能喝养生茶吗？',
    a: '14 岁以下不建议饮用含药材成分的养生茶，日常以温开水、淡粥、正常饮食为主即可。青少年如需调理，建议由家长陪同咨询中医师，不要自行长期饮用成人配方。'
  },
  {
    q: '痛风、尿酸偏高能喝吗？',
    a: '含糖较高的配方（红枣、桂圆肉、桑椹）建议少饮，因为糖分摄入与尿酸水平相关；同时注意总饮用量不要过多。痛风发作期或正在用药者，请先咨询医师。'
  },
  {
    q: '服用抗凝、抗血小板药能喝吗？',
    a: '需要谨慎。含玫瑰花、山楂、生姜、金银花等行气或活血倾向食材的配方，建议先咨询主治医师；拟做手术或拔牙者，请提前 2 周停饮并告知医师你的饮用习惯。'
  },
  {
    q: '在用免疫抑制剂或激素类药能喝吗？',
    a: '不建议自行饮用含黄芪、党参等补益类食材的配方。这类人群的饮食与用药相互影响较复杂，请把想喝的配方告知主治医师，由医师判断是否适合。'
  },
  {
    q: '在吃安神类、抗抑郁药能喝吗？',
    a: '饮用时间与服药间隔 ≥1 小时即可，但不建议自行加用酸枣仁、百合等安神倾向食材的配方，以免与镇静催眠类药物叠加。有需要请与精神科医师沟通。'
  },
  {
    q: '养生茶能当药或保健品用吗？',
    a: '不能。养生茶属于日常饮食的一部分，只能作为生活方式的补充，不具备药物或保健食品的作用，也不能承担正规诊疗。正在用药的人调整饮食前，请先咨询医生或药师。'
  },
  {
    q: '手术前还能喝吗？',
    a: '建议暂停。术前 2 周开始停饮含行气、温通倾向食材的配方，并在术前告知医师你的日常饮用习惯，便于医师综合评估。'
  },
  {
    q: '一天能喝几款养生茶？',
    a: '建议每天以 1 款主饮为宜，总量控制在 2 杯左右。多款同时饮用容易造成同一味食材重复叠加（如陈皮、枸杞子、红枣），也可能影响食欲与睡眠。'
  },

  /* ---------- 药膳侧：选购 / 储存 / 炮制 ---------- */
  {
    q: '养生茶能当药喝吗？',
    a: '不能。药食同源食材的日常用量远低于药用剂量，作用方向也不同。把茶饮当药喝既达不到期望，还可能因长期大量饮用带来不适。有明确身体困扰时请就医。'
  },
  {
    q: '药材怎么选购才放心？',
    a: '认准正规药店或商超渠道，优先选择有包装、有生产信息的产品。警惕颜色过于鲜亮、气味刺鼻或有硫熏痕迹（发白、酸味）的货品；散装无标识的尽量不买。'
  },
  {
    q: '药材怎么存放？',
    a: '花草类建议 3–6 个月内用完，根茎、果实类 6–12 个月。密封、避光、阴凉干燥存放，不要放冰箱冷藏室（易回潮）。出现霉味、虫蛀、结块就直接丢弃。'
  },
  {
    q: '薏苡仁为什么要炒？',
    a: '生薏苡仁偏凉，炒过之后性偏温，更适合寒湿、脾胃偏虚的人日常使用。体型偏干、容易上火的人则可以用生品。同一味食材，炮制方式不同，适合的人群也不同。'
  },
  {
    q: '一款茶方一次要放多少？',
    a: '本知识库统一按「代茶饮用量」给出：单味一般 ≤6g，全方总量 ≤20g/日。请注意这是「一天的代茶总量」，不是「每杯的量」；同日饮用多款时要合并计算，避免叠加超量。'
  },
  {
    q: '干品和鲜品用量一样吗？',
    a: '不一样。一般干品 6–8g 约相当于鲜品 30–80g（如山药干 8g ≈ 鲜山药 80g）。自购鲜品时请按干品用量折算，不要直接照搬克数。'
  },
  {
    q: '什么是试点物质？',
    a: '黄芪、党参属于「按照传统既是食品又是中药材的物质管理」试点物质，不是全国通用的普通食材，使用受试点省份、形态与用量限定。本知识库对含试点物质的配方会明确标注，非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。'
  },
  {
    q: '为什么茶饮不给具体的保健剂量建议？',
    a: '本知识库只能告诉你「什么时候该去查、该找谁」，不能告诉你「该吃多少」。铁剂用量、高剂量维生素 D、鱼油、钙剂、益生菌等涉及具体剂量与效果的说法，应由医师或药师结合你的情况判断。'
  },

  /* ---------- 体质侧：复测 / 兼夹 / 理解 ---------- */
  {
    q: '体质会变吗？多久复测一次？',
    a: '会变。体质受季节、作息、饮食与情绪影响，建议 4 周左右复测一次，重点感受睡眠质量、白天精力、胃口与排便这三项自评指标的变化。'
  },
  {
    q: '兼夹体质是什么意思？',
    a: '很多人不是单一状态，而是「主导 + 兼夹」。本测评会给出主导倾向与兼夹倾向两个结果，选茶时可以优先照顾主导方向，再用兼夹方向做微调。'
  },
  {
    q: '舌象和脉象自己看准吗？',
    a: '舌象可以对着自然光观察，有参考价值；脉象自摸只能做很粗略的感受，参考意义有限。所以本知识库的脉象描述都标注了「自摸仅作参考，不能替代面诊」。'
  },
  {
    q: '为什么测出来是「倾向」而不是「就是」？',
    a: '因为自评问卷只能反映你主观感受到的状态，不等同于中医师面诊辨识。所以我们统一用「体质倾向参考」的表达，例如「您的结果更接近倾向阳虚」，而不是给出判定结论。'
  },
  {
    q: '测评结果能作为看病的依据吗？',
    a: '不能。本结果基于自评问卷，仅供参考，不等同于中医师面诊辨识，不作为诊断或用药依据。就医时可以把结果当作个人体感的补充描述，但诊疗判断请以医师为准。'
  }
];

const MAP = {};

function rebuildMap() {
  Object.keys(MAP).forEach(function (k) { delete MAP[k]; });
  INGREDIENTS.forEach(function (i) { MAP[i.name] = i; });
}
rebuildMap();

/** 按食材名取安全卡（供端上风险提示复用） */
function notesOf(name) {
  const it = MAP[name];
  return it ? { drugInteraction: it.drugInteraction || [], chronicFlag: it.chronicFlag || [] } : null;
}

/**
 * 内容覆盖：就地改写 INGREDIENTS / FAQ，并重建食材名索引。
 * @param {{ingredients:Array, faq:Array}} next 知识库内容；字段缺失时保留原值
 * @returns {number} 覆盖后的食材条数
 */
function applyOverride(next) {
  if (next && Array.isArray(next.ingredients) && next.ingredients.length) {
    INGREDIENTS.length = 0;
    Array.prototype.push.apply(INGREDIENTS, next.ingredients);
    rebuildMap();
  }
  if (next && Array.isArray(next.faq) && next.faq.length) {
    FAQ.length = 0;
    Array.prototype.push.apply(FAQ, next.faq);
  }
  return INGREDIENTS.length;
}

module.exports = {
  ingredients: INGREDIENTS,
  faq: FAQ,
  ingredientMap: MAP,
  findIngredient: function (name) { return MAP[name] || null; },
  notesOf: notesOf,
  applyOverride: applyOverride
};
