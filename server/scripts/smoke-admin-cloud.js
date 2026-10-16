const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chalifang-cloud-admin-'));
process.env.STORAGE_DIR = tmp;
process.env.SESSION_IDENTITY_MODE = 'cloudbase';
process.env.ADMIN_OPENIDS = 'owner-openid-12345';
delete process.env.ADMIN_TOKEN;

const content = require('../src/content.js');
const server = require('../src/index.js').server;
process.env.NODE_ENV = 'production';
assert.throws(function () { content.init(); }, /CONTENT_STORAGE=mysql/);
delete process.env.NODE_ENV;

async function main() {
  content.init();
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(url, openid, method, body) {
    const response = await fetch(base + url, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, openid ? { 'x-wx-openid': openid } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call('/api/admin/overview')).status, 401);
  assert.equal((await call('/api/admin/login', '', 'POST', {})).status, 403);
  assert.equal((await fetch(base + '/admin')).status, 404);
  assert.equal((await call('/api/admin/overview', 'other-openid-12345')).status, 401);
  assert.equal((await call('/api/admin/status', 'other-openid-12345')).data.authorized, false);
  assert.equal((await call('/api/admin/status', 'owner-openid-12345')).data.authorized, true);
  assert.equal((await call('/api/admin/overview', 'owner-openid-12345')).status, 200);
  const got = await call('/api/admin/content/teas', 'owner-openid-12345');
  const changed = got.data.value;
  changed[0].subtitle = '持久化测试';
  assert.equal((await call('/api/admin/content/teas', 'other-openid-12345', 'PUT', { value: changed, baseVersion: 1 })).status, 401);
  assert.equal((await call('/api/admin/content/teas', 'owner-openid-12345', 'PUT', { value: changed, baseVersion: 0 })).status, 409);
  assert.equal((await call('/api/admin/content/teas', 'owner-openid-12345', 'PUT', { value: changed, baseVersion: 1 })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(content._file, 'utf8')).version, 2);
  delete require.cache[require.resolve('../src/content.js')];
  const restarted = require('../src/content.js');
  restarted.init();
  assert.equal(restarted.meta().version, 2);
  assert.equal(restarted.getType('teas')[0].subtitle, '持久化测试');
  await new Promise(function (resolve) { server.close(resolve); });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('✓ 云托管管理员白名单、未授权拒绝、版本冲突、重载持久化通过');
}
main().catch(function (error) { console.error(error); process.exit(1); });
