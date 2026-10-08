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
 * 上行的「最小化档案」。
 *
 * 为什么不能整份传：用户的性别、年龄段、孕期/哺乳期、慢性病、过敏史属于
 * 《个人信息保护法》定义的**敏感个人信息**，向服务端与第三方大模型传输需要单独同意。
 *
 * 但也不能一删了之 —— 服务端要靠这些信号决定「是否必须先做风险提示、是否不给具体配方」，
 * 删干净会把合规安全网一起删掉。所以这里做的是**用途最小化**：
 * 只上传「下游决策真正需要的那一位信息」，即由原始值降维得到的布尔风险标记，
 * 不上传原始值本身（例如只说「处于需要特别提示的生理阶段」，不说具体是孕期还是哺乳期）。
 */
function minimalProfile(p) {
  if (!p || !p.constitutionId) return null;

  const out = { constitutionId: p.constitutionId };
  if (p.secondaryId) out.secondaryId = p.secondaryId;
  if (typeof p.percent === 'number') out.percent = p.percent;
  if (p.levelText) out.levelText = p.levelText;

  const b = p.basic || {};
  const risk = {};
  if (b.stage && b.stage !== '无') risk.stage = true;
  if (b.conditions && b.conditions.filter(function (x) { return x && x !== '以上都没有'; }).length) {
    risk.chronic = true;
  }
  if (b.allergy) risk.allergy = true;
  if (Object.keys(risk).length) out.risk = risk;

  return out;
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
  //     getAiEnabled() 内已强制校验「用户是否单独同意过」，未同意时永远是 false，
  //     这里不需要重复判断，但请求体必须用最小化档案（见 minimalProfile）。
  if (!store.getAiEnabled()) return local('disabled');
  if (!llm.isAvailable()) return local('circuit-open');

  let emitted = false;

  const task = llm.chat({
    sessionId: store.getSessionId(),
    message: text,
    profile: minimalProfile(state.profile),
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
  respondAsync: respondAsync,
  _minimalProfile: minimalProfile
};
