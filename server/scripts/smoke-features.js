/**
 * 三项新功能的回归自检：体感反馈 / 自定义症状 / 对话结束推送科普。
 *
 * 分两段跑：
 *   A. 进程内直接调工具层（analyze_symptom、recall_feedback、knowledgeBlock）——
 *      快，且能断言工具返回的结构本身。
 *   B. 起一个真实服务端子进程 + 假大模型端点，抓服务端**真实发出的请求体**与
 *      真实响应体来断言 —— 这样验的是最终事实，而不是中间变量。
 *
 * 为什么 B 段必须存在：体感记录会经过「端上最小化 → 服务端净化 → 拼进提示词」
 * 三道处理，只测纯函数无法证明「用户写的自由描述没有常驻进提示词」。
 *
 * 运行：node server/scripts/smoke-features.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TMP = path.join(os.tmpdir(), 'chalifang-features-test-' + Date.now());

/** 唯一哨兵：体感备注里的自由描述，绝不可以出现在常驻提示词中 */
const NOTE_SENTINEL = 'A9-备注原文-不得进常驻提示词';

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + extra : ''));
}
function section(t) { console.log('\n【' + t + '】'); }

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

/**
 * 会调工具的假大模型端点。
 *
 * 脚本规则（按最后一条用户消息的长度判断）：
 *   - 长消息（真问题，如「我之前喝的那个怎么样了」）→ 先回一轮 tool_calls
 *     （recommend_tea + search_knowledge），被喂了工具结果后再回一段白话；
 *   - 短消息（「你好」这类）→ 直接回白话，不调工具。
 * 这样一次请求就能覆盖「工具块 → 科普推送」的完整链路，
 * 同时留出一个「什么都没发生」的轮次用于验证不推空卡。
 */
function startMockLlm() {
  const captured = [];
  const server = http.createServer(function (req, res) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      captured.push(raw);
      let body = {};
      try { body = JSON.parse(raw); } catch (e) { /* ignore */ }
      const msgs = body.messages || [];
      const hasToolResult = msgs.some(function (m) { return m.role === 'tool'; });
      const lastUser = msgs.slice().reverse().filter(function (m) { return m.role === 'user'; })[0] || {};
      const substantive = String(lastUser.content || '').length > 6;

      let message;
      if (substantive && !hasToolResult) {
        message = {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_a', type: 'function', function: { name: 'recommend_tea', arguments: '{"focus_tags":["sleep"],"count":2}' } },
            { id: 'call_b', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"陈皮 茯苓 百合"}' } }
          ]
        };
      } else {
        message = { role: 'assistant', content: '好，我看看你之前记录的情况。' };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        choices: [{ index: 0, message: message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }]
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

/* ================= A. 进程内：工具层 ================= */

async function testTools() {
  const tools = require('../src/tools.js');
  const TEAS = require('../../data/teas.js');

  section('自定义症状：analyze_symptom 只给方向、不给茶方');
  const a1 = await tools.run('analyze_symptom', { text: '眼睛干痒，看屏幕久了更明显' }, {});
  ok('识别出方向', a1.result.ok === true, JSON.stringify(a1.result.label));
  ok('给出候选体质', Array.isArray(a1.result.directions) && a1.result.directions.length > 0,
    a1.result.directions && a1.result.directions.map(function (d) { return d.constitutionName; }).join('/'));
  ok('候选带鉴别要点', !!(a1.result.directions[0] && a1.result.directions[0].distinguish));
  // 「推荐茶方只有一条路径」这个不变量：analyze_symptom 不得下发 teas 卡片
  ok('不直接下发茶方卡片', !a1.blocks.some(function (b) { return b.type === 'teas'; }));
  ok('结果里给出明确的下一步指令', /recommend_tea|问清/.test(String(a1.result.instruction)));

  const a2 = await tools.run('analyze_symptom', { text: '睡不好，总是做梦' }, {});
  ok('多方向时给出快捷选项', a2.blocks.some(function (b) { return b.type === 'chips' && b.items.length > 1; }));
  ok('多方向时指令要求先问清', /不要在这一轮直接给出茶方/.test(String(a2.result.instruction)));

  const a3 = await tools.run('analyze_symptom', { text: '我这台电脑好像坏了' }, {});
  ok('识别不出时不硬编方向', a3.result.ok === false, a3.result.reason);
  ok('识别不出时指引去检索知识库', /search_knowledge/.test(String(a3.result.hint)));
  const a4 = await tools.run('analyze_symptom', { text: '   ' }, {});
  ok('空文本被拦下', a4.result.ok === false);

  section('体感反馈：recall_feedback');
  const tea = TEAS.list[0];
  const ctxFb = {
    profile: { constitutionId: tea.constitution },
    feedback: [
      { teaId: tea.id, teaName: tea.name, constitutionId: tea.constitution, effect: 'worse', feelings: ['hot', 'BOGUS'], note: '喝完有点燥' },
      { teaId: 'other-1', teaName: '别的茶', effect: 'better', feelings: ['sleep'] }
    ]
  };
  const f1 = await tools.run('recall_feedback', {}, ctxFb);
  ok('读到记录', f1.result.ok === true && f1.result.records.length === 2, f1.result.records.length);
  ok('非法枚举被降级过滤', f1.result.records[0].feelings.indexOf('BOGUS') === -1);
  ok('偏好里含要避开的茶方', f1.result.preference.avoidTeas.indexOf(tea.id) > -1,
    JSON.stringify(f1.result.preference.avoidTeas));
  ok('偏好里注明「不承诺效果」', /不要向用户承诺任何效果/.test(String(f1.result.preference.note)));
  ok('下发一条可读的文本块', f1.blocks.some(function (b) { return b.type === 'text' && b.text.indexOf(tea.name) > -1; }));
  ok('结果里包含用户备注（工具结果可以带）', JSON.stringify(f1.result).indexOf('喝完有点燥') > -1);

  const f2 = await tools.run('recall_feedback', { tea_id: '不存在的茶' }, ctxFb);
  ok('按茶方过滤后为空', f2.result.records.length === 0);

  const f3 = await tools.run('recall_feedback', {}, { feedback: [] });
  ok('没有记录时不编造', f3.result.records.length === 0 && /还没有记录/.test(String(f3.result.hint)));

  section('科普推送块');
  const kb = tools.knowledgeBlock({ title: '顺带了解', subtitle: 'x', items: [{ kind: 'faq', id: '1', title: 'q', desc: 'd', tag: '常识' }], topicKey: 'k' });
  ok('正常块能构造', kb && kb.type === 'knowledge');
  ok('空块返回 null（不推空卡）', tools.knowledgeBlock({ items: [] }) === null);
  ok('undefined 返回 null', tools.knowledgeBlock(null) === null);

  section('安全铁律：反馈只改排序，绝不放宽风险档位');
  const engine = require('../../utils/engine.js');
  const TEAS2 = require('../../data/teas.js');
  const basic = { stage: '孕期', conditions: [], allergy: '', menses: '', drugs: [], supps: [] };
  const base = engine.recommendFull('qiyu', { season: '秋', limit: 5, basic: basic });
  ok('孕期下确有被排除的茶方（阳性对照）', base.blocked.length > 0,
    base.blocked.map(function (b) { return b.tea.id + '(' + (b.risk && b.risk.level) + ')'; }).join(','));
  // 把所有茶方的反馈权重都拉满，看能不能把「忌用」的抬回推荐池
  const maxBias = { boost: {}, penalty: {}, dislikedTeas: [] };
  TEAS2.list.forEach(function (t) { maxBias.boost[t.id] = 20; });
  const boosted = engine.recommendFull('qiyu', { season: '秋', limit: 5, basic: basic, feedback: maxBias });
  const blockedIds = base.blocked.map(function (b) { return b.tea.id; });
  const leaked = boosted.picks.filter(function (t) { return blockedIds.indexOf(t.id) > -1; });
  ok('极端正向反馈也抬不回「禁用/忌用」', leaked.length === 0,
    leaked.map(function (t) { return t.id; }).join(','));
  ok('被排除项仍如实返回给上层（不静默丢弃）', boosted.blocked.length === base.blocked.length);

  // 反馈确实生效（否则上一条断言是「模式没匹配上」的假绿）
  const plain = engine.recommend('qiyu', { season: '秋', limit: 5 });
  const pen = { boost: {}, penalty: {}, dislikedTeas: [] };
  pen.penalty[plain[0].id] = 20;
  const penalized = engine.recommend('qiyu', { season: '秋', limit: 5, feedback: pen });
  ok('负向反馈确实改变排序（阳性对照）',
    penalized.map(function (t) { return t.id; }).join(',') !== plain.map(function (t) { return t.id; }).join(','));
  ok('被降权的茶方不再排首位', penalized[0].id !== plain[0].id);
}

/* ================= B. 端到端：接口与提示词 ================= */

async function testEndpoints() {
  const PORT = await freePort();
  const BASE = 'http://127.0.0.1:' + PORT;
  const mock = await startMockLlm();

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'src', 'index.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STORAGE_DIR: TMP,
      ADMIN_TOKEN: 'features-test-token-abcdef123456',
      LOG_LEVEL: 'silent',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'http://127.0.0.1:' + mock.port + '/v1',
      LLM_MODEL: 'mock-model',
      LLM_THINKING: '',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_CHAT_MAX: '50',
      RATE_LIMIT_API_MAX: '200'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const childLog = [];
  child.stdout.on('data', function (d) { childLog.push(String(d)); });
  child.stderr.on('data', function (d) { childLog.push(String(d)); });

  const TEAS = require('../../data/teas.js');
  const tea = TEAS.list[0];

  try {
    await waitHealthy(BASE);
    console.log('服务端子进程就绪：' + BASE);

    section('POST /api/agent/feedback');
    const miss = await postJSON(BASE + '/api/agent/feedback', { sessionId: 'f1', effect: 'better' });
    ok('缺茶方标识 → 400', miss.status === 400, miss.status);

    const rec = await postJSON(BASE + '/api/agent/feedback', {
      sessionId: 'f1',
      teaId: tea.id,
      teaName: tea.name,
      constitutionId: tea.constitution,
      effect: 'worse',
      feelings: ['hot', '完全不存在的感受'],
      note: NOTE_SENTINEL
    });
    const recBody = await rec.json();
    ok('记录成功 → 200', rec.status === 200 && recBody.ok === true, rec.status);
    ok('会话内计数为 1', recBody.count === 1, recBody.count);
    ok('返回要避开的茶方', recBody.preference.avoidTeas.indexOf(tea.id) > -1,
      JSON.stringify(recBody.preference.avoidTeas));
    ok('响应体不回显备注原文', JSON.stringify(recBody).indexOf(NOTE_SENTINEL) === -1);

    const bad = await postJSON(BASE + '/api/agent/feedback', {
      sessionId: 'f1', teaId: tea.id, teaName: tea.name, effect: '这个档位不存在'
    });
    ok('非法感受档位被降级而不是 400', bad.status === 200, bad.status);

    section('体感记录进入提示词，但备注原文不进去');
    const chat = await postJSON(BASE + '/api/agent/chat.json', {
      sessionId: 'f1',
      message: '我之前喝的那个怎么样了',
      profile: { constitutionId: tea.constitution, percent: 66, levelText: '倾向明显' }
    });
    const chatBody = await chat.json();
    ok('对话成功返回', chat.status === 200 && chatBody.ok === true, chat.status);

    const sent = mock.captured[mock.captured.length - 1] || '';
    ok('确有请求送达模型', sent.length > 0);
    ok('偏好茶方：出现过不适反应的茶方进了提示词',
      sent.indexOf(tea.name) > -1, tea.name);
    ok('档位被翻译成中文（不是 better/worse 原值）',
      sent.indexOf('不太舒服') > -1);
    ok('非法感受档位没有进提示词', sent.indexOf('完全不存在的感受') === -1);
    ok('备注原文未进常驻提示词', sent.indexOf(NOTE_SENTINEL) === -1);
    ok('提示词里写明「不可当作疗效」', sent.indexOf('不可当作疗效') > -1);
    ok('提示词里保留了工具提示', sent.indexOf('recall_feedback') > -1);

    section('对话结束推送科普块');
    const kbBlocks = (chatBody.blocks || []).filter(function (b) { return b.type === 'knowledge'; });
    ok('随响应下发 knowledge 块', kbBlocks.length === 1, kbBlocks.length);
    const block = kbBlocks[0] || { items: [] };
    ok('块里有条目', block.items.length > 0, block.items.length);
    ok('每条都带 kind/id（端上要靠它跳详情页）',
      block.items.every(function (i) { return !!i.kind && !!i.id; }),
      JSON.stringify(block.items.map(function (i) { return i.kind + ':' + i.id; })));
    ok('kind 只能是可跳转的三类',
      block.items.every(function (i) { return ['ingredient', 'constitution', 'faq'].indexOf(i.kind) > -1; }));
    ok('带 topicKey 供端上去重', !!block.topicKey);
    ok('茶方卡片不作为科普重复推',
      !block.items.some(function (i) { return i.type === 'tea'; }));
    // 证明「联动知识库」不是空话：推送里必须含有本轮真实检索到的食材
    const KNOWN_ING = require('../../data/knowledge.js').ingredients.map(function (i) { return i.id; });
    const fromRag = block.items.filter(function (i) {
      return i.kind === 'ingredient' && KNOWN_ING.indexOf(i.id) > -1;
    });
    ok('推送里含本轮检索到的食材条目（实时联动 RAG）', fromRag.length > 0,
      JSON.stringify(fromRag.map(function (i) { return i.title; })));
    ok('本轮确实调过工具（工具块已被渲染）',
      (chatBody.blocks || []).some(function (b) { return b.type === 'teas'; }));

    section('无档案也能给出科普（不推空卡）');
    const plain = await postJSON(BASE + '/api/agent/chat.json', {
      sessionId: 'f2', message: '你好'
    });
    const plainBody = await plain.json();
    ok('请求成功', plain.status === 200, plain.status);
    ok('问候轮不硬塞科普（无茶方无档案时由端上兜底）',
      (plainBody.blocks || []).filter(function (b) { return b.type === 'knowledge'; }).length === 0);
  } finally {
    child.kill();
    mock.server.close();
    await new Promise(function (res) { setTimeout(res, 300); });
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    if (process.env.DEBUG_CHILD) console.log('\n--- 子进程输出 ---\n' + childLog.join(''));
  }
}

async function main() {
  await testTools();
  await testEndpoints();
  console.log(failed ? '\n✗ 失败 ' + failed + ' 项' : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('自检异常：' + e.message + '\n' + (e.stack || ''));
  process.exit(1);
});
