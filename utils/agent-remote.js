/**
 * 对话编排层：决定一次用户发言走哪条链路。
 *
 * 优先级（从高到低）：
 *   1. 本地医疗红线硬拦截 —— 合规不能依赖网络，命中直接本地回复，一个字节都不外发
 *   2. 用户主动关闭 AI 增强 / 服务端熔断中 —— 走本地规则引擎
 *   3. 服务端 Agent（大模型理解 + Function Call 取事实）—— 流式增量渲染
 *   4. 链路 3 失败 —— 回落本地规则引擎，用户侧无感
 *
 * 这样设计的收益：大模型只提升"表达与理解"，专业结论始终来自硬规则；
 * 而一旦模型或网络出问题，产品退化成原来的规则版本，仍然可用。
 */
const agent = require('./agent.js');
const llm = require('./llm.js');
const store = require('./store.js');

function emptyCtx(ctx) {
  return Object.assign({ profile: null, lastTeas: [], flags: {} }, ctx || {});
}

/**
 * @param {string} input
 * @param {object} ctx  { profile, lastTeas, flags }
 * @param {object} handlers
 *   onDelta(text)      增量文本
 *   onBlock(block)     结构化块（teas / notice / chips / cta / text）
 *   onMeta(meta)       服务端元信息（模型、检索模式、耗时）
 *   onReset(reason)    需要丢弃已流出的半截内容
 * @returns {Promise<{messages:Array, ctx:object, streamed:boolean, partial?:boolean, reason?:string}>}
 */
function respondAsync(input, ctx, handlers) {
  const h = handlers || {};
  const text = String(input || '').trim();
  const state = emptyCtx(ctx);

  function local(reason) {
    const res = agent.respond(text, state);
    res.streamed = false;
    res.reason = reason;
    return Promise.resolve(res);
  }

  if (!text) return local('empty');

  // 1. 本地硬拦截（与隐私承诺一致：命中即本地回复，不发出网络请求）
  if (agent.hitMedical(text)) return local('local-safety');

  // 2/3. 是否可用服务端
  if (!store.getAiEnabled()) return local('disabled');
  if (!llm.isAvailable()) return local('circuit-open');

  let emitted = false;

  const task = llm.chat({
    sessionId: store.getSessionId(),
    message: text,
    profile: state.profile,
    context: { lastTeas: state.lastTeas, flags: state.flags },
    onMeta: function (m) { h.onMeta && h.onMeta(m); },
    onDelta: function (d) {
      emitted = true;
      h.onDelta && h.onDelta(d);
    },
    onBlock: function (b) {
      emitted = true;
      h.onBlock && h.onBlock(b);
    }
  });

  task.abortRef = task.abort;

  return task.promise.then(function (done) {
    return {
      messages: [],
      ctx: Object.assign({}, state, done.ctx || {}),
      streamed: true,
      meta: done.meta || null
    };
  }).catch(function (err) {
    const reason = (err && err.message) || '网络异常';

    // 已经流出了一部分内容 → 不要把本地整段回复再叠上去，只提示可重试
    if (emitted) {
      h.onReset && h.onReset(reason);
      return {
        messages: [{ type: 'text', text: '刚才的回答中断了。可以再问一次，或者稍后重试。', small: true }],
        ctx: state,
        streamed: true,
        partial: true,
        reason: reason
      };
    }

    const res = agent.respond(text, state);
    res.streamed = false;
    res.reason = reason;
    return res;
  });
}

module.exports = {
  respondAsync: respondAsync
};
