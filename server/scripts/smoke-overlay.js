/**
 * 覆盖层冒烟自检：验证「就地改写」确实能被所有外部引用看到。
 * 运行：node server/scripts/smoke-overlay.js
 */
const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const questions = require('../../data/questions.js');
const knowledge = require('../../data/knowledge.js');
const catalog = require('../../data/catalog.js');
const engine = require('../../utils/engine.js');

let failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ' → ' + JSON.stringify(actual) + (ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'));
}

console.log('【内置数据】');
check('teas.total', teas.total, 18);
check('constitutions.ids.length', constitutions.ids.length, 9);
check('questions.total', questions.total, 10);
check('knowledge.ingredients.length', knowledge.ingredients.length, 28);
check('catalog.total', catalog.total, catalog.items.length);
check('engine.MAX_SCORE 有 9 项', Object.keys(engine.MAX_SCORE).length, 9);

// 外部引用（模拟页面：模块加载时就抓住了 list / map / ids）
const listRef = teas.list;
const mapRef = teas.map;
const idsRef = constitutions.ids;
const ingRef = knowledge.ingredients;
const maxRef = engine.MAX_SCORE;

console.log('\n【覆盖生效】');
teas.applyOverride([{ id: 'zz-test', name: '测试茶', constitution: 'pinghe', ingredients: [], effects: [], scenes: [], tags: [] }]);
constitutions.applyOverride([{ id: 'pinghe', name: '平和质（改）', color: '#000' }]);
questions.applyOverride({ list: [{ id: 'q1', title: '题一', options: [{ label: 'A', scores: { pinghe: 4 } }] }] });
knowledge.applyOverride({ ingredients: [{ id: 'x', name: '测试食材' }] });
catalog.applyOverride([{ name: '测试食材', category: '测试', part: '测试' }]);
engine.reload();

check('teas.total', teas.total, 1);
check('旧 listRef 引用已同步', listRef.length, 1);
check('旧 mapRef 已重建', Object.keys(mapRef), ['zz-test']);
check('teas.get 走新索引', teas.get('zz-test').name, '测试茶');
check('旧 idsRef 已同步', idsRef, ['pinghe']);
check('constitutions.map 已重建', constitutions.map.pinghe.name, '平和质（改）');
check('questions.total', questions.total, 1);
check('旧 ingRef 已同步', ingRef.length, 1);
check('knowledge.findIngredient', knowledge.findIngredient('测试食材').id, 'x');
check('catalog.has 走新索引', catalog.has('测试食材'), true);
check('catalog.total', catalog.total, 1);
check('旧 maxRef 已重算', maxRef, { pinghe: 4 });

console.log('\n【非法入参不改动】');
teas.applyOverride(null);
teas.applyOverride([]);
teas.applyOverride('xxx');
check('teas.total 不变', teas.total, 1);

console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
