/**
 * 把 Secrets.MINIPROGRAM_PRIVATE_KEY 还原成上传密钥文件（GitHub Actions 专用）
 *
 * 为什么不是一句 `base64 -d`：
 *   微信下载的 private.wxXXXX.key 本身就是 **PEM 文本**，长这样 ——
 *       -----BEGIN RSA PRIVATE KEY-----
 *       <25 行 base64，每行 64 字符>
 *       -----END RSA PRIVATE KEY-----
 *   把这段原文直接塞进 Secret，再 `base64 -d` 会因为连字符报 `base64: invalid input`，
 *   而这条报错完全看不出「其实是把密钥原文贴上来了」—— 排查成本极高。
 *   这里把几种常见形态都识别掉，并把**结构特征**（而非内容）打到日志：
 *   失败时直接说清该粘什么，成功时给出 sha256 供与本地文件对照。
 *
 * 支持的形态：
 *   1) 密钥文件的 base64 单行文本          ← 推荐，`base64 -w0 private.wxXXXX.key`
 *   2) 密钥文件的原始文本（带 PEM 包裹）    ← 直接粘贴文件内容也可以
 *   3) certutil -encode / openssl base64 产物（带 BEGIN/END 包裹且分行）
 *   4) URL-safe base64（+/ 写成 -_）
 *
 * 判定逻辑（为什么是这个顺序）：
 *   「形态 3」既带 PEM 包裹、又是 base64，若只看「有没有 PEM 包裹」会误判成形态 2。
 *   因此先尝试 base64 解码 —— **谁解出来还带 PEM 包裹，谁才是真正的密钥文件**。
 *
 * 用法：node decode-key.js <输出文件路径>
 * 环境变量：MP_PRIVATE_KEY
 * 退出码：0 成功；非 0 失败（Actions 据此判定 job 失败）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_PATH = process.argv[2];
const RAW = process.env.MP_PRIVATE_KEY || '';

/** PEM 包裹标签，如 `-----BEGIN RSA PRIVATE KEY-----` */
const PEM_RE = /-----BEGIN [^-]+-----/;

function fail(title, lines) {
  // 带上 GitHub 的错误标注，日志里会以红色横幅呈现；本地跑则退化为普通文本
  if (process.env.GITHUB_ACTIONS) console.error('::error::' + title);
  console.error('\n✗ ' + title + '\n');
  (lines || []).forEach(function (l) { console.error('  ' + l); });
  console.error('');
  process.exit(1);
}

if (!OUT_PATH) {
  fail('用法：node decode-key.js <输出文件路径>');
}

if (!RAW.trim()) {
  fail('Secrets.MINIPROGRAM_PRIVATE_KEY 未配置或为空', [
    '在 仓库 Settings → Secrets and variables → Actions → New repository secret 添加：',
    '',
    '  名称：MINIPROGRAM_PRIVATE_KEY',
    '  值  ：上传密钥文件的 base64 单行文本',
    '',
    '生成方式（任选其一，产物直接进剪贴板）：',
    '  Git Bash / macOS：base64 -w0 private.wxXXXX.key | clip',
    '  PowerShell      ：[Convert]::ToBase64String([IO.File]::ReadAllBytes("private.wxXXXX.key")) | Set-Clipboard',
    '',
    '也可以把密钥文件的原始文本（以 -----BEGIN 开头）整段粘贴，本脚本会自动识别。'
  ]);
}

/** 去掉 BOM，并统一换行为 LF（保持与微信下载的原始文件一致，便于 sha256 对照） */
const text = RAW.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/**
 * 尝试把「文本」按 base64 解出字节。
 * 会先剥掉 PEM 包裹行与所有空白 —— 这样形态 3 也能正确解出。
 * @returns {{buf: Buffer, variant: string}|null}
 */
function tryBase64(s) {
  let body = s
    .replace(/-----BEGIN [^-]*-----/g, '')
    .replace(/-----END [^-]*-----/g, '')
    .replace(/\s+/g, '');
  if (!body) return null;

  let variant = 'standard';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) {
    if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(body)) return null; // 含 base64 字母表以外的字符
    variant = 'urlsafe';
    body = body.replace(/-/g, '+').replace(/_/g, '/');
  }
  while (body.length % 4 !== 0) body += '=';

  const buf = Buffer.from(body, 'base64');
  return buf.length ? { buf: buf, variant: variant } : null;
}

let bytes = null;
let how = '';

const asBase64 = tryBase64(text);
if (asBase64 && PEM_RE.test(asBase64.buf.toString('latin1'))) {
  // 形态 1 / 3 / 4：base64 解出来的东西自己带 PEM 包裹 → 它才是密钥文件
  bytes = asBase64.buf;
  how = 'base64 解码（' + asBase64.variant + '）';
} else if (PEM_RE.test(text)) {
  // 形态 2：粘的就是密钥文件原文
  bytes = Buffer.from(text.trim() + '\n', 'utf8');
  how = '密钥文件原文（Secret 里本身就是 PEM 文本）';
} else {
  const preview = text.trim().slice(0, 12);
  fail('无法识别 Secret 的内容形态', [
    '当前值：' + text.length + ' 字符 / ' + text.split('\n').length + ' 行，开头是 `' + preview + '`',
    '',
    '期望是以下两种之一：',
    '  1. 密钥文件的 base64 单行文本 —— 推荐',
    '       Git Bash：base64 -w0 private.wxXXXX.key | clip',
    '  2. 密钥文件的原始文本内容（以 -----BEGIN 开头）'
  ]);
}

/* ---------- 落盘 ---------- */
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, bytes, { mode: 0o600 });
fs.chmodSync(OUT_PATH, 0o600);

/* ---------- 结构自检：只打印「形状」，不回显密钥内容 ---------- */
const asText = bytes.toString('utf8');
const bodyLines = asText.split('\n').filter(function (l) {
  return l && !/^-----/.test(l);
});
const tag = (asText.match(PEM_RE) || [null])[0];
const sha = crypto.createHash('sha256').update(bytes).digest('hex');

console.log('✓ 密钥文件已还原到 runner 临时目录');
console.log('  还原方式   : ' + how);
console.log('  字节数     : ' + bytes.length);
console.log('  行数       : ' + asText.split('\n').length);
console.log('  PEM 标签   : ' + (tag || '（无）'));
console.log('  正文字符数 : ' + bodyLines.join('').length);
console.log('  sha256     : ' + sha);
console.log('');
console.log('  可与本地密钥文件对照：Git Bash 里执行 sha256sum private.wxXXXX.key');

if (!tag) {
  console.log('');
  console.log('::warning::还原出的文件不含 PEM 包裹，可能不是密钥文件；若上传阶段报密钥相关错误，请检查 Secret 内容');
}
