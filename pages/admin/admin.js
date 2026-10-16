const transport = require('../../utils/transport.js');

const TYPES = [
  { id: 'teas', name: '茶方' },
  { id: 'knowledge', name: '知识库' },
  { id: 'constitutions', name: '体质' },
  { id: 'questions', name: '测评题' },
  { id: 'catalog', name: '食材目录' }
];

function call(path, method, data) {
  return transport.request({ path: '/api/admin/' + path, method: method || 'GET', data: data, timeout: 20000 }).promise.then(function (res) {
    const out = res.data || {};
    if (!out.ok) throw new Error(out.error || ((out.errors || []).map(function (e) { return e.path + ' ' + e.message; }).join('\n')) || '请求失败');
    return out;
  });
}

Page({
  data: { authorized: false, types: TYPES, type: 'teas', typeName: '茶方', version: 0, draft: '', dirty: false, busy: false, message: '' },

  onLoad() {
    call('status').then((state) => {
      if (!state.authorized) throw new Error('当前微信账号没有管理权限');
      this.setData({ authorized: true });
      this.loadType();
    }).catch((e) => this.setData({ message: e.message }));
  },

  chooseType(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.type) return;
    const next = () => {
      const found = TYPES.filter(function (item) { return item.id === id; })[0];
      this.setData({ type: id, typeName: found.name, dirty: false });
      this.loadType();
    };
    if (this.data.dirty) {
      wx.showModal({ title: '放弃未发布修改？', success: function (res) { if (res.confirm) next(); } });
    } else next();
  },

  loadType() {
    this.setData({ busy: true, message: '' });
    call('content/' + this.data.type).then((out) => {
      this.setData({ version: out.version, draft: JSON.stringify(out.value, null, 2), dirty: false, busy: false });
    }).catch((e) => this.setData({ busy: false, message: e.message }));
  },

  onDraft(e) { this.setData({ draft: e.detail.value, dirty: true }); },

  publish() {
    if (this.data.busy || !this.data.dirty) return;
    let value;
    try { value = JSON.parse(this.data.draft); }
    catch (e) { this.setData({ message: 'JSON 格式错误：' + e.message }); return; }
    wx.showModal({
      title: '发布' + this.data.typeName + '？',
      content: '将整体替换这一类线上内容。服务端会校验引用与禁忌规则，发布成功后立即对用户生效。',
      confirmText: '确认发布',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ busy: true, message: '' });
        call('content/' + this.data.type, 'PUT', { value: value, baseVersion: this.data.version })
          .then((out) => {
            this.setData({ busy: false, dirty: false, version: out.version, message: '已发布 v' + out.version });
            wx.showToast({ title: '发布成功', icon: 'success' });
          })
          .catch((e) => this.setData({ busy: false, message: e.message }));
      }
    });
  },

  rollback() {
    if (this.data.busy) return;
    wx.showModal({ title: '回滚到上一版？', content: '将恢复上一次发布前的完整内容，所有分类会一起回滚。', confirmText: '确认回滚', success: (result) => {
      if (!result.confirm) return;
      this.setData({ busy: true, message: '' });
      call('rollback', 'POST', {}).then((out) => {
        this.setData({ message: '已回滚至 v' + out.version });
        this.loadType();
      }).catch((e) => this.setData({ busy: false, message: e.message }));
    } });
  }
});
