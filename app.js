const store = require('./utils/store.js');
const contentClient = require('./utils/content-client.js');

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
    /** 当前生效的内容版本（管理后台下发，0 表示仍是内置内容） */
    contentVersion: 0,
    consult: {
      pregnant: '',
      chronic: '',
      allergy: '',
      prefer: []
    }
  },

  onLaunch() {
    const cfg = require('./utils/config.js');
    if (cfg.useCloud() && cfg.CLOUD_ENV_ID && wx.cloud && wx.cloud.init) {
      wx.cloud.init({ env: cfg.CLOUD_ENV_ID });
    }
    // 1) 同步套用上次缓存的内容库，保证首屏渲染用的就是最新已知内容。
    //    必须先于下面的档案读取，否则 contentVersion 与内容可能对不上。
    const boot = contentClient.bootstrap();
    this.globalData.contentVersion = boot.version || 0;

    const profile = store.getProfile();
    if (profile && profile.constitutionId) {
      this.globalData.profile = profile;
    }
    // 初始化浏览历史容器
    store.ensureInit();

    // 2) 静默拉取内容更新：成功则立即生效并通知当前页面，失败则静默保持内置内容。
    //    不 await，避免网络问题拖慢启动。
    contentClient.setup().then((r) => {
      if (r.refresh.status === 'applied') {
        this.globalData.contentVersion = r.refresh.version;
        console.log('[content] 已更新到 v' + r.refresh.version);
      }
    });
  },

  onShow() {
    // 每次回到前台同步一次体质档案
    const profile = store.getProfile();
    if (profile && profile.constitutionId) {
      this.globalData.profile = profile;
    }
  }
});
