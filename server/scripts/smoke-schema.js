/**
 * 内容校验自检：确认「内置内容能通过」且「违规内容会被拦下」。
 * 运行：node server/scripts/smoke-schema.js
 */
const schema = require('../src/content-schema.js');
const overlay = require('../../utils/content-overlay.js');

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra ? ' → ' + extra : ''));
}

const payload = overlay.snapshot();

console.log('【内置内容应全部通过】');
schema.TYPES_FOR_TEST = null;
['teas', 'constitutions', 'questions', 'knowledge', 'catalog'].forEach(function (t) {
  const r = schema.validate(t, payload[t]);
  ok(t + ' 校验通过', r.ok, r.ok ? r.count + ' 条 / ' + r.warnings.length + ' 条提示' : JSON.stringify(r.errors.slice(0, 3)));
});

console.log('\n【结构错误应被拦下】');
let r = schema.validate('teas', [{ id: 'Bad_ID', name: '', constitution: 'buzhidao', ingredients: [{ name: '党参', amount: '5g' }], effects: [], scenes: ['x'], caution: ['y'], brew: { water: 'w', steps: ['s'] } }]);
ok('非法字段被拦下', !r.ok);
console.log('        ' + r.errors.map(function (e) { return e.path + ' ' + e.message; }).join('\n        '));

r = schema.validate('teas', [
  { id: 'a', name: 'A', constitution: 'pinghe', ingredients: [], effects: ['x'], scenes: ['y'], caution: ['z'], brew: { water: 'w', steps: ['s'] } },
  { id: 'a', name: 'B', constitution: 'pinghe', ingredients: [], effects: ['x'], scenes: ['y'], caution: ['z'], brew: { water: 'w', steps: ['s'] } }
]);
ok('重复 id 被拦下', !r.ok && r.errors.some(function (e) { return e.message.indexOf('重复') > -1; }));

console.log('\n【合规红线应被拦下】');
function teaWith(effect) {
  return [{ id: 't1', name: '测试茶', constitution: 'pinghe', subtitle: '测试', nature: '性平', ingredients: [{ name: '党参', amount: '5g' }], effects: [effect], scenes: ['日常'], caution: ['孕妇慎用'], brew: { water: '500ml 沸水', steps: ['焖泡'] } }];
}
['本茶可治疗失眠', '能根治过敏', '有明显疗效', '可替代药物', '包治百病'].forEach(function (t) {
  const res = schema.validate('teas', teaWith(t));
  ok('拦截「' + t + '」', !res.ok, res.ok ? '未被拦截！' : res.errors[0].message);
});

console.log('\n【合规豁免应放行】');
[
  '本建议不替代药物治疗',
  '不具备医疗诊断与治疗资质，请及时前往正规医疗机构就诊',
  '本品不治疗疾病，仅作日常养生参考'
].forEach(function (t) {
  const res = schema.validate('teas', teaWith(t));
  ok('放行「' + t + '」', res.ok, res.ok ? '' : res.errors[0].message);
});

console.log('\n【白名单食材应被拦下】');
const poison = teaWith('温和调理');
poison[0].ingredients = [{ name: '人参', amount: '5g' }];
ok('目录外食材被拦下', !schema.validate('teas', poison).ok);

console.log('\n【超量用药应被拦下】');
const big = teaWith('温和调理');
big[0].ingredients = [{ name: '党参', amount: '60g' }];
ok('60g 被拦下', !schema.validate('teas', big).ok);
const mid = teaWith('温和调理');
mid[0].ingredients = [{ name: '党参', amount: '15g' }];
const midRes = schema.validate('teas', mid);
ok('15g 仅提示不阻断', midRes.ok && midRes.warnings.length > 0, midRes.warnings.map(function (w) { return w.message; }).join(' | '));

console.log('\n【疾病名仅提示】');
const dis = teaWith('适合日常饮用');
dis[0].caution = ['高血压人群请先咨询医师'];
const disRes = schema.validate('teas', dis);
ok('疾病名放行但告警', disRes.ok && disRes.warnings.some(function (w) { return w.message.indexOf('疾病名') > -1; }));

console.log('\n【枚举取值校验真的生效】');
const badEnum = teaWith('温和调理');
badEnum[0].constitution = 'not-exist';
ok('未知体质被拦下', !schema.validate('teas', badEnum).ok);
const qBad = overlay.snapshot().questions;
qBad.list[0].options[0].scores = { zzz: 1 };
ok('未知体质 id 计分被拦下', !schema.validate('questions', qBad).ok);

console.log('\n【管理端 schema 可下发】');
const pub = schema.publicSchema();
ok('包含五类内容', Object.keys(pub).length === 5, Object.keys(pub).join(','));
ok('enum ref 已解析为可选值', pub.teas.root.item.fields.filter(function (f) { return f.key === 'constitution'; })[0].options.values.length === 9);

console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
