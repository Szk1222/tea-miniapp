# 把 agent.js 换成真实大模型：接入与验证

> 当前小程序体验版和正式版改走微信云托管私有链路。本文关于 `API_BASE_LAN` / `API_BASE_PROD` 的说明已过时，请以 [cloudbase-deploy.md](cloudbase-deploy.md) 为准。

> 目标：保留「体质判定 / 茶方匹配必须走硬规则」这条底线，用大模型替掉 `utils/agent.js` 里的**文案模板与意图识别**。

---

## 一、先明确「替换掉什么」

`utils/agent.js` 现在承担两件事，要区别对待：

| 原有职责 | 处理方式 | 去向 |
|---|---|---|
| 意图识别（哪句话对应哪个分支） | **替换**为大模型 | `server/src/llm.js` + `prompt.js` |
| 文案模板（`t('结合你的「痰湿质」…')`） | **替换**为大模型自由表达 | 同上 |
| 体质判定、茶方匹配、食材数据、茶方克重 | **保留**在硬规则里 | `utils/engine.js`、`data/*` |
| 医疗红线拦截、特殊人群风险提示 | **保留并加强**，改由服务端前置执行 | `server/src/safety.js` |
| 断网 / 无 Key 时的应答能力 | **保留**为兜底链路 | `utils/agent.js` 原样保留 |

所以 `agent.js` **不会被删掉**——它从「主链路」降级为「兜底链路 + 事实来源」。这是刻意的：养生场景下模型幻觉的代价太高，产品必须能在没有模型时照常工作。

---

## 二、真实大模型是怎么接进来的

```
小程序 pages/chat
   └─ utils/agent-remote.js          ← 新增：决定走哪条链路
        ├─ utils/agent.js           ← 本地兜底（原逻辑不动）
        └─ utils/llm.js             ← 新增：SSE 流式请求 + 熔断
             └─(HTTPS)→ server/     ← 新增：Agent 服务
                          ├─ safety.js  入站风控（模型之前）
                          ├─ llm.js     大模型流式调用 + tool_calls 拼接
                          ├─ tools.js   7 个工具，全部落到硬规则
                          ├─ rag.js     知识检索（搜到才敢说）
                          ├─ safety.js  出站净化（模型之后）
                          └─ session.js 多轮上下文
```

**为什么必须过一层服务端**：小程序包体可被反编译，把大模型 API Key 放在端上等于公开。端上只持有服务地址，Key 只存在服务端环境变量里。

---

## 三、五个步骤跑通

### 1. 起服务（先不花钱，用 Mock 模型验证链路）

```bash
node server/scripts/mock-llm.js                                   # 终端 1
LLM_BASE_URL=http://127.0.0.1:8790/v1 LLM_API_KEY=mock \
  LLM_MODEL=mock-llm node server/src/index.js                     # 终端 2
```

Mock 实现的是标准 OpenAI 流式协议（含把 `arguments` 拆成多个增量），所以它能验证的正是真实模型会走的代码路径。

### 2. 换真实模型（默认火山方舟 / 豆包）

```bash
cp server/.env.example server/.env
# 填入方舟 API Key（端点与模型已预置为豆包），然后：
node --env-file=server/.env server/src/index.js
```

开箱即用豆包三步：

1. 创建 API Key → <https://console.volcengine.com/ark/region:ark+cn-beijing/apikey>
2. 在同一控制台的「开通管理」里**开通**要用的模型（不开通会报模型不存在）
3. 把 Key 填进 `server/.env` 的 `LLM_API_KEY`；`LLM_MODEL` 填「模型列表」里的**准确 Model ID**（如 `doubao-seed-2-1-lite-260915`），不是显示昵称

启服之前先自检一次，比对着日志猜快得多：

```bash
node --env-file=server/.env server/scripts/check-llm.js
```

它会依次验证 Key、模型、流式、Function Call 与思考开关，失败时直接指出是 Key 错、模型没开通还是字段被拒。

> **额度归谁**：方舟按「持有 API Key 的账号」计费。小程序用户不需要、也无法使用自己豆包账号里的额度——所有用户的调用都消耗你这个服务端 Key 的额度。所以 Key 只能放服务端。

### 3. 端上指向服务

`utils/config.js` 里按环境分三个常量，不要再去改 `API_BASE` 本身（它由 `pickApiBase()` 自动选择）：

```js
const API_BASE_DEVTOOLS = 'http://127.0.0.1:8787';        // 开发者工具
const API_BASE_LAN      = 'http://192.168.31.37:8787';    // 体验版真机联调（开发机局域网 IP）
const API_BASE_PROD     = 'https://your-domain.com';      // 正式版：必须 HTTPS + 已备案
```

正式域名的两个硬要求：**已加入小程序 request 合法域名**、**已在工信部备案**（且不能带非标准端口）。

### 3.1 上行字段

端上只上传 `{ constitutionId, secondaryId, percent, levelText, risk }`，
其中 `risk` 是 `{ stage, chronic, allergy }` 三个布尔标记 —— 性别、年龄、慢性病名称、过敏史
等原始填报值**不出端**（服务端还有一道兜底，见 `server/README.md` 的「隐私」章节）。
改这里的字段时，请同步跑 `node server/scripts/smoke-security.js`。

### 4. 验证

```bash
curl -N -X POST http://127.0.0.1:8787/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo","message":"最近总觉得身体沉、湿气重","profile":{"constitutionId":"tanshi"}}'
```

应该看到 `delta` 文本逐步到达、`block` 依次推送茶方卡片、`done.meta.tools` 里记录了 `recommend_tea`。

### 5. 回归

改完提示词或词表后跑一遍，防止「感觉变好了」：

```bash
node server/scripts/eval.js
```

---

## 四、模型想乱来时，系统是怎么拦的

这是整件事里最值得说的部分。提示词约束是**概率性**的，合规是**硬性**的，所以三道闸门都在模型之外：

| 闸门 | 触发条件 | 效果 |
|---|---|---|
| ① 入站短路 | 命中医疗诊疗意图 / 高危人群 | **不调用模型**，直接返回固定话术。从链路层面保证不可能输出诊断 |
| ② 工具即事实 | 模型想给茶方 | 只能调 `recommend_tea`；工具返回的内容来自 `engine.js`，模型编的茶方名进不了卡片 |
| ③ 出站净化 | 输出含医疗术语 / 疾病名 | 术语改写；含疾病名整句丢弃，改走就医引导 |

第 ③ 关在流式场景下有个真实坑：模型是逐 token 吐字的，禁词可能被切在两个 chunk 之间。**固定长度的 holdback 只能降低漏检概率，无法消除**——「根治」被切成「根」+「治」就漏过去了。`makeStreamSanitizer` 用的是「安全前缀」判定：

> 设待输出前缀长度为 p，只要存在某个禁词 `w` 使得 `s < p < s + |w|`，说明有词横跨切分点，就把 p 抬到 `s + |w|`，重新校验，直到稳定。

已用 1~5 字符的全部切分粒度穷举验证，零泄漏。

---

## 五、端上的降级策略

`utils/agent-remote.js` 的优先级，从高到低：

1. **本地医疗红线** —— `agent.hitMedical()` 命中就本地回复，一个字节都不外发（与隐私政策里「不上传」的承诺一致）
2. **用户关闭 AI 增强** —— 对话页顶部的「本地模式」开关，切过去后零网络请求
3. **服务端 Agent** —— 流式增量渲染
4. **失败回落** —— 连续失败 2 次熔断 60 秒，期间直接走本地规则引擎，用户不会每次都先卡一个 20 秒超时

已经流出一半内容才失败时，不会把本地整段回复叠上去，只提示「可以再问一次」。

---

## 六、成本与性能

- **Token 成本**：会话历史滑动窗口保留最近 8 轮（`config.session.maxTurns`），工具返回给模型的 JSON 最大 4000 字符截断（`index.js` 里 `JSON.stringify(out.result).slice(0, 4000)`）
- **首字延迟**：SSE 逐 token 下发，端上是「边生成边显示」，不是等全文再渲染
- **超时**：`LLM_TIMEOUT_MS` 默认 20s，服务端超时后仍会尽力给出兜底块
- **向量检索**：默认关闭。开启后首次调用会生成并缓存到 `server/.cache/embeddings.json`，容器部署时把这个目录挂出来，重启不重复计费

---

## 七、还没做的

- 工具结果没有做跨请求缓存（相同体质 + 季节的推荐每次都重算，规则引擎本身很快，暂时不值得做）
- 没有做用户级限流与配额，公网上线前需要补
- 会话存在进程内存里，单机够用；要多副本得换 Redis（`session.js` 的接口已经按可替换的方式写）

---

## 八、豆包（火山方舟）接入备忘

方舟 `/api/v3` 兼容 OpenAI 协议，所以**代码层零改动**，全部差异收在两个环境变量和一处过滤逻辑里：

| 项 | 处理 | 位置 |
|---|---|---|
| 端点 | `https://ark.cn-beijing.volces.com/api/v3` | 环境变量 `LLM_BASE_URL` |
| 模型 ID | 填控制台的 Model ID（非昵称），且模型需先在「开通管理」开通 | 环境变量 `LLM_MODEL` |
| 深度思考 | 默认关闭（`LLM_THINKING=disabled`）；换非豆包网关时置空 | `config.js` → `decorateBody()` |
| 思考内容 | `delta.reasoning_content` 只计数、不下发 | `llm.js` 流式解析 |

为什么「关掉思考」之后还要「额外过滤一次」？这是两道互不依赖的防线：

- **关掉思考**是为了延迟与成本——思考过程会拉长首字时间，而且计入 `max_tokens`，给太小就会出现「思考完没 token 输出正文」的空回复；
- **过滤 `reasoning_content`** 是为了不被模型打脸——即便某个模型不认 `thinking` 字段、照样回思考内容，服务端也不会把它当正文渲染给用户。

过滤效果记在 `done.meta.reasoningChars`：为 0 说明思考确实关掉了；不为 0 说明模型没认字段，但已被拦下。

还有一个硬前提：**模型必须支持 Function Calling**。本项目所有专业事实都来自工具，模型不支持工具调用，推荐链路就退化成闲聊。`check-llm.js` 第 2 项专验这一条，每次换模型都建议跑一次。
