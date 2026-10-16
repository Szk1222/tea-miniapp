#!/usr/bin/env node
/**
 * 静态比对：WXML 里的 bind/catch 事件名 ↔ 对应 JS 文件里的方法名。
 *
 * 为什么需要它：本项目多次出现「按钮看得见、点不动」的报障，
 * 其中一个常见成因是 WXML 绑定名与 JS 方法名不一致（改名后漏改一侧）。
 * 这种问题不会报错、不会警告，只能靠静态比对发现。
 *
 * 设计要点：
 *  - 用「阳性对照」自证检查器本身有效：构造一个必然缺方法的样本，
 *    若检查器对它不报警，说明抽取逻辑失效（而不是项目真的没问题）。
 *  - 正则禁用 g 标志 + .test()（lastIndex 推进会随机漏检），一律用 matchAll。
 *
 * 用法： node scripts/check-bindings.js
 * 退出码：0 = 通过；1 = 存在不一致或检查器自检失败。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** 递归收集目录下的文件 */
function walk(dir, filter, out) {
  out = out || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entries.forEach(function (ent) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, filter, out);
    else if (filter(ent.name)) out.push(full);
  });
  return out;
}

/**
 * 从 wxml 文本中抽取事件绑定名。
 * 覆盖：bindtap / catchtap / bind:tap / catch:tap / mut-bind:tap 等；
 * 排除 bindinput 这类需要保留的也一样抽出（统一校验，不做特例）。
 * 排除 {{}} 动态绑定（如 bind:tap="{{fn}}"）。
 */
function extractBindings(wxml) {
  const names = new Set();
  const re = /\b(?:bind|catch|mut-bind|capture-bind|capture-catch):?([a-zA-Z]+)\s*=\s*"([^"]*)"/gm;
  for (const m of wxml.matchAll(re)) {
    const handler = m[2].trim();
    if (!handler || handler.indexOf('{{') !== -1) continue;
    // 允许 a.b 形式（指向组件方法），取首段
    const head = handler.split('.').shift().trim();
    if (/^[A-Za-z_$][\w$]*$/.test(head)) names.add(head);
  }
  return names;
}

/** 从 js 文本中抽取顶层方法名（Page/Component 对象的一级键，以及普通函数/const 函数） */
function extractMethods(js) {
  const names = new Set();
  // 对象字面量里的方法 / 属性函数：  缩进 2 空格 + 名字 + (  或  名字: function
  const reObj = /^\s{2,}([A-Za-z_$][\w$]*)\s*(?::\s*(?:async\s*)?function\b|\([^)]*\)\s*\{|:\s*(?:async\s*)?\()/gm;
  for (const m of js.matchAll(reObj)) names.add(m[1]);
  // 顶层 function 声明
  const reFn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  for (const m of js.matchAll(reFn)) names.add(m[1]);
  // const/let/var 箭头函数或函数表达式
  const reVar = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/gm;
  for (const m of js.matchAll(reVar)) names.add(m[1]);
  return names;
}

/** 校验一份 (wxml, js) 配对 */
function checkPair(wxmlPath) {
  const base = wxmlPath.replace(/\.wxml$/, '');
  const jsPath = base + '.js';
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  if (!fs.existsSync(jsPath)) {
    return { wxmlPath, jsPath, missingFile: true, missing: [] };
  }
  const js = fs.readFileSync(jsPath, 'utf8');
  const used = extractBindings(wxml);
  const defined = extractMethods(js);
  const missing = [];
  used.forEach(function (n) {
    // 组件对外派发的事件处理也可写在 methods 里；extractMethods 已按缩进抽取，能覆盖
    if (!defined.has(n)) missing.push(n);
  });
  return { wxmlPath, jsPath, missingFile: false, missing, used: used.size, defined: defined.size };
}

function run() {
  const wxmlFiles = walk(ROOT, function (n) { return n.endsWith('.wxml'); });
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const registered = new Set(appJson.pages.map(function (p) { return path.join(ROOT, p + '.wxml'); }));

  let fail = 0;

  // ---------- 自检：阳性对照 ----------
  // 造一个「WXML 绑定了但 JS 没定义」的样本，检查器必须能报出来。
  const probeWxml = '<view bindtap="definitelyNotDefined">x</view>';
  const probeJs = 'Page({ onLoad() {} });';
  const probeUsed = extractBindings(probeWxml);
  const probeDefined = extractMethods(probeJs);
  const probeCaught = probeUsed.has('definitelyNotDefined') && !probeDefined.has('definitelyNotDefined');
  if (!probeCaught) {
    console.error('✗ 自检失败：检查器未能识别出故意构造的缺失绑定，抽取逻辑已失效');
    console.error('  extractBindings 抽到: ' + JSON.stringify(Array.from(probeUsed)));
    console.error('  extractMethods 抽到: ' + JSON.stringify(Array.from(probeDefined)));
    return 1;
  }
  console.log('✓ 自检通过：检查器能识别缺失的方法绑定（阳性对照）');

  // ---------- 逐页校验 ----------
  let pageCount = 0;
  wxmlFiles.forEach(function (w) {
    if (w.indexOf(path.join(ROOT, 'pages')) !== 0 && w.indexOf(path.join(ROOT, 'components')) !== 0) return;
    pageCount++;
    const r = checkPair(w);
    const rel = path.relative(ROOT, w).replace(/\\/g, '/');
    const inApp = registered.has(w);
    if (r.missingFile) {
      console.error('✗ ' + rel + ' 缺少同名 .js');
      fail++;
      return;
    }
    if (r.missing.length) {
      console.error('✗ ' + rel + ' 绑定了 JS 中不存在的方法: ' + r.missing.join(', '));
      fail++;
    } else {
      console.log('✓ ' + rel + (inApp ? '' : '  (非 app.json 注册页)') + '  ' + r.used + ' 个绑定全部有定义');
    }
  });

  console.log('---');
  console.log('扫描 ' + pageCount + ' 个 wxml，' + (fail ? fail + ' 处不一致' : '全部一致'));
  return fail ? 1 : 0;
}

process.exit(run());
