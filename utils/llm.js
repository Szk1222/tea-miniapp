/**
 * Agent 服务端接入层（SSE 流式）。
 *
 * 三件事必须在这里处理干净：
 * 1) 分块解码：小程序 onChunkReceived 给的是 ArrayBuffer，切点可能落在
 *    一个 UTF-8 字符中间，所以必须做带残留缓冲的解码。
 * 2) 事件解析：服务端按 SSE 协议发 meta/delta/block/done/error 五类事件，
 *    chunk 边界同样不保证落在 \n\n 上，要留残余。
 * 3) 熔断降级：服务端不可用时不能让用户每次发言都等一个超时，
 *    连续失败达到阈值就冷却一段时间，期间直接走本地规则引擎。
 */
const CFG = require('./config.js');

/* ---------------- 熔断状态 ---------------- */

let failStreak = 0;
let coolUntil = 0;

function isAvailable() {
  return Date.now() >= coolUntil;
}

function noteSuccess() {
  failStreak = 0;
  coolUntil = 0;
}

function noteFailure() {
  failStreak += 1;
  if (failStreak >= CFG.FAIL_THRESHOLD) {
    coolUntil = Date.now() + CFG.COOLDOWN;
    failStreak = 0;
  }
}

function status() {
  return {
    available: isAvailable(),
    coolingMs: Math.max(0, coolUntil - Date.now())
  };
}

/* ---------------- UTF-8 分块解码 ---------------- */

const MASKS = { 1: 0x1f, 2: 0x0f, 3: 0x07 };

function createUtf8Decoder() {
  let leftover = [];
  return function (buffer) {
    const bytes = Array.prototype.slice.call(new Uint8Array(buffer));
    const list = leftover.length ? leftover.concat(bytes) : bytes;
    let out = '';
    let i = 0;
    while (i < list.length) {
      const b = list[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
        continue;
      }
      let n = 0;
      if ((b & 0xe0) === 0xc0) n = 1;
      else if ((b & 0xf0) === 0xe0) n = 2;
      else if ((b & 0xf8) === 0xf0) n = 3;
      else { i += 1; continue; } // 非法起始字节，跳过
      if (i + n >= list.length) break; // 字符被切断，留给下一块
      let cp = b & MASKS[n];
      for (let k = 1; k <= n; k++) cp = (cp << 6) | (list[i + k] & 0x3f);
      out += String.fromCodePoint(cp);
      i += n + 1;
    }
    leftover = list.slice(i);
    return out;
  };
}

/* ---------------- SSE 解析 ---------------- */

function createSseParser(handlers) {
  let buf = '';
  return function (text) {
    buf += text;
    const blocks = buf.split('\n\n');
    buf = blocks.pop(); // 最后一段可能不完整，留下
    blocks.forEach(function (block) {
      let event = 'message';
      let data = '';
      block.split('\n').forEach(function (line) {
        if (line.indexOf('event:') === 0) event = line.slice(6).trim();
        else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
      });
      if (!data) return;
      let payload;
      try { payload = JSON.parse(data); } catch (e) { return; }
      if (typeof handlers[event] === 'function') handlers[event](payload);
    });
  };
}

/* ---------------- 主入口 ---------------- */

/**
 * @param {object} opts
 *   sessionId, message, profile, context,
 *   onDelta(text), onBlock(block), onMeta(meta), onDone({ctx,meta})
 * @returns {{promise:Promise, abort:Function}}
 */
function chat(opts) {
  const handlers = {
    meta: function (m) { opts.onMeta && opts.onMeta(m); },
    delta: function (d) { opts.onDelta && opts.onDelta(d.text || ''); },
    block: function (b) { opts.onBlock && opts.onBlock(b); },
    done: function (d) { doneData = d; },
    error: function (e) { errData = e; }
  };

  const feed = createSseParser(handlers);
  const decode = createUtf8Decoder();
  let doneData = null;
  let errData = null;
  let settled = false;
  let task = null;

  const payload = {
    sessionId: opts.sessionId,
    message: opts.message,
    profile: opts.profile || null,
    context: opts.context || null
  };

  const promise = new Promise(function (resolve, reject) {
    const finish = function (ok, value) {
      if (settled) return;
      settled = true;
      if (ok) { noteSuccess(); resolve(value); return; }
      noteFailure();
      reject(value);
    };

    task = wx.request({
      url: CFG.API_BASE + CFG.CHAT_PATH,
      method: 'POST',
      timeout: CFG.TIMEOUT,
      enableChunked: true,
      header: { 'Content-Type': 'application/json' },
      data: payload,

      success: function (res) {
        // chunked 模式下 res.data 可能为空或为 ArrayBuffer，两种都兜一下
        if (!doneData && res && res.data) {
          if (res.data instanceof ArrayBuffer) {
            try { feed(decode(res.data)); } catch (e) { /* ignore */ }
          } else if (typeof res.data === 'string') {
            try { feed(res.data); } catch (e) { /* ignore */ }
          }
        }
        if (errData) return finish(false, new Error(errData.message || '服务异常'));
        if (doneData) return finish(true, doneData);
        if (res && res.statusCode >= 400) {
          return finish(false, new Error('服务返回 ' + res.statusCode));
        }
        finish(false, new Error('连接被中断'));
      },

      fail: function (err) {
        finish(false, new Error((err && err.errMsg) || '网络异常'));
      }
    });

    if (task && typeof task.onChunkReceived === 'function') {
      task.onChunkReceived(function (res) {
        try { feed(decode(res.data)); } catch (e) { /* 单块解析失败不影响整体 */ }
      });
    }
  });

  return {
    promise: promise,
    abort: function () {
      if (task && typeof task.abort === 'function') {
        try { task.abort(); } catch (e) { /* ignore */ }
      }
    }
  };
}

/**
 * 非流式兜底：个别基础库不支持 enableChunked，退回一次完整请求。
 */
function chatOnce(opts) {
  const payload = {
    sessionId: opts.sessionId,
    message: opts.message,
    profile: opts.profile || null,
    context: opts.context || null
  };
  return new Promise(function (resolve, reject) {
    wx.request({
      url: CFG.API_BASE + '/api/agent/chat.json',
      method: 'POST',
      timeout: CFG.TIMEOUT,
      header: { 'Content-Type': 'application/json' },
      data: payload,
      success: function (res) {
        if (res.statusCode >= 400 || !res.data || !res.data.ok) {
          noteFailure();
          return reject(new Error('服务返回 ' + (res.statusCode || '异常')));
        }
        noteSuccess();
        resolve(res.data);
      },
      fail: function (err) {
        noteFailure();
        reject(new Error((err && err.errMsg) || '网络异常'));
      }
    });
  });
}

module.exports = {
  chat: chat,
  chatOnce: chatOnce,
  isAvailable: isAvailable,
  status: status,
  reset: function () { failStreak = 0; coolUntil = 0; }
};
