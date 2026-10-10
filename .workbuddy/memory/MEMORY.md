# 茶历方 小程序 · 项目长期记忆

> 详细过程性记录见 `.workbuddy/memory/YYYY-MM-DD.md`；本文件只保留跨会话必须遵守的结论与铁律。

## 项目
- 根目录 `D:\Projects\tea-miniapp`（**勿放 `D:\WorkBuddy\`**，那是应用安装目录）。仓库 `github.com/Szk1222/tea-miniapp`（私有）。
- 品牌「茶历方」：用户可见文案用中文；技术标识符（镜像名/包名/projectname）用 ASCII `chalifang`（不可用中文或上标字符）。
- 客服邮箱占位 `chalifang-support@example.com`，**上线前必换**。
- 定位：中医体质养生茶推荐小程序「辨证施茶 · 一人一方」。9 体质判定 → 体质 + 当季 + 场景匹配药食同源茶方。

## 技术约定
- 原生微信小程序，零第三方依赖；自定义 tabBar（`custom: true`）以便使用 SVG 图标。
- 体质判定/茶方匹配**必须走硬规则** `utils/engine.js`，不做生成式判定；倾向度用 raw/理论最高分，不用原始分（否则偏向平和质）。
- 对话文案在 `utils/agent.js`；本地存储统一 `utils/store.js`（key 前缀 `tl_`）。
- 展示类取体质一律 `constitutions.getOr(id)`（未知 id 返回占位对象）；`get(id)` 严格返回 null，**仅用于校验合法性**。
- `utils/config.js` 按环境三轨选 API：`API_BASE_DEVTOOLS`(127.0.0.1:8787) / `API_BASE_LAN`(trial 真机, 192.168.31.37:8787) / `API_BASE_PROD`(HTTPS + 已备案)。**改地址改这三处，不要直接改 `API_BASE`**。
- 打包白名单 `project.config.json` → `packOptions.ignore`：已排除 preview / server / docs / .workbuddy / *.md。**`server/.env` 含明文密钥，漏排即泄漏**。

## 设计规范
- 主色 `#2E6B4F`、深 `#21503A`、浅底 `#E8F1EC`、辅金 `#B9873A`；底 `#F5F7F4`、卡 `#FFFFFF`、主文 `#17251D`、次文 `#5A6A61`、弱文 `#93A099`、描边 `#E9EDE8`。
- 圆角：卡片 28rpx / 按钮 999rpx；阴影 `0 6rpx 24rpx rgba(28,56,41,.06)`。中文 UI，基准 28rpx，行高 1.6–1.8。
- 图标统一线性 SVG（`utils/icons.js` 生成 data-uri，`components/icon` 用 `background-image` 渲染），**禁用 Emoji**。
- **真机渲染铁律**：
  - 胶囊/标签用 `<view>`（固定 `height` + `line-height` 居中 + `text-align` + `nowrap`），**禁用行内 `<text>` 承载**（不认垂直内边距，会被压扁）。
  - 多列网格：容器 `display:flex; flex-wrap:wrap; justify-content:space-between`，单元格 `box-sizing:border-box; width:48.4%; flex:0 0 auto`。**禁用 `calc(50% - Nrpx)`**（部分安卓 WebView 整条 width 失效）、**禁用 flex `gap`**；`box-sizing` 必须写在元素自身规则里（不生效是"两列挤成一列"的唯一成因）。
  - 「图标 + 文字」间距用 `margin`；`flex:1` 主按钮必须配 `min-width:0` + `overflow:hidden`。
  - 自定义组件事件名**禁用原生事件名**（`tap`/`longpress` 等），否则一次点击触发两次；`tea-card` 已改名 `select`。
- 布局争议先复现再改：`preview/grid-fix-check.html` 为对照样例，用 headless Chrome 截图核对。

## 合规红线（医疗类目）
- 严禁诊断疾病、开处方、推荐药品；命中医疗意图统一回 `SAFETY_TEXT`。
- 只用「调理/改善/舒缓/养生/保健」，**禁用「治疗/治愈/疗效/根治」**。食材限《药食同源目录》，单味 3–10g。
- 孕期/哺乳/14 岁以下/慢性病必须前置风险提示；每处推荐结果末尾附免责声明。

## 服务端（server/）
- 定位：**大模型只负责理解与表达，专业事实全部由 Function Call 触发硬规则引擎取回**。零第三方依赖（Node 内置 http/fetch）。
- 服务端与端上**共用同一份知识源**（`data/`、`utils/engine.js`），不复制数据。`Dockerfile` 构建上下文 = 项目根目录。
- 豆包/火山方舟：`https://ark.cn-beijing.volces.com/api/v3`，模型 `doubao-seed-2-1-lite-260915`。**额度归开发者账号**，Key 只放 `server/.env`。换厂商改 `LLM_BASE_URL`/`LLM_MODEL` 并清空 `LLM_THINKING`（方舟私有字段，否则 400）。模型必须支持 Function Calling。
- 自检：`node --env-file=server/.env server/scripts/check-llm.js`；无 Key 用 `scripts/mock-llm.js` 验 Function Call 全链路；改提示词/词表/切块后跑 `scripts/eval.js`。
- 端上链路优先级：本地医疗红线硬拦截（不发网络）→ 用户关闭 AI/熔断 → 服务端 Agent → 失败回落本地规则引擎。

## 内容管理后台
- 入口 `http://<host>:8787/admin`（本机 `http://127.0.0.1:8787/admin`），粘贴 `ADMIN_TOKEN` 登录（配置在 `server/.env`，当前 32 位）。页面为静态外壳不鉴权，**所有数据接口都要 Bearer 令牌**。侧栏：概览 / 五类内容 / 变更记录 / 审计留痕，表单由 `/api/admin/schema` 下发。
- **`ADMIN_TOKEN` 留空 = 管理端整体关闭（接口一律 403）**，刻意如此。登录失败按 IP 限流锁定（默认 5 次 / 5 分钟）。
- 核心设计：让 `data/*.js` 支持「**就地覆盖**」`applyOverride(next)`——必须就地改写数组与映射、**不能换引用**，`constitutions.ids` 也要就地维护。这样不必改造 20+ 处消费点。
- **发布后必须刷新三个派生缓存**（漏一个就出「大部分对了、某处不对」的隐蔽 bug）：① `engine.js` 的 `MAX_SCORE`（`reload()`）② `tools.js` 工具枚举（按 overlay 版本惰性重建）③ `rag.buildIndex()`。
- 链路：`POST /api/admin/login`（Bearer + `timingSafeEqual` + IP 限流）→ `PUT /api/admin/content/:type` → 三道校验（结构/合规/交叉引用）→ 原子写 `server/storage/content.json` → overlay.apply → 重建索引 → 版本 +1 → 端上 `GET /api/content?version=N` 增量拉取。
- 合规扫描复用 `safety.WORD_MAP`（后台能发的、模型也允许说）；免责语先剔除、命中词前 6 字含否定词则豁免；疾病名只告警不阻断；交叉校验失败自动还原运行时并 422。
- 回滚 `POST /api/admin/rollback`（用 `content.prev.json`，版本号继续递增）；播种需 `confirm:"RESEED"`。
- 端上下发 `utils/content-client.js`：`bootstrap()` 同步套 Storage 缓存保首屏，`refresh()` 异步按版本拉取；服务不可达/缓存损坏/payload 异常一律静默回落内置内容。
- `server/storage/` 为运行时数据（内容库 + 审计 JSONL），已 gitignore，**容器部署必须挂 volume**。回归自检 `cd server && npm test`（overlay / schema / content / admin / client）。
- **改了 `data/*.js` 后，必须先把 `server/storage/content.json` + `content.prev.json` 移走再启动服务端**。原因：`init()` 会读旧 doc 并 `overlay.apply`，而 apply 是「就地覆盖」——**服务端一启动，内存里的 `data/*` 就被旧快照换血了**。此后 `/health` 与 `POST /api/admin/reseed` 拿到的全是旧内容（reseed 只是把已被污染的内存再快照一遍，**救不回来**）。这两个 json 通常是自检残留（`updatedBy` 形如 `live-check(...)`），归档即可。
- 端上「看不到新内容」的排查顺序：① devtools Storage 的 `tl_content_v1` 缓存（**只删这一个 key，别清整个数据缓存**，否则体质档案/收藏/历史一起丢）② 服务端 `content.json` 版本是否仍比端上旧 ③ `refresh()` 是否被闸住。
- **端上按 `version` 相等判定「无需更新」，所以服务端版本号必须单调递增、绝不回退。** 清空 `content.json` 后 `init()` 会从 **1** 重新播种 —— 若端上已缓存过 v1（旧内容），两边同为 1 会被判定 unchanged，**永远拉不到修正后的内容**。所以清空 storage 重启后，**必须再调一次 `POST /api/admin/reseed`** 把版本推到 2+（reseed 用当前内存数据重新快照，内容不变只推版本号）。
- **`refresh()` 刻意不受 `store.getAiEnabled()` 约束**：内容库是公开数据、payload 不含个人信息。历史版本曾拿 AI 开关当闸门，而 AI 默认关闭且需单独同意 → 绝大多数用户永远收不到后台更新的内容。对话/档案上送才由 AI 开关把关。
- **`notifyPages()` 目前空转**：`onContentUpdate` 全仓无页面实现；首页茶方列表只在 `onLoad` 的 `buildStatics()` 构建一次（`onShow` 仅刷档案）→ 即便拉到新内容也不会重渲染，需重启小程序或清缓存。`server/README.md:542` 声称的回调只是接口预留。

## 推荐策略（engine.recommend）
- **「禁用 / 忌用」一律不进推荐池**（`teas.RISK_BLOCKED`）；「慎用 / 减量 / 咨询医师」可推荐但排序靠后。`engine.recommendFull()` 返回 `{picks, blocked}`，`recommend()` 只返回 picks（保持旧签名）。
- **排序必须是「风险档位优先，再按权重」的二级排序**，不能用「权重 − 惩罚分」单值排序：体质 +30、季节 +14 是结构加分，会把惩罚抵消掉，产出「推荐它、又标它忌用」的自相矛盾结果。
- 被排除的茶方**不要静默丢弃**，要在结果页/对话里列出「当前情况下不建议饮用」+ 原因，否则用户会以为库里没有。
- 兜底补齐（用平和质温和茶补足 limit）**同样要过滤禁用/忌用**。
- 条件性禁忌：条目可带扁平字段 **`mensesOnly`**（如 `'经量偏多'`），`hitContraindications` 只在与 `basic.menses` 一致时命中。**理由里写了「量多者暂缓」的，必须加 `mensesOnly`**，否则会把部分人的提醒错标成全员禁忌。新增禁忌字段**必须同步声明到 `server/src/content-schema.js`**，否则后台表单保存时会把未声明字段静默丢掉（故用扁平 enum 而非嵌套对象）。

## 隐私与安全基线（务必保持）
- **AI 增强默认关闭 + 单独同意**：`store.getAiEnabled()` 内部强制校验 `tl_ai_consent_v1`，未同意一律返回 false；对话页首次开启弹 `wx.showModal` 授权说明（PIPL 敏感个人信息须单独同意）。
- **上行档案最小化**：`agent-remote.minimalProfile()` 只传 `{constitutionId, secondaryId, percent, levelText, risk:{stage,chronic,allergy}}`；性别/年龄/孕期哺乳期/慢性病/过敏史**原始值不出端**。
- **服务端兜底必须「降维」而不是「删除」**：`index.js#stripSensitiveProfile()` 对旧客户端的 `profile.basic` 就地转成布尔标记。只删不转会把合规安全网一起删掉（孕期用户不再被强制 `flag_risk`）。`prompt.js` 只用 `p.risk`。
- **公开接口一律限流**：`src/ratelimit.js`（固定窗口按 IP：chat 20/min、api 60/min）。**CORS 默认完全关闭**（`CORS_ORIGIN` 留空 = 不下发任何 `Access-Control-Allow-*` 头，`*` 无收益只有风险）。
- `/api/agent/audit`（无令牌回显用户输入原文）已下线，改为带鉴权的 `/api/admin/raw-audit`。
- 改隐私/限流/鉴权后必跑 `node server/scripts/smoke-security.js`（起假模型端点抓服务端真实请求体断言，验最终事实）。
- **改完服务端必须重启实例再验证**（Node 启动时载模块，不重启测的是旧代码）；`/health` 的 `uptimeSec` 判断版本，端口占用查 `Get-NetTCPConnection -LocalPort 8787 -State Listen`。

## 部署
- **必须单实例**（内容库与热更新是进程内 + 本地磁盘，`--scale` 会实例间内容不一致）。
- compose 用命名卷 `chalifang-storage` / `chalifang-cache`，**不用绑定挂载**（容器 uid 1000，属主不匹配会写盘失败）。
- 托管平台若无持久卷 → 后台内容与审计日志随重部署清空，上线前必须确认。
- 反代必须 `proxy_set_header X-Forwarded-For $remote_addr;` 覆写，否则客户端可自带该头绕过限流与登录锁定。

## CI / CD
- 单工作流 `.github/workflows/ci-deploy.yml`：`verify` → `needs` → `image`(GHCR) + `miniprogram`。用依赖图保证「校验不过就不发布」，不靠约定。
- 触发：push master → verify+image；tag `v*` → 加 miniprogram；PR → 只 verify。`on.push.paths` 是**白名单不是 paths-ignore**，新增源码目录必须同步加入，否则改动不触发构建。
- 镜像 `ghcr.io/szk1222/chalifang-agent`（GHCR 要求全小写；不能用 `<owner>/<repo>`，因仓库名 `-` 不是合法镜像名）。`latest` 标签显式写 `enable=${{ github.ref == 'refs/heads/master' }}`，**不要用 `is_default_branch`**（会静默永不产出）。
- 上传脚本 `.github/scripts/upload-miniprogram.js`：`require('miniprogram-ci')` 必须排在环境校验之后；全局安装靠 `NODE_PATH=$(npm root -g)` 解析。
- Secret `MINIPROGRAM_PRIVATE_KEY` **兼容四种形态**（base64 / 原文 / certutil 产物 / url-safe），由 `decode-key.js` 自动识别，**先试 base64 再回退原文**（判据：解出来仍带 PEM 包裹的才是密钥文件本身）。日志只打结构特征与 sha256，不回显内容（GitHub 会连带打码 Secret 片段）。
- `private.wx<appid>.key` 本身就是 PEM 文本：1675 字节 / LF / 无 BOM，内层 base64 解出 1191 字节 DER；「粘原文 + `base64 -d`」必报 `invalid input`。
- **IP 白名单是最大的坑**：托管 runner 出口 IP 动态，密钥一开白名单必然上传失败。
- 已跑通：push run 37762801471（verify 14s / image 47s）；手动 run 37765001146（miniprogram 79s）。上传仅产**开发版本**，仍需公众平台「版本管理」手动设体验版。
- 包体已实证 59 个文件（pages 33 / utils 9 / components 6 / data 5 / tabbar 3 / app.js / app.wxss），server、docs、preview、.github、.workbuddy、.env、*.md、*.key **均未进包**。
- 无 gh CLI 时用 REST API 反查：`/actions/runs` → `/runs/{id}/jobs` → `/actions/jobs/{id}/logs`（需 `curl -L`）。注意区分流程文件的 echo 模板行与实际输出。`GET /user/packages` 需 `read:packages`，403 是权限边界非故障。

## 推送凭证
- 本机无 gh CLI；`credential.helper` 指向 GCM 2.9.0，**无交互环境会挂起等输入**（`GIT_TERMINAL_PROMPT=0` + `GIT_ASKPASS=echo` 拦不住）→ 推送必须由用户提供 PAT，用内联 helper 走进程环境变量。
- PAT 需 `Contents: R/W` + `Workflows: R/W`（改 `.github/workflows/` 时缺后者会被拒）。
- 已知缺失权限及其表现：`Actions: write` → dispatch 403（改由用户在 Actions 页点 Run workflow）；`Secrets: read` → 列 Secret 403（用作业日志判断已配置）；`read:packages` → `/user/packages` 403（从构建日志 grep 镜像标签）。
- 判定仓库是否私有：`git -c credential.helper= ls-remote origin` → `Invalid username or token` 即私有。

## 通用铁律（历史踩坑提炼）
- **正则禁用 `g` 标志 + `.test()`**（lastIndex 推进会随机漏检）；合规词表一律用纯字符串数组。
- 流式内容净化的固定 holdback 无法消除跨 chunk 漏检，必须用「安全前缀」回退判定。
- 中文检索：加停用短语表 + 未登录词直接丢弃 + 候选只用长度 ≥2 的强词项 + trigram。规则词库要定期用评测集反查覆盖度。
- **凡是「要求用户先手工编码再粘贴」的设计，都会以故障形式回到自己身上**——接收端应兼容多种形态，并把「失败时该粘什么」写进错误信息。
- **「期望为 0」的检查必须配阳性对照**，否则 0 与「模式根本没匹配上」无法区分（曾因此差点误报「包内无敏感文件」）。
- 多分支逻辑的测试必须确认分支真被走到（曾出现两条路径实为同一条却"全绿"）；断言要带分支标识。
- **YAML 块标量 `tags: |` 里的 `#` 是字面内容不是注释**；CI 的 `run:` 脚本要在本地实跑一遍（YAML 合法 ≠ 脚本能跑，`set -e` 下 `[ -z "$x" ] && x=...` 会直接退出，须写成 `if`）。
- **本机环境坑**：`HTTP_PROXY` 指向 Mihomo `127.0.0.1:59230`，curl 访问内网 IP 被拦 → 加 `--noproxy '*'`，排查「不可达」先看代理变量；`/tmp` 在 Git Bash 与 Node 里不是同一目录，跨工具传文件用绝对 Windows 路径。

## 文档
- `docs/deploy-preflight.md` 部署前审计报告 + 上线 Checklist；`server/README.md` 架构 / 接口契约 / 部署（含 Nginx SSE 关 buffering）；
- `docs/llm-integration.md` 换真实大模型的完整步骤与降级策略；`docs/resume-project.md` 简历包装方案。
