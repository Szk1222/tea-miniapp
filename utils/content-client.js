/**
 * 内容下发接入层（小程序端）。
 *
 * 解决的问题：内容原来硬编码在 data/*.js 并被端上打包，改一个字都要重新提审发版。
 * 现在管理后台改完内容后，小程序下次启动就会用上新内容，无需发版。
 *
 * 两条路径，都不阻塞渲染：
 *   1) bootstrap()  同步。启动时从 Storage 读上次缓存的内容并就地覆盖到 data/*.js，
 *                   保证首屏渲染用的就是最新已知内容（同步是必须的，否则首屏拿的还是内置数据）。
 *   2) refresh()    异步。带上当前内容版本号问服务端「有没有更新」，
 *                   有就写缓存并立即生效；没有或失败就静默跳过。
 *
 * 降级原则：服务端不可达、缓存损坏、字段不全 —— 一律静默回落到内置内容，
 * 用户侧只会看到「内容没更新」，不会看到报错。
 *
 * 隐私说明：内容库是公开数据（茶方/食材/FAQ），下拉 payload 不含任何用户信息，
 * 因此 refresh() **不受「AI 增强」开关约束** —— 关掉 AI 的用户同样要能拿到内容更新。
 * 涉及用户信息的链路（对话、档案上送）才由 store.getAiEnabled() 严格把关。
 */

const CFG = require('./config.js');
const transport = require('./transport.js');
const store = require('./store.js');
const overlay = require('./content-overlay.js');

/** 缓存的 payload 至少要有这几个键之一，否则视为脏数据直接丢弃 */
const REQUIRED_ANY = ['teas', 'constitutions', 'questions', 'knowledge', 'catalog'];

let lastError = '';

function validPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return REQUIRED_ANY.some(function (k) {
    return payload[k] !== undefined && payload[k] !== null;
  });
}

/**
 * 启动时同步应用上次缓存的内容。
 * @returns {{version:number, counts:object, applied:boolean, reason?:string}}
 */
function bootstrap() {
  const cached = store.getContentCache();
  if (!cached || !validPayload(cached.payload)) {
    return Object.assign(overlay.stats(), { applied: false, reason: 'no-cache' });
  }
  try {
    const info = overlay.apply(cached.payload, {
      version: cached.version,
      updatedAt: cached.updatedAt
    });
    return Object.assign(info, { applied: true });
  } catch (e) {
    // 缓存结构坏了（例如版本升级后字段对不上）→ 清掉，用内置内容
    store.clearContentCache();
    lastError = 'cache-broken: ' + e.message;
    return Object.assign(overlay.stats(), { applied: false, reason: 'cache-broken' });
  }
}

/**
 * 异步拉取内容更新。
 * @returns {Promise<{status:string, version?:number, counts?:object}>}
 *   status: applied | unchanged | failed
 *   （刻意不返回 skipped：内容下拉不受 AI 开关约束，见文件头「隐私说明」）
 */
function refresh() {
  return new Promise(function (resolve) {
    // 注意：这里**刻意不检查 store.getAiEnabled()**。
    // 内容库是公开数据、payload 不含用户信息，若拿 AI 开关当闸门，
    // 默认关闭 AI 的用户将永远收不到后台更新的内容，内容下发机制形同虚设。
    const currentVersion = overlay.getVersion();

    transport.request({
      path: CFG.CONTENT_PATH + '?version=' + currentVersion,
      method: 'GET', timeout: CFG.CONTENT_TIMEOUT,
      header: { 'Content-Type': 'application/json' }
    }).promise.then(function (res) {
        const d = res.data;
        if (!d || !d.ok) return resolve({ status: 'failed', reason: 'bad-response' });
        if (d.unchanged || !d.payload) return resolve({ status: 'unchanged', version: currentVersion });
        if (!validPayload(d.payload)) return resolve({ status: 'failed', reason: 'bad-payload' });

        // 先落缓存再应用：即使应用阶段抛异常，下次启动也能重试，
        // 反过来（先应用后落盘）一旦落盘失败，本次改动就白拉了。
        const saved = store.setContentCache({
          version: d.version,
          updatedAt: d.updatedAt,
          payload: d.payload
        });
        if (!saved) return resolve({ status: 'failed', reason: 'cache-write-failed' });

        let info;
        try {
          info = overlay.apply(d.payload, { version: d.version, updatedAt: d.updatedAt });
        } catch (e) {
          lastError = 'apply-failed: ' + e.message;
          store.clearContentCache();
          return resolve({ status: 'failed', reason: 'apply-failed' });
        }
        return resolve({ status: 'applied', version: info.version, counts: info.counts });
      }, function (err) {
        lastError = (err && err.errMsg) || '网络异常';
        resolve({ status: 'failed', reason: lastError });
      });
  });
}

/** 当前生效内容的概况，供设置页等展示 */
function status() {
  const s = overlay.stats();
  const cached = store.getContentCache();
  return {
    version: s.version,
    counts: s.counts,
    latest: !!cached,
    lastError: lastError
  };
}

/** 内容更新后通知当前页面（页面实现同名方法即可收到） */
function notifyPages(info) {
  try {
    const pages = getCurrentPages() || [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (p && typeof p.onContentUpdate === 'function') {
        try { p.onContentUpdate(info); } catch (e) { /* 单页异常不影响其他页面 */ }
      }
    }
  } catch (e) { /* ignore */ }
}

/**
 * 一次性初始化：同步套用缓存 + 静默拉取更新。
 * @param {{notify?:boolean}} opts notify 为 true 时，更新后回调当前页面的 onContentUpdate
 */
function setup(opts) {
  const boot = bootstrap();
  return refresh().then(function (r) {
    if (r.status === 'applied' && (!opts || opts.notify !== false)) {
      notifyPages(r);
    }
    return { boot: boot, refresh: r };
  }).catch(function (e) {
    lastError = 'setup-failed: ' + e.message;
    return { boot: boot, refresh: { status: 'failed', reason: lastError } };
  });
}

module.exports = {
  bootstrap: bootstrap,
  refresh: refresh,
  setup: setup,
  status: status,
  _validPayload: validPayload
};
