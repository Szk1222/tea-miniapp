/**
 * 客户端运行配置。
 *
 * 关于 API_BASE：小程序不允许把大模型 API Key 放在端上（反编译即可拿到），
 * 因此对话走自建的 Agent 服务中转（见 server/README.md），端上只持有服务地址。
 *
 * 部署前必做：
 *   1. 把 API_BASE 换成你的 HTTPS 域名（微信要求 request 合法域名，且必须 HTTPS）
 *   2. 在「微信公众平台 → 开发 → 开发设置 → 服务器域名」里加入该域名
 */
const CONFIG = {
  /** Agent 服务地址；本地调试用 127.0.0.1，真机调试换成内网 IP 或线上域名 */
  API_BASE: 'http://127.0.0.1:8787',

  /** 对话接口路径（SSE 流式） */
  CHAT_PATH: '/api/agent/chat',

  /** 单次请求超时（毫秒）。超时即回落本地规则引擎，用户无感 */
  TIMEOUT: 20000,

  /** 连续失败几次后暂停走服务端（熔断），避免每次发言都先卡一个超时 */
  FAIL_THRESHOLD: 2,

  /** 熔断冷却时间（毫秒） */
  COOLDOWN: 60000,

  /** 是否允许端上手动关闭（设置页开关的默认值由 store 控制） */
  ALLOW_USER_TOGGLE: true
};

module.exports = CONFIG;
