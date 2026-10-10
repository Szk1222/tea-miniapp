/**
 * Function Call 工具层。
 *
 * 每个工具 = 一段 JSON Schema（给模型看）+ 一个执行器（真实取数）。
 * 执行器统一返回 { blocks, result }：
 *   - blocks  → 直接推给小程序的渲染块（卡片/提示/快捷选项），走结构化渲染，不受模型文案影响
 *   - result  → 回填给模型的工具结果，模型只能基于它组织语言
 * 所有专业内容都来自 utils/engine.js 的硬规则与 data/ 知识源，模型不参与生成。
 */
const engine = require('../../utils/engine.js');
const CONSTITUTIONS = require('../../data/constitutions.js');
const TEAS = require('../../data/teas.js');
const knowledge = require('../../data/knowledge.js');
const agent = require('../../utils/agent.js');
const overlay = require('../../utils/content-overlay.js');
const rag = require('./rag.js');
const safety = require('./safety.js');

const TAG_LABEL = {
  damp: '湿气重/身体沉重', weight: '饮食清淡期', cold: '怕冷/手脚冰凉', heat: '容易上火',
  sleep: '入睡困难/多梦', stayup: '经常熬夜', dry: '口干咽燥', tired: '容易疲乏', skin: '气色不佳'
};

/* ---------------- 渲染块工厂 ---------------- */

function textBlock(text) { return { type: 'text', text: text }; }
function teasBlock(ids) { return { type: 'teas', teas: ids }; }
function noticeBlock(text, tone) { return { type: 'notice', text: text, tone: tone || 'warn' }; }
function ctaBlock(title, desc, action, label) {
  return { type: 'cta', title: title, desc: desc, action: action, label: label || '去测评' };
}
function chipsBlock(items) { return { type: 'chips', items: items }; }

const CHIPS_AFTER_RECOMMEND = [
  { label: '换一批茶方', text: '还有别的茶方推荐吗' },
  { label: '看更多茶方', action: 'tea' },
  { label: '我的体质档案', action: 'profile' },
  { label: '重新测评', action: 'assess' }
];

/* ---------------- 工具定义 ---------------- */

/**
 * 工具定义里内嵌了「体质 id 枚举」和「茶方 id 枚举」，必须按内容版本惰性重建 ——
 * 管理后台新增一个体质或茶方后，如果沿用启动时构造的那份定义，
 * 模型永远不可能推荐到新条目（枚举里没有，模型只能瞎猜或忽略）。
 */
let toolsCache = null;
let toolsCacheVersion = -1;

function buildTools() {
  return [
  {
    type: 'function',
    function: {
      name: 'recommend_tea',
      description: '按体质 + 季节 + 用户关注点匹配养生茶方，返回小程序卡片。这是推荐茶方的唯一途径。',
      parameters: {
        type: 'object',
        properties: {
          constitution_id: {
            type: 'string',
            enum: CONSTITUTIONS.ids,
            description: '目标体质 id。若用户已有体质档案且方向一致可省略，省略时服务端自动取用户档案'
          },
          focus_tags: {
            type: 'array',
            items: { type: 'string', enum: Object.keys(TAG_LABEL) },
            description: '用户当前的关注点，可多选'
          },
          season: { type: 'string', enum: ['春', '夏', '秋', '冬'], description: '默认取当前季节' },
          count: { type: 'integer', minimum: 1, maximum: 3, description: '返回条数，默认 2' },
          exclude_ids: { type: 'array', items: { type: 'string' }, description: '需要排除的茶方 id，用户说「换一批」时传入上一轮结果' },
          avoid_ingredient: { type: 'string', description: '用户不喜欢的食材名（如「麦冬」），命中该食材的茶方会被自动排除' },
          reason: { type: 'string', description: '一句话说明本次推荐的理由，用于服务端留痕' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tea_detail',
      description: '查询单款茶方的完整信息：配方克重、性味、冲泡方法、适配场景、注意事项。',
      parameters: {
        type: 'object',
        properties: { tea_id: { type: 'string', enum: TEAS.list.map(function (t) { return t.id; }) } },
        required: ['tea_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_tea',
      description: '按关键词搜索茶方库（支持「祛湿」「熬夜」「暖身」这类场景词）。',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 4 } },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_constitution',
      description: '获取某个体质的标准特征、成因与调理原则。',
      parameters: {
        type: 'object',
        properties: { constitution_id: { type: 'string', enum: CONSTITUTIONS.ids } },
        required: ['constitution_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '检索药食同源食材与茶饮常识知识库。回答任何科普类问题前必须先调用它，并只依据返回内容作答。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索式，直接用用户的问题或抽取的关键词' },
          top_k: { type: 'integer', minimum: 1, maximum: 6 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'flag_risk',
      description: '输出风险提示。用户属于孕期/哺乳期/儿童/慢性病/长期服药，或提到过敏、疾病症状时，必须调用。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['stage', 'child', 'chronic', 'allergy', 'medical'] },
          detail: { type: 'string', description: '用户提到的具体情况，用于服务端留痕' }
        },
        required: ['kind']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_assessment',
      description: '引导用户去做 10 题快速体质测评。用户没有体质档案，或明确表达想测评时调用。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
  ];
}

function currentTools() {
  const v = overlay.getVersion();
  if (!toolsCache || toolsCacheVersion !== v) {
    toolsCache = buildTools();
    toolsCacheVersion = v;
  }
  return toolsCache;
}

/* ---------------- 执行器 ---------------- */

const RISK_TEXT = {
  medical: agent.SAFETY_TEXT,
  stage: agent.NOTICE_TEXT.stage,
  child: agent.NOTICE_TEXT.child,
  chronic: agent.NOTICE_TEXT.chronic,
  allergy: agent.NOTICE_TEXT.allergy
};

function resolveConstitution(args, ctx) {
  if (args.constitution_id && CONSTITUTIONS.get(args.constitution_id)) return args.constitution_id;
  if (ctx.profile && ctx.profile.constitutionId) return ctx.profile.constitutionId;
  const tags = args.focus_tags || [];
  for (let i = 0; i < tags.length; i++) {
    if (agent.TAG_FALLBACK[tags[i]]) return agent.TAG_FALLBACK[tags[i]];
  }
  return 'pinghe';
}

const EXECUTORS = {

  async recommend_tea(args, ctx) {
    const cid = resolveConstitution(args, ctx);
    const c = CONSTITUTIONS.getOr(cid);

    const exclude = (args.exclude_ids || []).slice();
    let avoided = '';
    if (args.avoid_ingredient) {
      const name = String(args.avoid_ingredient).replace(/(茶|汤|水|粉)$/, '');
      const matched = knowledge.ingredients.filter(function (i) {
        return name.indexOf(i.name) > -1 || i.name.indexOf(name) > -1;
      }).map(function (i) { return i.name; });
      const keys = matched.length ? matched : [name];
      TEAS.list.forEach(function (t) {
        const hit = t.ingredients.some(function (i) {
          return keys.some(function (k) { return i.name.indexOf(k) > -1; });
        });
        if (hit && exclude.indexOf(t.id) === -1) exclude.push(t.id);
      });
      if (keys.length) avoided = keys[0];
    }

    const list = engine.recommend(cid, {
      season: args.season || engine.seasonOf(),
      limit: Math.min(3, Math.max(1, args.count || 2)),
      exclude: exclude
    });

    if (!list.length) {
      return {
        blocks: [
          textBlock('符合这个方向的茶方暂时都排除了，可以放宽一点条件，我再帮你找找。'),
          chipsBlock(CHIPS_AFTER_RECOMMEND)
        ],
        result: { ok: false, reason: 'no_match_after_exclude', exclude: exclude }
      };
    }

    const blocks = [];
    if (avoided && !args.exclude_ids) {
      blocks.push(textBlock('好的，「' + avoided + '」相关的茶方我已经排除了。'));
    }
    blocks.push(teasBlock(list.map(function (x) { return x.id; })));

    const warn = [];
    if (cid === 'shire') warn.push('偏凉性的茶饮不建议连续长期饮用');
    if (cid === 'yangxu') warn.push('建议放在白天饮用，睡前不建议');
    if (cid === 'xueyu') warn.push('经期量多时请先暂停');
    blocks.push(noticeBlock((warn.length ? warn.join('；') + '。' : '') + agent.DISCLAIMER, 'warn'));

    // 服务端拿不到用户的用药明细（上行档案做了最小化，只传布尔风险标记），
    // 所以这里只能给「去找谁」的提示，具体哪款需要留意由端上按 contraindications 计算。
    if (ctx.profile && ctx.profile.risk && (ctx.profile.risk.chronic || ctx.profile.risk.stage)) {
      blocks.push(noticeBlock('你档案里有基础健康情况或用药物记录。具体到某一款是否适合，请以小程序里该茶方详情页的提示为准，必要时先咨询主治医师或药师。', 'warn'));
    }
    if (list.some(function (t) { return t.isPilot; })) {
      blocks.push(noticeBlock('推荐的配方中含试点物质（黄芪/党参），非全国通用食材：非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。', 'warn'));
    }

    if (ctx.profile && ctx.profile.constitutionId) blocks.push(chipsBlock(CHIPS_AFTER_RECOMMEND));
    else blocks.push(ctaBlock('补充一次体质测评', '做完测评，推荐会更贴合你的兼夹体质与季节变化', 'assess', '去测评'));
    if (!ctx.profile || !ctx.profile.constitutionId) blocks.push(chipsBlock(CHIPS_AFTER_RECOMMEND));

    ctx.lastTeas = list.map(function (x) { return x.id; });

    return {
      blocks: blocks,
      result: {
        ok: true,
        constitution: { id: c.id, name: c.name, principle: c.principle },
        season: args.season || engine.seasonOf(),
        focus: (args.focus_tags || []).map(function (k) { return TAG_LABEL[k] || k; }),
        teas: list.map(function (t) {
          return {
            id: t.id,
            name: t.name,
            subtitle: t.subtitle,
            nature: t.nature,
            ingredients: t.ingredients.map(function (i) { return i.name + i.amount; }).join('、'),
            effects: t.effects,
            scenes: t.scenes,
            caution: t.caution,
            contraindications: (t.contraindications || []).map(function (x) {
              return x.level + '·' + x.keyword + '：' + x.reason;
            }),
            usageCap: t.usageCap,
            dosageBasis: t.dosageBasis,
            isPilot: !!t.isPilot,
            sugarContent: !!t.sugarContent,
            courseLimit: t.courseLimit,
            matchReason: t.constitution === cid ? '与主导体质直接对应' : '与当前季节/关注点互补'
          };
        })
      }
    };
  },

  async get_tea_detail(args) {
    const t = TEAS.get(args.tea_id);
    if (!t) return { blocks: [textBlock('没有找到这款茶方。')], result: { ok: false } };
    const owner = CONSTITUTIONS.get(t.constitution);
    const lines = [
      t.name + '：' + t.subtitle,
      '性味：' + t.nature + '，' + t.taste + '；适配寒热：' + (owner ? owner.name : ''),
      '配方：' + t.ingredients.map(function (i) { return i.name + ' ' + i.amount + '（' + i.role + '）'; }).join('、') +
        '（' + (t.dosageBasis || '代茶饮用量') + '，' + (t.usageCap || '单味 ≤8g · 全方 ≤20g/日') + '）',
      '冲泡：' + t.brew.water + '，' + t.brew.steps.join('；') + '，焖泡 ' + t.brew.time,
      '饮用：' + t.brew.best + '，频次 ' + t.brew.frequency +
        (t.courseLimit && t.courseLimit.maxWeeks ? '，连续 ' + t.courseLimit.maxWeeks + ' 周后停 ' + t.courseLimit.restWeeks + ' 周' : ''),
      '注意：' + t.caution.join('；'),
      '不适用人群：' + (t.contraindications || []).map(function (x) {
        return x.level + x.keyword + '（' + x.reason + '）';
      }).join('；')
    ];
    if (t.isPilot) lines.push('试点物质：含黄芪/党参，非全国通用食材，非试点地区及孕期、哺乳期、14 岁以下请咨询专业人员。');
    lines.push('提示：养生茶与西药间隔 ≥1 小时；左甲状腺素、铁剂、钙剂间隔 ≥4 小时。');
    return {
      blocks: [textBlock(lines.join('\n')), teasBlock([t.id]), noticeBlock(agent.DISCLAIMER, 'warn')],
      result: {
        ok: true,
        tea: {
          id: t.id, name: t.name, nature: t.nature, taste: t.taste,
          ingredients: t.ingredients, effects: t.effects, scenes: t.scenes,
          brew: t.brew, caution: t.caution,
          contraindications: t.contraindications || [],
          usageCap: t.usageCap, dosageBasis: t.dosageBasis,
          isPilot: !!t.isPilot, sugarContent: !!t.sugarContent, courseLimit: t.courseLimit
        }
      }
    };
  },

  async search_tea(args) {
    const list = engine.search(args.keyword || '').slice(0, args.limit || 3);
    if (!list.length) {
      return { blocks: [], result: { ok: true, keyword: args.keyword, teas: [], hint: '库中无直接匹配，改用 search_knowledge 或 recommend_tea' } };
    }
    return {
      blocks: [teasBlock(list.map(function (x) { return x.id; }))],
      result: {
        ok: true, keyword: args.keyword,
        teas: list.map(function (t) { return { id: t.id, name: t.name, subtitle: t.subtitle, effects: t.effects }; })
      }
    };
  },

  async get_constitution(args) {
    const c = CONSTITUTIONS.get(args.constitution_id);
    if (!c) return { blocks: [], result: { ok: false } };
    return {
      blocks: [textBlock(c.name + '｜' + c.short + '\n' + c.brief + '\n\n常见表现：' + c.features.join('；') + '\n\n调理原则：' + c.principle), chipsBlock(agent.DEFAULT_CHIPS)],
      result: {
        ok: true,
        constitution: {
          id: c.id, name: c.name, short: c.short, brief: c.brief,
          features: c.features, causes: c.causes, principle: c.principle,
          teaAdvice: c.teaAdvice, life: c.life
        }
      }
    };
  },

  async search_knowledge(args) {
    const res = await rag.retrieve(args.query, { topK: args.top_k || 4 });
    if (!res.hits.length) {
      return {
        blocks: [],
        result: { ok: true, mode: res.mode, hits: [], hint: '知识库没有收录相关内容，请如实告知用户未收录，不要编造' }
      };
    }
    return {
      blocks: [],
      result: {
        ok: true,
        mode: res.mode,
        hits: res.hits.map(function (h) {
          return { title: h.title, source: h.source, type: h.type, score: h.score, content: h.text };
        })
      }
    };
  },

  async flag_risk(args, ctx) {
    const kind = args.kind || 'medical';
    ctx.flags = ctx.flags || {};
    ctx.flags[kind] = true;
    const tone = (kind === 'stage' || kind === 'child' || kind === 'medical') ? 'danger' : 'warn';
    const body = RISK_TEXT[kind] || agent.SAFETY_TEXT;
    const blocks = [noticeBlock(body, tone)];
    if (kind === 'medical') {
      blocks.push(chipsBlock([
        { label: '我最近总觉得累', text: '我最近总觉得累，没什么力气' },
        { label: '睡不好多梦', text: '最近睡不好，总是做梦' },
        { label: '只想了解体质知识', action: 'knowledge' }
      ]));
    }
    if (kind === 'stage' || kind === 'child') {
      blocks.push(chipsBlock([
        { label: '看看九种体质', action: 'knowledge' },
        { label: '了解养生常识', action: 'knowledge' }
      ]));
    }
    return { blocks: blocks, result: { ok: true, kind: kind, detail: args.detail || '', instruction: '本轮不要再给出任何具体配方' } };
  },

  async start_assessment() {
    return {
      blocks: [ctaBlock('中医体质快速测评', '10 道题 · 约 90 秒 · 生成你的体质档案', 'assess', '开始测评')],
      result: { ok: true, note: '测评在小程序端本地完成，结果只保存在用户手机，不上传' }
    };
  }
};

/**
 * 执行一次工具调用
 * @returns {Promise<{blocks:Array, result:any}>}
 */
async function run(name, rawArgs, ctx) {
  const fn = EXECUTORS[name];
  if (!fn) return { blocks: [], result: { ok: false, error: '未知工具 ' + name } };

  let args = {};
  try { args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : (rawArgs || {}); }
  catch (e) { return { blocks: [], result: { ok: false, error: '参数不是合法 JSON' } }; }

  try {
    const out = await fn(args, ctx);
    safety.audit('tool:' + name, args, out.result);
    return out;
  } catch (e) {
    safety.audit('tool:' + name + ':error', args, e.message);
    return { blocks: [], result: { ok: false, error: '工具执行失败：' + e.message } };
  }
}

module.exports = {
  get TOOLS() { return currentTools(); },
  buildTools: buildTools,
  run: run,
  TAG_LABEL: TAG_LABEL,
  CHIPS_AFTER_RECOMMEND: CHIPS_AFTER_RECOMMEND
};
