const agent = require('../../utils/agent.js');
const remote = require('../../utils/agent-remote.js');
const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const store = require('../../utils/store.js');

function stamp() {
  const d = new Date();
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

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
    mode: ''
  },

  onLoad() {
    this.ctx = { profile: null, lastTeas: [], flags: {} };
    this._timers = [];
    this._seq = 0;
    this._streamIdx = -1;
    this._inflight = null;
    this.setData({ aiOn: store.getAiEnabled() });
    this.bootstrap();
  },

  onUnload() {
    this.clearTimers();
    this.abortInflight();
  },

  onHide() {
    this.abortInflight();
  },

  abortInflight() {
    if (this._inflight && typeof this._inflight.abort === 'function') {
      try { this._inflight.abort(); } catch (e) { /* ignore */ }
    }
    this._inflight = null;
  },

  toggleAi() {
    const next = !this.data.aiOn;
    if (!next) {
      store.setAiEnabled(false);
      this.setData({ aiOn: false });
      wx.showToast({ title: '已切换为本地模式', icon: 'none' });
      return;
    }
    // 开启前必须单独取得同意：体质类型与提问内容会离开本机
    this.requestAiConsent().then((ok) => {
      if (!ok) return;
      store.setAiConsent(true);
      store.setAiEnabled(true);
      this.setData({ aiOn: true });
      wx.showToast({ title: '已开启 AI 增强', icon: 'none' });
    });
  },

  /**
   * 单独同意弹窗。文案必须与实际上行字段严格一致，
   * 否则就变成另一种形式的「隐私说明不实」。
   * 上行字段见 utils/agent-remote.js 的 minimalProfile()。
   */
  requestAiConsent() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '开启 AI 增强',
        content: '开启后，你的提问内容与体质类型会发送至我们的服务器，并转交第三方大模型用于生成更贴合的回答。'
          + '\n\n你的性别、年龄、慢性病名称、过敏史等原始填报内容不会上传，仅上传「是否需要特别提示」这一标记。'
          + '\n\n可随时关闭；关闭后全部在本机完成，不发出任何网络请求。',
        confirmText: '同意并开启',
        cancelText: '暂不开启',
        confirmColor: '#2E6B4F',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
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
        // 同步换一个服务端会话 id，避免清空后模型还记着上一轮的上下文
        store.resetSessionId();
        this.ctx.lastTeas = [];
        this.ctx.flags = {};
        this._streamIdx = -1;
        this.setData({ messages: [], sending: false, mode: '' });
        this.queue = agent.greeting({ profile: this.ctx.profile }).slice();
        this.flushQueue();
      }
    });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  onFocus() {
    this.setData({ focus: true });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: true });
    }
  },

  onBlur() {
    this.setData({ focus: false });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: false });
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
    this.dispatch(item.text || item.label);
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
    this.hintAiOnce();
    this.pushMessage({ role: 'user', type: 'text', text: text, time: stamp() });
    this.setData({ sending: true, mode: '' });
    this._streamIdx = -1;

    this._inflight = remote.respondAsync(text, this.ctx, {
      onMeta: (m) => {
        this.setData({ mode: m.mode === 'safety-short-circuit' ? '安全拦截' : (m.model || '') });
      },
      onDelta: (d) => this.appendDelta(d),
      onBlock: (b) => this.appendBlock(b),
      onReset: () => this.dropStreamBubble()
    });

    this._inflight.then((res) => {
      this.ctx = res.ctx;
      this.closeStreamBubble();

      if (res.streamed) {
        this.setData({ sending: false });
      } else {
        // 本地规则引擎：沿用原有的打字机节奏
        this.setData({ mode: res.reason === 'local-safety' ? '安全拦截' : '本地规则' });
        this.queue = res.messages.slice();
        this.later(() => this.flushQueue(), 260);
      }

      const mainName = this.ctx.profile ? constitutions.getOr(this.ctx.profile.constitutionId).name : '';
      this.setData({ profile: this.ctx.profile, mainName: mainName });
    }).catch(() => {
      this.closeStreamBubble();
      this.setData({ sending: false });
    });
  },

  /**
   * 一次性引导：AI 增强改为默认关闭后，用户可能不知道可以开启。
   * 仅在「从未授权过」时提示一次（本次启动内），已授权的用户不会被反复打扰。
   */
  hintAiOnce() {
    if (this._aiHinted || store.getAiConsent()) return;
    this._aiHinted = true;
    wx.showToast({
      title: '当前为本地模式，点右上角可开启 AI 增强',
      icon: 'none',
      duration: 3000
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
        self.setData({});
        self.setPath(idx, { typing: false, text: full });
        done && done();
        return;
      }
      i = Math.min(full.length, i + 1 + Math.floor(Math.random() * 3));
      self.setPath(idx, { text: full.slice(0, i), typing: i < full.length });
      self.scrollBottom();
      self.later(step, 20);
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
    const list = this.data.messages.concat([msg]);
    this.setData({ messages: list });
    this.scrollBottom();
    return list.length - 1;
  },

  scrollBottom() {
    const list = this.data.messages;
    if (!list.length) return;
    this.setData({ scrollTo: 'msg-' + list[list.length - 1].id });
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
