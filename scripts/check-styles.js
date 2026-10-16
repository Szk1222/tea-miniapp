#!/usr/bin/env node
/**
 * WXSS 静态检查（两件事）
 *
 * 一、WXML 类名 ↔ WXSS 规则 一致性
 *   为什么需要：
 *     WXML 里写了 class，但 WXSS 里忘了定义对应规则，小程序不会报任何错。
 *     表现只是样式「整段丢失」—— 典型症状是 display:flex 没生效，图标 / 文案 / 箭头
 *     各自退化成块级元素，竖着堆成一列；也可能只是间距没了。
 *     真实案例：pages/assess 的「补充症状」入口只写了 class="assess-sym" 没写样式，
 *     渲染成「图标一行、文字两行、箭头一行」的散架样子。
 *   分级（避免把既有历史包袱全算成故障，噪声会把真问题淹掉）：
 *     FAIL  类名在全仓任何 wxss 里都没有定义 → 一定是漏写样式，退出码 1。
 *     WARN  类名定义在别的页面 wxss 里（跨页复制粘贴残留）→ 本页不生效，退出码 0。
 *
 * 二、非法选择器（标签名 / ID / 属性选择器）
 *   为什么需要：
 *     开发者工具的 wxss 编译器会硬报
 *     "Some selectors are not allowed in component wxss, including tag name selectors,
 *      ID selectors, and attribute selectors." 并中断整个 wxss 编译。
 *     它把页面 wxss 也按组件级作用域编译（lazyCodeLoading 下尤其如此），
 *     所以 `page { height: 100% }`、`.note text { }` 都会让项目编译不过，
 *     而报错只给一个文件路径 + 含糊的一句话，极难定位。
 *     真实案例：pages/chat 的 `page { height: 100% }`、pages/feedback / pages/symptom
 *     里 7 处 `.xxx text { }`，共 4 个文件被编译器点名，报错持续刷屏。
 *     用开发者工具自带的 wcsc.exe 编译可逐条复现（见下 SELFTEST 注释）。
 *   覆盖范围：pages/ + components/ + custom-tab-bar/ + **app.wxss 本身**。
 *     ⚠️ app.wxss 不豁免。开发者工具同样按组件级作用域编译它：
 *     2026-10-10 的实战里，报错就点名了 `app.wxss:46`（`view, text, … { box-sizing }`），
 *     而修掉 46 行之后同一个文件里更早的 `page { }`（第 6 行）才浮出来。
 *     ⚠️ wcsc 对**每个文件只报一处**违规 → 修掉报出来的那处，会立刻冒出上一处；
 *     必须整仓清零，不能只看报错列表。
 *     ⇒ 结论：`page { }` 与元素复位都不能待在 wxss 里。全局设计变量改挂页面根容器
 *     class（`.page` / `.chat-page`），原本靠全局复位生效的规则逐个补 `box-sizing`。
 *     ⚠️ 也没有 `*` 这条退路：`* { box-sizing: border-box }` 会让 wcsc 直接
 *     `ERR: unexpected token '*'` 且退出码 1（比 illegal selector 更硬）。
 *     用开发者工具自带的 wcsc.exe 编译可逐条复现（见下 SELFTEST 注释）。
 *
 * 用法：
 *   node scripts/check-styles.js            只列 FAIL，WARN 给一行汇总
 *   node scripts/check-styles.js --verbose  WARN 也逐条列出
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.indexOf('--verbose') > -1;
/** {{...}} 的哨兵字符：替换后再切词，避免动态表达式里的标识符被当成类名 */
const MARK = '\u0001';

/* ---------------- 采集 ---------------- */

function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push.apply(out, walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  });
  return out;
}

/**
 * 从 wxml 里抽出静态类名。
 * 关键：先把 {{...}} 整体替换成哨兵再切词，否则
 * `class="opt-chip {{gender === item ? 'is-on' : ''}}"` 里的 `item` 会被误当成类名，
 * 产生一批永远找不到定义的假阳性，把真问题淹掉。
 */
function classesInWxml(src) {
  const set = new Set();
  const re = /(?:hover-class|class)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const marked = m[1].replace(/\{\{[\s\S]*?\}\}/g, MARK);
    marked.split(/\s+/).forEach(function (tok) {
      const t = tok.trim();
      if (!t) return;
      if (t.indexOf(MARK) > -1) return;      // 与动态表达式拼接出的半截名（如 risk-card--{{x}}）
      if (/[{}?':="!&<>|]/.test(t)) return;
      if (/^wx-/.test(t)) return;            // wx-* 是框架内置
      set.add(t);
    });
  }
  return set;
}

/** wxss 里定义过的类名集合（@import 一并展开，注释里的 .foo 不算定义） */
function classesInWxss(file, seen) {
  const set = new Set();
  seen = seen || {};
  if (!fs.existsSync(file) || seen[file]) return set;
  seen[file] = true;

  const src = fs.readFileSync(file, 'utf8');
  const imp = /@import\s+["']([^"']+)["']\s*;/g;
  let im;
  while ((im = imp.exec(src))) {
    const dep = path.resolve(path.dirname(file), im[1]);
    classesInWxss(dep, seen).forEach(function (c) { set.add(c); });
  }

  const clean = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(clean))) set.add(m[1]);
  return set;
}

/* ---------------- 非法选择器采集 ---------------- */

/** 第 pos 个字符落在第几行（clean 与原文等长，行号可直接用） */
function lineAt(clean, pos) {
  let n = 1;
  for (let k = 0; k < pos && k < clean.length; k += 1) {
    if (clean.charAt(k) === '\n') n += 1;
  }
  return n;
}

/**
 * 抽出 wxss 里的非法选择器：标签名 / ID / 属性选择器。
 * 返回 [{ line, sel, kind }]。
 *
 * 解析方式：只在「{」处回看缓冲的一段文本当作选择器前导，
 * 因此属性值里的 `env(...)`、`calc(...)`、`#FFF` 都不会被误判成选择器。
 * /* 注释 *\/ 会被替换成等长空白：既保住行号，又不会把注释里写的 `.foo` 当成规则。
 * @keyframes 整块跳过（里面的 from / to / 50% 不是选择器）。
 */
function selectorViolations(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
  const out = [];
  let i = 0;
  let depth = 0;
  let buf = '';
  let skipBlock = false;

  while (i < clean.length) {
    const ch = clean.charAt(i);

    if (ch === '{') {
      const prelude = buf.trim().replace(/\s+/g, ' ');
      const lead = buf.length - buf.replace(/^\s+/, '').length;
      const pos = i - buf.length + lead;
      buf = '';
      depth += 1;

      if (prelude.charAt(0) === '@') {
        if (/^@(-[a-z]+-)?keyframes\b/i.test(prelude)) skipBlock = true;
      } else if (!skipBlock) {
        prelude.split(',').forEach(function (one) {
          const sel = one.trim();
          if (!sel) return;
          sel.split(/[\s>]+/).forEach(function (p) {
            if (!p) return;
            let kind = '';
            if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(p)) kind = '标签名';
            else if (p.charAt(0) === '#') kind = 'ID';
            else if (p.indexOf('[') > -1) kind = '属性';
            // `*` 不是 illegal selector，但 wcsc 会直接 `ERR: unexpected token '*'` 且退出码 1，
            // 比 illegal selector 更硬 —— 一起拦掉，免得有人拿它当全局复位的退路。
            else if (p.charAt(0) === '*') kind = '通配';
            if (kind) out.push({ line: lineAt(clean, pos), sel: sel, kind: kind });
          });
        });
      }
      i += 1;
      continue;
    }

    if (ch === '}') {
      buf = '';
      depth = Math.max(0, depth - 1);
      if (depth === 0) skipBlock = false;
      i += 1;
      continue;
    }

    if (skipBlock) { i += 1; continue; }
    buf += ch;
    i += 1;
  }
  return out;
}

/* ---------------- 检查 ---------------- */

function check(wxmlFile, repoDefs) {
  const isComponent = path.relative(ROOT, wxmlFile).split(path.sep)[0] === 'components';
  const own = classesInWxss(wxmlFile.replace(/\.wxml$/, '.wxss'));
  const global = classesInWxss(path.join(ROOT, 'app.wxss'));
  const inScope = isComponent ? own : new Set([].concat(Array.from(own), Array.from(global)));

  const used = classesInWxml(fs.readFileSync(wxmlFile, 'utf8'));
  const missing = [];   // 全仓无定义 → FAIL
  const orphan = [];    // 只在别的页面有定义 → WARN
  used.forEach(function (c) {
    if (inScope.has(c)) return;
    if (repoDefs.has(c)) orphan.push(c);
    else missing.push(c);
  });
  return { file: path.relative(ROOT, wxmlFile), missing: missing.sort(), orphan: orphan.sort() };
}

/* ---------------- 控件 ---------------- */

let ctlBad = 0;
function control(name, pass, detail) {
  console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '   ' + detail : ''));
  if (!pass) ctlBad += 1;
}

function runControls() {
  console.log('[对照]');
  // 阳性对照：静态类名没定义 → 必须被识别（否则整份检查是假绿）
  const src = '<view class="ctl-ok ctl-ghost"></view>';
  const used = classesInWxml(src);
  control('阳性：未定义类名能被识别',
    used.has('ctl-ok') && used.has('ctl-ghost') && !new Set(['ctl-ok']).has('ctl-ghost'),
    '[' + Array.from(used).join(', ') + ']');

  // 阴性对照：动态表达式不得被当成类名（防止修完假阳性又把真信号一起修掉）
  const dyn = '<view class="a {{x === item ? \'is-on\' : \'\'}} b--{{risk.level}}"><text class="{{y}}z"></text></view>';
  const dynUsed = Array.from(classesInWxml(dyn));
  const leaks = dynUsed.filter(function (c) {
    return ['item', 'index', 'is-on', 'risk.level', 'b--', 'z', 'x', 'y'].indexOf(c) > -1;
  });
  control('阴性：动态表达式不会被当成类名', leaks.length === 0 && dynUsed.indexOf('a') > -1,
    '抽出 ' + JSON.stringify(dynUsed) + '，泄漏 ' + JSON.stringify(leaks));

  // 阳性对照：@import 的样式必须计入
  const imp = classesInWxss(path.join(ROOT, 'app.wxss'));
  control('阳性：app.wxss 能解析出类名（否则全仓会假报缺样式）', imp.size > 20, imp.size + ' 个');

  // 阳性对照：五类能被编译器判死的选择器都必须被抓到，且行号正确
  const badSrc = [
    '.a { color: red; }',            // 1  合法
    'page { height: 100%; }',        // 2  标签名
    '.note text { color: red; }',    // 3  标签名（后代）
    '#main { color: red; }',         // 4  ID
    'a[href] { color: red; }',       // 5  属性
    '.ok:hover { color: red; }',     // 6  合法
    '* { box-sizing: border-box; }'  // 7  通配（wcsc: ERR: unexpected token `*`）
  ].join('\n');
  const badHits = selectorViolations(badSrc);
  const badLines = badHits.map(function (h) { return h.line; }).join(',');
  control('阳性：page / .note text / #id / [attr] / * 全部被抓到，行号正确',
    badHits.length === 5 && badLines === '2,3,4,5,7' &&
    badHits[0].kind === '标签名' && badHits[2].kind === 'ID' &&
    badHits[3].kind === '属性' && badHits[4].kind === '通配',
    badHits.map(function (h) { return h.line + ':' + h.kind; }).join(' '));

  // 阴性对照：合法写法不得被误判（否则会逼着人把好代码改坏）
  const goodSrc = [
    '.a { color: red; }',
    '.a:hover { color: red; }',
    '.a > .b { color: red; }',
    '.a__b .a__c { color: red; }',
    '.a::after { content: "x"; }',
    '.bar__fill { height: 100%; }',
    '@keyframes k { from { opacity: 0; } to { opacity: 1; } }',
    '@media (min-width: 100px) { .a { color: red; } }',
    '.card { border: 1rpx solid #E9EDE8; background: url(a.png); }'
  ].join('\n');
  const goodHits = selectorViolations(goodSrc);
  control('阴性：类 / 伪类 / 后代 / 子代 / 关键帧 / 媒体查询 都不误报',
    goodHits.length === 0,
    goodHits.length ? JSON.stringify(goodHits) : '0 条');

  console.log();
}

/* ---------------- 非法选择器检查 ---------------- */

/**
 * 检查所有 wxss（含 app.wxss）
 * ⚠️ app.wxss 必须一起查：它同样按组件级作用域编译，`page { }` 与标签名复位
 * 都会被判 illegal selector。wcsc 每个文件只报一处，只查报错列表会漏掉同文件的更早违规。
 */
function runSelectorCheck() {
  const files = [].concat(
    walk(path.join(ROOT, 'pages'), '.wxss'),
    walk(path.join(ROOT, 'components'), '.wxss'),
    walk(path.join(ROOT, 'custom-tab-bar'), '.wxss'),
    [path.join(ROOT, 'app.wxss')]
  ).sort();

  const bad = [];
  files.forEach(function (f) {
    selectorViolations(fs.readFileSync(f, 'utf8')).forEach(function (h) {
      bad.push({ file: path.relative(ROOT, f), line: h.line, sel: h.sel, kind: h.kind });
    });
  });

  bad.forEach(function (h) {
    console.log('✗ ' + h.file + ':' + h.line + '  →  ' + h.sel + '   （' + h.kind + '选择器）');
  });

  return { files: files.length, bad: bad };
}

/* ---------------- 主流程 ---------------- */

function main() {
  const files = [].concat(
    walk(path.join(ROOT, 'pages'), '.wxml'),
    walk(path.join(ROOT, 'components'), '.wxml')
  ).sort();

  const repoDefs = classesInWxss(path.join(ROOT, 'app.wxss'));
  files.forEach(function (f) {
    classesInWxss(f.replace(/\.wxml$/, '.wxss')).forEach(function (c) { repoDefs.add(c); });
  });

  runControls();

  const failFiles = [];
  const orphanByClass = {};
  files.forEach(function (f) {
    const r = check(f, repoDefs);
    if (r.missing.length) failFiles.push(r);
    r.orphan.forEach(function (c) {
      (orphanByClass[c] = orphanByClass[c] || []).push(r.file);
    });
  });

  failFiles.forEach(function (r) {
    console.log('✗ ' + r.file);
    console.log('    WXML 用到、但全仓 wxss 都没有定义：' + r.missing.join('、'));
  });

  const orphanClasses = Object.keys(orphanByClass).sort();
  if (orphanClasses.length) {
    console.log(!failFiles.length ? '' : '');
    console.log('! 跨页复用类 ' + orphanClasses.length + ' 个（本页 wxss 未定义，仅靠别的页面生效 → 本页实际不生效）');
    if (VERBOSE) {
      orphanClasses.forEach(function (c) {
        console.log('    .' + c + '  ← ' + orphanByClass[c].join('、'));
      });
    } else {
      console.log('    ' + orphanClasses.map(function (c) { return '.' + c; }).join('、'));
      console.log('    （加 --verbose 看每个类出现在哪些页面）');
    }
  }

  console.log();
  console.log('检查 ' + files.length + ' 个 wxml：' +
    (failFiles.length ? failFiles.length + ' 个存在未定义类名' : '所有类名都有对应样式') +
    (orphanClasses.length ? '，另有 ' + orphanClasses.length + ' 个跨页复用类' : ''));

  const sel = runSelectorCheck();
  console.log('检查 ' + sel.files + ' 个 wxss（含 app.wxss）：' +
    (sel.bad.length ? sel.bad.length + ' 处非法选择器' : '无非法选择器'));

  if (ctlBad) {
    console.log('\n对照未通过 —— 本次检查结果不可信，先修检查器。');
    process.exit(1);
  }
  if (failFiles.length) {
    console.log('\n有 class 写了却没有样式。小程序不报错，但界面会塌，请补 wxss 或去掉多余类名。');
    process.exit(1);
  }
  if (sel.bad.length) {
    console.log('\nwxss 里用了标签名 / ID / 属性 / 通配选择器。开发者工具的 wxss 编译器会直接报错并中断编译');
    console.log('（app.wxss 也一样，`page { }` 与 `view, text { }` 都在禁用之列）；');
    console.log('请改成类名选择器（标签样式给元素加 class，如 .note__text 取代 .note text）；');
    console.log('需要给 page 元素设样式的，用页面首个节点 <page-meta page-style="..." />；');
    console.log('全局设计变量挂到页面根容器 class（.page / .chat-page）上，不要用 page{}。');
    console.log('注意 wcsc 每个文件只报一处违规：清掉这一处可能又冒出同文件里更早的一处，要跑到 0 为止。');
    process.exit(1);
  }
  console.log('\n全部通过 ✓');
}

if (require.main === module) main();

module.exports = {
  classesInWxml: classesInWxml,
  classesInWxss: classesInWxss,
  selectorViolations: selectorViolations
};
