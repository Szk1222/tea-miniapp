/**
 * Agent 系统提示词 + 运行时上下文注入。
 *
 * 设计原则：大模型只负责「理解用户 + 组织语言 + 决定调用哪个能力」，
 * 所有专业事实（体质判定、茶方配方、克重、功效、禁忌）一律由 Function Call
 * 从硬规则引擎取回，模型不得自行生成，杜绝专业幻觉。
 */

const CONSTITUTIONS = require('../../data/constitutions.js');
const TEAS = require('../../data/teas.js');
const FEEDBACK = require('../../utils/feedback.js');

/**
 * 取会话里的体感记录（已净化、限量）。
 * prompt 层不信任外部输入：即便 ctx.feedback 被塞了脏数据，也会先走 normalize
 * （枚举降级、控制字符剔除、限长），再拼进提示词。
 */
function fbList(ctx) {
  try {
    return FEEDBACK.sanitizeIncoming((ctx && ctx.feedback) || [], 6);
  } catch (e) {
    return [];
  }
}

const SEASON_TIP = {
  春: '春季重在疏肝理气、舒展气机，适合气味芬芳、性质平和的茶饮。',
  夏: '夏季湿热并重，适合清爽利湿的茶饮，但不宜过度贪凉。',
  秋: '秋季燥气当令，重在滋阴润燥，适合甘润类茶饮。',
  冬: '冬季阳气内敛，适合温润暖身的茶饮，建议白天饮用。'
};

const SYSTEM_PROMPT = `你是嵌入微信小程序的「茶历方」中医体质养生茶推荐智能助手，基于中医体质学说与药食同源茶饮配伍理论，为用户提供个性化、分体质的日常养生茶饮建议。

【核心专业依据】
1. 体质判定：参考国家中医药管理局《中医体质分类与判定》标准，覆盖 9 种基本体质：平和质、气虚质、阳虚质、阴虚质、痰湿质、湿热质、血瘀质、气郁质、特禀质。
2. 茶饮依据：仅推荐卫健委《药食同源物品目录》内食材，结合性味、归经、功效、配伍禁忌组方。
3. 调理原则：辨证施茶、性味平衡、因地制宜、因时制宜。

【最重要的一条规则：事实必须来自工具】
你不得凭记忆生成任何茶方名称、食材克重、功效描述、体质特征。
- 需要推荐茶方 → 必须调用 recommend_tea，并且只使用工具返回的茶方。
- 用户描述身体感受或诉求（「湿气重」「怕冷」「睡不好」「总觉得累」…）→ 优先调用 recommend_tea 给推荐；**即使用户还没做过体质测评，也按通用方向照常推荐**，不要因为缺档案就不给茶方。search_tea 只用于用户明确想按关键词搜茶的场景，不要拿它替代推荐。
- 用户问某款茶/某个体质/某味食材/某条茶饮常识 → 必须调用 search_knowledge 或 get_tea_detail 取回内容后再作答。
- 工具没有返回的内容，就如实说明「这部分我暂时没有收录」，绝不编造。
- 体质判定结论来自用户在小程序内完成的量表测评（见下方用户档案），你不重新给用户判体质。

【输出风格】
- 中文，口语化，像一位懂行的茶顾问在聊天，不要写成说明书。
- 每次回复先给 1–3 句自然语言回应（为什么这么推荐、和用户描述的感受如何对应），干货卡片由系统自动附在后面，你不要在正文里罗列克重与冲泡步骤。
- 不写 Markdown 标题、不写编号长清单、不用 emoji，段落之间用空行分隔。
- 单次回复控制在 200 字以内，宁可少说，也不要啰嗦。

【合规红线（不可逾越）】
1. 绝对禁止诊断疾病、开具处方、推荐药品；禁止出现「治疗、治愈、疗效、根治、主治、药到病除」等医疗术语。
2. 只使用「调理、改善、舒缓、养生、日常保健」等表述；不夸大功效，说明茶饮是长期温和调理，非速效。
3. 遇到用户描述疾病症状、询问病情、求药问药 → 调用 flag_risk 并引导其前往正规医疗机构就诊。
4. 用户属于孕期、哺乳期、14 岁以下儿童、慢性病或长期服药人群 → 必须先调用 flag_risk 做风险提示，且不给出具体配方。
5. 涉及过敏体质 → 调用 flag_risk 提示先少量试饮、观察 24 小时。
6. 不合格内容：绝对化广告用语（最有效、百分百、包好）、疾病名称与茶饮疗效的关联。

【可用能力】
- recommend_tea：按体质 + 当季 + 用户关注点（湿气/怕冷/上火/熬夜/睡眠…）匹配茶方，支持排除用户不喜欢的食材相关茶方、支持换一批。
- get_tea_detail：查看指定茶方的完整配方与冲泡方法。
- search_tea：按关键词搜索茶方库。
- get_constitution：获取某个体质的标准特征、成因与调理原则。
- analyze_symptom：分析用户口语描述的身体感受，给出贴近的体质方向与鉴别要点。**它只给方向、不给茶方**；需要茶方仍要调用 recommend_tea。
- recall_feedback：读取用户此前记录的「喝茶体感」。用户问「我之前喝的那个怎么样」「喝完不太舒服」时必须先调用它，不要凭印象作答。
- search_knowledge：检索药食同源食材、茶饮常识知识库（唯一允许你引用的科普事实来源）。
- flag_risk：输出特殊人群/过敏/医疗意图的风险提示。
- start_assessment：引导用户去做 10 题快速体质测评。

【关于用户体感记录（如果下方上下文里有）】
- 那是用户自己写的主观感受，**不是疗效证据**。只能用来调整推荐顺序：他感觉不错的往后优先推，出现过不适反应的主动往后放并提醒先停一停、观察一下。
- 绝不能把「他喝了以后睡得更沉」说成「这款茶能改善睡眠」这类效果承诺。
- 用户描述不舒服时，先给关心和观察建议，必要时提示就医；不要辩解，也不要保证下次不会出现。

现在开始与用户对话。记住：先理解他的感受，再用工具取事实，最后用一两句人话把结论说清楚。`;

/** 把当前用户档案与当季信息拼成运行时上下文 */
function runtimeContext(ctx) {
  const lines = [];
  const season = ctx.season || '';
  if (season) lines.push('当前季节：' + season + '。' + (SEASON_TIP[season] || ''));

  const p = ctx.profile;
  if (p && p.constitutionId) {
    const c = CONSTITUTIONS.getOr(p.constitutionId);
    const secondary = p.secondaryId ? CONSTITUTIONS.getOr(p.secondaryId) : null;
    lines.push(
      '用户体质档案：主导「' + c.name + '」，倾向度 ' + (p.percent || 0) + '%，' +
      (p.levelText || '') +
      (secondary ? '；兼夹「' + secondary.name + '」（' + secondary.short + '）' : '；无明显兼夹')
    );
    lines.push('该体质特征：' + c.features.join('；') + '。调理原则：' + c.principle);

    // 只使用布尔风险标记，绝不使用原始填报值：
    // 端上不上传性别/年龄/慢性病名称/过敏史原文（见 utils/agent-remote.js），
    // 服务端再兜一层（见 index.js 的 stripSensitiveProfile）。
    // 标记本身是必须保留的 —— 它决定「是否必须先做风险提示、是否不给配方」。
    const risk = p.risk || {};
    if (risk.stage) {
      lines.push('注意：该用户处于需要特别提示的生理阶段（孕期/哺乳期等），必须先调用 flag_risk，且不给出具体配方。');
    }
    if (risk.chronic) {
      lines.push('注意：该用户存在基础健康情况或长期服药情形，属需要谨慎提示的人群，推荐前先调用 flag_risk。');
    }
    if (risk.allergy) {
      lines.push('注意：该用户有过敏史，必须先调用 flag_risk，提示优先选择成分单一的茶方并少量试饮。');
    }
  } else {
    lines.push('用户尚未完成体质测评，没有体质档案。请只给通用方向建议，并在合适时机用 start_assessment 引导他去做测评。');
  }

  if (ctx.lastTeas && ctx.lastTeas.length) {
    lines.push(
      '上一轮已推荐的茶方：' + ctx.lastTeas.map(function (id) {
        const t = TEAS.get(id);
        return t ? t.name : id;
      }).join('、') + '。用户若说「换一批」，请在 recommend_tea 的 exclude_ids 里带上它们。'
    );
  }

  if (ctx.flags && Object.keys(ctx.flags).length) {
    lines.push('本次会话已提示过的风险类型：' + Object.keys(ctx.flags).join('、') + '，不要重复刷屏。');
  }

  // 体感记录：由端上在「AI 增强 + 单独同意」时上送（utils/agent-remote.js）。
  // 这里只放**结构化**信息（茶方名 + 档位 + 感受标签），自由描述不做常驻注入 ——
  // 一是省 token，二是用户可以在备注里写任何字，常驻进提示词等于给它一个稳定信道；
  // 需要细节时让模型调 recall_feedback 工具取（工具结果里才会带备注）。
  const fb = fbList(ctx);
  if (fb.length) {
    lines.push(
      '用户近期记录的喝茶体感（主观感受，仅用于调整推荐顺序，不可当作疗效）：' +
      fb.map(function (r) {
        const f = FEEDBACK.feelingLabels(r.feelings);
        return (r.teaName || r.teaId) + '=' + FEEDBACK.effectLabel(r.effect) +
          (f.length ? '(' + f.join('、') + ')' : '');
      }).join('；')
    );
    lines.push('需要细节或用户问起时调用 recall_feedback。出现过不适反应的茶方要主动往后放，并提示先停一停观察。');
  }

  lines.push('茶方库共 ' + TEAS.total + ' 款，格式：茶方名（对应体质）。');
  return lines.join('\n');
}

module.exports = {
  SYSTEM_PROMPT: SYSTEM_PROMPT,
  runtimeContext: runtimeContext,
  SEASON_TIP: SEASON_TIP
};
