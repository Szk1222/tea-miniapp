const questions = require('../../data/questions.js');
const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');

const BASIC = questions.basic;

const STEPS = [];
STEPS.push({ kind: 'basic1' });
STEPS.push({ kind: 'basic2' });
questions.list.forEach(function (q, i) {
  STEPS.push({ kind: 'q', index: i });
});

Page({
  data: {
    steps: [],
    total: 0,
    step: 0,
    percent: 0,
    kind: 'basic1',
    q: null,
    qIndex: 0,
    selected: -1,
    /* 基础信息 */
    genders: BASIC.genders,
    ages: BASIC.ages,
    conditions: BASIC.conditions,
    stages: BASIC.stages,
    tastes: BASIC.tastes,
    gender: '',
    age: '',
    stage: '无',
    condSel: {},
    tasteSel: {},
    allergy: '',
    basicReady: false,
    /* 计分 */
    answers: []
  },

  onLoad() {
    const answers = questions.list.map(function () { return -1; });
    this.setData({
      steps: STEPS,
      total: STEPS.length,
      step: 0,
      kind: STEPS[0].kind,
      answers: answers
    });
    this.syncProgress();
  },

  syncProgress() {
    const s = this.data.step;
    const total = this.data.total;
    const cur = STEPS[s];
    const patch = {
      percent: Math.round(((s) / total) * 100),
      kind: cur.kind
    };
    if (cur.kind === 'q') {
      const q = questions.list[cur.index];
      patch.q = q;
      patch.qIndex = cur.index;
      patch.selected = this.data.answers[cur.index];
    }
    this.setData(patch);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  prev() {
    if (this.data.step <= 0) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ step: this.data.step - 1 }, () => this.syncProgress());
  },

  /* ---------- 基础信息 ---------- */
  pickGender(e) {
    this.setData({ gender: e.currentTarget.dataset.v }, () => this.checkBasic1());
  },
  pickAge(e) {
    this.setData({ age: e.currentTarget.dataset.v }, () => this.checkBasic1());
  },
  checkBasic1() {
    this.setData({ basicReady: !!(this.data.gender && this.data.age) });
  },

  pickStage(e) {
    this.setData({ stage: e.currentTarget.dataset.v });
  },
  toggleCond(e) {
    const v = e.currentTarget.dataset.v;
    const sel = Object.assign({}, this.data.condSel);
    if (v === '以上都没有') {
      const on = !sel[v];
      Object.keys(sel).forEach(function (k) { delete sel[k]; });
      if (on) sel[v] = true;
    } else {
      delete sel['以上都没有'];
      if (sel[v]) delete sel[v];
      else sel[v] = true;
    }
    this.setData({ condSel: sel });
  },
  toggleTaste(e) {
    const v = e.currentTarget.dataset.v;
    const sel = Object.assign({}, this.data.tasteSel);
    if (sel[v]) delete sel[v];
    else sel[v] = true;
    this.setData({ tasteSel: sel });
  },
  onAllergy(e) {
    this.setData({ allergy: e.detail.value });
  },

  next() {
    const s = this.data.step;
    const cur = STEPS[s];

    if (cur.kind === 'basic1' && !this.data.basicReady) {
      wx.showToast({ title: '请选择性别与年龄段', icon: 'none' });
      return;
    }
    if (s >= this.data.total - 1) return;
    this.setData({ step: s + 1 }, () => this.syncProgress());
  },

  /* ---------- 答题 ---------- */
  chooseOption(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const qi = this.data.qIndex;
    const answers = this.data.answers.slice();
    answers[qi] = idx;
    this.setData({ selected: idx, answers: answers });
    setTimeout(() => {
      if (this.data.step >= this.data.total - 1) {
        this.finish();
      } else {
        this.setData({ step: this.data.step + 1 }, () => this.syncProgress());
      }
    }, 220);
  },

  jumpTo(e) {
    const s = Number(e.currentTarget.dataset.step);
    if (s <= this.data.step) {
      this.setData({ step: s }, () => this.syncProgress());
    }
  },

  /* ---------- 出结果 ---------- */
  finish() {
    const d = this.data;
    const result = engine.analyze(d.answers);
    const condList = Object.keys(d.condSel);
    const tasteList = Object.keys(d.tasteSel);
    const basic = {
      gender: d.gender,
      age: d.age,
      stage: d.stage,
      conditions: condList,
      tastes: tasteList,
      allergy: (d.allergy || '').trim()
    };
    const profile = {
      constitutionId: result.main,
      secondaryId: result.secondary,
      ranking: result.ranking,
      percent: result.percent,
      level: result.level,
      levelText: result.levelText,
      basic: basic,
      answeredAt: Date.now()
    };

    store.setProfile(profile);
    store.setConsult({
      stages: d.stage,
      conditions: condList.join('、') || '以上都没有',
      allergy: basic.allergy,
      tastes: tasteList
    });
    getApp().globalData.profile = profile;

    const risk = d.stage === '孕期' || d.stage === '哺乳期' || d.stage === '备孕中' ||
      d.age === '18 岁以下' ||
      condList.some(function (x) { return x !== '以上都没有'; });

    if (risk) {
      wx.showModal({
        title: '特殊人群提示',
        content: '你填写的信息涉及需要特别留意的阶段或基础健康情况。以下结果仅用于了解体质养生方向，任何茶饮建议请先咨询医师后再决定是否饮用。',
        showCancel: false,
        confirmText: '我已了解',
        confirmColor: '#2E6B4F',
        success: () => {
          wx.redirectTo({ url: '/pages/result/result' });
        }
      });
      return;
    }
    wx.redirectTo({ url: '/pages/result/result' });
  }
});
