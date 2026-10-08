Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/chat/chat', text: '问茶', icon: 'chat' },
      { pagePath: '/pages/tea/tea', text: '茶方', icon: 'tea' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'user' }
    ]
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
      this.setData({ selected: index });
    }
  }
});
