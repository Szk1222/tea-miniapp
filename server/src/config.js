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

  /**
   * 跨域白名单。
   *
   * 默认留空 = **不发送任何 Access-Control-Allow-Origin 响应头**（最严策略），原因：
   *   - 小程序的 wx.request 不受浏览器同源策略约束，压根不读 CORS 头；
   *   - 管理页由本服务自己托管，与接口同源，也不需要 CORS。
   * 所以 "*" 对小程序毫无收益，只会让任意网页都能调用对话与管理接口，白白放大攻击面。
   *
   * 仅当把管理页部署到**另一个域名**下时才需要填，支持逗号分隔多个来源。
   * 填 "*" 可恢复放开，但不建议用于生产。
   */
  corsOrigin: env('CORS_ORIGIN', ''),

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
    thinking: process.env.LLM_THINKING === '' ? '' : env('LLM_THINKING', 'disabled'),

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
    maxTurns: 8,
    // 正式微信云托管填 cloudbase，按网关注入的 openid 隔离会话；
    // legacy 只用于本地联调，不能作为公网服务的身份校验。
    identityMode: env('SESSION_IDENTITY_MODE', 'legacy'),
    /** 会话数上限。超限时按最久未活跃淘汰，防止伪造 sessionId 撑爆内存 */
    maxSessions: parseInt(env('SESSION_MAX', '5000'), 10)
  },

  /**
   * 公开接口限流。目标不是防 DDoS，而是防止**大模型额度被刷爆** ——
   * 方舟额度记在开发者账号上，接口公开却无限流时，任何人都能脚本刷量产生真实费用。
   * 配额按 IP + 接口组计数，固定窗口。
   */
  rateLimit: {
    // 设为 false 可整体关闭（仅供压测/回归使用，生产不要关）
    enabled: env('RATE_LIMIT_ENABLED', 'true') !== 'false',
    windowMs: parseInt(env('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    /** 对话类接口：单 IP 每窗口上限。调大前先想清楚被刷的账单 */
    chatMax: parseInt(env('RATE_LIMIT_CHAT_MAX', '20'), 10),
    /** 其余公开接口（内容下发、检索、科普） */
    apiMax: parseInt(env('RATE_LIMIT_API_MAX', '60'), 10),
    /** 最多跟踪多少个 IP，超过则按插入顺序淘汰，避免限流表本身成为内存漏点 */
    maxTrackedIps: parseInt(env('RATE_LIMIT_MAX_IPS', '20000'), 10)
  },

  /** 内容与审计日志的落盘位置（容器里要挂 volume，否则重启即失） */
  storage: {
    dir: env('STORAGE_DIR', path.join(__dirname, '..', 'storage')),
    mountPath: env('STORAGE_MOUNT_PATH', ''),
    auditRetentionDays: parseInt(env('AUDIT_RETENTION_DAYS', '7'), 10)
  },

  admin: {
    // 管理后台访问令牌。留空表示管理端整体关闭（接口一律 403），
    // 避免「忘了配」变成「谁都能改线上内容」。
    token: env('ADMIN_TOKEN', ''),
    openids: env('ADMIN_OPENIDS', '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    // 登录失败限流：同一 IP 连续失败达到阈值后锁定一段时间，防在线爆破
    maxLoginFails: parseInt(env('ADMIN_MAX_LOGIN_FAILS', '5'), 10),
    lockMs: parseInt(env('ADMIN_LOCK_MS', '300000'), 10)
  }
};
