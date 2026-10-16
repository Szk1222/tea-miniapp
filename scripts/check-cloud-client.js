/** 不依赖真实微信环境，验证体验版走私有链路且不触碰 wx.request。 */
const assert = require('assert');
const calls = [];
global.wx = {
  getAccountInfoSync: function () { return { miniProgram: { envVersion: 'trial' } }; },
  request: function () { throw new Error('体验版不应调用 wx.request'); },
  cloud: { callContainer: function (opts) {
    calls.push(opts);
    return Promise.resolve({ statusCode: 200, data: { ok: true, text: '你好', blocks: [{ type: 'notice', text: '参考' }],
      ctx: { lastTeas: [] }, meta: { mode: 'llm' } } });
  } }
};
const cfg = require('../utils/config.js');
cfg.CLOUD_ENV_ID = 'test-env-123';
cfg.CLOUD_SERVICE = 'tea-agent';
const llm = require('../utils/llm.js');
const seen = [];
llm.chat({ sessionId: 's1', message: '你好', onMeta: function (m) { seen.push(m.mode); },
  onDelta: function (t) { seen.push(t); }, onBlock: function (b) { seen.push(b.type); } }).promise.then(function (out) {
  assert.deepEqual(seen, ['llm', '你好', 'notice']);
  assert.equal(out.meta.mode, 'llm');
  assert.equal(calls[0].path, '/api/agent/chat.json');
  assert.equal(calls[0].header['X-WX-SERVICE'], 'tea-agent');
  assert.equal(calls[0].config.env, 'test-env-123');
  console.log('✓ 体验版云托管客户端链路通过');
}).catch(function (e) { console.error(e); process.exit(1); });
