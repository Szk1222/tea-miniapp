const agent = require('../../utils/agent.js');
const remote = require('../../utils/agent-remote.js');
const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const store = require('../../utils/store.js');
const knowledgePush = require('../../utils/knowledge-push.js');

function stamp() {
  const d = new Date();
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 消息列表上限。setData 每次都整体重传 messages，长对话下会成为主要开销；
 *  只保留最近若干条，滚动锚点始终在底部，用户无感。 */
const MAX_MESSAGES = 80;
/** 打字机节奏：32ms/帧 × 每次 2~4 字 ≈ 90 字/秒，
 *  观感与原来的 20ms 基本一致，但 setData 次数少一半（每次都跨 JS↔渲染层桥接） */
const TYPE_STEP = 32;
/** 自动滚动节流，避免与流式渲染抢主线程 */
const SCROLL_GAP = 120;

Page({
  data: {
    messages: [],
    input: '',
    focus: false,
    sending: false,
    scrollTo: '',
    profile: null,
    mainName: '',
    /** 是否走服务端 AI 增强（关闭后退化为纯本地规则，不外发任何数据）。
     *  默认关闭：开启会把对话内容与体质类型发往服务端及第三方大模型，
     *  必须先经过用户单独同意（见 requestAiConsent），真实取值在 onLoad 里从 store 读取。 */
    aiOn: false,
    /** 服务端元信息，用于展示实际推理模式 */
    mode: '',
    /** 是否曾经单独同意过。用于区分「从没开过」与「开过又主动关掉」，
     *  后者不该被反复推销 AI 增强 */
    aiConsented: false,
    /** 键盘让位高度（px）。写在根容器的 padding-bottom 上：
     *  容器让出多少，消息区就自动少多少，输入区正好落在键盘正上方。 */
    pagePad: 0
  },

  onLoad() {
    this.ctx = { profile: null, lastTeas: [], flags: {} };
    this._timers = [];
    this._seq = 0;
    this._streamIdx = -1;
    this._inflight = null;
    this._runId = 0;
    this._kbH = 0;        // 键盘高度判重，官方提示同一高度会重复触发
    this._baseH = 0;      // 未弹键盘时的容器高度
    this._anchor = 0;     // 底部锚点交替序号
    this._lastScrollAt = 0;
    this._scrollTimer = null;
    /** 已推送过的科普主题（topicKey → 1），避免同一主题反复刷屏 */
    this._pushedTopics = {};
    /** 本轮用户原话，用于挑科普主题 */
    this._lastUserText = '';
    /** 本轮服务端是否已下发科普块（下发了则端上不再补推） */
    this._serverPushed = false;
    this.setData({ aiOn: store.getAiEnabled(), aiConsented: store.getAiConsent() });
    this.bootstrap();
  },

  onReady() {
    this.measureViewport();
  },

  onUnload() {
    this.clearTimers();
    this.abortInflight();
    this.resetKeyboard();
  },

  onHide() {
    this.abortInflight();
    this.resetKeyboard();
  },

  abortInflight() {
    this._runId += 1;
    if (this._inflight && typeof this._inflight.abort === 'function') {
      try { this._inflight.abort(); } catch (e) { /* ignore */ }
    }
    this._inflight = null;
    if (this.data.sending) this.setData({ sending: false });
  },

  /**
   * 胶囊开关点击：左段=本地模式，右段=AI 增强，点哪边切哪边。
   *
   * 关键点：按 data-mode 判断「目标状态」，而不是对当前状态取反。
   * 取反式写法点在已选中的那一段上时是空操作（且没有任何反馈），
   * 用户看到的就是「点了没功能」。
   * 每条分支都有可见反馈（标签即时变色 + toast），不再有静默路径。
   */
  onModeTap(e) {
    const mode = (e.currentTarget.dataset || {}).mode;
    const wantAi = mode === 'ai';
    // 诊断用：若点击后控制台没有这行，说明事件根本没到达逻辑层（属视图层问题），
    // 而不是开关逻辑的问题
    console.log('[chat] mode tap:', mode, 'aiOn=', this.data.aiOn);

    if (wantAi === this.data.aiOn) {
      wx.showToast({ title: wantAi ? '当前已是 AI 增强' : '当前已是本地模式', icon: 'none' });
      return;
    }

    if (!wantAi) {
      this.abortInflight();
      store.setAiEnabled(false);
      this.setData({ aiOn: false, mode: '' });
      wx.showToast({ title: '已切换为本地模式', icon: 'none' });
      return;
    }

    // 开启前必须单独取得同意：体质类型与提问内容会离开本机
    this.requestAiConsent().then((ok) => {
      if (!ok) {
        wx.showToast({ title: '未开启，仍为本地模式', icon: 'none' });
        return;
      }
      store.setAiConsent(true);
      store.setAiEnabled(true);
      this.setData({ aiOn: true, aiConsented: true, mode: '' });
      wx.showToast({ title: '已开启 AI 增强', icon: 'none' });
    });
  },

  /**
   * 单独同意弹窗。文案必须与实际上行字段严格一致，
   * 否则就变成另一种形式的「隐私说明不实」。
   * 上行字段见 utils/agent-remote.js 的 minimalProfile() 与 minimalSummary()。
   */
  requestAiConsent() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '开启 AI 增强',
        content: '开启后，你的提问内容与体质类型会发送至我们的服务器，并转交第三方大模型用于生成更贴合的回答。'
          + '\n\n你的性别、年龄、慢性病名称、过敏史等原始填报内容不会上传，仅上传「是否需要特别提示」这一标记。'
          + '\n\n如果你记录过喝茶体感，为了让推荐更贴合，也会一并发送「哪款茶、总体感受、选中的体感标签」；你写的补充描述只有在记录时主动勾选后才会发送。'
          + '\n\n可随时关闭；关闭后全部在本机完成，不发出任何网络请求。',
        // 注意：showModal 的按钮文案官方限制最多 4 个字符，超长会直接走 fail
        // （弹窗根本不出现），历史版本写「同意并开启」5 个字，导致同意弹窗
        // 从未弹出过、AI 永远开不起来 —— 这里必须保持在 4 字以内。
        confirmText: '同意开启',
        cancelText: '暂不开启',
        confirmColor: '#2E6B4F',
        success: (res) => resolve(!!res.confirm),
        fail: (err) => {
          // 弹窗失败不能静默：否则表现就是「点了没反应」，且查不到原因
          console.error('[chat] showModal fail:', err && err.errMsg);
          resolve(false);
        }
      });
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, hidden: false });
    }
    const profile = store.getProfile();
    this.ctx.profile = profile && profile.constitutionId ? profile : null;
    const mainName = this.ctx.profile ? constitutions.getOr(this.ctx.profile.constitutionId).name : '';
    this.setData({ profile: this.ctx.profile, mainName: mainName });

    const app = getApp();
    if (app.globalData.presetAsk) {
      const ask = app.globalData.presetAsk;
      app.globalData.presetAsk = '';
      this.later(() => this.dispatch(ask), 900);
    }
  },

  clearTimers() {
    (this._timers || []).forEach(function (t) { clearTimeout(t); });
    this._timers = [];
    if (this._scrollTimer) {
      clearTimeout(this._scrollTimer);
      this._scrollTimer = null;
    }
  },

  later(fn, ms) {
    const t = setTimeout(fn, ms);
    this._timers.push(t);
    return t;
  },

  bootstrap() {
    const greeting = agent.greeting({ profile: this.ctx.profile });
    this.queue = greeting.slice();
    this.flushQueue();
  },

  resetChat() {
    wx.showModal({
      title: '清空对话',
      content: '将清空当前对话记录，体质档案与收藏不受影响。',
      confirmColor: '#2E6B4F',
      success: (res) => {
        if (!res.confirm) return;
        this.clearTimers();
        this.abortInflight();
        const oldSessionId = store.peekSessionId();
        if (oldSessionId && store.getAiEnabled()) {
          require('../../utils/agent-remote.js').deleteSession(oldSessionId).then(function (out) {
            if (!out.ok) wx.showToast({ title: '云端会话清除失败，请稍后重试', icon: 'none' });
          });
        }
        // 同步换一个服务端会话 id，避免清空后模型还记着上一轮的上下文
        store.resetSessionId();
        this.ctx.lastTeas = [];
        this.ctx.flags = {};
        this._streamIdx = -1;
        this._pushedTopics = {};
        this._lastUserText = '';
        this._serverPushed = false;
        this.setData({ messages: [], sending: false, mode: '' });
        this.queue = agent.greeting({ profile: this.ctx.profile }).slice();
        this.flushQueue();
      }
    });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  /* ---------- 键盘与视口 ---------- */

  /**
   * 记录未弹键盘时的容器高度，用于识别「可视区是否已被运行环境压缩」。
   * 容器用 top/bottom 锚定视口，所以这个值就是当前可视高度，不依赖 vh。
   */
  measureViewport() {
    wx.createSelectorQuery()
      .select('.chat-page')
      .boundingClientRect((rect) => {
        if (rect && rect.height) this._baseH = rect.height;
      })
      .exec();
  },

  onFocus(e) {
    this.setData({ focus: true });
    this.hideTabBar();
    // 基础库 1.9.90 起 focus 事件已带键盘高度：先用它让位，避免首帧被键盘压住，
    // 后续 keyboardheightchange 再按真实高度校正
    const kb = (e && e.detail && e.detail.height) || 0;
    if (kb > 0) this.applyKeyboard(kb);
  },

  onBlur() {
    this.resetKeyboard();
  },

  /**
   * 键盘高度变化。用组件级事件而不是 wx.onKeyboardHeightChange：
   * 后者是全局键盘监听，其它页面/输入法触发时也会回调，容易误判成本页键盘。
   * 官方提示同一高度可能重复触发，这里自行判重。
   */
  onKeyboardHeightChange(e) {
    const kb = (e.detail && e.detail.height) || 0;
    if (kb === this._kbH) return;
    this._kbH = kb;
    this.applyKeyboard(kb);
  },

  /**
   * 键盘高度 → 容器需要让出的底部空间。
   *
   * 绝大多数环境弹键盘只做「覆盖」，可视区不变，让位高度就等于键盘高度。
   * 但个别环境（企业微信内嵌、部分安卓 WebView 以 adjustResize 方式弹键盘）
   * 会直接把可视区压掉一截，此时容器已随 top/bottom 自行收缩，
   * 再叠加同样的 padding 会把输入框顶到屏幕中间。
   * 所以实测容器当前高度，只补「真正被遮住」的那部分。
   */
  applyKeyboard(kb) {
    if (!kb) return this.commitPad(0);
    const base = this._baseH;
    if (!base) return this.commitPad(kb);
    wx.createSelectorQuery()
      .select('.chat-page')
      .boundingClientRect((rect) => {
        const now = rect && rect.height ? rect.height : base;
        const covered = Math.max(0, base - now); // 环境已经替我们让出的高度
        this.commitPad(Math.max(0, Math.round(kb - covered)));
      })
      .exec();
  },

  commitPad(pad) {
    if (pad === this.data.pagePad) return;
    this.setData({ pagePad: pad });
    this.scrollBottom(true);
  },

  /** 输入区 / tabBar 状态复位（失焦、切页、卸载时调用） */
  resetKeyboard() {
    this._kbH = 0;
    if (this.data.focus || this.data.pagePad) {
      this.setData({ focus: false, pagePad: 0 });
    }
    this.showTabBar();
  },

  showTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: false });
    }
  },

  hideTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: true });
    }
  },

  onSend() {
    const text = (this.data.input || '').trim();
    if (!text || this.data.sending) return;
    this.setData({ input: '' });
    this.dispatch(text);
  },

  onChipTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.action === 'assess') {
      wx.navigateTo({ url: '/pages/assess/assess' });
      return;
    }
    if (item.action === 'tea') {
      wx.switchTab({ url: '/pages/tea/tea' });
      return;
    }
    if (item.action === 'profile') {
      wx.switchTab({ url: '/pages/profile/profile' });
      return;
    }
    if (item.action === 'knowledge') {
      wx.navigateTo({ url: '/pages/knowledge/knowledge' });
      return;
    }
    if (item.action === 'feedback') {
      wx.navigateTo({ url: '/pages/feedback/feedback' + (item.id ? ('?teaId=' + item.id) : '') });
      return;
    }
    this.dispatch(item.text || item.label);
  },

  /* ---------- 自定义症状 ---------- */

  /**
   * 跳到独立的「补充症状」页。
   * 刻意不做成页内弹层：输入页的键盘让位在聊天页里最容易出问题
   * （见项目里问茶页的键盘方案），独立页面用普通文档流，键盘行为最稳。
   * 提交后由该页把文本写进 globalData.presetAsk，回到本页时自动发出。
   */
  goSymptom() {
    wx.navigateTo({ url: '/pages/symptom/symptom' });
  },

  /** 一轮回答彻底结束（消息全部出完）后的收尾：自动推送科普 */
  onRoundDone() {
    if (!this._lastUserText) return;
    this.maybePushKnowledge();
  },

  /** 科普卡点击：按类型跳到对应详情 */
  openKnowledgeItem(e) {
    const kind = e.currentTarget.dataset.kind;
    const id = e.currentTarget.dataset.id;
    if (!kind || !id) return;
    if (kind === 'constitution') {
      wx.navigateTo({ url: '/pages/knowledge-detail/knowledge-detail?type=constitution&id=' + id });
    } else if (kind === 'ingredient') {
      wx.navigateTo({ url: '/pages/knowledge-detail/knowledge-detail?type=ingredient&id=' + id });
    } else {
      // 常识问答在知识库页的「常识」页签里
      wx.navigateTo({ url: '/pages/knowledge/knowledge?tab=faq' });
    }
  },

  /** 收起本轮推送的科普（用户不想看时不打扰） */
  hideKnowledge(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const list = this.data.messages.slice();
    if (!list[idx]) return;
    list.splice(idx, 1);
    this.setData({ messages: list });
  },

  /**
   * 一轮回答结束后，自动推送同主题科普。
   *
   * 触发时机放在「这一轮的文案已经出完、sending 归位」之后，
   * 用短延时让消息自然衔接；主题去重靠 topicKey，同一主题只推一次，
   * 用户手动收起后也不再补推（避免打扰）。
   */
  maybePushKnowledge() {
    // 服务端已经推过就别再补（它掌握本轮真实检索结果，比本地猜得准）
    if (this._serverPushed) return;
    const ctx = this.ctx || {};
    const profile = ctx.profile;
    const teaIds = ctx.lastTeas || [];
    if (!teaIds.length && !(profile && profile.constitutionId)) return;

    const block = knowledgePush.build({
      teas: teaIds,
      constitutionId: profile && profile.constitutionId,
      keywords: [this._lastUserText || '']
    });
    if (!block || !block.items || !block.items.length) return;
    if (this._pushedTopics[block.topicKey]) return;
    this._pushedTopics[block.topicKey] = 1;

    this.later(() => {
      this.pushMessage(Object.assign({}, block, { role: 'bot', time: stamp(), pushed: true }));
    }, 1100);
  },

  onCtaTap(e) {
    const action = e.currentTarget.dataset.action;
    if (action === 'assess') {
      wx.navigateTo({ url: '/pages/assess/assess' });
    } else if (action === 'tea') {
      wx.switchTab({ url: '/pages/tea/tea' });
    }
  },

  dispatch(text) {
    const runId = ++this._runId;
    this._lastUserText = text;
    // 逐轮重置：本轮服务端没推就轮到端上兜底，不能被上一轮的标记一直压着
    this._serverPushed = false;
    this.pushMessage({ role: 'user', type: 'text', text: text, time: stamp() });
    this.setData({ sending: true, mode: '' });
    this._streamIdx = -1;

    this._inflight = remote.respondAsync(text, this.ctx, {
      onMeta: (m) => {
        if (runId !== this._runId) return;
        this.setData({ mode: m.mode === 'safety-short-circuit' ? '安全拦截' : (m.model || '') });
      },
      onDelta: (d) => { if (runId === this._runId) this.appendDelta(d); },
      onBlock: (b) => { if (runId === this._runId) this.appendBlock(b); },
      onReset: () => { if (runId === this._runId) this.dropStreamBubble(); }
    });

    this._inflight.then((res) => {
      if (runId !== this._runId || res.cancelled) return;
      this._inflight = null;
      this.ctx = res.ctx;
      this.closeStreamBubble();

      if (res.streamed) {
        const finalMode = res.meta && res.meta.mode;
        const modeLabel = finalMode === 'safety-short-circuit' ? '安全拦截'
          : finalMode === 'local-fallback' ? '本地规则'
          : finalMode === 'llm-partial' ? '回答中断'
          : finalMode === 'llm' ? 'AI 增强' : this.data.mode;
        this.setData({ sending: false, mode: modeLabel });
        this.onRoundDone();
      } else {
        // 本地规则引擎：沿用原有的打字机节奏
        this.setData({ mode: res.reason === 'local-safety' ? '安全拦截' : '本地规则' });
        this.queue = res.messages.slice();
        this.later(() => this.flushQueue(), 260);
      }

      const mainName = this.ctx.profile ? constitutions.getOr(this.ctx.profile.constitutionId).name : '';
      this.setData({ profile: this.ctx.profile, mainName: mainName });
    }).catch(() => {
      if (runId !== this._runId) return;
      this._inflight = null;
      this.closeStreamBubble();
      this.setData({ sending: false });
    });
  },

  /* ---------- 流式增量渲染 ---------- */

  appendDelta(text) {
    if (!text) return;
    if (this._streamIdx < 0) {
      const idx = this.pushMessage({ role: 'bot', type: 'text', text: '', typing: true, time: stamp() });
      this._streamIdx = idx;
    }
    const cur = this.data.messages[this._streamIdx];
    this.setPath(this._streamIdx, { text: (cur ? cur.text : '') + text });
    this.scrollBottom();
  },

  appendBlock(block) {
    this.closeStreamBubble();
    const msg = Object.assign({}, block, { role: 'bot', time: stamp() });
    if (msg.type === 'teas') {
      msg.teas = (msg.teas || []).map(function (id) { return teas.map[id]; }).filter(Boolean);
    }
    // 服务端本轮已经推过科普 → 收尾时不再自己补推，否则用户会看到两条重复的「顺带了解」。
    // 服务端比端上更清楚本轮真实检索了什么，所以以它为准；端上的挑选器只在本地模式兜底。
    if (msg.type === 'knowledge') this._serverPushed = true;
    this.pushMessage(msg);
  },

  closeStreamBubble() {
    if (this._streamIdx < 0) return;
    this.setPath(this._streamIdx, { typing: false });
    this._streamIdx = -1;
  },

  /** 请求中断时丢弃半截流式气泡 */
  dropStreamBubble() {
    if (this._streamIdx < 0) return;
    const list = this.data.messages.slice();
    list.splice(this._streamIdx, 1);
    this._streamIdx = -1;
    this.setData({ messages: list });
  },

  /* ---------- 出队渲染 ---------- */

  flushQueue() {
    if (!this.queue || !this.queue.length) {
      this.setData({ sending: false });
      this.onRoundDone();
      return;
    }
    const m = this.queue.shift();
    const msg = Object.assign({}, m, { role: 'bot', time: stamp() });

    if (msg.type === 'teas') {
      msg.teas = (msg.teas || []).map(function (id) { return teas.map[id]; }).filter(Boolean);
    }

    if (msg.type === 'text') {
      const full = msg.text;
      const idx = this.pushMessage(Object.assign({}, msg, { text: '', typing: true }));
      this.streamText(idx, full, () => {
        this.later(() => this.flushQueue(), 200);
      });
      return;
    }

    this.pushMessage(msg);
    this.later(() => this.flushQueue(), msg.type === 'chips' ? 120 : 260);
  },

  streamText(idx, full, done) {
    let i = 0;
    const self = this;
    const step = function () {
      if (i >= full.length) {
        self.setPath(idx, { typing: false, text: full });
        self.scrollBottom(true);
        done && done();
        return;
      }
      i = Math.min(full.length, i + 2 + Math.floor(Math.random() * 3));
      self.setPath(idx, { text: full.slice(0, i), typing: i < full.length });
      self.scrollBottom();
      self.later(step, TYPE_STEP);
    };
    step();
  },

  setPath(idx, patch) {
    const data = {};
    Object.keys(patch).forEach(function (k) {
      data['messages[' + idx + '].' + k] = patch[k];
    });
    this.setData(data);
  },

  pushMessage(msg) {
    this._seq += 1;
    msg.id = msg.id || ('local_' + this._seq);
    let list = this.data.messages.concat([msg]);
    if (list.length > MAX_MESSAGES) {
      // 超出上限时从头部裁剪，并同步修正流式气泡的下标
      const cut = list.length - MAX_MESSAGES;
      list = list.slice(cut);
      if (this._streamIdx >= 0) this._streamIdx = Math.max(-1, this._streamIdx - cut);
    }
    this.setData({ messages: list });
    this.scrollBottom(true);
    return list.length - 1;
  },

  /**
   * 贴底滚动。
   * 1）scroll-into-view 指向同一个值时框架不会重复触发，而打字机/流式阶段
   *    末尾节点的 id 一直没变 —— 所以用两个底部锚点交替设置；
   * 2）做节流：流式阶段每 20~40ms 滚一次既无必要，也会和渲染抢主线程，
   *    末尾再补一次 force，确保停笔时一定停在底部。
   */
  scrollBottom(force) {
    if (!this.data.messages.length) return;
    const now = Date.now();
    if (force) {
      this._lastScrollAt = now;
      if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
        this._scrollTimer = null;
      }
      return this.applyScroll();
    }
    if (now - (this._lastScrollAt || 0) >= SCROLL_GAP) {
      this._lastScrollAt = now;
      return this.applyScroll();
    }
    if (this._scrollTimer) return;
    const self = this;
    this._scrollTimer = setTimeout(function () {
      self._scrollTimer = null;
      self._lastScrollAt = Date.now();
      self.applyScroll();
    }, SCROLL_GAP);
  },

  applyScroll() {
    this._anchor = this._anchor === 0 ? 1 : 0;
    this.setData({ scrollTo: this._anchor ? 'chat-anchor-b' : 'chat-anchor-a' });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  onShareAppMessage() {
    return {
      title: '茶历方 · 中医体质养生茶推荐',
      path: '/pages/index/index'
    };
  }
});
