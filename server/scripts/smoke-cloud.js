/** 云托管私有链路身份隔离、删除、SSE 完成与风险硬拦截回归。 */
const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function listen(server) { return new Promise(function (resolve) { server.listen(0, '127.0.0.1', function () { resolve(server.address().port); }); }); }
async function ready(base) {
  for (let n = 0; n < 50; n++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 100); });
  }
  throw new Error('服务启动超时');
}

(async function () {
  const requests = [];
  const mock = http.createServer(function (req, res) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      requests.push(JSON.parse(raw));
      setTimeout(function () {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '请先告诉我你偏好的日常茶饮口味。' }, finish_reason: 'stop' }] }));
      }, 50);
    });
  });
  const llmPort = await listen(mock);
  const probe = http.createServer(function () {});
  const port = await listen(probe);
  await new Promise(function (r) { probe.close(r); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chalifang-cloud-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', STORAGE_DIR: dir,
      SESSION_IDENTITY_MODE: 'cloudbase', RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_CHAT_MAX: '3', LLM_API_KEY: 'mock-key',
      LLM_BASE_URL: 'http://127.0.0.1:' + llmPort + '/v1', LLM_MODEL: 'mock', LLM_THINKING: '' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = 'http://127.0.0.1:' + port;
  async function send(route, user, body, method) {
    return fetch(base + route, { method: method || 'POST', headers: Object.assign({ 'Content-Type': 'application/json' },
      user ? { 'x-wx-openid': user } : {}), body: JSON.stringify(body) });
  }
  try {
    await ready(base);
    const body = { sessionId: 'shared-id', message: '我想了解日常茶饮口味' };
    assert.equal((await send('/api/agent/chat.json', '', body)).status, 401);
    assert.equal((await send('/api/agent/chat.json', 'user_aaaaaaaa', body)).status, 200);
    assert.equal((await send('/api/agent/chat.json', 'user_bbbbbbbb', body)).status, 200);
    assert.equal(requests.length, 2);
    const second = JSON.stringify(requests[1].messages);
    assert(!second.includes('请先告诉我你偏好的日常茶饮口味'), '不同用户不应共享历史');
    const stream = await send('/api/agent/chat', 'user_aaaaaaaa', { sessionId: 'stream-id', message: '我想了解日常茶饮口味' });
    assert.equal(stream.status, 200);
    const sse = await stream.text();
    assert(sse.includes('event: done'), 'POST 读完后流式响应不得过早中止');
    assert(!sse.includes('event: error'));
    const beforeRisk = requests.length;
    const risk = await (await send('/api/agent/chat.json', 'user_aaaaaaaa', { sessionId: 'risk-id',
      message: '我想喝茶', profile: { constitutionId: 'pinghe', risk: { stage: true } } })).json();
    assert.equal(requests.length, beforeRisk, '风险档案不得进模型');
    assert(!risk.blocks.some(function (b) { return b.type === 'teas'; }));
    const del = await send('/api/agent/session', 'user_aaaaaaaa', { sessionId: 'shared-id' }, 'DELETE');
    assert.equal(del.status, 200);
    console.log('✓ 云身份隔离、会话删除、SSE 完成、风险硬拦截通过');
  } finally {
    child.kill();
    await new Promise(function (r) { mock.close(r); });
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(function (e) { console.error(e); process.exit(1); });
