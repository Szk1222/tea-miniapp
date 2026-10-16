/** 上传体验版/正式版前的硬闸门；本地开发和普通 PR 不需要云资源。 */
const fs = require('fs');
const path = require('path');
global.wx = { getAccountInfoSync: function () { return { miniProgram: { envVersion: 'develop' } }; } };
const cfg = require('../utils/config.js');
const errors = [];
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,}$/.test(cfg.CLOUD_ENV_ID)) errors.push('CLOUD_ENV_ID 未填写有效云环境 ID');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,}$/.test(cfg.CLOUD_SERVICE)) errors.push('CLOUD_SERVICE 未填写有效服务名');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.SUPPORT_EMAIL) || /example\.com$/i.test(cfg.SUPPORT_EMAIL)) {
  errors.push('SUPPORT_EMAIL 仍是占位符');
}
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
if (!app.includes('wx.cloud.init')) errors.push('app.js 未初始化 wx.cloud');
const transport = fs.readFileSync(path.join(__dirname, '..', 'utils', 'transport.js'), 'utf8');
if (!transport.includes('wx.cloud.callContainer')) errors.push('正式链路未使用 callContainer');
if (errors.length) {
  errors.forEach(function (error) { console.error('发布阻断：' + error); });
  process.exit(1);
}
console.log('发布静态配置检查通过。仍须真机验证私有链路和部署环境变量。');
