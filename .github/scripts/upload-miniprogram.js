/**
 * 小程序体验版上传（GitHub Actions 专用）
 *
 * 为什么不用 `miniprogram-ci upload` 命令行的长参数：
 *   1. 命令行参数随版本变动，容易出现「本地能跑、CI 报未知参数」；
 *   2. ignores / setting 这类配置用 API 表达更直观，也便于逐条注释清楚为什么忽略。
 *
 * 依赖的环境变量（由 .github/workflows/ci-deploy.yml 注入）：
 *   MP_APPID      小程序 AppID
 *   MP_KEY_PATH   上传密钥文件路径（runner 临时目录，跑完即销毁）
 *   MP_VERSION    上传版本号，如 1.0.0
 *   MP_DESC       版本描述
 *
 * 退出码：0 成功；非 0 失败（Actions 会据此判定 job 失败）
 *
 * 注意执行顺序：环境校验排在 require('miniprogram-ci') **之前** ——
 * 否则依赖没装上时先抛 MODULE_NOT_FOUND，会把真正的原因盖掉。
 */
const path = require('path');
const fs = require('fs');

const APPID = process.env.MP_APPID;
const KEY_PATH = process.env.MP_KEY_PATH;
const VERSION = process.env.MP_VERSION;
const DESC = process.env.MP_DESC || VERSION;

/** 机器人编号 1–30：固定用 1，这样公众平台「版本管理」里来源恒定可辨 */
const ROBOT = 1;

function fail(lines) {
  console.error('\n✗ ' + (Array.isArray(lines) ? lines.join('\n') : lines) + '\n');
  process.exit(1);
}

/* ---------- 1. 前置校验：给出可读的中文原因，而不是抛一堆堆栈 ---------- */
const missing = ['MP_APPID', 'MP_KEY_PATH', 'MP_VERSION'].filter(function (k) {
  return !process.env[k];
});
if (missing.length) fail('缺少环境变量：' + missing.join('、'));

if (!/^wx[0-9a-f]{16}$/.test(APPID)) {
  fail('MP_APPID 格式可疑：' + APPID + '（应为 wx 开头 + 16 位十六进制）');
}
if (!fs.existsSync(KEY_PATH)) {
  fail('上传密钥文件不存在：' + KEY_PATH);
}

const projectPath = path.resolve(__dirname, '..', '..');
if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) {
  fail('项目目录下找不到 project.config.json：' + projectPath);
}

/* ---------- 2. 加载依赖 ---------- */
let ci;
try {
  ci = require('miniprogram-ci');
} catch (e) {
  fail([
    '无法加载 miniprogram-ci：' + e.message,
    '请先执行：npm i -g miniprogram-ci@2 并设置 NODE_PATH=$(npm root -g)'
  ]);
}

/* ---------- 3. 项目定义 ---------- */
const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: projectPath,
  privateKeyPath: KEY_PATH,
  // 与 project.config.json 的 packOptions.ignore 保持一致并补充几项。
  // 目的：仓库里含 server/（服务端源码与部署脚本）、docs/、设计预览图，
  // 这些都不该进小程序包 —— 包体上限 2MB，且服务端源码外泄没必要。
  ignores: [
    'node_modules/**/*',
    'server/**/*',
    'docs/**/*',
    'preview/**/*',
    '.workbuddy/**/*',
    '.github/**/*',
    '.git/**/*',
    '**/*.md',
    '.gitignore',
    '.dockerignore'
  ]
});

/* ---------- 4. 上传 ---------- */
(async function () {
  console.log('开始上传小程序体验版');
  console.log('  AppID      : ' + APPID);
  console.log('  项目目录   : ' + projectPath);
  console.log('  版本号     : ' + VERSION);
  console.log('  版本描述   : ' + DESC);
  console.log('  机器人编号 : ' + ROBOT);
  console.log('');

  let progressSteps = 0;
  const result = await ci.upload({
    project: project,
    version: VERSION,
    desc: DESC,
    robot: ROBOT,
    setting: {
      es6: true,
      es7: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      minify: true,
      autoPrefixWXSS: true,
      codeProtect: false,
      // 源码映射：便于在公众平台看线上报错栈；不想暴露源码树可改 false
      uploadWithSourceMap: true
    },
    onProgressUpdate: function (task) {
      progressSteps += 1;
      if (task && typeof task.message === 'string') {
        console.log('  [' + progressSteps + '] ' + task.message);
      }
    }
  });

  console.log('\n✓ 上传成功');
  if (result && typeof result === 'object') {
    const brief = {};
    Object.keys(result).forEach(function (k) {
      const v = result[k];
      if (v === null || ['string', 'number', 'boolean'].indexOf(typeof v) > -1) brief[k] = v;
    });
    if (Object.keys(brief).length) console.log(JSON.stringify(brief, null, 2));
  }
  console.log('\n下一步：到微信公众平台「版本管理」把该版本设为体验版，或提交审核。');
})().catch(function (err) {
  const msg = (err && (err.message || err.errMsg)) || String(err);
  console.error('\n✗ 上传失败：' + msg);

  // 把最常见的两个坑翻译成人话，省得对着一串错误码查半天
  if (/invalid ip|ip.*not.*(allow|white)/i.test(msg)) {
    console.error('\n原因判断：上传密钥开启了 IP 白名单，而 GitHub 托管 runner 的出口 IP 是动态的。');
    console.error('处理方式（任选其一）：');
    console.error('  1. 公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 关闭 IP 白名单；');
    console.error('  2. 改用自托管 runner（固定 IP），再把该 IP 填进白名单。');
  } else if (/invalid|format|key/i.test(msg)) {
    console.error('\n原因判断：上传密钥内容可能有误。请确认 Secret 是密钥文件的 base64 单行文本，');
    console.error('且该密钥属于 AppID ' + APPID + '（在公众平台「开发设置 → 小程序代码上传」生成）。');
  }
  process.exit(1);
});
