#!/usr/bin/env node
/**
 * 页面注册一致性检查（app.json.pages ↔ pages/ 目录）
 *
 * 为什么需要：
 *   A) `pages/` 下存在**未注册进 app.json 的 .wxml**（半成品页面、临时探针目录）
 *      小程序不报任何错，但会被开发者工具的文件监听**收编进编译任务**。
 *      真实事故（2026-10-10）：在开发者工具运行期间，往 pages/ 下写了一个一次性
 *      探针目录 `pages/__probe_stylecheck/` 又立刻删掉。工具的文件监听进程
 *      （`wxfilewatcher_x64.exe`，`微信开发者工具.exe` 的子进程）把这个已删除的
 *      页面记在了**进程内的监视表**里，此后每次编译都去 open 那个不存在的 wxss：
 *        [WXSS 文件编译错误] ENOENT: no such file or directory,
 *        open '…\pages\__probe_stylecheck\__probe_stylecheck.wxss'
 *      在工具里「清除缓存」完全无效 —— 清的是磁盘缓存，清不掉进程内存里的监视表；
 *      只能**完全退出微信开发者工具**（关掉 `微信开发者工具.exe` 的全部进程）再重开。
 *      ⇒ 结论两条：
 *        ① 不要在开发者工具运行时往被监听的目录（pages/ 等）里造临时文件；
 *        ② 用本检查兜住「遗留在 pages/ 下的未注册页面」。
 *   B) app.json 注册了页面，但四件套（.js / .json / .wxml / .wxss）缺件，
 *      要到编译期才炸，且报错信息不指向缺哪个文件。
 *
 * 检查项：
 *   1. pages/ 下每个目录里的每一个 .wxml 都必须在 app.json.pages 注册
 *   2. pages/ 下每个目录至少要有一个 .wxml（空目录 / 只有 .js 的半成品 → 报错）
 *   3. pages/ 第一层不应出现散落文件（临时文件残留）
 *   4. app.json 每个注册页的四件套必须齐备
 *
 * 说明：本项目未使用分包（app.json 无 subPackages）。若将来引入分包，
 * 需要把 subPackages[].root + subPackages[].pages 一并纳入 registered。
 *
 * 用法： node scripts/check-pages.js
 * 退出码：0 = 通过；1 = 存在问题或检查器自检失败。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT_SET = ['.js', '.json', '.wxml', '.wxss'];

/**
 * 纯函数：便于用阳性 / 阴性对照自证检查器有效（本项目铁律：
 * 「期望为 0」的检查必须配阳性对照，否则 0 与「模式根本没匹配上」无法区分）。
 *
 * @param {object} opt
 * @param {string[]} opt.registered  app.json 注册页路径，如 'pages/index/index'
 * @param {Array<{name:string, files:string[]}>} opt.dirs  pages/ 下第一层目录
 * @param {string[]} opt.looseFiles  直接位于 pages/ 下的文件名
 * @param {(rel:string)=>boolean} [opt.exists] 判断注册页配件是否存在（默认恒真）
 * @returns {string[]} 问题描述列表
 */
function analyzePages(opt) {
  const registered = opt.registered || [];
  const dirs = opt.dirs || [];
  const looseFiles = opt.looseFiles || [];
  const exists = opt.exists || function () { return true; };
  const problems = [];
  const regSet = new Set(registered);

  // 1 + 2：逐目录
  dirs.forEach(function (d) {
    const wxmls = d.files.filter(function (f) { return f.endsWith('.wxml'); });
    if (!wxmls.length) {
      problems.push('pages/' + d.name + '/ 下没有 .wxml（空目录或只有 .js 的半成品页面残留）');
      return;
    }
    wxmls.forEach(function (f) {
      const pagePath = 'pages/' + d.name + '/' + f.replace(/\.wxml$/, '');
      if (!regSet.has(pagePath)) {
        problems.push('pages/' + d.name + '/' + f + ' 未注册进 app.json.pages（会被开发者工具的文件监听收编）');
      }
    });
  });

  // 3：pages/ 第一层的散落文件
  looseFiles.forEach(function (f) {
    problems.push('pages/' + f + ' 直接位于 pages/ 根下（疑似临时文件残留）');
  });

  // 4：注册页四件套
  registered.forEach(function (p) {
    const missing = EXT_SET.filter(function (ext) { return !exists(p + ext); });
    if (missing.length) problems.push(p + ' 缺少 ' + missing.join(' / '));
  });

  return problems;
}

function run() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const registered = (appJson.pages || []).slice();

  // ---------- 自检：阳性对照（四类问题都必须被抓到） ----------
  const posHits = analyzePages({
    registered: ['pages/index/index'],
    dirs: [
      { name: 'index', files: ['index.js', 'index.json', 'index.wxml', 'index.wxss'] },
      { name: '__probe', files: ['__probe.wxml'] },
      { name: 'half', files: ['half.js'] }
    ],
    looseFiles: ['orphan.wxml'],
    exists: function (p) { return p !== 'pages/index/index.wxss'; }
  });
  const posOk =
    posHits.length === 4 &&
    posHits.some(function (h) { return h.indexOf('__probe') > -1; }) &&
    posHits.some(function (h) { return h.indexOf('half') > -1; }) &&
    posHits.some(function (h) { return h.indexOf('orphan') > -1; }) &&
    posHits.some(function (h) { return h.indexOf('.wxss') > -1; });
  if (!posOk) {
    console.error('✗ 自检失败：阳性对照未按预期命中 4 类问题（抽取逻辑可能已失效）');
    posHits.forEach(function (h) { console.error('   ' + h); });
    return 1;
  }
  console.log('✓ 自检通过：未注册页面 / 无 wxml 目录 / 散落文件 / 缺件 四类都能抓到（阳性对照）');

  // ---------- 自检：阴性对照（正常结构不得误报） ----------
  const negHits = analyzePages({
    registered: ['pages/a/a', 'pages/b/c', 'pages/b/d'],
    dirs: [
      { name: 'a', files: ['a.js', 'a.json', 'a.wxml', 'a.wxss'] },
      { name: 'b', files: ['c.js', 'c.json', 'c.wxml', 'c.wxss', 'd.js', 'd.json', 'd.wxml', 'd.wxss'] }
    ],
    looseFiles: [],
    exists: function () { return true; }
  });
  if (negHits.length) {
    console.error('✗ 自检失败：阴性对照被误报（一个目录承载多个页面属正常）');
    negHits.forEach(function (h) { console.error('   ' + h); });
    return 1;
  }
  console.log('✓ 自检通过：一个目录挂多个页面等正常结构不误报（阴性对照）');

  // ---------- 实际扫描 ----------
  const pagesDir = path.join(ROOT, 'pages');
  const dirs = [];
  const looseFiles = [];
  fs.readdirSync(pagesDir, { withFileTypes: true }).forEach(function (e) {
    if (e.isDirectory()) {
      dirs.push({ name: e.name, files: fs.readdirSync(path.join(pagesDir, e.name)) });
    } else {
      looseFiles.push(e.name);
    }
  });

  const problems = analyzePages({
    registered: registered,
    dirs: dirs,
    looseFiles: looseFiles,
    exists: function (rel) { return fs.existsSync(path.join(ROOT, rel)); }
  });

  console.log('---');
  console.log('app.json 注册 ' + registered.length + ' 个页面；pages/ 下 ' + dirs.length + ' 个目录');
  if (problems.length) {
    problems.forEach(function (p) { console.error('✗ ' + p); });
    console.error('共 ' + problems.length + ' 处问题：pages/ 下只允许存在已注册的完整页面');
    return 1;
  }
  console.log('✓ 页面注册与四件套齐备性一致');
  return 0;
}

if (require.main === module) process.exit(run());

module.exports = { analyzePages };
