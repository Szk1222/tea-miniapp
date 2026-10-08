const store = require('./utils/store.js');

App({
  globalData: {
    /** 体质档案 { constitutionId, scores, secondary, date, basic } */
    profile: null,
    /** 最近一次点击的茶方，用于详情页兜底 */
    activeTeaId: '',
    /** 从首页跳转对话页时携带的预设问题 */
    presetAsk: '',
    /** 对话页待发送的快捷意图 */
    chatIntent: null,
    consult: {
      pregnant: '',
      chronic: '',
      allergy: '',
      prefer: []
    }
  },

  onLaunch() {
    const profile = store.getProfile();
    if (profile && profile.constitutionId) {
      this.globalData.profile = profile;
    }
    // 初始化浏览历史容器
    store.ensureInit();
  },

  onShow() {
    // 每次回到前台同步一次体质档案
    const profile = store.getProfile();
    if (profile && profile.constitutionId) {
      this.globalData.profile = profile;
    }
  }
});
