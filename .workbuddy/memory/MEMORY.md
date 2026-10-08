# 茶历方 小程序 · 项目长期记忆

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

## 文档
- `server/README.md` — 服务端架构、接口契约、部署（含 Nginx 关 buffering 的 SSE 配置）
- `docs/llm-integration.md` — 从 agent.js 换到真实大模型的完整步骤与降级策略
- `docs/resume-project.md` — 简历包装方案：能写什么、不能写什么、面试追问预案
