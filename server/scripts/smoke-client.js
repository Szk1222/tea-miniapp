/**
 * 小程序端内容下发链路的端到端自检。
 *
 * 关键设计：服务端跑在**独立子进程**里，本进程只加载小程序端代码。
 * 这才能真实还原「端服分离」——否则同进程里服务端发布内容时会顺带把本进程的
 * 数据模块一起改了，测出来的「拉取生效」是假象。
 *
 * 本进程用最小桩件替换平台 API：Storage 用内存 Map，request 转发到真实服务端的 fetch。
 *
 * 运行：node server/scripts/smoke-client.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TMP = path.join(os.tmpdir(), 'chalifang-client-test-' + Date.now());
const TOKEN = 'client-test-token-abcdef123456';

/* ---------- wx 桩件（必须在 require 业务模块之前挂好） ---------- */
const memoryStorage = new Map();
let requestCount = 0;
let forceNetworkFail = false;

global.wx = {
  getStorageSync: function (k) { return memoryStorage.has(k) ? memoryStorage.get(k) : ''; },
  setStorageSync: function (k, v) { memoryStorage.set(k, v); },
  removeStorageSync: function (k) { memoryStorage.delete(k); },
  getStorageInfoSync: function () { return { keys: Array.from(memoryStorage.keys()) }; },
  // utils/config.js 会按环境版本挑 API_BASE，这里给出与开发者工具一致的环境
  getAccountInfoSync: function () { return { miniProgram: { envVersion: 'develop' } }; },
  request: function (opts) {
    requestCount += 1;
    if (forceNetworkFail) {
      return setTimeout(function () { opts.fail && opts.fail({ errMsg: 'request:fail timeout' }); }, 0);
    }
    fetch(opts.url, { method: opts.method || 'GET', headers: opts.header || {} })
      .then(function (r) { return r.json(); })
      .then(function (data) { opts.success && opts.success({ statusCode: 200, data: data }); })
      .catch(function (e) { opts.fail && opts.fail({ errMsg: 'request:fail ' + e.message }); });
  }
};
global.getCurrentPages = function () { return []; };

const CFG = require('../../utils/config.js');
const store = require('../../utils/store.js');
const contentClient = require('../../utils/content-client.js');
const overlay = require('../../utils/content-overlay.js');
const remote = require('../../utils/agent-remote.js');
const teas = require('../../data/teas.js');
const CONSTITUTIONS = require('../../data/constitutions.js');

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

async function main() {
  const PORT = await freePort();
  const BASE = 'http://127.0.0.1:' + PORT;

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'src', 'index.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STORAGE_DIR: TMP,
      ADMIN_TOKEN: TOKEN,
      LOG_LEVEL: 'silent',
      LLM_API_KEY: ''
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const childLog = [];
  child.stdout.on('data', function (d) { childLog.push(String(d)); });
  child.stderr.on('data', function (d) { childLog.push(String(d)); });

  try {
    await waitHealthy(BASE);
    CFG.API_BASE = BASE;
    console.log('服务端子进程就绪：' + BASE);

    console.log('\n【合规：未经单独同意 → 一律不外发】');
    // 还原一个「老版本残留」的场景：AI 开关是开的，但从未做过单独同意
    store.setAiEnabled(true);
    ok('未同意时 getAiEnabled 仍为 false', store.getAiEnabled() === false, store.getAiEnabled());
    const beforeConsent = requestCount;
    const rConsent = await contentClient.refresh();
    ok('状态 skipped', rConsent.status === 'skipped' && rConsent.reason === 'ai-disabled', rConsent.status);
    ok('没有发出网络请求', requestCount === beforeConsent);
    // 模拟用户在对话页点「同意并开启」
    store.setAiConsent(true);
    ok('同意后开关才生效', store.getAiEnabled() === true, store.getAiEnabled());

    console.log('\n【首次启动：无缓存 → 用内置内容】');
    let r = contentClient.bootstrap();
    ok('未套用缓存', r.applied === false, r.reason);
    ok('仍是内置茶方 18 款', teas.total === 18, teas.total);
    ok('本进程内容版本为 0', overlay.getVersion() === 0, overlay.getVersion());

    console.log('\n【后台发布新内容（改一款文案 + 新增一款茶方）】');
    const got = await (await fetch(BASE + '/api/admin/content/teas', { headers: { Authorization: 'Bearer ' + TOKEN } })).json();
    const list = got.value;
    list[0].subtitle = '疏肝和胃 · 后端下发版';
    const nano = JSON.parse(JSON.stringify(list[0]));
    nano.id = 'smoke-new-tea';
    nano.name = '自检新茶';
    nano.subtitle = '新增茶方 · 下发验证';
    list.push(nano);
    const pub = await (await fetch(BASE + '/api/admin/content/teas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ value: list, actor: 'client-smoke' })
    })).json();
    ok('发布成功', pub.ok, 'v' + pub.version);
    ok('本进程仍是内置内容（端服确实分离）', teas.total === 18, teas.total);

    console.log('\n【小程序拉取更新 → 立即生效】');
    r = await contentClient.refresh();
    ok('状态 applied', r.status === 'applied', r.reason || ('v' + r.version));
    ok('茶方变成 19 款', teas.total === 19, teas.total);
    ok('新茶方可被检索到', !!teas.get('smoke-new-tea'), (teas.get('smoke-new-tea') || {}).name);
    ok('改写的副标题已生效', teas.get(list[0].id).subtitle === '疏肝和胃 · 后端下发版', teas.get(list[0].id).subtitle);
    ok('内容已写入缓存', !!store.getContentCache() && store.getContentCache().version === pub.version,
      JSON.stringify(store.getContentCache() && store.getContentCache().version));

    console.log('\n【版本相同 → 不再重复下发 payload】');
    r = await contentClient.refresh();
    ok('状态 unchanged', r.status === 'unchanged', r.status);

    console.log('\n【模拟重启 → 同步套用缓存】');
    r = contentClient.bootstrap();
    ok('套用成功', r.applied === true, 'v' + r.version);
    ok('仍是下发后的内容', teas.total === 19 && teas.get(list[0].id).subtitle === '疏肝和胃 · 后端下发版');

    console.log('\n【服务端不可达 → 静默降级，内容不受影响】');
    forceNetworkFail = true;
    r = await contentClient.refresh();
    ok('状态 failed', r.status === 'failed', r.reason);
    ok('内容保持不变', teas.total === 19 && teas.get('smoke-new-tea').name === '自检新茶');
    ok('status() 记录了原因', contentClient.status().lastError.indexOf('request:fail') > -1, contentClient.status().lastError);
    forceNetworkFail = false;

    console.log('\n【用户关闭 AI 增强 → 不发任何请求】');
    store.setAiEnabled(false);
    const before = requestCount;
    r = await contentClient.refresh();
    ok('状态 skipped', r.status === 'skipped' && r.reason === 'ai-disabled', r.status);
    ok('没有发出网络请求', requestCount === before);
    store.setAiEnabled(true);

    console.log('\n【缓存被写坏 → 清缓存回落内置内容，不崩】');
    store.setContentCache({ version: 99, payload: 'not-an-object' });
    r = contentClient.bootstrap();
    ok('识别为脏数据', r.applied === false && r.reason === 'no-cache', r.reason);
    store.setContentCache({ version: 99, payload: { teas: 'broken' } });
    r = contentClient.bootstrap();
    ok('结构损坏也不崩', typeof r.version === 'number', 'v' + r.version);

    console.log('\n【缺失的字段类型保持原值】');
    store.clearContentCache();
    const onlyTeas = await (await fetch(BASE + '/api/content')).json();
    store.setContentCache({ version: 100, updatedAt: Date.now(), payload: { teas: onlyTeas.payload.teas } });
    r = contentClient.bootstrap();
    ok('套用成功', r.applied === true, 'v' + r.version);
    ok('茶方被覆盖', teas.total === 19, teas.total);
    ok('体质库未被清空', CONSTITUTIONS.list.length === 9, CONSTITUTIONS.list.length);

    console.log('\n【清除本地数据 → 会话与 AI 授权一并复位】');
    const sidBefore = store.getSessionId();
    store.setProfile({ constitutionId: 'pinghe' });
    store.clearAll();
    ok('会话 id 已更换', store.getSessionId() !== sidBefore, store.getSessionId());
    ok('AI 授权已撤销', store.getAiConsent() === false && store.getAiEnabled() === false);
    ok('档案已清空', store.getProfile() === null);

    console.log('\n【上行档案最小化：原始填报值不出端】');
    const minimal = remote._minimalProfile({
      constitutionId: 'tanshi',
      secondaryId: 'qixu',
      percent: 63,
      levelText: '倾向明显',
      basic: {
        gender: '女', age: '28-35', stage: '孕期',
        conditions: ['高血压'], allergy: '青霉素', tastes: ['清淡']
      }
    });
    const dumped = JSON.stringify(minimal);
    ok('保留体质类型', minimal.constitutionId === 'tanshi', minimal.constitutionId);
    ok('保留兼夹与倾向度', minimal.secondaryId === 'qixu' && minimal.percent === 63);
    ok('不含 basic 字段', !minimal.basic);
    ok('不含性别原文', dumped.indexOf('女') === -1);
    ok('不含年龄段原文', dumped.indexOf('28-35') === -1);
    ok('不含特殊阶段原文', dumped.indexOf('孕期') === -1);
    ok('不含慢性病原文', dumped.indexOf('高血压') === -1);
    ok('不含过敏史原文', dumped.indexOf('青霉素') === -1);
    ok('同类信息降维为风险标记',
      minimal.risk.stage === true && minimal.risk.chronic === true && minimal.risk.allergy === true,
      JSON.stringify(minimal.risk));
    ok('无档案时不构造空对象', remote._minimalProfile(null) === null);
    ok('无体质 id 时返回 null', remote._minimalProfile({ basic: { allergy: 'x' } }) === null);
    const clean = remote._minimalProfile({ constitutionId: 'pinghe', basic: { stage: '无', conditions: ['以上都没有'] } });
    ok('无风险项时不带 risk 键', clean.risk === undefined, JSON.stringify(clean));
  } finally {
    child.kill();
    await new Promise(function (res) { setTimeout(res, 300); });
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    if (process.env.DEBUG_CHILD) console.log('\n--- 子进程输出 ---\n' + childLog.join(''));
  }

  console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('测试异常：' + (e && e.stack || e));
  process.exit(1);
});
