const constitutions = require('../../data/constitutions.js');
const knowledge = require('../../data/knowledge.js');
const teas = require('../../data/teas.js');
const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');

Page({
  data: {
    type: 'constitution',
    c: null,
    ing: null,
    recommend: [],
    related: [],
    isMine: false,
    seasonName: ''
  },

  onLoad(options) {
    const type = (options && options.type) || 'constitution';
    const id = (options && options.id) || '';
    const profile = store.getProfile();
    const season = engine.seasonOf();

    if (type === 'ingredient') {
      const ing = knowledge.ingredients.filter(function (x) { return x.id === id; })[0];
      if (!ing) {
        wx.showToast({ title: '内容不存在', icon: 'none' });
        setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 900);
        return;
      }
      const related = teas.list.filter(function (t) {
        return t.ingredients.some(function (i) { return i.name.indexOf(ing.name) > -1; });
      });
      this.setData({
        type: 'ingredient',
        ing: ing,
        related: related,
        seasonName: engine.seasonName(season)
      });
      wx.setNavigationBarTitle({ title: ing.name });
      store.markRead('ing_' + id);
      return;
    }

    const c = constitutions.get(id);
    if (!c) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 900);
      return;
    }
    this.setData({
      type: 'constitution',
      c: c,
      recommend: engine.recommend(c.id, { season: season, limit: 3 }),
      isMine: !!(profile && profile.constitutionId === c.id),
      seasonName: engine.seasonName(season)
    });
    wx.setNavigationBarTitle({ title: c.name });
    store.markRead('c_' + id);
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  },

  askAdvisor() {
    const name = this.data.type === 'constitution' ? this.data.c.name : this.data.ing.name;
    getApp().globalData.presetAsk = '想了解' + name + '适合喝什么茶';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  onShareAppMessage() {
    const d = this.data;
    if (d.type === 'constitution') {
      return { title: d.c.name + '：' + d.c.short + '，该怎么喝养生茶', path: '/pages/index/index' };
    }
    return { title: d.ing.name + '：' + d.ing.effect, path: '/pages/index/index' };
  }
});
