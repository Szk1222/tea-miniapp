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
  AI: 'tl_ai_v1',
  AI_CONSENT: 'tl_ai_consent_v1',
  CONTENT: 'tl_content_v1'
};

/** 反馈类键的统一前缀（清空个人数据时按前缀批量删除） */
const FEEDBACK_PREFIX = 'tl_feedback_';

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

/** 生成一个不含任何个人信息的新会话 id */
function newSessionId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
      id = newSessionId();
      write(KEYS.SESSION, id);
    }
    return id;
  },
  resetSessionId() {
    const id = newSessionId();
    write(KEYS.SESSION, id);
    return id;
  },

  /* -------- AI 增强对话开关 --------
   * 合规要求：AI 增强会把对话内容与体质类型发往服务端及第三方大模型，
   * 因此**默认关闭**，且必须先取得用户的单独同意（AI_CONSENT）才能真正开启。
   * 未同意时 getAiEnabled() 一律返回 false —— 这是硬约束，不依赖调用方自觉。
   * 注意：这里刻意不通过 this 互相调用，避免被解构后 this 丢失导致判定失效。
   */
  getAiConsent() {
    return read(KEYS.AI_CONSENT, false) === true;
  },
  setAiConsent(on) {
    return write(KEYS.AI_CONSENT, !!on);
  },
  getAiEnabled() {
    if (read(KEYS.AI_CONSENT, false) !== true) return false;
    const v = read(KEYS.AI, null);
    return v === null ? false : !!v;
  },
  setAiEnabled(on) {
    return write(KEYS.AI, !!on);
  },

  /* -------- 内容库缓存（管理后台下发的内容，见 utils/content-client.js） -------- */
  getContentCache() {
    return read(KEYS.CONTENT, null);
  },
  setContentCache(doc) {
    return write(KEYS.CONTENT, doc);
  },
  clearContentCache() {
    return write(KEYS.CONTENT, null);
  },

  /* -------- 清空个人数据 -------- */
  clearAll() {
    write(KEYS.PROFILE, null);
    write(KEYS.FAV, []);
    write(KEYS.HISTORY, []);
    write(KEYS.CONSULT, { stages: '无', conditions: '以上都没有', allergy: '', tastes: [] });
    write(KEYS.READ, []);
    // 服务端会话 id 必须一起换掉：否则「已清除」之后，服务端仍能用旧 id 关联到此前的对话上下文
    write(KEYS.SESSION, newSessionId());
    // AI 增强与授权一并复位：清除数据后应回到「默认关闭、需重新授权」的状态
    write(KEYS.AI, null);
    write(KEYS.AI_CONSENT, false);
    // 内容缓存不是个人数据，但清了才能保证下次启动重新按版本拉取，避免与已删数据混淆
    write(KEYS.CONTENT, null);
    // 本地反馈草稿
    try {
      const info = wx.getStorageInfoSync();
      (info.keys || []).forEach(function (k) {
        if (k.indexOf(FEEDBACK_PREFIX) === 0) wx.removeStorageSync(k);
      });
    } catch (e) { /* 存储信息取不到就算了，不影响主流程 */ }
    return true;
  }
};
