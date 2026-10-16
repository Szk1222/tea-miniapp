const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const feedback = require('../../utils/feedback.js');
const remote = require('../../utils/agent-remote.js');
const store = require('../../utils/store.js');
const engine = require('../../utils/engine.js');

function fmt(ts) {
  const d = new Date(ts || Date.now());
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const EFFECT_LABEL = {};
feedback.EFFECTS.forEach(function (e) { EFFECT_LABEL[e.id] = e.label; });
const TASTE_LABEL = {};
feedback.TASTES.forEach(function (t) { TASTE_LABEL[t.id] = t.label; });

Page({
  data: {
    mode: 'pick',           // pick = 选茶方 / form = 填体感
    teaId: '',
    tea: null,
    c: null,
    /* 可记录的茶方（历史 + 收藏 + 当季推荐） */
    candidates: [],
    /* 表单 */
    effects: feedback.EFFECTS,
    feelings: feedback.FEELINGS,
    tastes: feedback.TASTES,
    effect: '',
    feelingSel: {},
    taste: '',
    note: '',
    uploadNote: false,
    canUpload: false,
    /* 记录 */
    records: [],
    /* 提交后 */
    done: false,
    doneTone: 'ok',
    doneText: []
  },

  onLoad(options) {
    const teaId = (options && options.teaId) || '';
    this.setData({ canUpload: store.getAiEnabled() });
    if (teaId) {
      this.openForm(teaId);
    } else {
      this.loadCandidates();
    }
    this.loadRecords();
  },

  onShow() {
    this.setData({ canUpload: store.getAiEnabled() });
    this.loadRecords();
  },

  loadRecords() {
    const list = feedback.list().slice(0, 30).map(function (r) {
      return {
        id: r.id,
        teaId: r.teaId,
        teaName: r.teaName || (r.teaId && teas.map[r.teaId] ? teas.map[r.teaId].name : '未指定茶方'),
        effect: r.effect,
        effectLabel: EFFECT_LABEL[r.effect] || '已记录',
        tone: r.effect === 'better' ? 'ok' : (r.effect === 'worse' ? 'warn' : 'flat'),
        time: fmt(r.at),
        feelings: (r.feelings || []).map(function (f) {
          const it = feedback.FEELING_MAP[f];
          return it ? it.label : f;
        })
      };
    });
    this.setData({ records: list });
  },

  /** 候选茶方：浏览历史 → 收藏 → 当季推荐，去重后取前 8 个 */
  loadCandidates() {
    const seen = {};
    const out = [];
    function push(t) {
      if (!t || seen[t.id]) return;
      seen[t.id] = 1;
      out.push(t);
    }
    store.getHistory().forEach(function (id) { push(teas.get(id)); });
    store.getFavorites().forEach(function (id) { push(teas.get(id)); });
    const profile = store.getProfile();
    if (profile && profile.constitutionId) {
      engine.recommend(profile.constitutionId, { season: engine.seasonOf(), limit: 6 })
        .forEach(push);
    }
    if (!out.length) {
      teas.list.slice(0, 6).forEach(push);
    }
    this.setData({ candidates: out.slice(0, 8) });
  },

  pickTea(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.openForm(id);
  },

  openForm(teaId) {
    const tea = teas.get(teaId);
    if (!tea) return;
    this.setData({
      mode: 'form',
      teaId: teaId,
      tea: tea,
      c: constitutions.getOr(tea.constitution),
      effect: '',
      feelingSel: {},
      taste: '',
      note: '',
      uploadNote: false,
      done: false
    });
    wx.setNavigationBarTitle({ title: '记录体感' });
  },

  backToPick() {
    this.setData({ mode: 'pick', done: false });
    this.loadCandidates();
  },

  pickEffect(e) {
    this.setData({ effect: e.currentTarget.dataset.v, done: false });
  },

  toggleFeeling(e) {
    const v = e.currentTarget.dataset.v;
    const sel = Object.assign({}, this.data.feelingSel);
    if (sel[v]) delete sel[v];
    else sel[v] = true;
    this.setData({ feelingSel: sel, done: false });
  },

  pickTaste(e) {
    this.setData({ taste: e.currentTarget.dataset.v, done: false });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  toggleUploadNote() {
    this.setData({ uploadNote: !this.data.uploadNote });
  },

  clearNote() {
    this.setData({ note: '' });
  },

  submit() {
    const d = this.data;
    if (!d.tea) return;
    if (!d.effect) {
      wx.showToast({ title: '请先选总体感受', icon: 'none' });
      return;
    }
    const feelings = Object.keys(d.feelingSel);
    const rec = feedback.add({
      teaId: d.teaId,
      teaName: d.tea.name,
      constitutionId: d.tea.constitution,
      effect: d.effect,
      feelings: feelings,
      taste: d.taste,
      note: d.note,
      uploadNote: d.canUpload && d.uploadNote
    });

    // 有 AI 增强（且已单独同意）时，把最小化后的反馈同步给服务端记忆，
    // 让顾问在后续对话里能引用这次体感。无网络/未开启时静默跳过。
    if (d.canUpload) {
      remote.sendFeedback({
        teaId: rec.teaId,
        teaName: rec.teaName,
        constitutionId: rec.constitutionId,
        effect: rec.effect,
        feelings: rec.feelings,
        note: rec.uploadNote ? rec.note : ''
      });
    }

    const lines = [];
    const negative = d.effect === 'worse';
    const badFeelings = feelings.filter(function (f) {
      const it = feedback.FEELING_MAP[f];
      return it && !it.good;
    });

    if (negative) {
      lines.push('已经记下这次的不适。请先停用这款茶，观察 3–5 天；期间症状没有缓解，或出现明显腹痛腹泻、皮疹、心慌、头晕乏力等情况，请及时前往正规医疗机构就诊。');
      lines.push('之后我会把这款茶从推荐里往后放，并优先给你更温和的方向。');
    } else if (d.effect === 'better') {
      lines.push('已经记下这次的良好体感。我会在后续推荐里优先考虑这款，以及方向相近的配方。');
      lines.push('养生茶讲究温和缓慢，建议以 2–4 周为一个观察周期，中间留出停一停的时间。');
    } else {
      lines.push('已经记下这次记录。短时间内没有明显体感是正常的，养生茶不属于速效方案。');
      lines.push('继续观察睡眠、精神、胃口这几项感受就好；如果喝了一段时间一直没感觉，也可以换一个方向试试。');
    }
    if (badFeelings.length) {
      lines.push('你勾选的「' + badFeelings.map(function (f) { return feedback.FEELING_MAP[f].label; }).join('、') + '」已一并记录。');
    }

    this.setData({
      done: true,
      doneTone: negative ? 'warn' : 'ok',
      doneText: lines
    });
    wx.showToast({ title: '已记录', icon: 'none' });
    this.loadRecords();
  },

  removeRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除记录',
      content: '删除后这条体感不再参与推荐调整。',
      confirmText: '删除',
      confirmColor: '#C4553F',
      success: (res) => {
        if (!res.confirm) return;
        feedback.remove(id);
        this.loadRecords();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  askAdvisor() {
    const t = this.data.tea;
    getApp().globalData.presetAsk = t
      ? ('我喝完' + t.name + '有了一些感受，帮我看看接下来怎么调整')
      : '我想聊聊喝完茶之后的感受';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' });
  },

  goChat() {
    getApp().globalData.presetAsk = '帮我看看最近适合喝什么';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  onShareAppMessage() {
    return { title: '茶历方 · 记录喝茶体感，让推荐更懂你', path: '/pages/index/index' };
  }
});
