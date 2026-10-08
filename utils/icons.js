/**
 * 统一图标库（线性 SVG，24x24 网格）
 * 全部以 data-uri 形式输出，配合 background-image 使用，规避 emoji 与图片资源
 * 用法：icons.url('home', '#2E6B4F', 1.7)
 */

const ICONS = {
  home: '<path d="M3 9.3 12 2.4l9 6.9V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.3 21v-6.4h5.4V21"/>',
  tea: '<path d="M4.2 8.4h12.6v7.2a4.9 4.9 0 0 1-4.9 4.9H9.1a4.9 4.9 0 0 1-4.9-4.9z"/><path d="M16.8 9.8h1.7a3 3 0 0 1 0 6h-1.7"/><path d="M8.4 2.6v3.2M12.6 2.6v3.2"/>',
  cup: '<path d="M5 6h11v9.2a4.6 4.6 0 0 1-4.6 4.6H9.6A4.6 4.6 0 0 1 5 15.2z"/><path d="M16 8.6h1.6a2.9 2.9 0 0 1 0 5.8H16"/><path d="M8.6 2.6a2.4 2.4 0 0 0 0 3.4M12.4 2.6a2.4 2.4 0 0 0 0 3.4"/>',
  user: '<path d="M20 20.4v-1.8a4.4 4.4 0 0 0-4.4-4.4H8.4A4.4 4.4 0 0 0 4 18.6v1.8"/><circle cx="12" cy="7.6" r="4"/>',
  chat: '<path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.7-.9L3 20.6l1.5-5.3A8.4 8.4 0 0 1 12.4 3 8.4 8.4 0 0 1 21 11.6z"/><path d="M8.8 11.6h6.4M9.6 14.8h4.8"/>',
  clipboard: '<path d="M15.6 4H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2.4"/><rect x="8.4" y="2.2" width="7.2" height="3.8" rx="1.2"/><path d="M9 12.4h6M9 16.4h4"/>',
  list: '<path d="M8.4 6h12M8.4 12h12M8.4 18h12"/><path d="M3.6 6h.01M3.6 12h.01M3.6 18h.01"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  share: '<circle cx="18" cy="5" r="2.8"/><circle cx="6" cy="12" r="2.8"/><circle cx="18" cy="19" r="2.8"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  star: '<path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.7l-5.9 3.1 1.13-6.57L2.45 9.54l6.6-.96z"/>',
  leaf: '<path d="M11 20.4A7.4 7.4 0 0 1 9.7 6.1C15.6 5 17.2 4.4 19.2 2c1 2 2 4.2 2 8 0 5.6-4.8 10.4-10.2 10.4z"/><path d="M2.4 21.4c0-3.1 1.9-5.6 5.2-6.2 2.5-.5 5-2 6-3.5"/>',
  droplet: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  flame: '<path d="M12 22c4.4 0 7-2.9 7-6.6 0-2.3-1.2-4.2-2.6-5.7-1-1-2-2.2-2.4-3.7-.2-.8-.3-1.6-.3-2.5-2.2 1-3.9 2.6-4.8 4.4-.5-1-.6-2.1-.5-3.2C6 6.3 5 8.9 5 11.6 5 18 7.6 22 12 22z"/>',
  wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.2v2.2M12 19.6v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.2 12h2.2M19.6 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  clock: '<circle cx="12" cy="12" r="9.4"/><path d="M12 6.6V12l3.8 2.2"/>',
  calendar: '<rect x="3.2" y="4.4" width="17.6" height="17" rx="2.4"/><path d="M16 2.4v4M8 2.4v4M3.2 10.4h17.6"/>',
  shield: '<path d="M12 22s8-3.9 8-10V5.2L12 2.2 4 5.2V12c0 6.1 8 10 8 10z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  info: '<circle cx="12" cy="12" r="9.4"/><path d="M12 16.4v-4.8M12 8.2h.01"/>',
  help: '<circle cx="12" cy="12" r="9.4"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.6-2.7 4"/><path d="M12 17.4h.01"/>',
  check: '<path d="M20 6.5L9.2 17.3l-5.2-5.2"/>',
  checkCircle: '<path d="M21.6 11.1V12a9.6 9.6 0 1 1-5.7-8.8"/><path d="M21.6 4.4l-9.6 9.6-2.9-2.9"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7.6"/><path d="M21 21l-4.4-4.4"/>',
  send: '<path d="M21.4 2.6L10.6 13.4"/><path d="M21.4 2.6l-6.8 19-4-9.2-9.2-4 19-5.8z"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  arrowRight: '<path d="M4.6 12h14.8M13 5.6l6.4 6.4-6.4 6.4"/>',
  arrowLeft: '<path d="M19.4 12H4.6M11 18.4L4.6 12 11 5.6"/>',
  filter: '<path d="M21.4 3.4H2.6l7.5 8.9v6.1l3.8 1.9v-8l7.5-8.9z"/>',
  sliders: '<path d="M4 21v-6.6M4 10.4V3M12 21v-8.8M12 8.2V3M20 21v-4.6M20 12.4V3M1.6 14.4h4.8M9.6 8.2h4.8M17.6 16.4h4.8"/>',
  refresh: '<path d="M22.4 4.4v5.6h-5.6"/><path d="M1.6 19.6V14h5.6"/><path d="M3.9 9.2a9 9 0 0 1 14.8-3.4l3.7 3.8M1.6 14l3.7 3.8A9 9 0 0 0 20.1 14.8"/>',
  history: '<path d="M1.6 4.4v5.6H7.2"/><path d="M3.9 14.6a9 9 0 1 0 2.1-9.3L1.6 10"/>',
  edit: '<path d="M11 4H4.4A2.4 2.4 0 0 0 2 6.4v13.2A2.4 2.4 0 0 0 4.4 22h13.2a2.4 2.4 0 0 0 2.4-2.4V13"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4.4A1.4 1.4 0 0 1 9.4 3h5.2A1.4 1.4 0 0 1 16 4.4V6M18.6 6l-1 13.6a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.4 6"/>',
  lock: '<rect x="3.4" y="10.6" width="17.2" height="10.6" rx="2.4"/><path d="M7.4 10.6V7a4.6 4.6 0 0 1 9.2 0v3.6"/>',
  target: '<circle cx="12" cy="12" r="9.4"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.6"/>',
  grid: '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.8"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="1.8"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="1.8"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7.4L3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.4v4.2M12 17.2h.01"/>',
  sparkle: '<path d="M11.4 2.6l1.7 4.9 4.9 1.7-4.9 1.7-1.7 4.9-1.7-4.9L4.8 9.2l4.9-1.7z"/><path d="M18.4 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  thermometer: '<path d="M14 14.8V3.8a2.4 2.4 0 0 0-4.8 0v11a4.4 4.4 0 1 0 4.8 0z"/>',
  eye: '<path d="M1.6 12S5.4 4.4 12 4.4 22.4 12 22.4 12 18.6 19.6 12 19.6 1.6 12 1.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
  gift: '<path d="M20.4 12v9.4H3.6V12"/><rect x="2.2" y="7.4" width="19.6" height="4.6" rx="1.2"/><path d="M12 21.4V7.4"/><path d="M12 7.4H7.8a2.6 2.6 0 1 1 0-5.2c2.6 0 4.2 5.2 4.2 5.2zM12 7.4h4.2a2.6 2.6 0 1 0 0-5.2C13.6 2.2 12 7.4 12 7.4z"/>',
  award: '<circle cx="12" cy="8.6" r="5.6"/><path d="M8.6 13.4L7 22l5-3 5 3-1.6-8.6"/>',
  scale: '<path d="M12 3.4v17.2M6.4 20.6h11.2"/><path d="M5 7l-3.4 6.6h6.8zM19 7l-3.4 6.6h6.8z"/><path d="M5 7l7-2 7 2"/>',
  compass: '<circle cx="12" cy="12" r="9.4"/><path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6z"/>',
  seal: '<path d="M6.6 3.4h10.8v6.2H6.6z"/><path d="M5 12.4h14v8.2H5z"/><path d="M9 16.4h6"/>',
  cloud: '<path d="M17.6 10.2h-1.3A6.9 6.9 0 1 0 6.8 18.2h10.8a4 4 0 0 0 0-8z"/>',
  activity: '<path d="M21.6 12h-4.2l-3.1 8.2L9.7 3.8 6.6 12H2.4"/>',
  wave: '<path d="M2 8.4c2.6-2.6 5.4-2.6 8 0s5.4 2.6 8 0M2 15.6c2.6-2.6 5.4-2.6 8 0s5.4 2.6 8 0"/>',
  snow: '<path d="M12 2.4v19.2M3.7 7.2l16.6 9.6M20.3 7.2L3.7 16.8"/>'
};

const cache = {};

function build(name, color, weight, filled) {
  const key = name + '|' + color + '|' + weight + '|' + (filled ? 1 : 0);
  if (cache[key]) return cache[key];
  const inner = ICONS[name] || ICONS.leaf;
  const stroke = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' +
    (filled ? color : 'none') + '" stroke="' + color + '" stroke-width="' + weight +
    '" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stroke);
  cache[key] = uri;
  return uri;
}

module.exports = {
  ICONS: ICONS,
  /** 生成图标背景图 data-uri */
  url: function (name, color, weight, filled) {
    return build(name, color || '#2E6B4F', weight || 1.7, !!filled);
  },
  /** 校验图标是否存在 */
  has: function (name) {
    return !!ICONS[name];
  }
};
