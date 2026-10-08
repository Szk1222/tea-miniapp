/**
 * 大模型连通性自检（火山方舟 / 豆包，或任意 OpenAI 兼容网关）。
 *
 * 用法：
 *   node --env-file=server/.env server/scripts/check-llm.js
 *
 * 它按 Agent 服务的真实代码路径（llm.js）发请求，依次验证：
 *   [1] 纯文本流式对话  → 验证 API Key、模型 ID、SSE 链路
 *   [2] Function Call   → 验证工具调用能力（本项目强依赖，必须有）
 *   [3] 深度思考开关    → 确认 thinking 是否按配置生效
 *
 * 退出码：全通过为 0，任一项失败为 1（可用于部署前门禁）。
 */
const cfg = require('../src/config.js');
const llm = require('../src/llm.js');

function line() { console.log('-'.repeat(58)); }

function mask(k) {
  if (!k) return '(未配置)';
  if (k.length <= 8) return k.slice(0, 2) + '***';
  return k.slice(0, 4) + '***' + k.slice(-4);
}

function hintFor(err) {
  const msg = String((err && err.message) || '');
  // 方舟返回的业务错误码比 HTTP 状态码更能说明问题，优先按错误码判定
  if (msg.indexOf('ModelNotOpen') > -1) {
    return '模型未开通（Key 本身是有效的）：到方舟控制台「开通管理」把 ' + cfg.llm.model +
      ' 开通即可 → https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement';
  }
  if (msg.indexOf('InvalidEndpointOrModel.NotFound') > -1) {
    return 'Model ID 不存在：' + cfg.llm.model +
      ' 不在方舟在售列表里。豆包迭代很快、旧版本会下线，请用控制台「模型列表」中的准确 ID。';
  }
  if (err.status === 401) return '401：API Key 不对。检查是否多复制了空格或少了字符。';
  if (err.status === 400) return '400：请求被拒。常见于非豆包网关却携带了 thinking 字段（把 LLM_THINKING 置空即可）。';
  if (err.status === 429) return '429：限流或额度不足，检查账号套餐余量。';
  return '排查网络连通性与端点地址（LLM_BASE_URL）是否正确。';
}

const WEATHER_TOOL = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: '查询指定城市的天气',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名' } },
      required: ['city']
    }
  }
}];

async function main() {
  console.log('\n茶历方 · 大模型连通性自检\n');
  console.log('端点     : ' + cfg.llm.baseUrl);
  console.log('模型     : ' + cfg.llm.model);
  console.log('API Key  : ' + mask(cfg.llm.apiKey));
  console.log('思考开关 : ' + (cfg.llm.thinking || 'auto（不向请求注入 thinking 字段）'));
  line();

  if (!cfg.llm.apiKey || cfg.llm.apiKey.indexOf('在这里填') > -1) {
    console.error('✗ 未读到有效的 LLM_API_KEY。');
    console.error('  请把 server/.env.example 复制为 server/.env 并填入方舟 API Key，');
    console.error('  然后用 node --env-file=server/.env server/scripts/check-llm.js 运行。');
    process.exit(1);
  }

  let reasoningTotal = 0;
  let textOk = false;
  let toolOk = false;

  /* ---------- [1] 纯文本流式 ---------- */
  process.stdout.write('[1/3] 纯文本流式对话 ... ');
  try {
    let text = '';
    const t0 = Date.now();
    const r = await llm.chatStream({
      messages: [
        { role: 'system', content: '你是中文助手，回答务必控制在 20 字以内。' },
        { role: 'user', content: '用一句话说明什么是养生茶。' }
      ],
      tools: [],
      onDelta: function (d) { text += d; }
    });
    reasoningTotal += r.reasoningChars || 0;
    console.log('通过 (' + (Date.now() - t0) + 'ms)');
    console.log('      模型回复：' + (text || '(空——可能是 max_tokens 太小或被思考占满)'));
    textOk = !!text;
  } catch (e) {
    console.log('失败');
    console.error('      ' + e.message);
    console.error('      → ' + hintFor(e));
    process.exit(1);
  }

  /* ---------- [2] Function Call ---------- */
  process.stdout.write('[2/3] Function Call（工具调用） ... ');
  try {
    const r = await llm.chatStream({
      messages: [
        { role: 'system', content: '你是一个助手。需要外部信息时必须调用提供的工具，不要凭空回答。' },
        { role: 'user', content: '帮我查一下北京今天的天气。' }
      ],
      tools: WEATHER_TOOL,
      onDelta: function () {}
    });
    reasoningTotal += r.reasoningChars || 0;
    const names = r.toolCalls.map(function (c) { return c.name; });
    if (names.indexOf('get_weather') > -1) {
      console.log('通过');
      console.log('      工具调用：' + names.join(', '));
      console.log('      参数：' + (r.toolCalls[0].arguments || '{}'));
      toolOk = true;
    } else {
      console.log('未触发');
      console.warn('      模型没有调用 get_weather。若该模型不支持 function calling，本项目不可用。');
      console.warn('      finish_reason=' + r.finishReason + ' 返回文本=' + JSON.stringify(r.content.slice(0, 80)));
    }
  } catch (e) {
    console.log('失败');
    console.error('      ' + e.message);
    console.error('      → ' + hintFor(e));
    process.exit(1);
  }

  /* ---------- [3] 思考开关判定 ---------- */
  process.stdout.write('[3/3] 深度思考开关 ... ');
  const wantDisabled = cfg.llm.thinking === 'disabled';
  if (wantDisabled && reasoningTotal === 0) {
    console.log('符合预期（thinking=disabled，未产生思考内容）');
  } else if (wantDisabled && reasoningTotal > 0) {
    console.log('注意');
    console.warn('      配置为 disabled，但仍收到 ' + reasoningTotal + ' 字思考内容。');
    console.warn('      服务端已自动过滤，不会泄漏给用户，但说明该模型不认 thinking 字段，建议换模型。');
  } else if (cfg.llm.thinking === 'enabled') {
    console.log('thinking=enabled，思考字符数 ' + reasoningTotal + '（服务端只计数、不下发）');
  } else {
    console.log('thinking=auto，思考字符数 ' + reasoningTotal + '（由模型自行决定）');
  }

  /* ---------- 汇总 ---------- */
  line();
  if (textOk && toolOk) {
    console.log('✓ 全部通过：Key、模型、流式、Function Call 均可用。');
    console.log('  下一步：启动服务 node --env-file=server/.env server/src/index.js');
    process.exit(0);
  }
  console.log('△ 部分通过：文本对话可用，但工具调用未生效，本项目核心链路（推荐茶方）会退化。');
  process.exit(1);
}

main().catch(function (e) {
  console.error('\n✗ 未预期的错误：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
