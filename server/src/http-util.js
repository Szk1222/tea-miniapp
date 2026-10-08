/**
 * HTTP 小工具：响应封装与请求体读取。
 * 服务端零依赖，只用 Node 内置 http，所以这些胶水代码得自己写。
 */

const cfg = require('./config.js');

/**
 * 组装 CORS 头。
 * CORS_ORIGIN 留空（默认）时**不下发任何 Access-Control-Allow-* 头**，
 * 即浏览器侧完全不开放跨域 —— 小程序与管理页都不需要它（见 config.js 说明）。
 * 仅在显式配置了来源时才追加，避免出现 `Access-Control-Allow-Origin: ` 这种非法空值。
 */
function corsHeaders() {
  const origin = String(cfg.corsOrigin || '').trim();
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin === '*' ? '*' : origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const JSON_HEADERS = Object.assign({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
}, corsHeaders());

/** 客户端 IP：反向代理写入的头优先，其次直连地址 */
function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({}, JSON_HEADERS, {
    'Content-Length': Buffer.byteLength(body)
  }));
  res.end(body);
}

function sendHTML(res, status, html, extraHeaders) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(html);
}

function sendText(res, status, text) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8'
  }, corsHeaders()));
  res.end(text);
}

/**
 * 读取并解析 JSON 请求体。
 * @param {object} req
 * @param {number} [limit] 字节上限，默认 1MB（内容整类替换可能较大）
 */
function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > (limit || 1024 * 1024)) {
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

module.exports = {
  sendJSON: sendJSON,
  sendHTML: sendHTML,
  sendText: sendText,
  readBody: readBody,
  clientIp: clientIp,
  corsHeaders: corsHeaders,
  JSON_HEADERS: JSON_HEADERS
};
