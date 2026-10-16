/**
 * 内容中心自检：播种 / 发布 / 拦截 / 交叉校验 / 回滚 / 索引重建。
 * 用临时 STORAGE_DIR 跑，不污染实际数据。
 * 运行：node server/scripts/smoke-content.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'chalifang-content-test-' + Date.now());
process.env.STORAGE_DIR = TMP;
process.env.LOG_LEVEL = 'silent';

const content = require('../src/content.js');
const overlay = require('../../utils/content-overlay.js');
const teas = require('../../data/teas.js');
const rag = require('../src/rag.js');

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + extra : ''));
}

console.log('存储目录：' + TMP);
console.log('\n【首次启动播种】');
const info = content.init();
ok('版本从 1 起', content.meta().version === 1, content.meta().version);
ok('茶方 23 条', teas.total === 23, teas.total);
ok('落盘文件存在', fs.existsSync(content._file));
ok('索引已建', rag._state.chunks.length > 0, rag._state.chunks.length + ' chunk');
ok('标记为内置播种', content.meta().seeded === true);

console.log('\n【发布：改一条茶方文案】');
const chunksBefore = rag._state.chunks.length;
let list = content.getType('teas');
list[0].subtitle = '疏肝和胃 · 自检改写副标题';
let r = content.save('teas', list, 'tester', content.meta().version);
ok('发布成功', r.ok, 'v' + r.version);
ok('版本递增到 2', r.version === 2);
ok('运行时已生效', teas.get(list[0].id).subtitle === '疏肝和胃 · 自检改写副标题', teas.get(list[0].id).subtitle);
ok('索引已重建', rag._state.chunks.length > 0, chunksBefore + ' → ' + rag._state.chunks.length + ' chunk');
ok('回滚点已生成', content.meta().hasRollback === true);

console.log('\n【并发发布锁和旧版本保护】');
const lock = path.join(TMP, '.content-write-lock');
fs.mkdirSync(lock);
r = content.save('teas', list, 'tester', content.meta().version);
ok('并发锁阻止写入', !r.ok && r.conflict === true);
fs.rmdirSync(lock);
r = content.save('teas', list, 'tester', 1);
ok('旧版本草稿阻止覆盖', !r.ok && r.conflict === true && r.version === 2);

console.log('\n【拦截：结构错误不入库】');
list = content.getType('teas');
list[0].name = '';
r = content.save('teas', list, 'tester', content.meta().version);
ok('被拒绝', !r.ok, (r.errors[0] || {}).message);
ok('版本未变', content.meta().version === 2, content.meta().version);
ok('运行时未被写坏', teas.get('meigui-chenpi').name === '玫瑰陈皮茶', teas.get('meigui-chenpi').name);

console.log('\n【拦截：合规违禁词】');
list = content.getType('teas');
list[0].effects = ['可以治疗失眠'];
r = content.save('teas', list, 'tester', content.meta().version);
ok('被拒绝', !r.ok, (r.errors[0] || {}).message);
ok('版本未变', content.meta().version === 2);

console.log('\n【拦截：目录外食材】');
list = content.getType('teas');
list[0].ingredients = [{ name: '人参', amount: '3g' }];
r = content.save('teas', list, 'tester', content.meta().version);
ok('被拒绝', !r.ok, (r.errors[0] || {}).message);

console.log('\n【交叉校验：删掉体质会让茶方失效】');
const cons = content.getType('constitutions').filter(function (c) { return c.id !== 'pinghe'; });
r = content.save('constitutions', cons, 'tester', content.meta().version);
ok('被拒绝且提示会失效', !r.ok && r.hint, (r.errors[0] || {}).message);
ok('体质库未被改动', require('../../data/constitutions.js').get('pinghe') !== null);
ok('版本未变', content.meta().version === 2, content.meta().version);

console.log('\n【发布：合法地改体质文案】');
const cons2 = content.getType('constitutions');
cons2[0].short = '自检改写';
r = content.save('constitutions', cons2, 'tester', content.meta().version);
ok('发布成功', r.ok, 'v' + r.version);
ok('工具枚举随时可用', require('../src/tools.js').TOOLS.filter(function (t) { return t.function.name === 'recommend_tea'; })[0]
  .function.parameters.properties.constitution_id.enum.length === 9);

console.log('\n【版本对齐：客户端增量判断】');
ok('同版本不下发 payload', content.payloadFor(content.meta().version).unchanged === true);
const p = content.payloadFor(0);
ok('异版本下发完整内容', p.unchanged === false && p.payload.teas.length === 23, '茶方 ' + p.payload.teas.length + ' 条');

console.log('\n【回滚】');
const vBefore = content.meta().version;
r = content.rollback('tester');
ok('回滚成功', r.ok, 'v' + r.version);
ok('版本继续递增', r.version === vBefore + 1, vBefore + ' → ' + r.version);
ok('体质文案已还原', require('../../data/constitutions.js').get('pinghe').short === '阴阳调和',
  require('../../data/constitutions.js').get('pinghe').short);

console.log('\n【变更留痕】');
const j = content.recentJournal(5);
ok('有变更记录', j.length >= 3, j.map(function (x) { return x.action + '/' + x.type; }).join(', '));
ok('审计日志已落盘', fs.readdirSync(TMP).some(function (f) { return /^audit-/.test(f); }),
  fs.readdirSync(TMP).join(', '));

const saved = fs.readFileSync(content._file);
fs.writeFileSync(content._file, '{broken');
let corruptRejected = false;
try { content.sync(); } catch (e) { corruptRejected = /读取内容文件失败/.test(e.message); }
ok('损坏的持久化文件拒绝自动重播种', corruptRejected);
fs.writeFileSync(content._file, saved);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
