const store = require('../../utils/store.js');

Page({
  data: {
    version: '1.0.0',
    feedback: '',
    tab: 'disclaimer',
    disclaimer: [
      '茶历方是面向日常养生的茶饮推荐工具，全部内容依据公开的中医体质学说与药食同源食材资料整理。',
      '本小程序不具备医疗诊断、开具处方或治疗疾病的资质。所有体质判定结果、茶方推荐、食材说明均仅作日常养生参考，不构成任何医疗建议，不能替代专业医师的面诊与诊断。',
      '若你正在患病、正在服药，或处于孕期、哺乳期、儿童期等特殊阶段，请在饮用任何含药材成分的茶饮前先咨询专业医师。',
      '若出现明确的身体不适、疾病症状或用药需求，请及时前往正规医疗机构就诊，不要依赖本小程序的内容自行判断。'
    ],
    privacy: [
      '我们仅在你主动使用测评功能时收集必要的养生参考信息，包括性别、年龄段、身体感受、饮食习惯与过敏史。',
      '以上信息与你的收藏、浏览记录全部保存在你手机本地（小程序本地存储），不会上传至服务器，也不会与任何第三方共享。',
      '我们不会收集你的手机号、通讯录、位置等与养生推荐无关的信息。',
      '你可以随时在「我的 → 清除本地数据」中一键删除全部记录，删除后不可恢复。'
    ],
    special: [
      '孕期、哺乳期、备孕期：请咨询产科或中医师后再决定是否饮用。',
      '14 岁以下儿童：不建议饮用含药材成分的养生茶，日常以温开水和清淡饮食为主。',
      '有高血压、糖尿病、肝肾疾病或长期服药者：饮用前请咨询主治医师，避免与用药相互影响。',
      '过敏体质：优先选择成分单一的茶方，初次只喝小半杯，观察 24 小时无不适再正常饮用。'
    ]
  },

  onLoad() {
    const consult = store.getConsult();
    this.setData({});
    if (consult && consult.allergy) {
      // 保留用户已填写的过敏史，便于在反馈中带出
    }
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onFeedback(e) {
    this.setData({ feedback: e.detail.value });
  },

  submitFeedback() {
    const text = (this.data.feedback || '').trim();
    if (text.length < 4) {
      wx.showToast({ title: '请至少输入 4 个字', icon: 'none' });
      return;
    }
    wx.setStorageSync('tl_feedback_' + Date.now(), text);
    this.setData({ feedback: '' });
    wx.showToast({ title: '已收到，感谢反馈', icon: 'none' });
  },

  copyContact() {
    wx.setClipboardData({
      data: 'chalifang-support@example.com',
      success: function () {
        wx.showToast({ title: '邮箱已复制', icon: 'none' });
      }
    });
  },

  clearData() {
    wx.showModal({
      title: '清除本地数据',
      content: '将删除体质档案、收藏与浏览记录。此操作不可撤销。',
      confirmText: '确定清除',
      confirmColor: '#C4553F',
      success: (res) => {
        if (!res.confirm) return;
        store.clearAll();
        getApp().globalData.profile = null;
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return { title: '茶历方 · 中医体质养生茶推荐', path: '/pages/index/index' };
  }
});
