# 微信云托管部署清单（当前目标架构）

小程序体验版和正式版使用 `wx.cloud.callContainer` 调用私有服务，不需要购买备案域名，也不必填写「request 合法域名」。[微信云托管小程序接入说明](https://docs.cloudbase.net/run/develop/access/mini)。开发者工具仍请求本机 `127.0.0.1:8787`。

## 首次配置

1. 在微信云开发控制台创建**与本小程序关联**的云环境与云托管服务，记录「环境 ID」「服务名」。把它们填入 `utils/config.js` 的 `CLOUD_ENV_ID` 和 `CLOUD_SERVICE`。同时将 `SUPPORT_EMAIL` 改为可收信邮箱。
2. 绑定 GitHub 仓库时选 `master`；「目标目录」留空（仓库根目录），选择「有 Dockerfile」，名称填 `Dockerfile`。根目录 Dockerfile 会一并复制 `server/`、`data/`、`utils/`；监听端口填 `8787`。平台注入的 `PORT` 会覆盖默认值。
3. 设置服务环境变量：`NODE_ENV=production`、`SESSION_IDENTITY_MODE=cloudbase`、`LLM_API_KEY`、准确的 `LLM_MODEL`；按模型服务实际情况调整 `LLM_BASE_URL`、`LLM_THINKING`。密钥只填云托管控制台，绝不写入小程序或仓库。
4. **关闭服务公网访问**。此设置不会影响 `callContainer`，但它是信任网关注入的 `x-wx-openid` 的前提。[云托管服务设置](https://docs.cloudbase.net/run/deploy/service-setting)。本项目生产模式缺少 `SESSION_IDENTITY_MODE=cloudbase` 或 `LLM_API_KEY` 时会拒绝启动。
5. 在线管理前，给服务版本配置 CFS 文件系统挂载（同地域、同 VPC），例如挂载到容器 `/mnt/chalifang`。设置 `STORAGE_MOUNT_PATH=/mnt/chalifang`、`STORAGE_DIR=/mnt/chalifang/data`。启动时会检查挂载点确实存在且可写；检查失败直接拒绝启动，避免误写容器临时盘。[CFS 挂载说明](https://docs.cloudbase.net/en/run/deploy/configuring/storage/cfs)。当前实现通过共享目录锁和内容版本冲突检查保护发布；建议先设最大实例数 1，升级时再验多实例行为。共享目录里的 `content.json`、`content.prev.json` 和审计文件要定期备份。
6. 继续让 `ADMIN_TOKEN` 留空，浏览器 `/admin` 因无公网入口不可用。管理员通过小程序「设置 → 内容管理」编辑；服务端只认可 `ADMIN_OPENIDS` 白名单中的微信 OpenID，绝不把令牌放进小程序包。先在真机调试控制台调用下面的接口读取**自己的** OpenID，然后把它填入云托管环境变量 `ADMIN_OPENIDS`；多个管理员用英文逗号分隔。重新发布服务版本并重新上传小程序体验版。管理员入口只对通过白名单的账号显示；服务端每次读写仍会独立校验身份。

   ```js
   wx.cloud.callContainer({
     config: { env: 'chalifang-prod-d0gb3mua244b0e5ea' },
     path: '/api/admin/status',
     method: 'GET',
     header: { 'X-WX-SERVICE': 'chalifang-agent' }
   }).then(res => console.log(res.data))
   ```

   只复制返回的 `openid`，不要把模型密钥或管理令牌贴在聊天或仓库。白名单启用前，`authorized` 应为 `false`。保持公网访问关闭；这是信任网关注入身份头的前提。[私有链路说明](https://docs.cloudbase.net/run/deploy/service-setting)。
7. 在上传体验版前运行 `node scripts/check-release.js` 和 `cd server && npm test`。CI 的上传任务也会运行静态配置闸门。

## 上线前真机验收

- 体验版真机能拉到 `/api/content`，问茶能调用 `/api/agent/chat.json`；无域名白名单也能完成请求。
- 云端日志能看到服务启动；普通请求由网关注入 `x-wx-openid`，缺少身份时对话接口返回 401。不要在日志里打印 OpenID、健康描述、密钥或完整请求头。
- 分别验证 AI 关闭、单独同意后开启、特殊阶段/慢病/过敏硬拦截、断网本地回退、清除数据后的会话删除提示。
- 监测模型响应耗时、调用次数和账单；为云托管和模型服务分别设置费用告警。若使用多实例，当前进程内会话与限流不共享，应先迁移到外部存储或限制为单实例。

云环境 ID、服务名、客服邮箱已配置；用户已确认云托管版本正常、真机基础功能正常。持久化挂载与管理员白名单仍需在控制台配置，并在真机验证一次茶方发布、重启后仍保留、回滚与非管理员 401。
