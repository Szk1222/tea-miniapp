/**
 * 离线 Mock 大模型（仅用于本地联调，不要上生产）。
 *
 * 实现 OpenAI 兼容的 /v1/chat/completions 流式协议，并按关键词决定是否发起
 * Function Call，用来在没有 API Key 的情况下验证完整链路：
 *   流式增量 → tool_calls 增量拼接 → 工具执行 → 二次调用收口 → 出站净化
 *
 * 用法：
 *   node scripts/mock-llm.js                       # 默认 8790
 *   LLM_BASE_URL=http://127.0.0.1:8790/v1 LLM_API_KEY=mock node src/index.js
 */
const http = require('http');

const PORT = parseInt(process.env.MOCK_PORT || '8790', 10);

// 模拟豆包 seed 系列的深度思考输出：真实模型会把思考过程放在 delta.reasoning_content，
// 服务端必须只计数、不下发。开启方式：MOCK_REASONING=1
const EMIT_REASONING = process.env.MOCK_REASONING === '1';

function reply(res, obj) {
  res.write('data: ' + JSON.stringify(obj) + '\n\n');
}

function reasoningChunks(res, text) {
  if (!EMIT_REASONING) return;
  const parts = text.match(/.{1,4}/g) || [];
  parts.forEach(function (p) { reply(res, chunk({ reasoning_content: p })); });
}

function chunk(delta, finish) {
  return {
    id: 'mock-' + Date.now(),
    object: 'chat.completion.chunk',
    model: process.env.MOCK_MODEL || 'mock-llm',
    choices: [{ index: 0, delta: delta, finish_reason: finish || null }]
  };
}

/** 由最后一条用户消息决定调用哪个工具 */
function decide(messages) {
  const hasToolResult = messages.some(function (m) { return m.role === 'tool'; });
  if (hasToolResult) return { kind: 'final' };

  const user = messages.slice().reverse().filter(function (m) { return m.role === 'user'; })[0];
  const text = (user && user.content) || '';

  // 通用工具分支：让 scripts/check-llm.js 的自检也能离线跑通
  if (/(天气|气温|下雨)/.test(text)) {
    return { kind: 'tool', name: 'get_weather', args: { city: '北京' } };
  }

  if (/(湿气|沉重|祛湿|浮肿)/.test(text)) {
    return { kind: 'tool', name: 'recommend_tea', args: { focus_tags: ['damp'], count: 2, reason: '用户描述湿气重' } };
  }
  if (/(黄芪|麦冬|枸杞|茯苓|陈皮|生姜)/.test(text)) {
    return { kind: 'tool', name: 'search_knowledge', args: { query: text } };
  }
  if (/(换一批|别的|还有吗|其他)/.test(text)) {
    return { kind: 'tool', name: 'recommend_tea', args: { count: 2 } };
  }
  if (/(怕冷|手脚凉|暖身)/.test(text)) {
    return { kind: 'tool', name: 'recommend_tea', args: { focus_tags: ['cold'], count: 2 } };
  }
  if (/(测评|测试|测一测)/.test(text)) {
    return { kind: 'tool', name: 'start_assessment', args: {} };
  }
  return { kind: 'tool', name: 'recommend_tea', args: { count: 2 } };
}

/** 收口文案：故意保留几个违规词，用于验证出站净化是否生效 */
function finalText(messages) {
  const tools = messages.filter(function (m) { return m.role === 'tool'; }).map(function (m) { return m.name; });
  if (tools.indexOf('search_knowledge') > -1) {
    return '这一味是常见的药食同源食材，性味平和，日常少量代茶即可。它属于长期缓慢的调理，不是速效，喝几天停一停更稳妥。这款茶可以治疗一些日常不适，但效果百分百是不现实的。';
  }
  return '我看你提到的情况，方向上更接近日常祛湿的调理思路，茶饮只是辅助，关键还是作息和少碰冰饮。给你挑了下面这两款，都比较清爽，上午喝更合适。另外提醒一下，这类茶不能根治问题，坚持喝才有意义。';
}

const server = http.createServer(function (req, res) {
  if (req.url.indexOf('/embeddings') > -1) {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      let input = [];
      try { input = JSON.parse(body).input || []; } catch (e) { input = []; }
      if (typeof input === 'string') input = [input];
      const data = input.map(function (t, i) {
        // 用 charCode 拼一个确定的伪向量，保证同文本得到同向量
        const v = new Array(32).fill(0);
        for (let k = 0; k < t.length; k++) v[k % 32] += t.charCodeAt(k) / 1000;
        return { index: i, embedding: v };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: data }));
    });
    return;
  }

  if (req.url.indexOf('/chat/completions') === -1) {
    res.writeHead(404).end('{}');
    return;
  }

  let body = '';
  req.on('data', function (c) { body += c; });
  req.on('end', function () {
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) { /* ignore */ }
    const messages = payload.messages || [];
    const plan = decide(messages);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    if (plan.kind === 'final') {
      reasoningChunks(res, '用户问的是养生方向，我要基于工具返回的内容回答，注意不能出现治疗类的说法。');
      const text = finalText(messages);
      let i = 0;
      const timer = setInterval(function () {
        if (i >= text.length) {
          clearInterval(timer);
          reply(res, chunk({}, 'stop'));
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        reply(res, chunk({ content: text.slice(i, i + 3) }));
        i += 3;
      }, 12);
      return;
    }

    // 先输出一句自然语言，再发起工具调用（覆盖「文本 + tool_calls 同一轮」的场景）
    reasoningChunks(res, '需要先调用工具拿到事实，再组织语言，不能自己编茶方。');
    const lead = '我看看你这边的具体情况，稍等。';
    let i = 0;
    const leadTimer = setInterval(function () {
      if (i >= lead.length) {
        clearInterval(leadTimer);
        // 故意把 arguments 拆成多个增量，验证服务端的 json 拼接
        reply(res, chunk({ tool_calls: [{ index: 0, id: 'call_mock_1', type: 'function', function: { name: plan.name, arguments: '' } }] }));
        const args = JSON.stringify(plan.args);
        const half = Math.ceil(args.length / 2);
        reply(res, chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, half) } }] }));
        setTimeout(function () {
          reply(res, chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] }));
          reply(res, chunk({}, 'tool_calls'));
          res.write('data: [DONE]\n\n');
          res.end();
        }, 30);
        return;
      }
      reply(res, chunk({ content: lead.slice(i, i + 2) }));
      i += 2;
    }, 15);
  });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('mock llm → http://127.0.0.1:' + PORT + '/v1  (仅本地联调)');
});
