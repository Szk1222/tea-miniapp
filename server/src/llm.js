/**
 * 大模型客户端（OpenAI 兼容协议 /chat/completions、/embeddings）。
 *
 * 默认对接**火山方舟（豆包）**：baseUrl = https://ark.cn-beijing.volces.com/api/v3。
 * 只依赖 Node 内置的 fetch 与 ReadableStream，无第三方 SDK，
 * 因此任何提供 OpenAI 兼容接口的厂商（豆包 / OpenAI / DeepSeek / 通义 / 智谱 / 本地 vLLM…）
 * 都只需改 LLM_BASE_URL 与 LLM_MODEL 两个环境变量。
 *
 * 豆包相关的两处特殊处理（防坑）：
 * 1) thinking 字段是方舟私有参数，用 LLM_THINKING 显式控制是否注入，
 *    避免换厂商时因多余字段被网关拒绝（400）。
 * 2) seed 系列开启深度思考时，思考过程从 delta.reasoning_content 回来，
 *    这里只计数、不下发，防止端上把「内心独白」当正文渲染。
 *
 * 流式解析要点：SSE 的 chunk 边界不保证落在行尾，必须留残余缓冲。
 */
const cfg = require('./config.js');

class LLMError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'LLMError';
    this.status = status || 502;
  }
}

function withTimeout(ms, external) {
  const ac = new AbortController();
  const timer = setTimeout(function () {
    ac.abort(new Error('LLM 请求超时'));
  }, ms);
  if (external) {
    if (external.aborted) ac.abort();
    else external.addEventListener('abort', function () { ac.abort(); }, { once: true });
  }
  return { signal: ac.signal, clear: function () { clearTimeout(timer); } };
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + cfg.llm.apiKey
  };
}

/**
 * 注入厂商私有参数。
 * - thinking：豆包 seed 系列用它开/关深度思考。这是方舟私有字段，透传给其他网关会 400，
 *   所以由 LLM_THINKING 显式决定是否注入（auto 表示不注入，交给模型默认行为）。
 * - extraBody：任意额外字段的逃生舱，用来兜各家自己的参数。
 */
function decorateBody(body) {
  if (cfg.llm.thinking && cfg.llm.thinking !== 'auto') {
    body.thinking = { type: cfg.llm.thinking };
  }
  if (cfg.llm.extraBody) {
    Object.keys(cfg.llm.extraBody).forEach(function (k) {
      body[k] = cfg.llm.extraBody[k];
    });
  }
  return body;
}

function assertReady() {
  if (!cfg.llm.apiKey) {
    throw new LLMError('未配置 LLM_API_KEY，请参考 server/.env.example 配置后重启服务。', 500);
  }
}

/**
 * 流式对话（支持 Function Call）
 * @returns {Promise<{content:string, toolCalls:Array, finishReason:string, usage:object}>}
 */
async function chatStream(opts) {
  assertReady();
  const messages = opts.messages;
  const tools = opts.tools || [];
  const onDelta = opts.onDelta || function () {};

  const body = decorateBody({
    model: cfg.llm.model,
    messages: messages,
    stream: true,
    temperature: cfg.llm.temperature,
    max_tokens: cfg.llm.maxTokens
  });
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const t = withTimeout(cfg.llm.timeoutMs, opts.signal);
  let res;
  try {
    res = await fetch(cfg.llm.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: t.signal
    });
  } catch (e) {
    t.clear();
    throw new LLMError('连接大模型失败：' + e.message, 502);
  }

  if (!res.ok) {
    t.clear();
    const text = await res.text().catch(function () { return ''; });
    // 原样透传上游状态码：401 / 404 / 429 的区分对排障很关键
    // （404 通常不是网络问题，而是模型未开通或 Model ID 写错）
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw new LLMError('大模型返回 ' + res.status + '：' + text.slice(0, 300), status);
  }

  const contentType = res.headers.get('content-type') || '';

  // 某些网关忽略 stream=true，直接返回一次性 JSON，这里做兼容
  if (contentType.indexOf('application/json') > -1 && contentType.indexOf('event-stream') === -1) {
    t.clear();
    const json = await res.json();
    const msg = (json.choices && json.choices[0] && json.choices[0].message) || {};
    if (msg.content) onDelta(msg.content);
    return {
      content: msg.content || '',
      toolCalls: normalizeToolCalls(msg.tool_calls),
      finishReason: (json.choices && json.choices[0] && json.choices[0].finish_reason) || 'stop',
      usage: json.usage || null,
      reasoningChars: (msg.reasoning_content || '').length
    };
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let reasoningChars = 0;
  let finishReason = 'stop';
  const toolAcc = {};

  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.charAt(0) === ':') continue;
        if (line.indexOf('data:') !== 0) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        let json;
        try { json = JSON.parse(payload); } catch (e) { continue; }
        const choice = json.choices && json.choices[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta || {};
        // 豆包 seed 等推理模型会把思考过程放在 delta.reasoning_content 里。
        // 这不是正文，绝不能 onDelta 给用户，否则端上会看到一大段内心独白。
        // 只累计字符数用于 meta 观测；同一 chunk 可能同时带正文，所以不能 continue。
        if (delta.reasoning_content) reasoningChars += delta.reasoning_content.length;
        if (delta.content) {
          content += delta.content;
          onDelta(delta.content);
        }
        if (delta.tool_calls) {
          delta.tool_calls.forEach(function (tc) {
            const idx = tc.index === undefined ? 0 : tc.index;
            if (!toolAcc[idx]) toolAcc[idx] = { id: '', name: '', args: '' };
            if (tc.id) toolAcc[idx].id = tc.id;
            if (tc.function && tc.function.name) toolAcc[idx].name += tc.function.name;
            if (tc.function && tc.function.arguments) toolAcc[idx].args += tc.function.arguments;
          });
        }
      }
    }
  } finally {
    t.clear();
  }

  return {
    content: content,
    toolCalls: finishToolCalls(toolAcc),
    finishReason: finishReason,
    usage: null,
    reasoningChars: reasoningChars
  };
}

function finishToolCalls(acc) {
  return Object.keys(acc)
    .sort(function (a, b) { return Number(a) - Number(b); })
    .map(function (k) {
      const c = acc[k];
      return { id: c.id || 'call_' + k, name: c.name, arguments: c.args || '{}' };
    })
    .filter(function (c) { return !!c.name; });
}

function normalizeToolCalls(list) {
  return (list || []).map(function (c) {
    return {
      id: c.id,
      name: c.function && c.function.name,
      arguments: (c.function && c.function.arguments) || '{}'
    };
  });
}

/** 非流式单轮调用，用于检索重排等内部场景 */
async function chatOnce(opts) {
  assertReady();
  const body = decorateBody({
    model: cfg.llm.model,
    messages: opts.messages,
    temperature: opts.temperature === undefined ? 0 : opts.temperature,
    max_tokens: opts.maxTokens || 400
  });
  if (opts.json) body.response_format = { type: 'json_object' };

  const t = withTimeout(opts.timeoutMs || cfg.llm.timeoutMs, null);
  try {
    const res = await fetch(cfg.llm.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: t.signal
    });
    if (!res.ok) throw new LLMError('大模型返回 ' + res.status, 502);
    const json = await res.json();
    return ((json.choices && json.choices[0] && json.choices[0].message) || {}).content || '';
  } finally {
    t.clear();
  }
}

/** 文本向量化，供 RAG 使用 */
async function embed(texts) {
  assertReady();
  const t = withTimeout(cfg.llm.timeoutMs, null);
  try {
    const res = await fetch(cfg.llm.baseUrl + '/embeddings', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: cfg.embedding.model, input: texts }),
      signal: t.signal
    });
    if (!res.ok) throw new LLMError('向量化接口返回 ' + res.status, 502);
    const json = await res.json();
    return (json.data || []).map(function (d) { return d.embedding; });
  } finally {
    t.clear();
  }
}

module.exports = {
  chatStream: chatStream,
  chatOnce: chatOnce,
  embed: embed,
  LLMError: LLMError
};
