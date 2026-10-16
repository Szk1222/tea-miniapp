/**
 * 管理后台端到端自检：鉴权 / 内容读写 / 版本下发 / 拦截 / 回滚 / 留痕。
 * 直接拉起真实 http 服务（随机端口），用临时 STORAGE_DIR，不污染实际数据。
 * 运行：node server/scripts/smoke-admin.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'chalifang-admin-test-' + Date.now());
process.env.STORAGE_DIR = TMP;
process.env.LOG_LEVEL = 'silent';
process.env.ADMIN_TOKEN = 'test-token-0123456789abcdef';

const content = require('../src/content.js');
const { server } = require('../src/index.js');
const teas = require('../../data/teas.js');
const CONSTITUTIONS = require('../../data/constitutions.js');

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + extra : ''));
}

let BASE = '';
function call(p, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  return fetch(BASE + p, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  }).then(function (r) {
    return r.text().then(function (t) {
      let j = null;
      try { j = JSON.parse(t); } catch (e) { /* 非 JSON（如 /admin 的 HTML） */ }
      return { status: r.status, json: j, text: t };
    });
  });
}

async function main() {
  content.init();
  await new Promise(function (res) { server.listen(0, '127.0.0.1', res); });
  BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('测试服务：' + BASE);

  console.log('\n【健康检查已带上内容版本】');
  let r = await call('/health');
  ok('/health 正常', r.status === 200 && r.json.ok);
  ok('返回 content.meta', !!r.json.content && r.json.content.version === 1, 'v' + (r.json.content || {}).version);

  console.log('\n【管理页面托管】');
  r = await call('/admin');
  ok('/admin 返回 HTML', r.status === 200 && r.text.indexOf('内容管理后台') > -1, (r.text.length + ' 字节'));

  console.log('\n【鉴权】');
  r = await call('/api/admin/overview');
  ok('无令牌被拒', r.status === 401, r.json.error);
  r = await call('/api/admin/overview', { token: 'wrong-token-xxxxxxxxxxxxxx' });
  ok('错误令牌被拒', r.status === 401);
  r = await call('/api/admin/login', { method: 'POST', body: { token: 'wrong-token-xxxxxxxxxxxxxx' } });
  ok('登录接口拒绝错误令牌', r.status === 401, r.json.error);
  r = await call('/api/admin/login', { method: 'POST', body: { token: 'test-token-0123456789abcdef' } });
  ok('登录成功', r.status === 200 && r.json.ok);
  const T = 'test-token-0123456789abcdef';
  r = await call('/api/admin/overview', { token: T });
  ok('带令牌可访问概览', r.status === 200 && r.json.ok, '茶方 ' + r.json.content.counts.teas + ' 条');

  console.log('\n【登录限流】');
  for (let i = 0; i < 5; i++) await call('/api/admin/login', { method: 'POST', body: { token: 'bad-' + i + 'xxxxxxxxxxxxxxxxxxxx' } });
  r = await call('/api/admin/login', { method: 'POST', body: { token: T } });
  ok('连续失败后锁定', r.status === 429, r.json.error);

  console.log('\n【字段描述可下发】');
  r = await call('/api/admin/schema', { token: T });
  ok('返回五类 schema', r.json.ok && Object.keys(r.json.schema).length === 5, Object.keys(r.json.schema || {}).join(','));
  ok('枚举已解析', r.json.schema.teas.root.item.fields.filter(function (f) { return f.key === 'constitution'; })[0].options.values.length === 9);

  console.log('\n【内容读取与发布】');
  r = await call('/api/admin/content/teas', { token: T });
  ok('读取茶方库', r.json.ok && r.json.value.length === 23, r.json.value.length + ' 条');
  const edit = r.json.value;
  edit[0].subtitle = '疏肝和胃 · 后台改写验证';
  r = await call('/api/admin/content/teas', { method: 'PUT', token: T, body: { value: edit, actor: 'smoke', baseVersion: 1 } });
  ok('发布成功', r.status === 200 && r.json.ok, 'v' + r.json.version);
  ok('版本递增', r.json.version === 2);
  ok('运行时已生效', teas.get(edit[0].id).subtitle === '疏肝和胃 · 后台改写验证', teas.get(edit[0].id).subtitle);

  console.log('\n【内容下发接口】');
  r = await call('/api/content?version=1');
  ok('旧版本收到完整内容', r.json.ok && r.json.unchanged === false && r.json.payload.teas.length === 23);
  r = await call('/api/content?version=2');
  ok('同版本只回版本号', r.json.ok && r.json.unchanged === true);

  console.log('\n【违规内容被拦下】');
  const bad = JSON.parse(JSON.stringify(edit));
  bad[0].effects = ['本茶可以治疗失眠'];
  r = await call('/api/admin/content/teas', { method: 'PUT', token: T, body: { value: bad, actor: 'smoke', baseVersion: 2 } });
  ok('返回 422', r.status === 422, (r.json.errors[0] || {}).message);
  r = await call('/api/admin/overview', { token: T });
  ok('版本未被改动', r.json.content.version === 2, 'v' + r.json.content.version);
  ok('线上内容未被写坏', teas.get(edit[0].id).effects[0] !== '本茶可以治疗失眠');

  console.log('\n【交叉引用保护】');
  r = await call('/api/admin/content/constitutions', { token: T });
  const cons = r.json.value.filter(function (c) { return c.id !== 'pinghe'; });
  r = await call('/api/admin/content/constitutions', { method: 'PUT', token: T, body: { value: cons, actor: 'smoke', baseVersion: 2 } });
  ok('拒绝（会让茶方失效）', r.status === 422, (r.json.errors[0] || {}).message);
  ok('体质库未被改动', CONSTITUTIONS.get('pinghe') !== null);

  console.log('\n【变更记录与审计留痕】');
  r = await call('/api/admin/journal?n=20', { token: T });
  ok('有变更流水', r.json.ok && r.json.items.length >= 2, r.json.items.map(function (x) { return x.action + '/' + x.type; }).join(', '));
  r = await call('/api/admin/audit?n=50', { token: T });
  ok('审计可读', r.json.ok && r.json.stats.lines > 0, r.json.stats.lines + ' 条 / ' + r.json.stats.dir);

  console.log('\n【回滚】');
  r = await call('/api/admin/rollback', { method: 'POST', token: T, body: { actor: 'smoke' } });
  ok('回滚成功', r.json.ok, 'v' + r.json.version);
  ok('内容已还原', teas.get(edit[0].id).subtitle !== '疏肝和胃 · 后台改写验证', teas.get(edit[0].id).subtitle);

  console.log('\n【播种需二次确认】');
  r = await call('/api/admin/reseed', { method: 'POST', token: T, body: {} });
  ok('无 confirm 被拒', r.status === 400, r.json.error);

  console.log('\n【容器重启后内容仍在】');
  const savedVersion = content.meta().version;
  delete require.cache[require.resolve('../src/content.js')];
  const content2 = require('../src/content.js');
  content2.init();
  ok('重新加载后版本不变', content2.meta().version === savedVersion, 'v' + content2.meta().version);
  ok('内容是回滚后的值', teas.get(edit[0].id).subtitle !== '疏肝和胃 · 后台改写验证', teas.get(edit[0].id).subtitle);

  await new Promise(function (res) { server.close(res); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('测试异常：' + (e && e.stack || e));
  process.exit(1);
});
