# 茶历方 · 部署前检查报告

> 当前部署方案改为微信云托管；本文中关于域名、PocketBay、局域网体验版的步骤已过时。请以 [cloudbase-deploy.md](cloudbase-deploy.md) 为准。

审计时间：2026-10-08　范围：小程序端（根目录）+ 服务端（`server/`）

> ## 修复状态（2026-10-08 更新）
>
> **B1 / B2 / B3 / B4 / H1 / H2 / H3 与全部中危项已修复**，服务端回归 6 套件全绿
> （新增 `smoke-security.js` 覆盖隐私剥离 / 审计鉴权 / CORS / 限流）。
> 下文为审计当时的原始记录，保留以说明每项修复的动机。
>
> 仍需**你本人**完成的三件事：
> 1. 到火山方舟控制台**重新生成 API Key** 并填回 `server/.env` 的 `LLM_API_KEY`
>    —— 现有 Key 经实测**可用**（见第十节），但它已在对话记录中以明文出现，建议轮换一次；
> 2. 备案通过后，把 `utils/config.js` 的 `API_BASE_PROD` 换成正式域名并加入小程序 request 合法域名；
> 3. 把客服邮箱占位符换成真实邮箱（`utils/config.js` 的 `SUPPORT_EMAIL`）。
>
> 另有一项**新发现的部署风险**，见文末「九、PocketBay 部署的冲突点」。

---

## 一、自动化检查结果（基线）

| 检查项 | 命令 | 结果 |
|---|---|---|
| 全量 JS 语法 | `node --check`（37 个文件） | 全部通过 |
| 全量 JSON 解析 | `JSON.parse`（13 个文件） | 全部通过 |
| 服务端回归 | `cd server && npm test` | 5 个 smoke 全绿 |
| 密钥泄漏扫描 | 全仓库搜 API Key / ADMIN_TOKEN | 仅出现在 `server/.env`（已忽略），无外泄 |
| git 历史 | `git log --all -- server/.env` | 空 —— `.env` 从未提交 |
| 管理页 XSS | 检查 `admin.html` 插值 | `esc()` 转义覆盖完整 |

**结论：代码质量与工程完整性良好，无系统性缺陷。** 下面的问题集中在「部署配置」与「合规声明」两类，而非功能实现。

---

## 二、部署阻断项（上线前必须处理）

### B1　端上 API 地址仍是本地回环地址　`utils/config.js:13`

```js
API_BASE: 'http://127.0.0.1:8787'
```

- 真机上 `127.0.0.1` 指向手机自身，服务端永远不可达，对话链路 100% 降级到本地规则引擎。
- 微信正式版**强制 HTTPS**，`http://` 无法通过。

**处理**：改为 `https://<已备案域名>`，并在「微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名」中加入该域名。

---

### B2　隐私声明与实际数据流不一致（合规高危）　`pages/settings/settings.js:16`

端上声明：

> 「以上信息与你的收藏、浏览记录**全部保存在你手机本地**……**不会上传至服务器，也不会与任何第三方共享**。」

实际链路（AI 增强默认开启，`utils/store.js:130` 返回 `true`）：

```
chat.js:69  ctx.profile = store.getProfile()          ← 含 basic：性别/年龄段/孕期哺乳期/慢性病/过敏史
agent-remote.js → llm.js:127  profile: state.profile  ← 整个档案 POST 到服务端
server/prompt.js:75-88                                 ← 年龄、性别、特殊阶段、基础健康情况、过敏史
                                                          全部拼进 system prompt
                                                        → 发送至火山方舟（豆包）
```

**风险**：健康与特殊阶段信息属《个人信息保护法》定义的**敏感个人信息**，向第三方（方舟）传输需**单独同意**并如实告知。当前状态同时构成「隐私说明不实」与「未经单独同意处理敏感信息」，且微信审核对此类不一致有驳回先例。

**处理（建议三管齐下）**：
1. **如实改文案**：明确说明开启 AI 增强后，对话内容与体质档案会发往我方服务器及第三方大模型；
2. **最小化上传**：`agent-remote.js` 上传前剥离 `profile.basic`，只保留 `constitutionId`（体质类型本身仍需告知）；
3. **单独同意**：AI 增强改为默认关闭，首次开启时弹窗单独授权；
4. 在微信公众平台配置「用户隐私保护指引」。

---

### B3　服务端 `.env` 中的真实密钥

`server/.env` 内含真实的方舟 `LLM_API_KEY` 与 `ADMIN_TOKEN`（明文）。

- 已核实：`.gitignore` / `.dockerignore` 覆盖、git 历史干净、未被任何被追踪文件引用 —— **当前无泄漏**。
- 但明文存在于工作区，截图、备份、共享目录、云盘同步都可能造成外泄。

**处理**：上线前**轮换一次**（方舟控制台重新生成 API Key；`ADMIN_TOKEN` 用 `crypto.randomBytes(24).toString('base64url')` 重新生成）。轮换后确认服务端与小程序配置同步更新。

---

### B4　打包白名单未排除 `server/`，存在密钥被打进小程序包的风险　`project.config.json:3-11`

```json
"packOptions": { "ignore": [ { "value": "preview", "type": "folder" } ] }
```

`server/` 位于小程序项目根目录内，其中 `server/.env` 含明文密钥。虽然 `project.private.config.json` 里 `ignoreDevUnusedFiles: true` 可能兜底，但**该文件是本地私有配置、不随仓库分发**（已在 `.gitignore` 中），换机器导入项目即失效。

**处理**：`packOptions.ignore` 增加 `server`、`docs`、`.workbuddy`、`*.md`。

---

## 三、高危（强烈建议上线前修复）

### H1　对话接口无鉴权、无频率限制 → 额度可被刷爆

公开且无频控的接口：`/api/agent/chat`、`/api/agent/chat.json`、`/api/agent/assess`、`/api/agent/retrieve`、`/api/agent/knowledge`。全项目仅管理端登录做了限流。

- 方舟额度**记在开发者账号**上，任何拿到域名的人（反编译小程序即可取得地址）都能脚本刷量，产生真实费用。
- 附带风险：`server/src/session.js` 无实例数上限，`get(id)` 对任意 `sessionId` 都会建对象，只靠 30 分钟 TTL 回收 —— 配合无鉴权可造成内存耗尽。

**处理**（按成本递增）：
- 最小方案：Nginx `limit_req` + 服务端内存令牌桶（按 IP，如 10 req/min）；
- 加固方案：会话数上限（如 5 万）+ 超限 LRU 淘汰；
- 完整方案：`wx.login` 换 code 由服务端校验（需 AppSecret 与 code2session 接口）。

---

### H2　公开接口 `/api/agent/audit` 泄露用户原话　`server/src/index.js:355-357`

```js
if (path === '/api/agent/audit' && req.method === 'GET') {
  return sendJSON(res, 200, { ok: true, items: safety.recentAudit(...) });
}
```

无需任何令牌即返回最近 50 条审计；条目中的 `input` 字段就是**用户输入的原文**（`safety.js:218`），即线上用户与养生顾问的对话片段（含健康隐私）。管理端已有等价的、带鉴权的 `/api/admin/audit`。

**处理**：直接删除该公开路由，或将其移入 `admin.js` 的 `authGuard` 之后。

---

### H3　`CORS_ORIGIN=*`　`server/.env:8`

小程序 `wx.request` 不受浏览器同源策略约束，`*` 对小程序毫无收益，却让任意网页都能调用对话接口与 `/api/admin/*`，无谓放大了攻击面。

**处理**：小程序场景下改为管理后台的固定来源，或对 `/api/admin/*` 单独拒绝跨站。

---

## 四、中危

| 编号 | 问题 | 位置 | 处理建议 |
|---|---|---|---|
| M1 | 「清除本地数据」未清会话 ID 与 AI 开关，用户以为数据已清空，服务端仍可用旧 `sessionId` 关联历史上下文 | `utils/store.js:148` | `clearAll()` 中追加 `resetSessionId()`，并清理 `tl_ai_v1`、`tl_content_v1`、`tl_feedback_*` |
| M2 | 客服邮箱仍是占位符 | `pages/settings/settings.js:57` | 换成真实可达邮箱，否则用户反馈全部丢失，审核亦可能质询 |
| M3 | 单实例约束未在部署层固化 | `server/docker-compose.yml` | 内容与热更新是进程内 + 本地磁盘，`--scale` 会导致实例间内容不一致。在 compose 与 README 中显式声明「必须单实例」 |
| M4 | 绑定挂载目录属主问题 | `server/docker-compose.yml:19-22` | 容器以 uid 1000 运行，宿主 `./storage` 属主不匹配会「写盘失败」。改用**具名 volume**，或在 README 中固化 `chown -R 1000:1000` 步骤 |
| M5 | `docs/resume-project.md` 属个人材料 | `docs/` | 不应随小程序或公开仓库发布，至少加入 `packOptions.ignore` |

---

## 五、低危 / 提交前确认

1. **AppID 确认**：`project.config.json` 中 `appid: wxda7a648bda4e9cfa`，请确认是本人主体的小程序 AppID 而非测试号。
2. **`urlCheck: false`**：仅影响开发者工具，真机不生效。上传前建议关闭该选项，用真机预览跑一轮完整链路（测评 → 对话 → 内容下发）。
3. **隐私接口声明**：本项目未调用 `wx.getUserProfile` / `wx.getLocation` 等隐私接口，`requiredPrivateInfos: []`、`permission: {}` 配置正确，**无需**额外声明；但 B2 的信息处理仍需在公众平台补充说明。
4. **类目与资质**：养生茶 + 体质判定可能触发微信「医疗健康」类目审核。现有文案已严格规避诊断/疗效表述（词表 + 双端净化 + 后台合规校验齐备），建议提交时准备「非医疗、仅日常养生参考」的说明材料。
5. **`/health` 信息暴露**：返回 provider、model、索引规模、会话数，属轻度信息泄露，建议上线后由 Nginx 限制为内网可访问。

---

## 六、已确认健壮的部分

- **双端共用知识源**，`data/*.js` 就地覆盖（`applyOverride`）而非替换引用，22 处端上消费点无需改造；
- **三个派生缓存刷新链路完整**：`engine.reload()`（`content-overlay.js:104`）、`tools.js` 按 overlay 版本惰性重建枚举（`tools.js:158`）、`rag.buildIndex()`（`content.js:209`）；
- **风控三层**：入站医疗意图短路 → 出站流式净化（含「安全前缀」回退判定，无跨 chunk 漏检）→ 后台发布合规校验；
- **内容发布三道校验** + 原子写 + `content.prev.json` 回滚，交叉校验失败自动还原运行时；
- **端上降级链路四层**：本地医疗拦截 → 用户关闭/熔断 → 服务端 Agent → 失败回落本地规则引擎，任一环节故障用户侧均无感；
- **`ADMIN_TOKEN` 留空即整体关闭管理端**，避免「忘配 = 裸奔」。

---

## 七、上线前 Checklist（按执行顺序）

```
[x] 1. ADMIN_TOKEN 已轮换并写回 server/.env
[~] 2. LLM_API_KEY 已实测可用（check-llm 三项全过）；建议因明文暴露再轮换一次   ← 需你本人操作
[ ] 3. 服务端部署 + 挂持久化卷 + 验证 /health
[ ] 4. Nginx 配置：HTTPS + SSE 关缓冲 + limit_req + 覆写 X-Forwarded-For
     （配置模板见 server/README.md「部署」章节）
[x] 5. 下线公开 /api/agent/audit；CORS 默认收敛为不下发跨域头
[x] 6. utils/config.js 改为三轨地址（开发者工具 / 局域网 / 正式域名）
[ ] 7. 备案通过后填 API_BASE_PROD，并加入小程序 request 合法域名   ← 需你本人操作
[x] 8. 隐私文案改写 + 上行剥离敏感字段 + AI 增强默认关闭并单独同意
[ ] 9. 替换客服邮箱占位符（utils/config.js 的 SUPPORT_EMAIL）   ← 需你本人操作
[x] 10. 补全 packOptions.ignore（server / docs / .workbuddy / *.md）
[~] 11. 服务端真实模型链路已验证（见第十节）；小程序端真机全链路回归仍待做
[ ] 12. 关闭 urlCheck 后上传体验版，走一遍审核提交流程
```

---

## 八、遗留风险（非阻塞，需知悉）

- **横向扩容不成立**：内容与热更新为进程内 + 本地磁盘，需改共享存储 + 变更广播。
- **会话存内存**：重启后多轮上下文丢失（用户无感，但连续对话体验会重置）。
  已加 `SESSION_MAX` 上限（默认 5000，按最久未活跃淘汰）防内存耗尽。
- **单令牌鉴权**：无多账号、无角色、无令牌过期机制。
- **`ADMIN_TOKEN` 泄露即内容可被任意篡改**：建议在 Nginx 层再加一层 IP 白名单。
- **限流是进程内、按 IP 的**：多实例部署时各限各的；且若反向代理未覆写
  `X-Forwarded-For`，客户端可自带该头绕过。Nginx 模板里已给出正确写法。
- **`/health` 会暴露 provider / 模型名 / 索引规模 / 会话数**：建议在 Nginx 上限制为
  内网或平台健康检查可访问（模板已给出 `allow/deny` 写法）。

---

## 九、PocketBay 部署的冲突点

PocketBay 是面向 Vibe Coding 的一站式部署平台（分配 `*.pocketbay.app` 子域名 + HTTPS，
支持带 Dockerfile 的单容器 Web 应用）。本项目可以部署上去，但有**两个必须提前确认的点**：

### 9.1 「不会冲突」的部分

小程序端的 `API_BASE_PROD` 只是一个常量，先跑局域网、后换 PocketBay 域名**不产生任何代码冲突**，
改一行重新上传体验版即可。三轨配置已就位，无需二次改造。

### 9.2 冲突点一：`pocketbay.app` 域名大概率无法加入小程序 request 合法域名（**阻断**）

微信要求 request 合法域名**必须完成工信部 ICP 备案**。PocketBay 的主体是
**PocketBay Technologies Limited（中国香港）**，其平台子域名不属于境内备案主体，
**无法通过微信公众平台的域名校验**。表现为：开发工具勾掉「不校验合法域名」能跑，
正式版与体验版一律请求失败。

**结论**：正式版仍需使用**你自己已备案的域名**。可选路径：
1. 等你手头的备案通过，用自己的域名指向服务器（推荐）；
2. PocketBay 支持绑定自定义域名的话，把已备案域名 CNAME 过去；
3. 若平台不接受自定义域名，则正式版不能走 PocketBay，需换境内云主机。

### 9.3 冲突点二：`server/storage/` 的持久化（**需确认**）

内容管理后台的成果（`content.json`）与审计日志都落在容器的 `server/storage/` 目录。
PocketBay 的产品说明里未提及持久化卷能力 —— **若每次重新部署都会重建容器文件系统，
那么后台改过的内容与全部审计日志都会清空**。

**上线前请务必确认**：
- 平台是否提供持久磁盘 / Volume 挂载；
- 若提供，把 `STORAGE_DIR` 指到挂载点；
- 若不提供，则后台只能当作「改完即发布、别指望持久」，或改为把内容库存到对象存储 / 托管数据库。

其余无冲突：单容器 Dockerfile 部署（构建上下文是项目根目录）、单实例运行，都与平台定位吻合。

---

## 十、真实模型链路验证（2026-10-08 补做）

前面的修复验证依赖离线 Mock 与静态检查。拿到可用的方舟 Key 后，在**修复后的服务端**上跑了一遍
真实豆包，把「只能靠 Mock 推断」的部分落成了实测事实。

### 10.1 前置：先确认跑的是新代码

> **坑**：`127.0.0.1:8787` 上当时还挂着修复前启动的旧实例（`/health` 的 `uptimeSec` ≈ 5400）。
> Node 在进程启动时载入模块，**不重启就测，测的是旧行为**。
> 重启后 `/health` 新增了 `rateLimit` 与 `session.maxSessions` 字段，可作为「新代码已生效」的判据。

### 10.2 连通性（`server/scripts/check-llm.js`）

| 项 | 结果 |
|---|---|
| 纯文本流式对话 | 通过（首字约 1.5s） |
| Function Call 工具调用 | 通过 |
| 深度思考开关（`disabled`） | 符合预期，未产生思考内容 |

### 10.3 「降维」修复在真实链路成立（本次最关键的一条）

同一句提问（口干、睡不好，求养生茶），分别用两种入参打真实模型：

| 入参 | 模型行为 | `ctx.flags` |
|---|---|---|
| **旧客户端**：只传 `profile.basic`（含 `孕期` / `高血压` / 过敏史**原文**） | 调用 `flag_risk` ×3，**明确拒绝给出具体配方**，建议咨询医师 | `{stage:true, chronic:true, allergy:true}` |
| **新客户端**：只传 `profile.risk` 三个布尔标记 | 同上，行为完全一致 | `{stage:true, chronic:true, allergy:true}` |

→ 两者行为完全一致，证明服务端是**就地降维**成标记而非简单删字段，
旧版本客户端的孕期 / 慢性病人群**安全网没有丢失**（这正是 `smoke-security.js` 抓出来的那个 bug）。
附：无档案时正常触发 `recommend_tea`，推荐链路不受影响。

### 10.4 敏感原文零落盘

对 `server/storage/` 全量逐文件扫描：

| 文件 | 结论 |
|---|---|
| `audit-2026-10-08.jsonl` | 命中的「孕期」来自 `flag_risk` 的**固定提示模板文案**，非用户数据 ✓ |
| `content.json` / `content.prev.json` | 命中的「孕期 / 高血压 / 花粉」来自知识库（茶方禁忌、体质说明）✓ |

**用户填报的原始值（性别 / 年龄区间 / 孕期 / 慢性病 / 过敏史）一个字节都没有进入服务端日志。**
（审计确实记录了用户自己的提问原文，但该接口已收敛为需鉴权的 `/api/admin/raw-audit`。）

### 10.5 限流精确生效

chat 组在 60 秒窗口内的第 **21** 次请求返回 `429`，与 `RATE_LIMIT_CHAT_MAX=20` 严格吻合。

### 10.6 复核手法（可复用）

把测试入参做成**可搜索的哨兵值** → 跑完真实链路 → 遍历运行时可写目录逐文件 `indexOf` 搜哨兵。
比读代码推断可靠得多；注意区分「固定模板文案」与「用户数据」，避免误报。

