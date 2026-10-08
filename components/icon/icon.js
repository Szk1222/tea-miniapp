const icons = require('../../utils/icons.js');

Component({
  options: {
    virtualHost: true
  },
  properties: {
    name: { type: String, value: 'leaf' },
    /** 尺寸，单位 rpx */
    size: { type: Number, value: 40 },
    color: { type: String, value: '#2E6B4F' },
    weight: { type: Number, value: 1.7 },
    filled: { type: Boolean, value: false },
    /** 圆形底色 */
    bg: { type: String, value: '' },
    bgSize: { type: Number, value: 0 }
  },
  data: {
    src: '',
    wrapStyle: '',
    innerStyle: ''
  },
  observers: {
    'name, color, weight, filled, size, bg': function () {
      this.render();
    }
  },
  lifetimes: {
    attached() {
      this.render();
    }
  },
  methods: {
    render() {
      const p = this.data;
      const src = icons.url(p.name, p.color, p.weight, p.filled);
      const s = p.size;
      let wrapStyle = 'width:' + s + 'rpx;height:' + s + 'rpx;flex:0 0 auto;display:flex;align-items:center;justify-content:center;';
      if (p.bg) {
        wrapStyle += 'background:' + p.bg + ';border-radius:50%;';
      }
      const inner = Math.max(10, s - (p.bg ? Math.round(s * 0.42) : 0));
      const innerStyle = 'width:' + inner + 'rpx;height:' + inner + 'rpx;background-image:url("' + src +
        '");background-size:contain;background-repeat:no-repeat;background-position:center;';
      this.setData({ src: src, wrapStyle: wrapStyle, innerStyle: innerStyle });
    }
  }
});
