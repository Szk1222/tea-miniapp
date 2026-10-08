/**
 * 运行配置。全部来自环境变量，便于容器化部署与多环境切换。
 */
const path = require('path');

function env(key, fallback) {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(key, fallback) {
  const v = parseFloat(env(key, ''));
  return isNaN(v) ? fallback : v;
}

function json(key, fallback) {
  const raw = env(key, '');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[config] ' + key + ' 不是合法 JSON，已忽略：' + e.message);
    return fallback;
  }
}

module.exports = {
  port: parseInt(env('PORT', '8787'), 10),
  host: env('HOST', '0.0.0.0'),
  corsOrigin: env('CORS_ORIGIN', '*'),

  llm: {
    // 默认指向火山方舟（豆包）的 OpenAI 兼容端点。
    // 换厂商只改 .env，代码一行不动（见 .env.example 里的对照表）。
    baseUrl: env('LLM_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, ''),
    apiKey: env('LLM_API_KEY', ''),
    model: env('LLM_MODEL', 'doubao-seed-2-1-lite-260915'),
    temperature: num('LLM_TEMPERATURE', 0.3),
    // 默认 1024：豆包 seed 系列若开了深度思考，思考过程也计入 max_tokens，
    // 给太小会出现「思考完没 token 输出正文」的空回复。
    maxTokens: parseInt(env('LLM_MAX_TOKENS', '1024'), 10),
    timeoutMs: parseInt(env('LLM_TIMEOUT_MS', '20000'), 10),
    maxToolRounds: parseInt(env('LLM_MAX_TOOL_ROUNDS', '4'), 10),

    // 深度思考开关，取值 disabled | enabled | auto。
    // 这是豆包 seed 系列的私有字段（thinking.type）。养生茶场景不需要长链推理，
    // 关掉可显著降低首字延迟与 token 消耗。
    // 换到非豆包网关时请置空（LLM_THINKING=），否则可能被网关判为非法字段。
    thinking: env('LLM_THINKING', 'disabled'),

    // 逃生舱：任意额外请求体字段（JSON），用于各家私有参数，如 {"top_p":0.9}。
    // 优先级低于上面的显式配置，同名键会被它覆盖。
    extraBody: json('LLM_EXTRA_BODY', null)
  },

  embedding: {
    enabled: env('EMBEDDING_ENABLED', 'false') === 'true',
    model: env('EMBEDDING_MODEL', 'text-embedding-3-small'),
    cacheFile: env('EMBEDDING_CACHE', path.join(__dirname, '..', '.cache', 'embeddings.json'))
  },

  retriever: {
    topK: parseInt(env('RAG_TOP_K', '4'), 10),
    minScore: num('RAG_MIN_SCORE', 0.12),
    vectorWeight: num('RAG_VECTOR_WEIGHT', 0.62)
  },

  session: {
    ttlMs: 30 * 60 * 1000,
    maxTurns: 8
  }
};
