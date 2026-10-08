/**
 * 服务端安全边界回归。
 *
 * 覆盖四件「上线后出问题代价很大」的事：
 *   1. 隐私：端上可能带过来的敏感档案字段，绝不能出现在发给第三方模型的 prompt 里
 *   2. 鉴权：审计留痕接口必须带令牌，公开的那条已下线
 *   3. CORS：默认不下发 Access-Control-Allow-Origin
 *   4. 限流：对话接口超限返回 429（防大模型额度被刷爆）
 *
 * 1 的实现方式：在本地起一个**假的大模型端点**，把服务端 LLM_BASE_URL 指过去，
 * 再把服务端真实发出的请求体抓下来断言 —— 这样验的是最终事实，而不是中间变量。
 *
 * 运行：node server/scripts/smoke-security.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TMP = path.join(os.tmpdir(), 'chalifang-security-test-' + Date.now());
const TOKEN = 'security-test-token-abcdef123456';

/** 唯一哨兵值：绝不可能出现在静态提示词里，因此可用于判定「字段是否真的没上传」 */
const SENTINEL = {
  gender: 'A7-女性标记',
  age: 'A7-28到35岁',
  stage: 'A7-阶段标记',
  condition: 'A7-基础健康标记',
  allergy: 'A7-过敏标记'
};

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + extra : ''));
}

function freePort() {
  return new Promise(function (resolve) {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', function () {
      const p = s.address().port;
      s.close(function () { resolve(p); });
    });
  });
}

function waitHealthy(base, tries) {
  return new Promise(function (resolve, reject) {
    let n = 0;
    (function poll() {
      n += 1;
      fetch(base + '/health')
        .then(function (r) { return r.json(); })
        .then(function (d) { d.ok ? resolve(d) : retry(); })
        .catch(retry);
      function retry() {
        if (n >= (tries || 40)) return reject(new Error('服务端启动超时'));
        setTimeout(poll, 250);
      }
    })();
  });
}

/** 假大模型端点：记录收到的请求体，回一段普通 JSON（llm.js 兼容非流式响应） */
function startMockLlm() {
  const captured = [];
  const server = http.createServer(function (req, res) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      captured.push(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '收到，我先了解一下你的日常感受。' },
          finish_reason: 'stop'
        }]
      }));
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port, captured: captured });
    });
  });
}

function postJSON(url, body, headers) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
}

async function main() {
  const PORT = await freePort();
  const BASE = 'http://127.0.0.1:' + PORT;
  const mock = await startMockLlm();

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'src', 'index.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STORAGE_DIR: TMP,
      ADMIN_TOKEN: TOKEN,
      LOG_LEVEL: 'silent',
      // 指向假模型，并刻意留出很紧的对话限流额度便于验证
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'http://127.0.0.1:' + mock.port + '/v1',
      LLM_MODEL: 'mock-model',
      LLM_THINKING: '',
      CORS_ORIGIN: '',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_CHAT_MAX: '3',
      RATE_LIMIT_API_MAX: '60'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const childLog = [];
  child.stdout.on('data', function (d) { childLog.push(String(d)); });
  child.stderr.on('data', function (d) { childLog.push(String(d)); });

  try {
    await waitHealthy(BASE);
    console.log('服务端子进程就绪：' + BASE);

    /* ---------------- 1. 隐私：敏感字段不得进入 prompt ---------------- */
    console.log('\n【隐私：端上带敏感字段时，服务端必须剥离后再送模型】');
    const fullProfile = {
      constitutionId: 'pinghe',
      secondaryId: 'qixu',
      percent: 72,
      levelText: '倾向明显',
      basic: {
        gender: SENTINEL.gender,
        age: SENTINEL.age,
        stage: SENTINEL.stage,
        conditions: [SENTINEL.condition],
        allergy: SENTINEL.allergy,
        tastes: ['清淡']
      }
    };
    const r1 = await postJSON(BASE + '/api/agent/chat.json', {
      sessionId: 'sec-1',
      message: '最近总是没力气',
      profile: fullProfile
    });
    const j1 = await r1.json();
    ok('对话请求成功返回', r1.status === 200 && j1.ok === true, r1.status);

    const sent = mock.captured[mock.captured.length - 1] || '';
    ok('确有请求送达模型', sent.length > 0);
    ok('未出现「basic」字段', sent.indexOf('"basic"') === -1);
    ok('未上传性别原文', sent.indexOf(SENTINEL.gender) === -1);
    ok('未上传年龄原文', sent.indexOf(SENTINEL.age) === -1);
    ok('未上传特殊阶段原文', sent.indexOf(SENTINEL.stage) === -1);
    ok('未上传健康情况原文', sent.indexOf(SENTINEL.condition) === -1);
    ok('未上传过敏史原文', sent.indexOf(SENTINEL.allergy) === -1);
    // 但风险标记必须保留，否则等于把「先做风险提示、不给配方」的合规安全网一起删了
    ok('风险标记 stage 仍生效', sent.indexOf('需要特别提示的生理阶段') > -1);
    ok('风险标记 chronic 仍生效', sent.indexOf('基础健康情况或长期服药') > -1);
    ok('风险标记 allergy 仍生效', sent.indexOf('过敏史') > -1);
    ok('体质类型仍保留（产品核心功能）', sent.indexOf('平和质') > -1 || sent.indexOf('pinghe') > -1);

    /* ---------------- 2. 鉴权：审计接口 ---------------- */
    console.log('\n【鉴权：审计留痕接口】');
    const pubAudit = await fetch(BASE + '/api/agent/audit');
    ok('已下线的公开审计接口返回 404', pubAudit.status === 404, pubAudit.status);

    const rawNoToken = await fetch(BASE + '/api/admin/raw-audit');
    ok('raw-audit 无令牌 → 401', rawNoToken.status === 401, rawNoToken.status);

    const rawWithToken = await fetch(BASE + '/api/admin/raw-audit', {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const rawBody = await rawWithToken.json();
    ok('raw-audit 带令牌 → 200', rawWithToken.status === 200 && rawBody.ok === true, rawWithToken.status);

    /* ---------------- 3. CORS 默认收敛 ---------------- */
    console.log('\n【CORS：默认不下发跨域头】');
    const health = await fetch(BASE + '/health');
    ok('未下发 Access-Control-Allow-Origin',
      !health.headers.get('access-control-allow-origin'),
      health.headers.get('access-control-allow-origin'));
    const preflight = await fetch(BASE + '/api/agent/chat', { method: 'OPTIONS' });
    ok('预检请求不下发跨域头',
      !preflight.headers.get('access-control-allow-origin'),
      preflight.headers.get('access-control-allow-origin'));

    /* ---------------- 4. 限流 ---------------- */
    console.log('\n【限流：RATE_LIMIT_CHAT_MAX=3】');
    // 上面已用掉 1 次对话额度，这里再用 2 次应仍然放行
    const r2 = await postJSON(BASE + '/api/agent/chat.json', { sessionId: 'sec-2', message: '睡不好' });
    ok('第 2 次放行', r2.status === 200, r2.status);
    const r3 = await postJSON(BASE + '/api/agent/chat.json', { sessionId: 'sec-3', message: '怕冷' });
    ok('第 3 次放行', r3.status === 200, r3.status);
    const r4 = await postJSON(BASE + '/api/agent/chat.json', { sessionId: 'sec-4', message: '口干' });
    ok('第 4 次被限流 → 429', r4.status === 429, r4.status);
    const j4 = await r4.json();
    ok('返回可读的限流提示', !!j4.error && j4.retryAfterSec > 0, j4.error);
    ok('带 Retry-After 响应头', !!r4.headers.get('retry-after'), r4.headers.get('retry-after'));

    // 内容下发属于另一个限流桶，不应被对话限流波及
    const contentRes = await fetch(BASE + '/api/content?version=0');
    ok('内容下发不受对话限流影响', contentRes.status === 200, contentRes.status);
  } finally {
    child.kill();
    mock.server.close();
    await new Promise(function (res) { setTimeout(res, 300); });
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    if (process.env.DEBUG_CHILD) console.log('\n--- 子进程输出 ---\n' + childLog.join(''));
  }

  console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('自检异常：' + e.message);
  process.exit(1);
});
