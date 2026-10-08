const store = require('../../utils/store.js');
const CONFIG = require('../../utils/config.js');

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
      '测评中你填写的性别、年龄段、身体感受、饮食习惯、健康情况与过敏史，以及你的收藏与浏览记录，全部保存在你手机本地（小程序本地存储）。',
      '其中的健康情况与过敏史属于敏感个人信息，我们不会在未经你明确同意的情况下上传。',
      'AI 增强对话默认关闭。只有你主动开启并单独同意后，你的提问内容与体质类型才会发送至我们的服务器，并转交大模型服务商（火山方舟）用于生成回答。',
      '开启 AI 增强时，我们只上传体质类型，以及「是否存在需要特别提示的健康风险」这一标记；你的性别、年龄、慢性病名称、过敏史等原始填报内容不会上传。',
      '关闭 AI 增强后，全部对话在本机完成，不发出任何网络请求。',
      '我们不会收集你的手机号、通讯录、位置等与养生推荐无关的信息，不会用于广告投放或用户画像，也不向任何第三方出售你的个人信息。',
      '你可以随时在「我的 → 清除本地数据」中一键删除全部记录，同时会重置对话会话与 AI 授权，删除后不可恢复。'
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
      data: CONFIG.SUPPORT_EMAIL,
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
