/**
 * 茶历方 Agent 服务入口（零依赖，只用 Node 内置 http）。
 *
 * 接口一览
 *   GET  /health                     健康检查 + 索引状态
 *   POST /api/agent/chat             流式对话（text/event-stream）
 *   POST /api/agent/chat.json        非流式对话（便于联调 / 小程序降级）
 *   POST /api/agent/assess           体质量表评分（服务端复核）
 *   POST /api/agent/recommend        直接按条件取茶方
 *   POST /api/agent/retrieve         RAG 检索调试（展示召回与打分）
 *   GET  /api/agent/audit            最近的风控与工具调用留痕
 */
const http = require('http');
const { URL } = require('url');

const cfg = require('./config.js');
const llm = require('./llm.js');
const prompt = require('./prompt.js');
const tools = require('./tools.js');
const safety = require('./safety.js');
const session = require('./session.js');
const rag = require('./rag.js');

const engine = require('../../utils/engine.js');
const agent = require('../../utils/agent.js');
const CONSTITUTIONS = require('../../data/constitutions.js');
const TEAS = require('../../data/teas.js');

const STARTED_AT = Date.now();

/* ---------------- 通用工具 ---------------- */

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': cfg.corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > (limit || 256 * 1024)) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function publicCtx(ctx) {
  return { lastTeas: ctx.lastTeas || [], flags: ctx.flags || {} };
}

/* ---------------- 核心：Agent 编排 ---------------- */

/**
 * @param {object} body  { sessionId, message, profile, context }
 * @param {{onDelta:Function, onBlock:Function, onMeta:Function, signal:AbortSignal}} sink
 */
async function runAgent(body, sink) {
  const t0 = Date.now();
  const input = String(body.message || '').trim().slice(0, 500);
  const session_ = session.get(body.sessionId);
  const ctx = session_.ctx;

  if (body.profile && body.profile.constitutionId) ctx.profile = body.profile;
  if (body.context) {
    if (Array.isArray(body.context.lastTeas)) ctx.lastTeas = body.context.lastTeas;
    if (body.context.flags) ctx.flags = Object.assign({}, ctx.flags, body.context.flags);
  }

  const meta = {
    model: cfg.llm.model,
    mode: 'llm',
    sessionId: session_.id,
    retrieval: rag._state.embeddings ? 'hybrid' : 'sparse',
    chunks: rag._state.chunks.length
  };
  sink.onMeta && sink.onMeta(meta);

  if (!input) {
    sink.onBlock({ type: 'text', text: '你可以直接说说最近的感受，比如「总是没力气」「手脚冰凉」或者「最近老睡不好」。' });
    return { ctx: publicCtx(ctx), meta: meta, text: '' };
  }

  /* ---- 第一层：入站风控，命中即短路，不进模型 ---- */
  const blocked = safety.preCheck(input, ctx);
  if (blocked) {
    safety.audit('preCheck', { input: input }, blocked.reason);
    blocked.blocks.forEach(function (b) { sink.onBlock(b); });
    meta.mode = 'safety-short-circuit';
    meta.blocked = blocked.kind;
    meta.latencyMs = Date.now() - t0;
    return { ctx: publicCtx(ctx), meta: meta, text: blocked.blocks[0].text || '' };
  }

  /* ---- 组装消息 ---- */
  const hints = safety.riskHints(input, ctx);
  const system = prompt.SYSTEM_PROMPT +
    '\n\n【运行时上下文】\n' + prompt.runtimeContext(ctx) +
    (hints.length
      ? '\n\n注意：本轮检测到风险信号（' + hints.join('、') + '），请先调用 flag_risk 输出风险提示，再决定后续动作。'
      : '');

  const messages = [{ role: 'system', content: system }]
    .concat(session.history(session_))
    .concat([{ role: 'user', content: input }]);

  const sanitizer = safety.makeStreamSanitizer(function (txt) { sink.onDelta(txt); });
  const blocks = [];
  const calledTools = [];
  let fullText = '';
  let rounds = 0;
  let usedFallback = false;
  let reasoningChars = 0;

  try {
    while (rounds <= cfg.llm.maxToolRounds) {
      const r = await llm.chatStream({
        messages: messages,
        tools: tools.TOOLS,
        onDelta: function (d) { sanitizer.push(d); },
        signal: sink.signal
      });
      sanitizer.flush();
      if (r.content) fullText += r.content;
      reasoningChars += r.reasoningChars || 0;

      if (!r.toolCalls.length) break;

      messages.push({
        role: 'assistant',
        content: r.content || '',
        tool_calls: r.toolCalls.map(function (c) {
          return { id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } };
        })
      });

      for (let i = 0; i < r.toolCalls.length; i++) {
        const tc = r.toolCalls[i];
        const out = await tools.run(tc.name, tc.arguments, ctx);
        calledTools.push({ name: tc.name, ok: !!(out.result && out.result.ok) });
        out.blocks.forEach(function (b) {
          blocks.push(b);
          sink.onBlock(b);
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify(out.result).slice(0, 4000)
        });
      }
      rounds += 1;
    }

    // 工具轮次用尽仍未收口 → 强制一次「不带工具」的总结，保证有自然语言回答
    if (rounds > cfg.llm.maxToolRounds) {
      const final = await llm.chatStream({
        messages: messages.concat([{ role: 'system', content: '请基于上面的工具结果直接用中文回答用户，不要再调用工具。' }]),
        tools: [],
        onDelta: function (d) { sanitizer.push(d); },
        signal: sink.signal
      });
      sanitizer.flush();
      fullText += final.content || '';
      reasoningChars += final.reasoningChars || 0;
    }
  } catch (e) {
    safety.audit('llm:error', { input: input }, e.message);
    if (!fullText && !blocks.length) {
      // 模型不可用 → 回落本地规则引擎，用户侧无感
      usedFallback = true;
      const local = agent.respond(input, { profile: ctx.profile, lastTeas: ctx.lastTeas, flags: ctx.flags });
      ctx.lastTeas = local.ctx.lastTeas || ctx.lastTeas;
      ctx.flags = local.ctx.flags || ctx.flags;
      local.messages.forEach(function (m) {
        blocks.push(m);
        sink.onBlock(m);
      });
      meta.mode = 'local-fallback';
      meta.fallbackReason = e.message;
    } else {
      sink.onBlock({ type: 'text', text: '刚才的回答被中断了，你可以再问一次。' });
      meta.mode = 'llm-partial';
    }
  }

  /* ---- 出站：补免责声明 ---- */
  const hasNotice = blocks.some(function (b) {
    return b.type === 'notice' && String(b.text).indexOf(agent.DISCLAIMER) > -1;
  });
  // 只要本轮给了建议或查了知识（blocks 或工具调用非空），就必须补免责声明
  if ((blocks.length || calledTools.length) && !hasNotice && !usedFallback) {
    sink.onBlock({ type: 'notice', text: agent.DISCLAIMER, tone: 'warn' });
  }

  /* ---- 会话记忆 ---- */
  session.push(session_, 'user', input);
  if (fullText) session.push(session_, 'assistant', fullText);

  const cleanText = sanitizer.flush();
  meta.rounds = rounds;
  meta.tools = calledTools;
  meta.reasoningChars = reasoningChars;
  meta.sanitized = cleanText && cleanText.replaced ? cleanText.replaced : [];
  meta.latencyMs = Date.now() - t0;
  safety.audit('chat', { input: input, tools: calledTools }, { mode: meta.mode, blocks: blocks.map(function (b) { return b.type; }) });

  return { ctx: publicCtx(ctx), meta: meta, text: fullText };
}

/* ---------------- 路由 ---------------- */

async function handleChat(req, res, stream) {
  const body = await readBody(req);

  if (!stream) {
    const collected = { blocks: [], text: '', meta: null, ctx: null };
    const out = await runAgent(body, {
      onMeta: function (m) { collected.meta = m; },
      onDelta: function (d) { collected.text += d; },
      onBlock: function (b) { collected.blocks.push(b); }
    });
    collected.ctx = out.ctx;
    if (!collected.text && out.text) collected.text = out.text;
    return sendJSON(res, 200, { ok: true, ...collected });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': cfg.corsOrigin
  });

  const ac = new AbortController();
  let closed = false;
  req.on('close', function () { closed = true; ac.abort(); });

  const write = function (event, data) {
    if (closed) return;
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };

  try {
    const out = await runAgent(body, {
      signal: ac.signal,
      onMeta: function (m) { write('meta', m); },
      onDelta: function (d) { write('delta', { text: d }); },
      onBlock: function (b) { write('block', b); }
    });
    write('done', { ctx: out.ctx, meta: out.meta });
  } catch (e) {
    write('error', { message: e.message || '服务异常' });
  }
  res.end();
}

function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': cfg.corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (path === '/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      ok: true,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      provider: cfg.llm.baseUrl,
      model: cfg.llm.model,
      thinking: cfg.llm.thinking || 'auto',
      llmConfigured: !!cfg.llm.apiKey,
      index: { chunks: rag._state.chunks.length, vocab: Object.keys(rag._state.idf).length },
      retrieval: rag._state.embeddings ? 'hybrid(vector+keyword)' : 'sparse(tf-idf)',
      knowledge: { constitutions: CONSTITUTIONS.list.length, teas: TEAS.total },
      session: session.stats()
    });
  }

  if (path === '/api/agent/chat' && req.method === 'POST') {
    return handleChat(req, res, true).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/chat.json' && req.method === 'POST') {
    return handleChat(req, res, false).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/assess' && req.method === 'POST') {
    return readBody(req).then(function (body) {
      const answers = body.answers;
      if (!Array.isArray(answers) || !answers.length) {
        return sendJSON(res, 400, { ok: false, error: 'answers 必须是数组，元素为题项得分 0-4' });
      }
      const r = engine.analyze(answers);
      safety.audit('assess', { count: answers.length }, { main: r.main, percent: r.percent });
      return sendJSON(res, 200, { ok: true, result: r });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/recommend' && req.method === 'POST') {
    return readBody(req).then(function (body) {
      const cid = body.constitution_id || 'pinghe';
      if (!CONSTITUTIONS.get(cid)) return sendJSON(res, 400, { ok: false, error: '未知体质 id' });
      const list = engine.recommend(cid, {
        season: body.season || engine.seasonOf(),
        limit: Math.min(3, Math.max(1, body.count || 2)),
        exclude: body.exclude_ids || []
      });
      return sendJSON(res, 200, {
        ok: true,
        season: body.season || engine.seasonOf(),
        teas: list.map(function (t) {
          return { id: t.id, name: t.name, subtitle: t.subtitle, nature: t.nature, effects: t.effects, scenes: t.scenes };
        })
      });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/retrieve' && req.method === 'POST') {
    return readBody(req).then(function (body) {
      return rag.retrieve(body.query || '', { topK: body.top_k || ctxTopK() }).then(function (r) {
        return sendJSON(res, 200, { ok: true, mode: r.mode, query: r.query, hits: r.hits });
      });
    }).catch(function (e) { sendJSON(res, 400, { ok: false, error: e.message }); });
  }

  if (path === '/api/agent/audit' && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, items: safety.recentAudit(Number(url.searchParams.get('n') || 50)) });
  }

  if (path === '/api/agent/knowledge' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    return sendJSON(res, 200, {
      ok: true,
      ingredients: require('../../data/knowledge.js').ingredients.filter(function (i) {
        return !q || i.name.indexOf(q) > -1;
      })
    });
  }

  sendJSON(res, 404, { ok: false, error: '接口不存在：' + path });
}

function ctxTopK() { return cfg.retriever.topK; }

/* ---------------- 启动 ---------------- */

const server = http.createServer(function (req, res) {
  try {
    const maybe = route(req, res);
    if (maybe && typeof maybe.catch === 'function') {
      maybe.catch(function (e) { sendJSON(res, 500, { ok: false, error: e.message }); });
    }
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: e.message });
  }
});

if (require.main === module) {
  const idx = rag.buildIndex();
  console.log('知识索引构建完成：' + idx.chunks + ' 个 chunk / ' + idx.vocab + ' 个词项');

  if (cfg.embedding.enabled) {
    rag.buildEmbeddings(false)
      .then(function (r) { console.log('向量索引：' + (r.cached ? '命中缓存' : '已生成') + ' ' + r.count + ' 条'); })
      .catch(function (e) { console.warn('向量索引构建失败，退化为关键词检索：' + e.message); });
  }

  setInterval(function () {
    const n = session.prune();
    if (n) console.log('清理过期会话 ' + n + ' 个');
  }, 5 * 60 * 1000).unref();

  server.listen(cfg.port, cfg.host, function () {
    console.log('茶历方 Agent 服务 → http://' + cfg.host + ':' + cfg.port);
    console.log('模型：' + cfg.llm.model + (cfg.llm.apiKey ? '' : '（未配置 LLM_API_KEY，将走本地规则兜底）'));
  });
}

module.exports = { runAgent: runAgent, server: server };
