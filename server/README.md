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
```

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
| `CORS_ORIGIN` | `*` | 跨域白名单 |

---

## 接口

所有接口统一信封：成功 `{ ok: true, ... }`，失败 `{ ok: false, error }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回模型、索引规模、检索模式、会话数 |
| POST | `/api/agent/chat` | **流式对话（SSE）**，小程序主链路 |
| POST | `/api/agent/chat.json` | 非流式对话，用于联调或基础库不支持 chunked 时降级 |
| POST | `/api/agent/assess` | 体质量表评分（服务端复核同一套算法） |
| POST | `/api/agent/recommend` | 按体质 + 季节 + 排除项直接取茶方 |
| POST | `/api/agent/retrieve` | RAG 检索调试，返回每条的稀疏分/向量分/重排分 |
| GET | `/api/agent/audit` | 最近的风控与工具调用留痕 |

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

## 部署

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
location /api/agent/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # 关键
    proxy_cache off;
    chunked_transfer_encoding off;
    proxy_read_timeout 120s;      # 大模型首字可能较慢
}
```

---

## 小程序端接入

1. `utils/config.js` 把 `API_BASE` 改成你的 HTTPS 域名；
2. 微信公众平台 → 开发 → 开发设置 → 服务器域名，把该域名加进 **request 合法域名**；
3. 端上逻辑在 `utils/agent-remote.js`，链路优先级：

```
本地医疗红线硬拦截（不发网络） → 用户关闭 AI / 熔断中 → 服务端 Agent → 失败回落本地规则引擎
```

连续失败 2 次触发 60 秒熔断，避免每次发言都先卡一个超时；用户也可以在对话页顶部一键切回「本地模式」，此时零网络请求。

---

## 目录

```
server/
├── src/
│   ├── index.js      HTTP 路由 + Agent 编排主循环
│   ├── llm.js        OpenAI 兼容客户端（流式解析 / tool_calls 增量拼接 / 超时）
│   ├── prompt.js     Agent 系统提示词 + 运行时上下文注入
│   ├── tools.js      7 个 Function Call 定义与执行器
│   ├── rag.js        切块 / TF-IDF / 向量 / 融合重排
│   ├── corpus.js     知识语料构建（复用 ../data）
│   ├── safety.js     双层风控 + 流式净化 + 审计留痕
│   ├── session.js    多轮上下文，滑动窗口 + TTL 回收
│   └── config.js     环境变量
├── scripts/
│   ├── check-llm.js  大模型连通性自检（Key / 模型 / Function Call / 思考开关）
│   ├── eval.js       离线评测（检索 / 风控 / 事实一致性）
│   ├── build-index.js 构建索引与向量缓存
│   └── mock-llm.js   离线 Mock 模型（仅本地联调，可模拟豆包思考输出）
├── Dockerfile / docker-compose.yml / .env.example
```

运行时零第三方依赖，只用 Node 内置 `http` / `fetch` / `ReadableStream`。
