const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');

Page({
  data: {
    tea: null,
    c: null,
    favorite: false,
    related: [],
    seasonName: '',
    seasonFit: false,
    /* 安全提示 */
    risk: null,
    riskText: '',
    drugNotes: [],
    drugGeneral: '',
    usageCap: '',
    courseText: ''
  },

  onLoad(options) {
    const id = options.id || '';
    const tea = teas.get(id);
    if (!tea) {
      // 正常路径不会走到这里（tea-card 的 select 事件一定带 id）；
      // 走到这里说明链接缺参（如分享卡片被截断），兜底回列表页。
      wx.showToast({ title: '茶方不存在', icon: 'none' });
      setTimeout(function () {
        if (getCurrentPages().length > 1) {
          wx.navigateBack({ delta: 1 });
        } else {
          wx.switchTab({ url: '/pages/tea/tea' });
        }
      }, 900);
      return;
    }
    const c = constitutions.getOr(tea.constitution);
    const season = engine.seasonOf();
    const related = engine.recommend(tea.constitution, { season: season, limit: 3 })
      .filter(function (t) { return t.id !== tea.id; })
      .slice(0, 2);

    // 安全提示：只对「用户实际填了用药/慢病/阶段」的情况展示，
    // 避免没有档案的用户被一堆与己无关的禁忌刷屏。
    const profile = store.getProfile();
    const basic = (profile && profile.basic) || null;
    const risk = basic ? engine.riskOf(tea, basic) : null;
    let riskText = '';
    if (risk) {
      const parts = risk.items.map(function (i) {
        return '【' + i.level + '】' + i.keyword + '：' + i.reason;
      });
      riskText = parts.join('\n');
    }
    const course = tea.courseLimit || {};

    this.setData({
      tea: tea,
      c: c,
      favorite: store.isFavorite(tea.id),
      related: related,
      seasonName: engine.seasonName(season),
      seasonFit: !!(tea.season && tea.season.indexOf(season) > -1),
      risk: risk,
      riskText: riskText,
      drugNotes: risk ? risk.drugNotes : [],
      drugGeneral: teas.DRUG_NOTE_GENERAL,
      usageCap: tea.usageCap || '',
      contra: (tea.contraindications || []).map(function (x) {
        return { level: x.level, text: x.keyword + '：' + x.reason };
      }),
      courseText: course.maxWeeks
        ? ('连续 ' + course.maxWeeks + ' 周后停 ' + course.restWeeks + ' 周再评估')
        : ''
    });
    store.addHistory(tea.id);
    wx.setNavigationBarTitle({ title: tea.name });
  },

  toggleFav() {
    if (!this.data.tea) return;
    const on = store.toggleFavorite(this.data.tea.id);
    this.setData({ favorite: on });
    wx.showToast({ title: on ? '已加入收藏' : '已取消收藏', icon: 'none' });
  },

  askAdvisor() {
    if (!this.data.tea) return;
    getApp().globalData.presetAsk = '我适合喝' + this.data.tea.name + '吗';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  copyRecipe() {
    const t = this.data.tea;
    if (!t) return;
    const lines = [];
    lines.push('【茶历方 · ' + t.name + '】');
    lines.push(t.subtitle);
    lines.push('');
    lines.push('配方：' + t.ingredients.map(function (i) {
      return i.name + ' ' + i.amount + '（' + i.role + '）';
    }).join('、'));
    lines.push('性味：' + t.nature + '，' + t.taste);
    lines.push('');
    lines.push('冲泡：' + t.brew.water + '，' + t.brew.time);
    t.brew.steps.forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
    lines.push('最佳时段：' + t.brew.best + '｜频次：' + t.brew.frequency);
    if (this.data.courseText) lines.push('疗程：' + this.data.courseText);
    if (t.usageCap) lines.push('用量口径：' + t.usageCap + '（' + (t.dosageBasis || '代茶饮用量') + '）');
    lines.push('');
    lines.push('注意：' + t.caution.join('；') + '。');
    if (t.isPilot) lines.push('试点物质提示：含黄芪/党参，非全国通用食材，非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。');
    if (this.data.risk) {
      lines.push('');
      lines.push('我的情况提示：');
      if (this.data.riskText) lines.push(this.data.riskText);
      this.data.drugNotes.forEach(function (n) { lines.push(n); });
    }
    lines.push('');
    lines.push('本建议仅作日常养生参考，不替代专业医疗建议。');

    wx.setClipboardData({
      data: lines.join('\n'),
      success: function () {
        wx.showToast({ title: '配方已复制', icon: 'none' });
      }
    });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  goConstitution() {
    if (!this.data.c) return;
    wx.navigateTo({ url: '/pages/knowledge-detail/knowledge-detail?type=constitution&id=' + this.data.c.id });
  },

  onShareAppMessage() {
    const t = this.data.tea;
    return {
      title: t ? (t.name + ' · ' + t.subtitle) : '茶历方 · 养生茶',
      path: t ? ('/pages/tea-detail/tea-detail?id=' + t.id) : '/pages/index/index'
    };
  }
});
