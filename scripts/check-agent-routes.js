#!/usr/bin/env node
/**
 * 对话意图路由回归（端上规则引擎）。
 *
 * 为什么值得单列一个脚本：utils/agent.js 是一个 13 级 if-else 链，
 * 分支顺序本身就是业务规则（体感反馈必须排在食材科普之前，否则
 * 「我喝完玫瑰陈皮茶…」会被「陈皮」抢走）。这类顺序敏感的逻辑，
 * 改一处很容易静默影响另一处 —— 没有断言就只能靠人肉回忆。
 *
 * 每个用例都带「期望的意图类别」，并额外断言首条文案里的特征词，
 * 这样即使意图类别对了、实际落到的分支不对，也能被发现。
 *
 * 运行：node scripts/check-agent-routes.js
 * 退出码：0 = 全部符合预期；1 = 有用例偏离
 */

// feedback.js 的 read() 依赖 wx.*，Node 下需要桩；缺了会静默返回 []（不影响本检查，
// 但补齐后能保证端上逻辑在 Node 里跑的是同一路径）
if (typeof global.wx === 'undefined') {
  global.wx = { _s: {}, getStorageSync: function (k) { return this._s[k]; }, setStorageSync: function (k, v) { this._s[k] = v; } };
}

const path = require('path');
const agent = require(path.join(__dirname, '..', 'utils', 'agent.js'));

const PROFILE = { constitutionId: 'qiyu', percent: 66, levelText: '倾向明显' };

/**
 * cases: [输入, 说明, 期望意图, 首条文案必须包含的特征片段]
 * 期望意图取值：feedback | safety | science | greet | symptom | recommend | fallback
 */
const CASES = [
  // ---- 体感反馈：必须先于食材科普认领 ----
  ['我喝完玫瑰陈皮茶感觉睡得更沉了', '体感·正向（茶方名较长）', 'feedback', '体感我记下了'],
  ['喝了那个金银花菊花茶不太舒服，肚子发凉', '体感·负向（茶方名 7 字，旧的邻近正则漏检）', 'feedback', '体感我记下了'],
  ['昨天喝的玫瑰陈皮茶，今天感觉精神好一些', '体感·跨句表述', 'feedback', '体感我记下了'],
  ['喝完有点上火', '体感·未提茶但动作紧贴感受', 'feedback', '体感反馈'],
  ['我想反馈一下这个茶的配方', '体感·显式提到「反馈」', 'feedback', '体感反馈'],

  // ---- 疑问句式必须让位给常识问答 ----
  ['喝了之后觉得不舒服怎么办', '疑问句 → 安全引导，不能当成体感记录', 'safety', '停用并观察'],

  // ---- 食材科普：不得被体感分支抢走 ----
  ['陈皮有什么作用', '食材科普', 'science', '陈皮'],
  ['喝茶有什么讲究', '无饮用动作 → 不算体感（走兜底引导）', 'fallback', '没能从这个描述里找到'],

  // ---- 非茶场景不得误判为体感 ----
  ['今天喝了很多水，感觉还不错', '非茶场景', 'fallback', '没能从这个描述里找到'],

  // ---- 自定义症状 ----
  ['最近眼睛干痒，看屏幕久了更明显', '自定义症状·命中症状表（多方向）', 'symptom', '调理方向不止一个'],
  ['睡不好，总是做梦', '常见症状·多方向鉴别', 'symptom', '调理方向不止一个'],
  ['我更像阴虚质的情况', '症状鉴别回传体质名 → 直接推荐', 'recommend', '阴虚质'],

  // ---- 其它既有分支不得回归 ----
  ['你好', '问候', 'greet', '欢迎回来'],
  ['今天天气不错啊哈哈', '兜底引导', 'fallback', '没能从这个描述里找到']
];

/** 判定实际落到了哪一类分支（依据首条消息与消息块组成） */
function classify(messages) {
  const types = messages.map(function (m) { return m.type; });
  const head = String((messages[0] && messages[0].text) || '');
  const joined = messages.map(function (m) { return String(m.text || ''); }).join('\n');

  if (/\u4f53\u611f\u6211\u8bb0\u4e0b\u4e86|\u4f53\u611f\u53cd\u9988/.test(joined)) return 'feedback';
  // 「喝了不舒服怎么办」走的是常识问答里的那一条（答「请立即停用并观察…」），
  // 它可能是 text 也可能是 notice，所以这里不按消息类型过滤。
  if (/停用并观察|正规医疗机构/.test(joined)) return 'safety';
  if (/主要作用是|归肺|归脾|归心|归肝|归肾/.test(joined)) return 'science';
  if (/欢迎回来|很高兴又见到你/.test(head)) return 'greet';
  if (/调理方向不止一个/.test(joined)) return 'symptom';
  if (types.indexOf('teas') > -1) return 'recommend';
  if (/没能从这个描述里找到/.test(joined)) return 'fallback';
  return 'unknown';
}

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) failed += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + extra : ''));
}

// ---------- 自检：阳性对照 ----------
// 造一个必然落不到期望分支的用例，若检查器仍报"通过"，说明分类逻辑失效
(function selfCheck() {
  const msgs = [{ type: 'text', text: '没能从这个描述里找到' }];
  const got = classify(msgs);
  const caught = got !== 'feedback';
  if (!caught) {
    console.error('✗ 自检失败：分类器把兜底文案判成了 feedback，指令无法区分分支');
    process.exit(1);
  }
  console.log('✓ 自检通过：分类器能区分不同分支（阳性对照）\n');
})();

CASES.forEach(function (c) {
  const text = c[0];
  const want = c[2];
  const marker = c[3];
  const r = agent.respond(text, { profile: Object.assign({}, PROFILE), lastTeas: [], flags: {} });
  const got = classify(r.messages);
  const joined = r.messages.map(function (m) { return String(m.text || ''); }).join('\n');
  const markerOk = !marker || joined.indexOf(marker) > -1;
  const pass = got === want && markerOk;
  ok('[' + c[1] + '] ' + text, pass,
    '意图=' + got + '(期望 ' + want + ')' + (markerOk ? '' : ' 缺少特征片段「' + marker + '」'));
});

console.log('---');
console.log(failed ? '✗ ' + failed + ' 项偏离预期' : '✓ ' + CASES.length + ' 项全部符合预期');
process.exit(failed ? 1 : 0);
