const store = require('../../utils/store.js');
const engine = require('../../utils/engine.js');
const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');

Page({
  data: {
    hasProfile: false,
    profile: null,
    c: null,
    secondary: null,
    ranking: [],
    recommend: [],
    recommendEmpty: false,
    blocked: [],
    teaWarnings: [],
    seasonName: '',
    risk: null,
    basicTags: []
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    const profile = store.getProfile();
    if (!profile || !profile.constitutionId) {
      this.setData({ hasProfile: false });
      return;
    }
    const c = constitutions.getOr(profile.constitutionId);
    const secondary = profile.secondaryId ? constitutions.getOr(profile.secondaryId) : null;
    const season = engine.seasonOf();
    const basic = profile.basic || {};

    // 把用户填写的用药/慢病/阶段传进推荐：
    // ①「禁用/忌用」的茶方**不进推荐池**（它们是"不该喝"，不是"少喝一点"），
    //   单独放进 blocked 区块说明原因 —— 否则会出现「推荐它、又标它忌用」的自相矛盾；
    // ②「慎用/减量/咨询医师」仍可推荐，但排序靠后，并在下方逐款提示。
    const rf = engine.recommendFull(c.id, {
      secondary: profile.secondaryId,
      season: season,
      limit: 3,
      basic: basic
    });
    const recommend = rf.picks;
    const blocked = rf.blocked.map(function (b) {
      const parts = b.risk.items.map(function (i) { return i.level + '（' + i.reason + '）'; });
      return { id: b.tea.id, name: b.tea.name, level: b.risk.level, text: parts.join('；') };
    });

    const ranking = (profile.ranking || []).filter(function (r) {
      return r.raw > 0;
    }).slice(0, 5).map(function (r) {
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        percent: Math.max(6, r.percent)
      };
    });

    const basicTags = [];
    if (basic.gender) basicTags.push(basic.gender);
    if (basic.age) basicTags.push(basic.age);
    if (basic.stage && basic.stage !== '无') basicTags.push(basic.stage);
    (basic.conditions || []).forEach(function (x) {
      if (x !== '以上都没有') basicTags.push(x);
    });
    (basic.drugs || []).forEach(function (x) {
      if (x !== '以上都没有') basicTags.push('在用：' + x);
    });
    (basic.allergens || []).forEach(function (x) {
      if (x !== '以上都没有') basicTags.push('过敏原：' + x);
    });
    if (basic.menses) basicTags.push('月经：' + basic.menses);
    (basic.tastes || []).forEach(function (x) { basicTags.push(x); });
    if (basic.allergy) basicTags.push('过敏：' + basic.allergy);

    const flags = engine.riskFlags(basic);
    let risk = null;
    if (flags.stage) {
      risk = {
        tone: 'danger',
        text: '你填写的阶段信息属于特殊时期，本页所有茶饮建议仅供了解养生方向，请务必先咨询医师后再决定是否饮用。'
      };
    } else if (flags.chronic) {
      risk = {
        tone: 'warn',
        text: '你填写了基础健康情况或用药物，部分食材可能与用药相互影响，建议饮用前先咨询你的主治医师或药师。'
      };
    } else if (flags.allergy) {
      risk = {
        tone: 'warn',
        text: '你填写了过敏情况，建议优先选择成分单一的茶方，初次只喝小半杯，观察 24 小时没有不适再正常饮用。'
      };
    }

    // 逐款列出「为什么这款要留意」，比一句笼统提示更有用
    const teaWarnings = [];
    recommend.forEach(function (t) {
      const r = engine.riskOf(t, basic);
      if (!r) return;
      const parts = r.items.map(function (i) { return i.level + '（' + i.reason + '）'; });
      r.drugNotes.forEach(function (n) { parts.push(n); });
      teaWarnings.push({ id: t.id, name: t.name, level: r.level, text: parts.join('；') });
    });

    this.setData({
      hasProfile: true,
      profile: profile,
      c: c,
      secondary: secondary,
      ranking: ranking,
      recommend: recommend,
      recommendEmpty: !recommend.length,
      blocked: blocked,
      teaWarnings: teaWarnings,
      seasonName: engine.seasonName(season),
      risk: risk,
      basicTags: basicTags
    });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  },

  goChat() {
    getApp().globalData.presetAsk = '我是什么体质？该喝什么茶';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  goTeaList() {
    wx.switchTab({ url: '/pages/tea/tea' });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  openWarnTea(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  goConstitutionDetail() {
    if (!this.data.c) return;
    wx.navigateTo({ url: '/pages/knowledge-detail/knowledge-detail?type=constitution&id=' + this.data.c.id });
  },

  copySummary() {
    const d = this.data;
    if (!d.c) return;
    const lines = [];
    lines.push('【茶历方体质档案】');
    lines.push('主导倾向：' + d.c.name + '（' + d.profile.levelText + '）');
    if (d.secondary) lines.push('兼夹倾向：' + d.secondary.name);
    lines.push('');
    lines.push('推荐茶方：');
    d.recommend.forEach(function (t) {
      lines.push('· ' + t.name + '：' + t.ingredients.map(function (i) {
        return i.name + ' ' + i.amount;
      }).join('、'));
    });
    lines.push('');
    lines.push('剂量口径：单味 ≤8g、全方 ≤20g/日，当日饮完不留过夜。');
    lines.push('本结果基于自评问卷，仅供参考，不等同于中医师面诊辨识，不作为诊断或用药依据。');
    wx.setClipboardData({
      data: lines.join('\n'),
      success: function () {
        wx.showToast({ title: '已复制到剪贴板', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    const d = this.data;
    return {
      title: d.c ? ('我的体质倾向是' + d.c.name + '，推荐了这几款养生茶') : '茶历方 · 中医体质养生茶',
      path: '/pages/index/index'
    };
  }
});
