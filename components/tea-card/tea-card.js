Component({
  options: { virtualHost: true },
  properties: {
    tea: { type: Object, value: null },
    /** row | grid | mini */
    variant: { type: String, value: 'row' },
    showChips: { type: Boolean, value: true },
    /** 是否展示体质归属标签（茶方库列表用） */
    showConstitution: { type: Boolean, value: false },
    constitutionName: { type: String, value: '' },
    favorite: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      if (!this.data.tea) return;
      // 注意：自定义事件名不能用 tap —— 组件的 bind:tap 会同时收到
      // 「组件内原生 tap 冒泡」（detail 是 {x,y}，没有 id）和「triggerEvent('tap')」，
      // 导致一次点击触发两次跳转，第二次带着 undefined 的 id 进详情页。
      this.triggerEvent('select', { id: this.data.tea.id });
    }
  }
});
