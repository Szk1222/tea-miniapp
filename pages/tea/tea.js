const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const engine = require('../../utils/engine.js');
const store = require('../../utils/store.js');

Page({
  data: {
    keyword: '',
    filter: 'all',
    filters: [],
    list: [],
    total: 0,
    myId: '',
    myName: ''
  },

  onLoad() {
    const filters = [{ id: 'all', name: '全部', color: '#5A6A61' }];
    constitutions.list.forEach(function (c) {
      filters.push({ id: c.id, name: c.name, color: c.color });
    });
    this.setData({ filters: filters, total: teas.total });
    this.apply();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, hidden: false });
    }
    const pending = wx.getStorageSync('tl_tea_filter');
    const profile = store.getProfile();
    const myId = profile && profile.constitutionId ? profile.constitutionId : '';
    const patch = {
      myId: myId,
      myName: myId ? constitutions.getOr(myId).name : ''
    };
    if (pending) {
      wx.removeStorageSync('tl_tea_filter');
      patch.filter = pending;
    }
    this.setData(patch, () => this.apply());
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.apply());
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.apply());
  },

  pickFilter(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ filter: id }, () => this.apply());
  },

  pickMine() {
    if (!this.data.myId) {
      wx.navigateTo({ url: '/pages/assess/assess' });
      return;
    }
    this.setData({ filter: this.data.myId }, () => this.apply());
  },

  apply() {
    const d = this.data;
    let list = d.filter === 'all' ? teas.list.slice() : teas.byConstitution(d.filter);
    if (d.keyword) {
      const ids = engine.search(d.keyword).map(function (t) { return t.id; });
      list = list.filter(function (t) { return ids.indexOf(t.id) > -1; });
    }
    const withMeta = list.map(function (t) {
      const c = constitutions.getOr(t.constitution);
      return Object.assign({}, t, {
        constitutionName: c.name,
        constitutionColor: c.color
      });
    });
    this.setData({ list: withMeta });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  }
});
