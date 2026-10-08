const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const store = require('../../utils/store.js');

function decorate(ids) {
  return ids.map(function (id) {
    const t = teas.map[id];
    if (!t) return null;
    const c = constitutions.get(t.constitution);
    return Object.assign({}, t, {
      constitutionName: c.name
    });
  }).filter(Boolean);
}

Page({
  data: {
    tab: 'fav',
    favList: [],
    historyList: []
  },

  onLoad(options) {
    if (options && options.tab === 'history') {
      this.setData({ tab: 'history' });
    }
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({
      favList: decorate(store.getFavorites()),
      historyList: decorate(store.getHistory())
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  goTea() {
    wx.switchTab({ url: '/pages/tea/tea' });
  },

  clearHistory() {
    wx.showModal({
      title: '清空浏览记录',
      content: '将清空全部浏览记录，收藏不受影响。',
      confirmColor: '#2E6B4F',
      success: (res) => {
        if (!res.confirm) return;
        store.clearHistory();
        this.load();
      }
    });
  }
});
