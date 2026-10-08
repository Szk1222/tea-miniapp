/**
 * 客户端运行配置。
 *
 * 关于 API_BASE：小程序不允许把大模型 API Key 放在端上（反编译即可拿到），
 * 因此对话走自建的 Agent 服务中转（见 server/README.md），端上只持有服务地址。
 *
 * 地址按「小程序环境版本」自动选择，避免上线前把调试地址带上正式包：
 *   develop（开发者工具）  → API_BASE_DEVTOOLS
 *   trial  （体验版/真机）  → API_BASE_LAN
 *   release（正式版）       → API_BASE_PROD   ← 必须是 HTTPS + 已备案域名
 *
 * 部署前必做：
 *   1. 把 API_BASE_PROD 换成线上 HTTPS 域名（微信要求 request 合法域名，且必须 HTTPS）
 *   2. 在「微信公众平台 → 开发 → 开发设置 → 服务器域名」里加入该域名
 *   3. 真机联调时把 API_BASE_LAN 改成开发机的局域网 IP（见下方注释）
 */

/** 开发者工具：跑在本机，直接用回环地址 */
const API_BASE_DEVTOOLS = 'http://127.0.0.1:8787';

/**
 * 体验版真机联调：填开发机在局域网内的 IP，手机与电脑必须连同一个 Wi-Fi。
 * 约定：http + 非备案地址，需要在手机端开启「调试模式」才能请求成功
 *       （微信 → 右上角胶囊 → 打开调试）。
 * 注意：内网 IP 由 DHCP 分配，换网络或重启路由器后会变，连不上时先 ipconfig 确认。
 */
const API_BASE_LAN = 'http://192.168.31.37:8787';

/**
 * 正式版：HTTPS + 已在工信部备案的域名。
 * ↓↓↓ 上线前唯一需要改的一行 ↓↓↓
 */
const API_BASE_PROD = 'https://api.example.com';

/** 用户反馈接收邮箱。↓↓↓ 上线前必须换成真实可达的邮箱 ↓↓↓ */
const SUPPORT_EMAIL = 'chalifang-support@example.com';

/** 按环境版本挑地址；基础库过低取不到时回落到开发者工具地址 */
function pickApiBase() {
  try {
    const info = wx.getAccountInfoSync();
    const env = info && info.miniProgram && info.miniProgram.envVersion;
    if (env === 'release') return API_BASE_PROD;
    if (env === 'trial') return API_BASE_LAN;
    return API_BASE_DEVTOOLS;
  } catch (e) {
    return API_BASE_DEVTOOLS;
  }
}

const CONFIG = {
  /** 当前生效的 Agent 服务地址（按环境自动选择，不要再手改这一行） */
  API_BASE: pickApiBase(),

  /** 三个候选地址，供排障时查看 */
  API_BASE_DEVTOOLS: API_BASE_DEVTOOLS,
  API_BASE_LAN: API_BASE_LAN,
  API_BASE_PROD: API_BASE_PROD,

  /** 客服邮箱（设置页「复制联系方式」用） */
  SUPPORT_EMAIL: SUPPORT_EMAIL,

  /** 对话接口路径（SSE 流式） */
  CHAT_PATH: '/api/agent/chat',

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
