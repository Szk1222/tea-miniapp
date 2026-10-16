const engine = require('../../utils/engine.js');

/** 示例：覆盖几类常见但量表里不一定问到的表述，点一下即可填入 */
const EXAMPLES = [
  '眼睛干痒，看屏幕久了更明显',
  '吃完饭就胀气，消化不太好',
  '总想发脾气，胸口发闷',
  '白天没精神，晚上又睡不踏实',
  '早上起来嘴里发苦',
  '下午腿有点肿，按下去有印子'
];

Page({
  data: {
    text: '',
    examples: EXAMPLES,
    hit: null
  },

  onLoad(options) {
    const pre = (options && options.text) || '';
    if (pre) this.setData({ text: pre });
  },

  onInput(e) {
    const text = e.detail.value;
    this.setData({ text: text, hit: this.detect(text) });
  },

  /** 边输入边给一个轻量的方向提示（本地规则实时算，不发网络） */
  detect(text) {
    const t = (text || '').trim();
    if (t.length < 3) return null;
    const r = engine.symptomAnalyze(t);
    if (!r) return null;
    return { label: r.label, count: (r.candidates || []).length };
  },

  pickExample(e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ text: v, hit: this.detect(v) });
  },

  clearText() {
    this.setData({ text: '', hit: null });
  },

  submit() {
    const text = (this.data.text || '').trim();
    if (text.length < 4) {
      wx.showToast({ title: '再多写几个字', icon: 'none' });
      return;
    }
    // 交给对话页处理：那里既有本地规则引擎，也能在开启 AI 增强时走知识库检索
    getApp().globalData.presetAsk = text;
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  },

  onShareAppMessage() {
    return { title: '茶历方 · 补充症状，找到对应的养生方向', path: '/pages/index/index' };
  }
});
