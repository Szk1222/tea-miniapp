const constitutions = require('../../data/constitutions.js');
const knowledge = require('../../data/knowledge.js');
const store = require('../../utils/store.js');
const teas = require('../../data/teas.js');

Page({
  data: {
    tab: 'constitution',
    constitutions: [],
    ingredients: [],
    faq: [],
    openFaq: -1,
    myId: ''
  },

  onLoad(options) {
    const tab = (options && options.tab) || 'constitution';
    const profile = store.getProfile();
    this.setData({
      tab: tab,
      constitutions: constitutions.list.map(function (c) {
        return Object.assign({}, c, {
          teaCount: teas.byConstitution(c.id).length
        });
      }),
      ingredients: knowledge.ingredients,
      faq: knowledge.faq,
      myId: profile && profile.constitutionId ? profile.constitutionId : ''
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  toggleFaq(e) {
    const i = Number(e.currentTarget.dataset.idx);
    this.setData({ openFaq: this.data.openFaq === i ? -1 : i });
  },

  openConstitution(e) {
    wx.navigateTo({
      url: '/pages/knowledge-detail/knowledge-detail?type=constitution&id=' + e.currentTarget.dataset.id
    });
  },

  openIngredient(e) {
    wx.navigateTo({
      url: '/pages/knowledge-detail/knowledge-detail?type=ingredient&id=' + e.currentTarget.dataset.id
    });
  }
});
