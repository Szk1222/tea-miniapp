const questions = require('../../data/questions.js');
const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');

const BASIC = questions.basic;

const STEPS = [];
STEPS.push({ kind: 'basic1' });   // 性别 / 年龄段
STEPS.push({ kind: 'basic2' });   // 阶段 / 慢病 / 口味 / 过敏史文本
STEPS.push({ kind: 'basic3' });   // 在用西药 / 补充剂 / 过敏原 / 月经情况
questions.list.forEach(function (q, i) {
  STEPS.push({ kind: 'q', index: i });
});

/** 多选互斥工具：「以上都没有」与其它项互斥 */
function toggleIn(sel, v, noneLabel) {
  const next = Object.assign({}, sel);
  if (v === noneLabel) {
    const on = !next[v];
    Object.keys(next).forEach(function (k) { delete next[k]; });
    if (on) next[v] = true;
  } else {
    delete next[noneLabel];
    if (next[v]) delete next[v];
    else next[v] = true;
  }
  return next;
}

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
    drugs: BASIC.drugs,
    supplements: BASIC.supplements,
    stages: BASIC.stages,
    allergens: BASIC.allergens,
    menses: BASIC.menses,
    tastes: BASIC.tastes,
    gender: '',
    age: '',
    stage: '无',
    mensesSel: '',
    condSel: {},
    drugSel: {},
    suppSel: {},
    allergenSel: {},
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
  pickMenses(e) {
    this.setData({ mensesSel: e.currentTarget.dataset.v });
  },

  toggleCond(e) {
    this.setData({ condSel: toggleIn(this.data.condSel, e.currentTarget.dataset.v, '以上都没有') });
  },
  toggleDrug(e) {
    this.setData({ drugSel: toggleIn(this.data.drugSel, e.currentTarget.dataset.v, '以上都没有') });
  },
  toggleSupp(e) {
    this.setData({ suppSel: toggleIn(this.data.suppSel, e.currentTarget.dataset.v, '以上都没有') });
  },
  toggleAllergen(e) {
    this.setData({ allergenSel: toggleIn(this.data.allergenSel, e.currentTarget.dataset.v, '以上都没有') });
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
    const drugList = Object.keys(d.drugSel);
    const suppList = Object.keys(d.suppSel);
    const allergenList = Object.keys(d.allergenSel);
    const tasteList = Object.keys(d.tasteSel);
    const basic = {
      gender: d.gender,
      age: d.age,
      stage: d.stage,
      conditions: condList,
      drugs: drugList,
      supplements: suppList,
      allergens: allergenList,
      menses: d.gender === '女' ? (d.mensesSel || '') : '',
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
      drugs: drugList.join('、') || '以上都没有',
      allergens: allergenList.join('、') || '以上都没有',
      allergy: basic.allergy,
      tastes: tasteList
    });
    getApp().globalData.profile = profile;

    // 风险判定统一走 engine.riskFlags：这里改了判定口径，结果页与服务端的标记才能一致
    const flags = engine.riskFlags(basic);
    const risk = flags.stage || flags.chronic;

    if (risk) {
      wx.showModal({
        title: '特殊人群提示',
        content: '你填写的信息涉及需要特别留意的阶段、基础健康情况或用药物。以下结果仅用于了解体质养生方向，任何茶饮建议请先咨询医师后再决定是否饮用。',
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
