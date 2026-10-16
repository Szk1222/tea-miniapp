/** 小程序网络传输：正式版走微信云托管私有链路，开发者工具走本地 HTTP。 */
const CFG = require('./config.js');

function request(opts) {
  const path = opts.path || '';
  if (CFG.useCloud()) {
    if (!CFG.CLOUD_ENV_ID || !CFG.CLOUD_SERVICE || !wx.cloud || !wx.cloud.callContainer) {
      return { promise: Promise.reject(new Error('微信云托管环境尚未配置')), abort: function () {} };
    }
    let cancelled = false;
    const promise = Promise.resolve().then(function () { return wx.cloud.callContainer({
      config: { env: CFG.CLOUD_ENV_ID },
      path: path,
      method: opts.method || 'GET',
      timeout: opts.timeout,
      header: Object.assign({ 'X-WX-SERVICE': CFG.CLOUD_SERVICE }, opts.header || {}),
      data: opts.data
    }); }).then(function (res) {
      if (cancelled) {
        const error = new Error('请求已取消');
        error.cancelled = true;
        throw error;
      }
      return res;
    });
    return { promise: promise, abort: function () { cancelled = true; } };
  }

  let task;
  const promise = new Promise(function (resolve, reject) {
    task = wx.request({
      url: CFG.API_BASE + path,
      method: opts.method || 'GET',
      timeout: opts.timeout,
      header: opts.header || {},
      data: opts.data,
      success: resolve,
      fail: reject
    });
  });
  return { promise: promise, abort: function () { if (task && task.abort) task.abort(); } };
}

module.exports = { request: request };
