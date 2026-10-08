/**
 * 本地存储封装
 * 说明：正式上线时体质信息等健康敏感数据应加密存储并符合《个人信息保护法》要求，
 * 本 MVP 仅保存在用户本机，不做任何上传。
 */

const KEYS = {
  PROFILE: 'tl_profile_v1',
  FAV: 'tl_favorites_v1',
  HISTORY: 'tl_history_v1',
  CONSULT: 'tl_consult_v1',
  READ: 'tl_read_v1',
  INIT: 'tl_init_v1',
  SESSION: 'tl_session_v1',
  AI: 'tl_ai_v1'
};

function read(key, def) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || typeof v === 'undefined') return def;
    return v;
  } catch (e) {
    return def;
  }
}

function write(key, val) {
  try {
    wx.setStorageSync(key, val);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  KEYS: KEYS,

  ensureInit() {
    if (!read(KEYS.INIT, false)) {
      write(KEYS.FAV, []);
      write(KEYS.HISTORY, []);
      write(KEYS.INIT, true);
    }
  },

  /* -------- 体质档案 -------- */
  getProfile() {
    return read(KEYS.PROFILE, null);
  },
  setProfile(profile) {
    return write(KEYS.PROFILE, profile);
  },
  clearProfile() {
    return write(KEYS.PROFILE, null);
  },

  /* -------- 收藏 -------- */
  getFavorites() {
    return read(KEYS.FAV, []) || [];
  },
  isFavorite(id) {
    return this.getFavorites().indexOf(id) > -1;
  },
  toggleFavorite(id) {
    const list = this.getFavorites();
    const i = list.indexOf(id);
    if (i > -1) {
      list.splice(i, 1);
    } else {
      list.unshift(id);
    }
    write(KEYS.FAV, list);
    return i === -1;
  },

  /* -------- 浏览历史 -------- */
  getHistory() {
    return read(KEYS.HISTORY, []) || [];
  },
  addHistory(id) {
    const list = this.getHistory().filter(function (x) { return x !== id; });
    list.unshift(id);
    write(KEYS.HISTORY, list.slice(0, 30));
  },
  clearHistory() {
    return write(KEYS.HISTORY, []);
  },

  /* -------- 咨询偏好（特殊人群/过敏/口味） -------- */
  getConsult() {
    return read(KEYS.CONSULT, { stages: '无', conditions: '以上都没有', allergy: '', tastes: [] });
  },
  setConsult(v) {
    return write(KEYS.CONSULT, v);
  },

  /* -------- 知识库已读 -------- */
  getRead() {
    return read(KEYS.READ, []) || [];
  },
  markRead(id) {
    const list = this.getRead();
    if (list.indexOf(id) === -1) {
      list.push(id);
      write(KEYS.READ, list);
    }
  },

  /* -------- 对话会话 id（用于服务端多轮上下文；不含任何个人信息） -------- */
  getSessionId() {
    let id = read(KEYS.SESSION, '');
    if (!id) {
      id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      write(KEYS.SESSION, id);
    }
    return id;
  },
  resetSessionId() {
    const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    write(KEYS.SESSION, id);
    return id;
  },

  /* -------- AI 增强对话开关（用户可关闭，关闭后纯本地规则，不发出任何网络请求） -------- */
  getAiEnabled() {
    const v = read(KEYS.AI, null);
    return v === null ? true : !!v;
  },
  setAiEnabled(on) {
    return write(KEYS.AI, !!on);
  },

  /* -------- 清空个人数据 -------- */
  clearAll() {
    write(KEYS.PROFILE, null);
    write(KEYS.FAV, []);
    write(KEYS.HISTORY, []);
    write(KEYS.CONSULT, { stages: '无', conditions: '以上都没有', allergy: '', tastes: [] });
    write(KEYS.READ, []);
    return true;
  }
};
