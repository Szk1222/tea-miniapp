# 茶历方 Agent 服务

给「茶历方」中医体质养生茶推荐小程序提供对话能力的后端服务。

**一句话架构**：大模型只负责「听懂用户 + 组织语言」，所有专业结论（体质判定、茶方匹配、食材功效、风险提示）都由 Function Call 触发硬规则引擎与本地知识库取回，模型不参与生成。

---

## 为什么这么设计

养生推荐是一个「表达可以宽松、事实必须严格」的场景。如果让大模型自由生成茶方，会出现三种不可接受的后果：

1. **专业幻觉**：编造不存在的配方、克重或功效；
2. **合规风险**：把「调理」说成「治疗」，或给出绝对化承诺；
3. **不可复现**：同一个用户两次问同一句话得到不同配方，无法做质量评测。

因此整条链路的职责被切开：

```
用户输入
  │
  ├─ ① 入站风控（硬规则，模型之前）      命中医疗意图 → 直接短路，不进模型
  │
  ├─ ② 大模型（OpenAI 兼容协议）          只做意图理解 + 决定调哪个工具 + 组织语言
  │      │
  │      └─ Function Call ──► ③ 工具层（全部是硬规则）
  │                             ├ recommend_tea  → utils/engine.js 规则匹配
  │                             ├ get_tea_detail → data/teas.js
  │                             ├ search_knowledge → rag.js 检索(data/ 知识源)
  │                             ├ get_constitution → data/constitutions.js
  │                             ├ flag_risk      → utils/agent.js 风控词库
  │                             └ start_assessment
  │
  ├─ ④ 结构化块渲染                       茶方卡片/风险提示/快捷选项由服务端拼装，不经过模型文案
  │
  └─ ⑤ 出站净化（硬规则，模型之后）        医疗术语与绝对化用语改写，疾病名整句降级
```

关键点：**服务端与小程序共用同一份知识源**（`../data`、`../utils`），不需要同步两套数据；模型换掉、提示词改掉，专业结论都不变。

---

## 快速开始

### 方式一：不接大模型，先用离线 Mock 跑通链路

```bash
# 终端 1：启动假模型（实现 OpenAI 流式协议 + Function Call，不花任何额度）
node server/scripts/mock-llm.js

# 终端 2：让 Agent 服务指向它
LLM_BASE_URL=http://127.0.0.1:8790/v1 LLM_API_KEY=mock LLM_MODEL=mock-llm node server/src/index.js

# 终端 3：看整条链路
curl -N -X POST http://127.0.0.1:8787/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo","message":"最近总觉得身体沉、湿气重","profile":{"constitutionId":"tanshi"}}'
```

### 方式二：接真实模型（默认火山方舟 / 豆包）

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入方舟 API Key（端点与模型已预置为豆包）
node --env-file=server/.env server/src/index.js
```

**开箱即用豆包的三步：**

1. 方舟控制台创建 API Key → <https://console.volcengine.com/ark/region:ark+cn-beijing/apikey>
2. 在同一控制台的「开通管理」里**开通**要用的模型（不开通会报「模型不存在」）
3. 把 Key 填进 `server/.env` 的 `LLM_API_KEY`；`LLM_MODEL` 用「模型列表」里的**准确 Model ID**（如 `doubao-seed-2-1-lite-260915`），不是页面上显示的昵称

填完先跑一次自检，比直接启服更容易定位问题：

```bash
node --env-file=server/.env server/scripts/check-llm.js
```

它会依次验证 Key、模型、流式输出、Function Call 与思考开关，失败时直接提示是 Key 错、模型没开通还是字段被拒。

**换其他兼容网关**（改两三个环境变量即可）：

| 服务 | LLM_BASE_URL | LLM_MODEL 示例 | 注意 |
|---|---|---|---|
| 火山方舟（豆包） | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-1-lite-260915` | 默认；保留 `LLM_THINKING=disabled` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 把 `LLM_THINKING` 置空 |
| 阿里通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 同上 |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 同上 |
| 本地 vLLM / Ollama | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` | 同上 |

### 跑评测与自检

```bash
node --env-file=server/.env server/scripts/check-llm.js   # 大模型连通性自检（Key/模型/工具/思考开关）
node server/scripts/eval.js                               # 检索 / 风控 / 事实一致性 三块指标（不花额度）
node server/scripts/build-index.js                        # 重建检索索引（可选生成向量）

# 回归自检（全部用临时 STORAGE_DIR，不污染实际数据）
node server/scripts/smoke-overlay.js   # 内容覆盖层：就地改写后所有外部引用是否同步
node server/scripts/smoke-schema.js    # 字段与合规校验：内置内容必须全过、违规内容必须被拦
node server/scripts/smoke-content.js   # 内容中心：发布 / 拦截 / 交叉校验 / 回滚 / 索引重建
node server/scripts/smoke-admin.js     # 管理接口：鉴权 / 限流 / 读写 / 下发 / 留痕
node server/scripts/smoke-client.js    # 小程序端链路：拉取生效 / 降级兜底 / 单独同意（服务端子进程）
node server/scripts/smoke-security.js  # 安全边界：隐私剥离 / 审计鉴权 / CORS / 接口限流
```

也可以 `cd server && npm test` 一次跑完六个自检（任一套件失败即中断，退出码非 0）。

`smoke-security.js` 值得单独说一句：它在本地起一个**假的大模型端点**，把服务端
**真实发出的请求体**抓下来做断言，验证「敏感原文确实没上传、风险标记确实还在」。
改提示词、改上行字段、改 `stripSensitiveProfile` 之后务必跑它。

---

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | 监听地址 |
| `LLM_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` | OpenAI 兼容网关地址（默认火山方舟） |
| `LLM_API_KEY` | — | 缺失时服务仍可启动，客户端会自动回落本地规则引擎 |
| `LLM_MODEL` | `doubao-seed-2-1-lite-260915` | 模型 Model ID |
| `LLM_TEMPERATURE` | `0.3` | 低温度，减少表达漂移 |
| `LLM_MAX_TOKENS` | `1024` | 单轮上限；开深度思考时思考也计入，别给太小 |
| `LLM_TIMEOUT_MS` | `20000` | 单次模型请求超时 |
| `LLM_MAX_TOOL_ROUNDS` | `4` | Function Call 最大轮次，超出强制收口 |
| `LLM_THINKING` | `disabled` | 豆包深度思考开关（`disabled`/`enabled`/`auto`）；换非豆包网关请置空 |
| `LLM_EXTRA_BODY` | — | 额外请求体字段（JSON），用于兜各家私有参数 |
| `EMBEDDING_ENABLED` | `false` | 开启后启用向量检索（混合检索模式） |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 向量模型（豆包需换成方舟对应的 embedding Model ID） |
| `RAG_TOP_K` / `RAG_MIN_SCORE` | `4` / `0.10` | 召回条数与相关度阈值 |
| `RAG_VECTOR_WEIGHT` | `0.62` | 向量分与关键词分的融合权重 |
| `CORS_ORIGIN` | 空 | 跨域白名单。**留空 = 不下发任何 CORS 头**（见下） |
| `RATE_LIMIT_ENABLED` | `true` | 公开接口限流总开关（仅压测/回归时关，生产不要关） |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口长度（毫秒） |
| `RATE_LIMIT_CHAT_MAX` | `20` | 对话类接口单 IP 每窗口上限 |
| `RATE_LIMIT_API_MAX` | `60` | 其余公开接口单 IP 每窗口上限 |
| `RATE_LIMIT_MAX_IPS` | `20000` | 限流表最多跟踪多少个 IP，超出按插入顺序淘汰 |
| `SESSION_MAX` | `5000` | 会话数上限，超出按最久未活跃淘汰 |
| `ADMIN_TOKEN` | — | 管理后台访问令牌。**留空则管理端整体关闭（接口一律 403）** |
| `ADMIN_MAX_LOGIN_FAILS` | `5` | 同一 IP 连续登录失败几次后锁定 |
| `ADMIN_LOCK_MS` | `300000` | 锁定时长（毫秒，默认 5 分钟） |
| `STORAGE_DIR` | `server/storage` | 内容库与审计日志落盘目录。**容器部署必须挂 volume** |
| `AUDIT_RETENTION_DAYS` | `7` | 审计日志保留天数，按天分文件、过期自动清理 |

---

## 接口

所有接口统一信封：成功 `{ ok: true, ... }`，失败 `{ ok: false, error }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回模型、索引规模、检索模式、**内容版本**、会话数 |
| GET | `/api/content` | **内容下发**，小程序启动时按 `?version=N` 拉取（版本一致只回版本号） |
| POST | `/api/agent/chat` | **流式对话（SSE）**，小程序主链路 |
| POST | `/api/agent/chat.json` | 非流式对话，用于联调或基础库不支持 chunked 时降级 |
| POST | `/api/agent/assess` | 体质量表评分（服务端复核同一套算法） |
| POST | `/api/agent/recommend` | 按体质 + 季节 + 排除项直接取茶方 |
| POST | `/api/agent/retrieve` | RAG 检索调试，返回每条的稀疏分/向量分/重排分 |
| GET | `/api/agent/knowledge` | 食材科普查询 |
| GET | `/api/admin/raw-audit` | 最近的风控与工具调用留痕（内存环形缓冲）。**需令牌** |

> **已下线**：原来的 `GET /api/agent/audit` 是**无令牌公开**的，而条目里的 `input`
> 就是用户输入原文 —— 等于把线上用户的健康类对话片段公开在互联网上。
> 现在只保留带鉴权的 `/api/admin/raw-audit`（落盘版见 `/api/admin/audit`）。

管理端接口（全部要求 `Authorization: Bearer <ADMIN_TOKEN>`，见「内容管理后台」）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin` | 管理页面（静态外壳，不鉴权；数据接口都要令牌） |
| POST | `/api/admin/login` | 校验令牌，失败按 IP 限流锁定 |
| GET | `/api/admin/overview` | 概览：内容版本、条数、索引、会话、审计、存储 |
| GET | `/api/admin/schema` | 字段描述，管理端据此自动渲染表单 |
| GET | `/api/admin/content/:type` | 读取某类内容（`teas`/`constitutions`/`questions`/`knowledge`/`catalog`） |
| PUT | `/api/admin/content/:type` | **发布某类内容**（整体替换，校验不过直接 422） |
| GET | `/api/admin/journal` | 本进程的内容变更流水 |
| POST | `/api/admin/rollback` | 回滚到上一版 |
| POST | `/api/admin/reseed` | 用代码内置内容重新播种（需 `confirm: "RESEED"`） |
| GET | `/api/admin/audit` | 审计留痕（落盘版，跨重启可查） |

### 请求体（chat）

```json
{
  "sessionId": "s1a2b3c",
  "message": "最近总觉得身体沉、湿气重",
  "profile": {
    "constitutionId": "tanshi",
    "secondaryId": "",
    "percent": 62,
    "levelText": "倾向比较明显",
    "basic": { "age": "25-34 岁", "gender": "女", "stage": "无", "conditions": ["以上都没有"], "tastes": ["清淡"], "allergy": "" }
  },
  "context": { "lastTeas": ["chenpi-heye"], "flags": {} }
}
```

### 流式事件

```
event: meta    {"model":"doubao-seed-2-1-lite-260915","mode":"llm","retrieval":"sparse","chunks":92}
event: delta   {"text":"结合你的"}
event: block   {"type":"teas","teas":["chenpi-heye","hongdou-yimi"]}
event: block   {"type":"notice","text":"本建议仅作日常养生参考，不替代专业医疗建议。","tone":"warn"}
event: block   {"type":"chips","items":[{"label":"换一批茶方","text":"还有别的茶方吗"}]}
event: done    {"ctx":{"lastTeas":["chenpi-heye","hongdou-yimi"],"flags":{}},
                "meta":{"rounds":1,"tools":[{"name":"recommend_tea","ok":true}],
                        "reasoningChars":0,"sanitized":["治疗"],"latencyMs":673}}
event: error   {"message":"..."}
```

`block` 的 5 种类型（`text` / `teas` / `notice` / `chips` / `cta`）与小程序渲染层一一对应，端上不需要理解业务，只负责渲染。`done.meta.mode` 会明确告诉端上这次是 `llm`、`local-fallback` 还是 `safety-short-circuit`。

---

## 豆包（火山方舟）接入要点

方舟的 `/api/v3` 与 OpenAI 协议兼容，代码层零改动；真正要留意的是三个容易踩的点：

1. **模型 ID ≠ 显示名，而且必须先开通。** 控制台里看到的是昵称，代码里要填 Model ID（`doubao-seed-2-1-lite-260915` 这类），并且每个模型都要在「开通管理」里单独开通。两种报错要分清：

   - `ModelNotOpen` → ID 是对的，只是这个模型还没开通，去控制台点开通即可；
   - `InvalidEndpointOrModel.NotFound` → 这个 ID 本身不在在售列表里（豆包迭代很快，旧版本会静默下线，别再抄网上过时的 ID）。
2. **必须选支持 Function Calling 的模型。** 本项目所有专业事实都靠工具取回，模型若不支持工具调用，推荐链路会退化成「只能闲聊」。`check-llm.js` 的第 2 项就是专门验这个。
3. **深度思考要主动关掉。** seed 系列默认可能开思考，副作用有两个：首字延迟明显变长；思考过程也计入 `max_tokens`，给太小会出现「思考完没 token 输出正文」的空回复。因此默认 `LLM_THINKING=disabled`，同时把 `LLM_MAX_TOKENS` 提到 1024。
4. **lite 和 pro 怎么选。** 默认用 `doubao-seed-2-1-lite-260915`：更快更省，本项目这种「一两句话回复 + 工具取事实」的场景完全够用（实测首字约 1.2s，含 2 轮工具调用整轮约 5s）。若发现工具调用不够稳或表达偏干，再换 `doubao-seed-2-1-pro-260915`，改 `LLM_MODEL` 一行即可。

即便模型仍然回了思考内容，服务端也会在 `llm.js` 里把 `delta.reasoning_content` **只计数、不下发**——用户不会在界面上看到模型的内心独白。字数会记进 `done.meta.reasoningChars`，方便观察开关是否真的生效。

**关于「用豆包账号额度」这件事，需要澄清一个前提：**

方舟是按**持有 API Key 的那个账号**计费的。小程序终端用户既不需要、也无法使用自己豆包账号里的额度——豆包没有面向第三方小程序的「用户登录后消耗自己套餐」的授权机制。所以正确的形态是：

- 你（开发者）在方舟开通模型、创建 API Key，把它放在服务端；
- 所有小程序用户共享这一个 Key 的额度（也就是你这个账号的套餐 / 充值余额）；
- 用户在小程序里不需要登录豆包，也感知不到豆包的存在。

这也是为什么 Key 只能放服务端：小程序包体可被反编译，Key 一旦下发就等于公开，别人刷的是你的额度。

---

## 检索（RAG）实现说明

语料来自 `data/` 下的结构化知识（9 种体质 / 18 款茶方 / 28 味食材 / 10 条常识），
切块后在 `rag.js` 里做两级检索：

1. **稀疏检索**：中文按「单字 + bigram + trigram + 整体词」加权建 TF-IDF 索引，
   用余弦相似度打分。中文短查询（「湿气重」「睡不好」）靠二元/三元组才能召回。
2. **稠密检索（可选）**：`EMBEDDING_ENABLED=true` 时调 `/embeddings` 生成向量，
   结果缓存到 `server/.cache/embeddings.json`，避免重复计费。
3. **融合 + 重排**：向量分与关键词分按权重融合后，再叠加标题命中（乘法加成）、
   文档类型先验、续块降权，最后同文档去重、按阈值截断。

调过三个坑，都写进注释了：

- **疑问词污染**：不剔除「怎么办 / 有什么作用」这类填充词，「湿气重怎么办」会命中「喝了不舒服怎么办」；
- **单字兜底**：给未登录词兜底 idf 会让「恐龙蛋化石」靠「化」「石」命中化痰类文档，所以未登录词直接丢弃，且候选集只取长度 ≥ 2 的强词项；
- **三元组缺失**：只有 bigram 时「睡不好」切成「睡不 / 不好」，召不回任何内容。

---

## 合规风控（双层）

| 层 | 位置 | 做法 |
|---|---|---|
| 入站 | 模型之前 | 7 类医疗诊疗正则 + 4 类特殊人群正则。命中医疗意图或高危人群（孕期/哺乳/14 岁以下）**直接短路**，不进模型，从链路层面杜绝违规输出 |
| 出站 | 模型之后 | 11 组医疗术语/绝对化用语词表改写；疾病名命中则整句降级为就医引导 |

出站这一层有个容易踩的坑：**流式下必须做边界安全处理**。固定长度的 holdback 只能降低漏检概率，无法消除——「根治」被切成「根」+「治」就漏了。`makeStreamSanitizer` 采用「安全前缀」判定：只要存在某个禁词横跨切分点，就把切分点抬到该词之后重新校验，直到稳定。已用 1~5 字符的所有切分粒度穷举验证过，零泄漏。

---

## 内容管理后台

### 解决什么问题

内容（18 款茶方 / 9 种体质 / 10 题量表 / 28 味食材 / 10 条常识）原来硬编码在 `data/*.js` 里，
并被小程序打包带走 —— 改一个字都要重新提审发版。管理后台把内容搬到服务端，改完即生效。

### 架构：一处覆盖，全身生效

```
管理后台 PUT /api/admin/content/:type
        │  ① 结构 + 合规 + 跨类型交叉校验，不过则 422 且线上内容一字不动
        ▼
  server/storage/content.json          ② 原子写（.tmp + rename），旧版留一份 content.prev.json
        │
        ▼
  utils/content-overlay.js  apply()    ③ 就地改写 data/*.js 的数组与索引
        │                                 （不换引用 —— 端上 22 处、服务端 9 处消费点全部无需改动）
        ├──► utils/engine.js reload()   ④ 重算体质理论最高分（否则倾向度百分比会失真）
        ├──► tools.js 惰性重建工具定义   ⑤ 体质/茶方枚举跟着内容版本走（否则模型推荐不到新条目）
        └──► rag.buildIndex()           ⑥ 重建检索索引（否则对话里检索到的还是旧文案）
        ▼
  内容版本号 +1  →  GET /api/content?version=N  →  小程序下次启动生效，无需发版
```

**关键取舍**：没有把 20 多处消费点改成异步取数，而是让 `data/*.js` 支持「就地覆盖」。
代价是这三个模块的派生缓存必须显式刷新（`engine.MAX_SCORE`、工具枚举、RAG 索引），
漏掉任何一个都会出现「大部分对了、某一处不对」的隐蔽问题 —— 这也是 `smoke-overlay.js`
存在的意义。

### 保存前的三重校验

| 关卡 | 拦什么 | 例子 |
|---|---|---|
| 结构校验 | 必填、长度、枚举、id 唯一、id 格式、颜色格式 | 茶方名为空、体质 id 写成 `buzhidao`、两条记录同 id |
| 合规校验 | 复用 `safety.js` 的**同一份风控词表**，外加内容侧红线 | 写「可治疗失眠」「根治」「替代药物」直接拒绝 |
| 交叉校验 | 本次改动会不会让其他内容失效 | 删掉 `pinghe` 体质 → 引用它的茶方与量表全部报警，整批拒绝并**自动还原** |

合规校验有两处工程细节值得说明：

1. **免责语豁免**：`不具备医疗诊断与治疗资质` 这类合规表述本身含「治疗」，先剔除这些固定短语再扫描；
2. **否定语境豁免**：命中词前 6 个字里出现「不/非/无/未/别/勿/免」时不算违规（`本品不治疗疾病` 放行）。
   疾病名（高血压/糖尿病…）**只告警不阻断** —— 合规上恰恰需要识别这些人群。

dosage 也有两道线：单味 > 10g 告警，> 30g 阻断；食材必须在「药食同源目录」内，口径与
`scripts/eval.js` 的茶方合规率检查完全一致。

### 怎么用

```bash
# 1. 生成令牌（32 位以上随机串）
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
# 2. 填进 server/.env 的 ADMIN_TOKEN，重启服务
# 3. 打开 http://<host>:8787/admin，粘贴令牌登录
```

页面左侧是五类内容 + 概览 + 变更记录 + 审计留痕；表单由 `/api/admin/schema` 下发，
**加字段只需要改 `content-schema.js`**，服务端校验与管理端表单会同步跟上，不会两边不一致。

误操作有两道保险：`回滚到上一版`（恢复 `content.prev.json`，版本号继续递增所以客户端能感知）
和概览页的 `用内置数据重新播种`（需输入 `RESEED` 二次确认）。

### 鉴权与安全边界

- **单令牌模型**：`ADMIN_TOKEN` + `Authorization: Bearer`，`timingSafeEqual` 比较防时序侧信道；
  同一 IP 连续失败 `ADMIN_MAX_LOGIN_FAILS` 次锁定 `ADMIN_LOCK_MS`
- `ADMIN_TOKEN` 留空 → 管理接口一律 403。这是故意的：宁可「忘了配导致管理端不可用」，
  也不要「忘了配导致谁都能改线上内容」
- 令牌放 `server/.env`（已在 `.gitignore` / `.dockerignore`），**不要提交、不要在群里发**
- 管理页面带 `noindex`，且所有数据接口都要令牌 —— 页面外壳本身不鉴权，拿到 HTML 也读不到内容
- **审计留痕不对外公开**：`/api/agent/audit` 已下线（它无令牌即返回用户输入原文），
  只保留带鉴权的 `/api/admin/raw-audit`
- **已知局限**：没有多账号、没有角色权限、没有令牌过期与轮换。单人或小团队运营够用；
  一旦要多人协作或权限分级，需要换成账号体系（届时 `/api/admin/*` 的路由与 `authGuard` 是唯一改动点）

### 公开接口限流（防大模型额度被刷爆）

方舟额度**记在开发者账号**上。接口公开却无限流时，任何人拿到域名（反编译小程序即可取得）
都能脚本刷量，产生真实资费。因此 `/api/agent/chat`、`/api/agent/chat.json` 与其余公开接口
都走了 IP 限流（见 `src/ratelimit.js`，配额见「环境变量」章节），超限返回 429 与 `Retry-After`。

两个必须知道的局限：

1. **单进程内存态**。多实例部署时各限各的，阈值等价于乘以实例数；要精确全局限流请放到
   Nginx（`limit_req`）或共享存储。
2. **IP 可伪造**。若反向代理**没有覆写** `X-Forwarded-For`，客户端可自带该头绕过限流。
   Nginx 侧必须写：`proxy_set_header X-Forwarded-For $remote_addr;`
   （这条同时也决定了管理端登录锁定是否有效 —— 两者用的是同一个 IP 取值函数。）

### CORS：默认完全关闭

`CORS_ORIGIN` 默认留空，即**不下发任何 `Access-Control-Allow-*` 响应头**。原因：

- 小程序的 `wx.request` 不受浏览器同源策略约束，压根不读 CORS 头；
- 管理页由本服务自己托管，与接口同源，也不需要 CORS。

所以 `*` 对小程序毫无收益，只会让任意网页都能调用对话与管理接口。仅当把管理页部署到
**另一个域名**下时才需要配置（支持逗号分隔多个来源）。

### 隐私：上行档案的最小化

用户的性别、年龄段、孕期/哺乳期、慢性病、过敏史属于《个人信息保护法》定义的**敏感个人信息**，
向服务端与第三方大模型传输需要单独同意。因此：

- **端上**（`utils/agent-remote.js` 的 `minimalProfile`）只上传体质类型与
  `risk: { stage, chronic, allergy }` 三个布尔标记，原始值不出端；
- **服务端**（`src/index.js` 的 `stripSensitiveProfile`）再兜一层，并且对**旧版本客户端**
  仍然透传上来的 `basic` 做就地降维 —— 不能只是「删掉了事」，
  那会把「先做风险提示、不给具体配方」的合规安全网一起删掉；
- `src/prompt.js` 只使用标记，不再把原始填报值拼进 prompt。

回归验证见 `scripts/smoke-security.js`：它在本地起一个假模型端点，把服务端**真实发出的请求体**
抓下来断言「敏感原文不存在、风险标记仍存在」。

### 持久化与部署

| 路径 | 内容 | 是否进仓库 |
|---|---|---|
| `server/storage/content.json` | 当前生效内容 + 版本号 | 否（`.gitignore`） |
| `server/storage/content.prev.json` | 上一版备份，供回滚 | 否 |
| `server/storage/audit-YYYY-MM-DD.jsonl` | 风控与工具调用留痕，按天切分 | 否 |

**容器部署务必挂 volume**，否则重启就丢后台改动。

compose 里用的是**具名卷**（`chalifang-storage` / `chalifang-cache`）而不是绑定挂载：
容器以非 root（uid 1000）运行，绑定挂载 `./storage` 时宿主机目录属主通常不是 1000，
会导致后台发布内容报「写盘失败」。具名卷由 Docker 管理属主，免去 chown。
确实需要直接看宿主目录时再换回绑定挂载，并先执行：

```bash
mkdir -p server/storage && sudo chown -R 1000:1000 server/storage
```

**必须单实例部署。** 内容与撤销都写在本地磁盘，且热更新只作用于**当前进程**；
用 `--scale` 扩容会让多个实例各读各的，表现为「后台改完内容，一部分用户的请求仍返回旧内容」
且难以排查。要真正扩容，需改成共享存储（挂同一卷或用对象存储）并加「内容变更后广播刷新」。

**平台适配提醒**：托管平台若**不支持持久化卷**（很多单容器 PaaS 都不支持），
`storage/` 会随每次重新部署被清空 —— 后台改的内容与审计日志全部丢失。
上线前务必确认平台是否提供持久磁盘；若没有，需要把 `content.json` 与审计日志改存对象存储或数据库。

---

## 部署

> 仓库已配好 GitHub Actions 流水线（校验 → 构建镜像推 GHCR → 可选上传小程序体验版）。
> 若走 CI/CD，见 **`docs/github-actions-deploy.md`**；下面是本地手动部署的方式。

```bash
# 构建（注意上下文是项目根目录）
docker build -f server/Dockerfile -t chalifang-agent .

# 运行
docker run -d --name chalifang-agent -p 8787:8787 --env-file server/.env chalifang-agent

# 或者用 compose
docker compose -f server/docker-compose.yml up -d
```

**反向代理必须关掉响应缓冲**，否则 SSE 会攒成一次性返回，流式效果消失：

```nginx
# 单 IP 对话限流（服务端另有一层，这里是第二道，也是多实例下唯一有效的一道）
limit_req_zone $binary_remote_addr zone=chat:10m rate=20r/m;
limit_req_zone $binary_remote_addr zone=api:10m  rate=60r/m;

location /api/agent/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # 关键
    proxy_cache off;
    chunked_transfer_encoding off;
    proxy_read_timeout 120s;      # 大模型首字可能较慢

    # 必须覆写，否则客户端可自带 X-Forwarded-For 绕过限流与登录锁定
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;

    limit_req zone=chat burst=5 nodelay;
    limit_req_status 429;
}

# 内容下发：小程序启动时会请求，建议允许缓存但按版本号区分
location /api/content {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    client_max_body_size 4m;

    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    limit_req zone=api burst=20 nodelay;
    limit_req_status 429;
}

# 管理后台：建议再加一层 IP 白名单 / Basic Auth
location /api/admin/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    client_max_body_size 4m;

    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;

    # allow 203.0.113.0/24; deny all;   # 按需打开
}

location /admin {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
}

# /health 会暴露 provider、模型名、索引规模、会话数等运行信息，
# 建议只对内网 / 平台健康检查开放，对外拒绝：
location /health {
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;
    proxy_pass http://127.0.0.1:8787;
}
```

---

## 小程序端接入

1. `utils/config.js` 把 `API_BASE_PROD` 改成你的 HTTPS 域名。
   该文件按环境版本自动选地址：开发者工具用 `API_BASE_DEVTOOLS`（127.0.0.1）、
   体验版用 `API_BASE_LAN`（开发机局域网 IP）、正式版用 `API_BASE_PROD`，
   避免上线前把调试地址带上正式包；
2. 微信公众平台 → 开发 → 开发设置 → 服务器域名，把该域名加进 **request 合法域名**。
   注意该域名必须**已在工信部备案**，且不能带非标准端口；
3. 端上逻辑在 `utils/agent-remote.js`，链路优先级：

```
本地医疗红线硬拦截（不发网络） → 未单独同意 AI / 用户关闭 / 熔断中 → 服务端 Agent → 失败回落本地规则引擎
```

**AI 增强默认关闭，且必须单独同意**：首次在对话页开启时会弹出授权说明；
同意前 `store.getAiEnabled()` 恒为 false —— 即使本地残留着旧版本的开关状态，
也不会发出任何网络请求。这是敏感个人信息（体质 / 健康）向第三方模型传输的合规要求，不是可选项。
上行字段只包含体质类型与 `risk` 三个布尔标记，原始填报值不出端（见上文「隐私」章节）。

连续失败 2 次触发 60 秒熔断，避免每次发言都先卡一个超时；用户也可以在对话页顶部一键切回「本地模式」，此时零网络请求。

### 内容下发（`utils/content-client.js`）

`app.js` 启动时两步走，都不阻塞渲染：

```
onLaunch
 ├─ bootstrap()  同步：把上次缓存的 content.json 就地覆盖到 data/*.js
 │                      （必须同步，否则首屏拿到的还是内置数据）
 └─ setup()      异步：GET /api/content?version=N
                        ├─ unchanged → 什么都不做
                        ├─ 有新版本 → 先落 Storage 再 apply，立即生效
                        └─ 失败/超时 → 静默保持现有内容，用户无感
```

降级是全覆盖的：服务端不可达、缓存 JSON 损坏、payload 结构不对、Storage 写失败 ——
任何一种情况都只表现为「内容没更新」，不会报错、不会白屏。用户关闭 AI 增强时，
内容拉取也一并跳过，与对话链路的隐私承诺保持一致。

**生效时机**：已打开的页面不会自动重绘。需要即时刷新的页面实现
`onContentUpdate(info)` 即可被回调（`content-client.js` 的 `notifyPages`）。
未实现的页面在下次进入时自然读到新内容。

**一个连带的加固**：内容可远程删除后，用户本机的历史体质档案可能指向已删掉的体质。
原先 11 处展示路径直接写 `constitutions.get(id).name`，会抛异常导致白屏；
现在统一走 `getOr(id)`（未知 id 返回「未知体质」占位对象），
只有「校验 id 是否合法」的场景才用严格的 `get(id)`。

---

## 目录

```
server/
├── src/
│   ├── index.js          HTTP 路由 + Agent 编排主循环
│   ├── llm.js            OpenAI 兼容客户端（流式解析 / tool_calls 增量拼接 / 超时）
│   ├── prompt.js         Agent 系统提示词 + 运行时上下文注入
│   ├── tools.js          7 个 Function Call 定义与执行器（定义随内容版本惰性重建）
│   ├── rag.js            切块 / TF-IDF / 向量 / 融合重排
│   ├── corpus.js         知识语料构建（复用 ../data）
│   ├── safety.js         双层风控 + 流式净化 + 审计留痕（内存 + 落盘双写）
│   ├── session.js        多轮上下文，滑动窗口 + TTL 回收
│   ├── config.js         环境变量
│   ├── content.js        内容中心：持久化 / 校验 / 发布 / 回滚 / 版本号
│   ├── content-schema.js 字段描述 + 三重校验（结构 / 合规 / 交叉引用）
│   ├── admin.js          管理接口 + 令牌鉴权 + 登录限流
│   ├── audit-store.js    审计日志落盘（JSONL 按天切分 + 过期清理）
│   ├── ratelimit.js      公开接口 IP 限流（固定窗口，防大模型额度被刷爆）
│   └── http-util.js      响应封装 / 请求体读取 / CORS 头 / 客户端 IP
├── public/
│   └── admin.html        单文件管理后台（零依赖原生 JS，表单由 schema 驱动）
├── scripts/
│   ├── check-llm.js      大模型连通性自检（Key / 模型 / Function Call / 思考开关）
│   ├── eval.js           离线评测（检索 / 风控 / 事实一致性）
│   ├── build-index.js    构建索引与向量缓存
│   ├── mock-llm.js       离线 Mock 模型（仅本地联调，可模拟豆包思考输出）
│   └── smoke-*.js        六个回归自检（覆盖层 / 校验 / 内容中心 / 管理接口 / 端上链路 / 安全边界）
├── storage/              运行时数据：内容库 + 审计日志（不进仓库，需挂 volume）
├── Dockerfile / docker-compose.yml / .env.example
```

小程序端新增/改动：

```
utils/content-overlay.js   共享的内容覆盖层（端服共用，纯逻辑）
utils/content-client.js    端上拉取与缓存（bootstrap 同步 / refresh 异步）
utils/agent-remote.js      上行档案最小化（minimalProfile：只传体质类型 + 风险标记）
utils/store.js             AI 增强默认关闭 + 单独同意标记（tl_ai_consent_v1）
utils/config.js            按环境版本自动选 API 地址（开发 / 体验 / 正式三轨）
app.js                     onLaunch 里接上内容初始化
data/*.js                  五个数据模块各加一个 applyOverride()
utils/engine.js            MAX_SCORE 改为可重算（reload()）
```

运行时零第三方依赖，只用 Node 内置 `http` / `fetch` / `ReadableStream`。
