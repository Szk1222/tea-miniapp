# 微信云托管部署清单（当前目标架构）

小程序体验版和正式版使用 `wx.cloud.callContainer` 调用私有服务，不需要购买备案域名，也不必填写「request 合法域名」。[微信云托管小程序接入说明](https://docs.cloudbase.net/run/develop/access/mini)。开发者工具仍请求本机 `127.0.0.1:8787`。

## 首次配置

1. 在微信云开发控制台创建**与本小程序关联**的云环境与云托管服务，记录「环境 ID」「服务名」。把它们填入 `utils/config.js` 的 `CLOUD_ENV_ID` 和 `CLOUD_SERVICE`。同时将 `SUPPORT_EMAIL` 改为可收信邮箱。
2. 绑定 GitHub 仓库时选 `master`；「目标目录」留空（仓库根目录），选择「有 Dockerfile」，名称填 `Dockerfile`。根目录 Dockerfile 会一并复制 `server/`、`data/`、`utils/`；监听端口填 `8787`。平台注入的 `PORT` 会覆盖默认值。
3. 设置服务环境变量：`NODE_ENV=production`、`SESSION_IDENTITY_MODE=cloudbase`、`LLM_API_KEY`、准确的 `LLM_MODEL`；按模型服务实际情况调整 `LLM_BASE_URL`、`LLM_THINKING`。密钥只填云托管控制台，绝不写入小程序或仓库。
4. **关闭服务公网访问**。此设置不会影响 `callContainer`，但它是信任网关注入的 `x-wx-openid` 的前提。[云托管服务设置](https://docs.cloudbase.net/run/deploy/service-setting)。本项目生产模式缺少 `SESSION_IDENTITY_MODE=cloudbase` 或 `LLM_API_KEY` 时会拒绝启动。
5. 未接入持久存储前，`ADMIN_TOKEN` 留空（管理接口关闭），以仓库内置茶方和知识库运行。发布和审计记录当前写容器文件，实例重建会丢失；会话记忆与限流也在进程内。云托管会动态重建实例，因此不能把这些状态当成持久数据。[云托管迁移说明](https://docs.cloudbase.net/run/best-practice/migration)。需要在线改内容时，先接 CFS / 数据库等持久化存储，再开启管理端。
6. 在上传体验版前运行 `node scripts/check-release.js` 和 `cd server && npm test`。CI 的上传任务也会运行静态配置闸门。

## 上线前真机验收

- 体验版真机能拉到 `/api/content`，问茶能调用 `/api/agent/chat.json`；无域名白名单也能完成请求。
- 云端日志能看到服务启动；普通请求由网关注入 `x-wx-openid`，缺少身份时对话接口返回 401。不要在日志里打印 OpenID、健康描述、密钥或完整请求头。
- 分别验证 AI 关闭、单独同意后开启、特殊阶段/慢病/过敏硬拦截、断网本地回退、清除数据后的会话删除提示。
- 监测模型响应耗时、调用次数和账单；为云托管和模型服务分别设置费用告警。若使用多实例，当前进程内会话与限流不共享，应先迁移到外部存储或限制为单实例。

目前云环境 ID、服务名和客服邮箱仍为空/占位；静态发布检查会阻止上传。实际云托管服务尚未部署，私有链路和真机行为也尚未验证。
