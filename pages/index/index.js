const store = require('../../utils/store.js');
const engine = require('../../utils/engine.js');
const teas = require('../../data/teas.js');
const constitutions = require('../../data/constitutions.js');
const feedback = require('../../utils/feedback.js');

const SEASON_TIP = {
  '春': '春季重在疏肝理气，宜气味芬芳、性质平和的茶饮。',
  '夏': '夏季湿热并重，宜清爽利湿，但不宜过度贪凉。',
  '秋': '秋季燥气当令，重在滋阴润燥，宜甘润类茶饮。',
  '冬': '冬季阳气内敛，宜温润暖身，建议白天饮用。'
};

Page({
  data: {
    greet: '你好',
    dateText: '',
    season: '春',
    seasonName: '春季',
    seasonTip: '',
    profile: null,
    mainConstitution: null,
    seasonal: [],
    allTeas: [],
    constitutions: [],
    teaTotal: 0,
    fbCount: 0,
    fbHint: '喝完顺手记一句，之后推荐会跟着调整。'
  },

  onLoad() {
    this.buildStatics();
  },

  onShow() {
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, hidden: false });
    }
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  buildStatics() {
    const d = new Date();
    const h = d.getHours();
    let greet = '晚上好';
    if (h < 6) greet = '夜深了';
    else if (h < 11) greet = '早上好';
    else if (h < 14) greet = '中午好';
    else if (h < 18) greet = '下午好';

    const season = engine.seasonOf(d);
    const seasonal = teas.list.filter(function (t) {
      return t.season && t.season.indexOf(season) > -1;
    }).slice(0, 6);

    this.setData({
      greet: greet,
      dateText: (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日',
      season: season,
      seasonName: engine.seasonName(season),
      seasonTip: SEASON_TIP[season],
      seasonal: seasonal,
      allTeas: teas.list.slice(0, 4),
      constitutions: constitutions.list,
      teaTotal: teas.total
    });
  },

  refresh() {
    const profile = store.getProfile();
    let mainConstitution = null;
    if (profile && profile.constitutionId) {
      mainConstitution = constitutions.getOr(profile.constitutionId);
    }
    // 体感反馈：首页首屏给一个轻量入口，顺带展示已记录条数与最近一款
    const fbStat = feedback.stats();
    const recent = feedback.list()[0];
    const fbHint = fbStat.total
      ? ('已记录 ' + fbStat.total + ' 次' + (recent && recent.teaName ? ' · 最近：' + recent.teaName : ''))
      : '喝完顺手记一句，之后推荐会跟着调整。';
    this.setData({
      profile: profile && profile.constitutionId ? profile : null,
      mainConstitution: mainConstitution,
      fbCount: fbStat.total,
      fbHint: fbHint
    });
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  goAssess() {
    wx.navigateTo({ url: '/pages/assess/assess' });
  },

  goChat(e) {
    const preset = e && e.currentTarget && e.currentTarget.dataset.ask;
    if (preset) {
      getApp().globalData.presetAsk = preset;
    }
    wx.switchTab({ url: '/pages/chat/chat' });
  },

  goTea() {
    wx.switchTab({ url: '/pages/tea/tea' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goResult() {
    wx.navigateTo({ url: '/pages/result/result' });
  },

  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  goConstitutionList(e) {
    const cid = e.currentTarget.dataset.id;
    wx.setStorageSync('tl_tea_filter', cid);
    wx.switchTab({ url: '/pages/tea/tea' });
  },

  openTea(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id });
  }
});
