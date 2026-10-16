/**
 * 客户端运行配置。
 *
 * 关于 API_BASE：小程序不允许把大模型 API Key 放在端上（反编译即可拿到），
 * 因此对话走自建的 Agent 服务中转（见 server/README.md），端上只持有服务地址。
 *
 * 开发者工具走本地 HTTP；体验版与正式版走 wx.cloud.callContainer 私有链路。
 * 上线前在下方填云环境 ID、服务名和真实客服邮箱。
 */

/** 开发者工具：跑在本机，直接用回环地址 */
const API_BASE_DEVTOOLS = 'http://127.0.0.1:8787';

/** 用户反馈接收邮箱。 */
const SUPPORT_EMAIL = '17274865261@163.com';

// 微信云托管正式接入时填写控制台中的环境 ID 与服务名。
// 体验版、正式版统一使用私有链路；开发者工具仍可连接本地服务。
const CLOUD_ENV_ID = 'chalifang-prod-d0gb3mua244b0e5ea';
const CLOUD_SERVICE = 'chalifang-agent';

const CONFIG = {
  /** 仅开发者工具使用；体验版/正式版禁止通过此地址请求 */
  API_BASE: API_BASE_DEVTOOLS,
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  CLOUD_SERVICE: CLOUD_SERVICE,
  useCloud: function () {
    try {
      const info = wx.getAccountInfoSync();
      return !(info && info.miniProgram && info.miniProgram.envVersion === 'develop');
    } catch (e) { return true; }
  },

  /** 本地调试地址 */
  API_BASE_DEVTOOLS: API_BASE_DEVTOOLS,

  /** 客服邮箱（设置页「复制联系方式」用） */
  SUPPORT_EMAIL: SUPPORT_EMAIL,

  /** 对话接口路径（SSE 流式） */
  CHAT_PATH: '/api/agent/chat',

  /** 体感反馈上送路径（仅在 AI 增强开启且单独同意时调用） */
  FEEDBACK_PATH: '/api/agent/feedback',

  /** 内容下发路径（按版本号增量拉取，见 utils/content-client.js） */
  CONTENT_PATH: '/api/content',

  /** 内容拉取超时：比对话短。内容拉不到就用内置内容，绝不能拖慢启动 */
  CONTENT_TIMEOUT: 8000,

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
