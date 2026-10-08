const store = require('../../utils/store.js');
const engine = require('../../utils/engine.js');
const constitutions = require('../../data/constitutions.js');
const teas = require('../../data/teas.js');

Page({
  data: {
    hasProfile: false,
    profile: null,
    c: null,
    secondary: null,
    ranking: [],
    recommend: [],
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
    const recommend = engine.recommend(c.id, {
      secondary: profile.secondaryId,
      season: season,
      limit: 3
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

    const basic = profile.basic || {};
    const basicTags = [];
    if (basic.gender) basicTags.push(basic.gender);
    if (basic.age) basicTags.push(basic.age);
    if (basic.stage && basic.stage !== '无') basicTags.push(basic.stage);
    (basic.conditions || []).forEach(function (x) {
      if (x !== '以上都没有') basicTags.push(x);
    });
    (basic.tastes || []).forEach(function (x) { basicTags.push(x); });
    if (basic.allergy) basicTags.push('过敏：' + basic.allergy);

    let risk = null;
    const highRisk = basic.stage === '孕期' || basic.stage === '哺乳期' || basic.age === '18 岁以下';
    const midRisk = (basic.conditions || []).some(function (x) { return x !== '以上都没有'; });
    if (highRisk) {
      risk = {
        tone: 'danger',
        text: '你填写的阶段信息属于特殊时期，本页所有茶饮建议仅供了解养生方向，请务必先咨询医师后再决定是否饮用。'
      };
    } else if (midRisk) {
      risk = {
        tone: 'warn',
        text: '你填写的信息涉及基础健康情况，部分食材可能与用药相互影响，建议饮用前先咨询你的主治医师。'
      };
    } else if (basic.allergy) {
      risk = {
        tone: 'warn',
        text: '你填写了过敏史，建议优先选择成分单一的茶方，初次只喝小半杯，观察 24 小时没有不适再正常饮用。'
      };
    }

    this.setData({
      hasProfile: true,
      profile: profile,
      c: c,
      secondary: secondary,
      ranking: ranking,
      recommend: recommend,
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

  goConstitutionDetail() {
    if (!this.data.c) return;
    wx.navigateTo({ url: '/pages/knowledge-detail/knowledge-detail?type=constitution&id=' + this.data.c.id });
  },

  copySummary() {
    const d = this.data;
    if (!d.c) return;
    const lines = [];
    lines.push('【茶历方体质档案】');
    lines.push('主导体质：' + d.c.name + '（' + d.profile.levelText + '）');
    if (d.secondary) lines.push('兼夹倾向：' + d.secondary.name);
    lines.push('');
    lines.push('推荐茶方：');
    d.recommend.forEach(function (t) {
      lines.push('· ' + t.name + '：' + t.ingredients.map(function (i) {
        return i.name + ' ' + i.amount;
      }).join('、'));
    });
    lines.push('');
    lines.push('本建议仅作日常养生参考，不替代专业医疗建议。');
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
      title: d.c ? ('我的体质是' + d.c.name + '，推荐了这几款养生茶') : '茶历方 · 中医体质养生茶',
      path: '/pages/index/index'
    };
  }
});
