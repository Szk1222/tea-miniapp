const store = require('../../utils/store.js');
const constitutions = require('../../data/constitutions.js');
const teas = require('../../data/teas.js');

Page({
  data: {
    profile: null,
    c: null,
    favCount: 0,
    historyCount: 0,
    consult: null,
    teaTotal: teas.total,
    version: '1.0.0'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3, hidden: false });
    }
    this.load();
  },

  load() {
    const profile = store.getProfile();
    this.setData({
      profile: profile && profile.constitutionId ? profile : null,
      c: profile && profile.constitutionId ? constitutions.getOr(profile.constitutionId) : null,
      favCount: store.getFavorites().length,
      historyCount: store.getHistory().length,
      consult: store.getConsult()
    });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  },

  goResult() {
    wx.navigateTo({ url: '/pages/result/result' });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites?tab=fav' });
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/favorites/favorites?tab=history' });
  },

  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goChat() {
    getApp().globalData.presetAsk = '帮我看看最近适合喝什么';
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  clearData() {
    wx.showModal({
      title: '清除本地数据',
      content: '将删除体质档案、收藏与浏览记录。此操作不可撤销，确定继续吗？',
      confirmText: '确定清除',
      confirmColor: '#C4553F',
      success: (res) => {
        if (!res.confirm) return;
        store.clearAll();
        getApp().globalData.profile = null;
        this.load();
        wx.showToast({ title: '已清除本地数据', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return { title: '茶历方 · 中医体质养生茶推荐', path: '/pages/index/index' };
  }
});
