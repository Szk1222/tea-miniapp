# 茶历方 小程序 · 项目长期记忆

## 项目路径（2026-10-08 迁移）
- 项目根：**`D:\Projects\tea-miniapp`**（原 `C:\Users\25823\WorkBuddy\tea 小程序`，已迁移并清除）
- **不要放在 `D:\WorkBuddy\` 下** —— 那是 WorkBuddy 应用的安装目录（含 WorkBuddy.exe / resources /
  卸载程序），升级或卸载有连带清除风险
- 目录名改用 ASCII `tea-miniapp`；微信开发者工具 / WorkBuddy 工作区均需按新路径重新打开
- 迁移方式：`robocopy /E` 复制 → 文件数 + 字节数 + **逐文件 SHA256** + 目录结构四重校验 → 才清理源

## 品牌与定位
- 小程序名称：**茶历方**（原名 tealife，因与已有公众号重名而更换；中间曾用过「茶³」，
  最终确定为「茶历方」）
- **命名规范**：用户可见文案一律用中文「茶历方」；技术标识符（Docker 镜像名 / npm 包名 /
  开发者工具 projectname）用 ASCII 代号 `chalifang`。**镜像名、包名不可用中文或上标字符**，
  否则 docker build / npm 直接失败
- 客服邮箱占位符：`chalifang-support@example.com`（**上线前必须换成真实邮箱**）
- 产品定位：中医体质养生茶推荐微信小程序 —— 「辨证施茶 · 一人一方」
- 核心逻辑：九种中医体质判定 → 按体质 + 当季 + 场景匹配药食同源茶方

## 设计规范（务必沿用）
- 主色 `#2E6B4F`（茶青绿），深色 `#21503A`，浅底 `#E8F1EC`；辅色暖金 `#B9873A`
- 背景 `#F5F7F4`，卡片 `#FFFFFF`，主文字 `#17251D`，次文字 `#5A6A61`，弱文字 `#93A099`，描边 `#E9EDE8`
- 圆角：卡片 28rpx、按钮 999rpx；阴影克制（`0 6rpx 24rpx rgba(28,56,41,.06)`）
- **统一线性 SVG 图标，禁止使用 Emoji**。图标经 `utils/icons.js` 生成 data-uri，
  由 `components/icon` 通过 `background-image` 渲染（兼容性优于 `<image src=svg>`）
- 中文界面，字号 28rpx 基准，正文行高 1.6–1.8
- **胶囊/标签类样式禁止挂在行内 `<text>` 上**：`<text>` 不认垂直内边距，会被压扁。
  一律用 `<view>` + 固定 `height` + `line-height`（垂直居中）+ `text-align`（水平居中）+ `white-space: nowrap`
- **多列网格写法（真机兼容铁律）**：
  ```css
  .grid { display:flex; flex-direction:row; flex-wrap:wrap; justify-content:space-between; }
  .cell { box-sizing:border-box; width:48.4%; flex:0 0 auto; margin-bottom:18rpx; }
  ```
  即：**不用 `calc(50% - Nrpx)`**（部分安卓 WebView 上 rpx 参与 calc 会导致整条 width 失效）、
  **不用 flex `gap`**（老 WebView 不支持，改 `margin` 或 `space-between`）、
  **`box-sizing` 必须显式写在元素自己的规则里**，不能依赖 app.wxss 的全局规则
  —— 已用 headless Chrome 实证：`box-sizing` 不生效（content-box）是"两列挤成一列"的唯一成因
- **布局争议先复现再改**：`preview/grid-fix-check.html` 是对照样例；
  套路 = 用 `require` 引真实 `data/*.js` 生成 HTML（rpx ×0.5 转 px）→
  `chrome.exe --headless=new --screenshot=out.png file:///...` → 直接读图核对
- **真机渲染约定**：胶囊/标签用 `<view>`（见「踩过的坑 5」）；「图标 + 文字」间距用 margin
  （见「踩过的坑 6」）；底部固定条的主按钮 `min-width: 0` + `overflow: hidden` + 文字省略号兜底

## 技术约定
- 原生微信小程序，无第三方依赖；自定义 tabBar（`custom: true`）以便使用 SVG 图标
- 体质判定与茶方匹配**必须走硬规则**（`utils/engine.js`），不做生成式判定
- 体质判定用「相对倾向度 raw/理论最高分」比较，不可用原始分（否则会偏向平和质）
- 对话能力在 `utils/agent.js`：规则意图识别 + 文案模板；改文案改这里
- 本地存储统一走 `utils/store.js`，key 前缀 `tl_`

## 合规红线（医疗类目）
- 严禁诊断疾病、开处方、推荐药品；命中医疗意图统一回 `SAFETY_TEXT`
- 只用「调理/改善/舒缓/养生/保健」类表述，禁用「治疗/治愈/疗效/根治」
- 食材限定在《药食同源目录》内，用量取日常养生参考剂量（单味 3–10g）
- 特殊人群（孕期/哺乳/14 岁以下/慢性病）必须前置风险提示
- 每处推荐结果末尾附免责声明

## 已完成
- 11 个页面 + 3 个组件，18 款茶方、9 种体质、10 题测评、28 味食材、10 条茶饮常识
- `preview/design-preview.html` 为多屏静态设计预览，用于快速确认视觉方向

## 服务端（server/）· 第二轮新增
- 定位：**大模型只负责理解与表达，专业事实全部由 Function Call 触发硬规则引擎取回**
- 零第三方依赖，只用 Node 内置 http/fetch；`Dockerfile` 构建上下文是**项目根目录**（要 COPY ../data 与 ../utils）
- 服务端与小程序**共用同一份知识源**（`data/`、`utils/engine.js`），不复制数据
- 端上链路优先级：本地医疗红线硬拦截（不发网络）→ 用户关闭 AI/熔断 → 服务端 Agent → 失败回落本地规则引擎
- API Key 只放服务端环境变量，端上绝不持有
- 改完提示词/词表/切块策略后跑 `node server/scripts/eval.js` 回归
- 无 API Key 时用 `server/scripts/mock-llm.js` 离线验证完整 Function Call 链路

## 服务端 · 第四轮：内容管理后台
- 目的：内容原先硬编码在 `data/*.js` 并被端上打包，改一个字都要提审发版；现改为服务端可管、端上下发
- **核心设计：让 `data/*.js` 支持「就地覆盖」，而不是改造 20 多处消费点**（端上 22 处 / 服务端 9 处）
  - 每个数据模块导出 `applyOverride(next)`，**必须就地改写数组与映射、不能换引用**
  - `data/constitutions.js` 的 `ids` 也要就地维护（换成新数组后旧引用读不到，已被 smoke 测出）
- **发布后必须刷新的三个派生缓存**（漏一个就出「大部分对了、某处不对」的隐蔽 bug）：
  1. `utils/engine.js` 的 `MAX_SCORE` → `reload()`（否则体质倾向度百分比以旧量表为基数）
  2. `server/src/tools.js` 的工具枚举 → 按 overlay 版本**惰性重建**（否则模型推荐不到新增条目）
  3. `rag.buildIndex()`（否则对话里检索到的还是旧文案）
- 管理链路：`POST /api/admin/login`（Bearer + timingSafeEqual + IP 限流）→ 管理页 `/admin`
  → `PUT /api/admin/content/:type` → 三道校验 → 原子写 `server/storage/content.json`
  → overlay.apply → 重建索引 → 版本号 +1 → 端上 `GET /api/content?version=N` 增量拉取
- **三道校验**：结构 / 合规 / 交叉引用。合规扫描复用 `safety.WORD_MAP`（后台能发的、模型也允许说）；
  免责语先剔除 + 命中词前 6 字含否定词则豁免；疾病名只告警不阻断；交叉校验失败自动还原运行时并 422
- 端上下发在 `utils/content-client.js`：`bootstrap()` 同步套用 Storage 缓存（保证首屏），
  `refresh()` 异步按版本号拉取；服务端不可达/缓存损坏/payload 异常一律静默回落内置内容
- 回滚 `POST /api/admin/rollback`（用 `content.prev.json`，版本号继续递增）；播种需 `confirm:"RESEED"`
- **`ADMIN_TOKEN` 留空 = 管理端整体关闭**（宁可忘了配不可用，也不要忘了配就裸奔）
- 多实例部署不成立：内容与热更新都是进程内 + 本地磁盘，需改共享存储与广播刷新
- `server/storage/` 为运行时数据（内容库 + 审计 JSONL），已加入 `.gitignore`；容器部署必须挂 volume
- 回归自检：`cd server && npm test`（overlay / schema / content / admin / client 五个）

## 数据访问约定（内容可远程编辑后新增）
- 展示类取值一律用 `constitutions.getOr(id)`（未知 id 返回「未知体质」占位对象，绝不返回 null）
- `constitutions.get(id)` 保持严格返回 null，**仅用于校验 id 是否合法**
- 原因：内容可被后台删除，用户本机历史档案可能指向已删体质；原先 11 处 `.get(id).name` 会抛异常白屏

## 隐私与安全基线（部署前加固，务必保持）
- **AI 增强默认关闭 + 单独同意**：`utils/store.js` 的 `getAiEnabled()` 内部强制校验
  `tl_ai_consent_v1`，未同意一律返回 false（硬约束，不靠调用方自觉）。
  对话页首次开启弹 `wx.showModal` 授权说明。原实现是「默认开启、隐私文案却写『不上传』」，
  属合规硬伤（PIPL 第 28-29 条敏感个人信息须单独同意）
- **上行档案最小化**：`utils/agent-remote.js` 的 `minimalProfile()` 只上传
  `{constitutionId, secondaryId, percent, levelText, risk:{stage,chronic,allergy}}`；
  性别/年龄/孕期哺乳期/慢性病/过敏史**原始值不出端**
- **服务端兜底必须「降维」而不是「删除」**：`server/src/index.js` 的 `stripSensitiveProfile()`
  对旧客户端传来的 `basic` 就地转成布尔标记。**只删不转会把合规安全网一起删掉**
  （孕期用户不再被强制走 flag_risk），这条已写成 `smoke-security.js` 的断言
- `server/src/prompt.js` 的 runtimeContext 只用 `p.risk`，不再拼原始填报值进 prompt
- **公开接口一律限流**：`server/src/ratelimit.js`（固定窗口，按 IP 分组：
  chat 20/min、api 60/min）。方舟额度挂在开发者账号上，无限流则可被刷爆
- **CORS 默认完全关闭**：`CORS_ORIGIN` 留空 = 不下发任何 `Access-Control-Allow-*` 头。
  小程序不读 CORS、管理页同源，`*` 无收益只有风险。改 `http-util.corsHeaders()`
- **审计留痕不对外**：`/api/agent/audit`（无令牌返回用户输入原文）已下线，
  改为带鉴权的 `/api/admin/raw-audit`
- **`/api/agent/chat` 等敏感接口变更后，跑 `node server/scripts/smoke-security.js`**：
  它起一个假模型端点，把服务端真实发出的请求体抓下来断言，验的是最终事实而非中间变量

## 客户端配置约定
- `utils/config.js` **按环境版本自动选 API 地址**（三轨）：`API_BASE_DEVTOOLS`（127.0.0.1）/
  `API_BASE_LAN`（开发机局域网 IP，DHCP 会变）/ `API_BASE_PROD`（HTTPS + 已备案）。
  **不要再直接改 `API_BASE`**，它由 `pickApiBase()` 计算
- 客服邮箱等对外占位符集中到 `utils/config.js` 的 `SUPPORT_EMAIL`，别散落在页面里
- 打包白名单在 `project.config.json` 的 `packOptions.ignore`：已排除
  `preview` / `server` / `docs` / `.workbuddy` / `*.md`。**`server/` 内含 `.env` 明文密钥，
  漏排会被打进小程序包、反编译即得**

## 部署形态约束
- **必须单实例**：内容库与热更新是「进程内 + 本地磁盘」，`--scale` 会导致实例间内容不一致
- compose 用具名卷（`chalifang-storage` / `chalifang-cache`）而非绑定挂载：
  容器以 uid 1000 运行，绑定挂载宿主目录属主不匹配会「写盘失败」
- **托管平台若不支持持久卷 → 后台改的内容与审计日志随重新部署清空**，上线前必须确认
- 反向代理必须 `proxy_set_header X-Forwarded-For $remote_addr;` 覆写，
  否则客户端可自带该头绕过限流与登录锁定

## 踩过的坑（务必不要再犯）
1. **正则 g 标志**：`/x/g.test(s)` 会推进 lastIndex 造成随机漏检 → 词表一律用纯字符串数组
2. **流式内容净化的边界**：固定 holdback 无法消除跨 chunk 漏检，必须用「安全前缀」回退判定
3. **中文检索**：必须加停用短语表、未登录词直接丢弃、候选只用长度≥2 的强词项、并加入 trigram
4. **规则词库要定期用评测集反查覆盖度**，凭直觉补词会漏
5. **自定义组件事件名禁用原生事件名**：`triggerEvent('tap', …)` 会让父级 `bind:tap`
   同时收到「自定义事件（detail 带业务数据）」和「组件内原生 tap 冒泡（detail 是 {x,y}）」两次，
   表现为一次点击触发两次跳转。`tea-card` 已改名 `select`。同理禁用 longpress/touchstart 等
6. **`calc()` 里不要用 `rpx`**：部分安卓 WebView 解析阶段 `rpx` 是非法单位 → 整条声明被丢弃，
   数值退化（如 `width` 变 auto）。需要多列就写百分比
7. **依赖布局的属性一律给兜底**：`flex:1` 配 `min-width:0`；按钮/胶囊配 `overflow:hidden`
5. **行内 `<text>` 不能承载胶囊样式**：`<text>` 在真机不认垂直内边距，加 padding+border-radius+background
   会被压成一条细扁色块、圆角与描边渲染异常 → 胶囊/标签一律用 `<view>`（固定 height + line-height 居中
   + text-align 居中 + nowrap）。另外行内 `<text>` 内的换行/缩进会渲染成空白，文本内容必须写在一行
6. **元素间距不要依赖 flex `gap`**：部分 WebView 上 `gap` 不生效，图标会直接贴住文字。
   按钮/胶囊这类「图标 + 文字」的间距用 `margin-left`；`flex: 1` 的主按钮必须同时写 `min-width: 0`，
   否则内容可能撑出圆角胶囊
7. **合规整改时「删掉敏感字段」和「保住安全网」是两回事**：服务端收到旧客户端的
   `profile.basic` 时，若只是丢弃，孕期/慢性病人群就失去了「强制 flag_risk、不给配方」的保护。
   正确做法是**就地降维**成布尔标记再丢弃原值（见 `stripSensitiveProfile`）。
   凡涉及「最小化上传」的改造，都要先问一句：下游决策真正需要的是哪一位信息？
8. **改完隐私/限流/鉴权相关代码，必须跑带「真实抓包」的用例**：
   `smoke-security.js` 通过假模型端点抓服务端真实发出的请求体验证，而不是断言中间变量 ——
   本次就是它暴露了「服务端兜底只删不转」这个隐蔽 bug（端上改了、服务端没改，测试却全绿）
9. **服务端改完代码必须重启实例再验证**：Node 在启动时载入模块，`127.0.0.1:8787` 上挂着的旧进程
   跑的是旧代码 —— 不重启就测，测的是旧行为，会把旧结论当成新代码的结论。
   查活着的是哪个版本看 `/health` 的 `uptimeSec`；定位占用进程
   `Get-NetTCPConnection -LocalPort 8787 -State Listen` → `OwningProcess` → `Stop-Process`
10. **验证「敏感数据不外泄」用哨兵值 + 全目录扫描**：把测试入参写成可搜索的唯一串，
    跑完真实链路后遍历运行时可写目录逐文件 `indexOf` 搜哨兵。
    注意区分「固定模板文案」与「用户数据」——`audit-*.jsonl` 里的「孕期」来自
    `flag_risk` 的提示模板，不是用户填报值，别误报

## 服务端 · 第三轮：接豆包（火山方舟）
- 已接真实豆包并端到端联调通过：端点 `https://ark.cn-beijing.volces.com/api/v3`，模型 `doubao-seed-2-1-lite-260915`（账号已开通）
- **额度归开发者账号**：方舟按持有 API Key 的账号计费，终端用户无法用自己豆包账号的额度。
  Key 只放服务端 `server/.env`（已在 `.gitignore` / `.dockerignore` 中）
- `LLM_THINKING=disabled` 关深度思考；`llm.js` 另有一道 `reasoning_content` 过滤（只计数、不下发），
  字数记在 `done.meta.reasoningChars`
- 换厂商：只改 `LLM_BASE_URL` / `LLM_MODEL`，并把 `LLM_THINKING` 置空（thinking 是方舟私有字段，否则 400）
- 部署前跑 `node --env-file=server/.env server/scripts/check-llm.js` 自检（验 Key/模型/流式/Function Call）
- 模型必须支持 Function Calling，否则推荐链路退化为闲聊
- 方舟错误码辨析：`ModelNotOpen` = ID 正确但未开通；`InvalidEndpointOrModel.NotFound` = ID 已下线
- 刚开通模型后有**分钟级同步延迟**，期间仍可能报 ModelNotOpen，稍等重试即恢复
- 默认用 `lite`（够用且省），质量不够再换 `doubao-seed-2-1-pro-260915`
- **2026-10-08 复验通过**（修复后）：`check-llm.js` 三项全过（Key/流式/Function Call）；
  真实链路 `/api/agent/chat` 双语料验证 —— 孕期待测 → `flag_risk`×3 且明确不给配方；
  空档案 → `recommend_tea` 正常推荐；限流 60s 窗口第 21 次请求 429

## 文档
- `docs/deploy-preflight.md` — 部署前审计报告：问题清单（按严重级别）、修复状态、上线 Checklist、PocketBay 冲突分析
- `server/README.md` — 服务端架构、接口契约、部署（含 Nginx 关 buffering 的 SSE 配置）
- `docs/llm-integration.md` — 从 agent.js 换到真实大模型的完整步骤与降级策略
- `docs/resume-project.md` — 简历包装方案：能写什么、不能写什么、面试追问预案
