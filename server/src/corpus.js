/**
 * 知识语料构建：把小程序侧的结构化数据（体质 / 茶方 / 药材 / 常识）
 * 拉平成带来源标记的文档，再切成检索单元（chunk）。
 *
 * 之所以直接从 ../../data/*.js require，而不是复制一份：
 * 客户端与服务端共用同一份知识源，改一处即可全局生效，避免两边数据漂移。
 */
const CONSTITUTIONS = require('../../data/constitutions.js');
const TEAS = require('../../data/teas.js');
const KNOWLEDGE = require('../../data/knowledge.js');

const CHUNK_SIZE = 220;
const CHUNK_OVERLAP = 40;

/** 组装原始文档 */
function buildDocs() {
  const docs = [];

  CONSTITUTIONS.list.forEach(function (c) {
    docs.push({
      id: 'constitution:' + c.id,
      type: 'constitution',
      source: '中医体质分类与判定（简化改编）· ' + c.name,
      title: c.name + '（' + c.short + '）',
      text: [
        // 关键词覆盖用户的口语化说法（「湿气重」「手脚冰凉」「睡不好」）。
        // 放在最前并重复一次，是为了抬高这些词在该块内的词频——
        // 用户提问用的就是这些词，而体质文档正文里的书面语反而匹配不上。
        '常见描述：' + c.keywords.join('、') + '。',
        '关键词：' + c.keywords.join(' '),
        c.name + '，' + c.short + '。' + c.brief,
        '常见表现：' + c.features.join('；') + '。',
        '常见成因：' + c.causes,
        '调理原则：' + c.principle,
        '茶饮建议：' + c.teaAdvice,
        '生活建议：' + c.life.join('；') + '。'
      ].join('\n'),
      meta: { constitutionId: c.id, color: c.color }
    });
  });

  TEAS.list.forEach(function (t) {
    const owner = CONSTITUTIONS.getOr(t.constitution);
    const ing = t.ingredients.map(function (i) {
      return i.name + ' ' + i.amount + '（' + i.role + '）';
    }).join('、');
    docs.push({
      id: 'tea:' + t.id,
      type: 'tea',
      source: '茶历方茶方库 · ' + t.name,
      title: t.name + '（' + (owner ? owner.name : '') + '适用）',
      text: [
        t.name + '，' + t.subtitle + '。' + t.nature + '，' + t.taste + '。',
        '配方：' + ing + '。',
        '主要作用：' + t.effects.join('；') + '。',
        '适配场景：' + t.scenes.join('、') + '。',
        '冲泡：' + t.brew.steps.join('；') + '，' + t.brew.water + '，焖泡 ' + t.brew.time + '，建议 ' + t.brew.best + '，频次 ' + t.brew.frequency + '。',
        '注意事项：' + t.caution.join('；') + '。',
        '标签：' + (t.tags || []).join('、')
      ].join('\n'),
      meta: { teaId: t.id, constitutionId: t.constitution }
    });
  });

  KNOWLEDGE.ingredients.forEach(function (i) {
    docs.push({
      id: 'ingredient:' + i.id,
      type: 'ingredient',
      source: '药食同源食材科普 · ' + i.name,
      title: i.name,
      text: [
        i.name + '：' + i.nature + '，' + i.meridian + '。',
        '作用：' + i.effect + '。',
        '适用：' + i.use + '。',
        '注意事项：' + i.caution + '。'
      ].join('\n'),
      meta: { ingredientId: i.id }
    });
  });

  KNOWLEDGE.faq.forEach(function (f, idx) {
    docs.push({
      id: 'faq:' + idx,
      type: 'faq',
      source: '茶饮常识 · ' + f.q,
      title: f.q,
      text: f.q + '\n' + f.a,
      meta: {}
    });
  });

  return docs;
}

/** 长文按标点优先切分，超长段落再按窗口滑动，相邻块保留重叠以便上下文衔接 */
function splitLong(text, onChunk, base) {
  if (text.length <= CHUNK_SIZE) {
    onChunk(text, base);
    return;
  }
  const sentences = text.split(/(?<=[。；！？\n])/);
  let buf = '';
  sentences.forEach(function (s) {
    if ((buf + s).length > CHUNK_SIZE && buf) {
      onChunk(buf.trim(), base);
      buf = buf.slice(Math.max(0, buf.length - CHUNK_OVERLAP));
    }
    buf += s;
  });
  if (buf.trim()) onChunk(buf.trim(), base);
}

function chunkDocs(docs) {
  const chunks = [];
  docs.forEach(function (doc) {
    let n = 0;
    splitLong(doc.text, function (piece, base) {
      chunks.push({
        id: doc.id + '#' + n,
        docId: doc.id,
        type: doc.type,
        source: doc.source,
        title: doc.title,
        text: piece,
        meta: doc.meta,
        offset: n
      });
      n += 1;
      void base;
    }, 0);
  });
  return chunks;
}

function build() {
  const docs = buildDocs();
  const chunks = chunkDocs(docs);
  return { docs: docs, chunks: chunks };
}

module.exports = {
  build: build,
  buildDocs: buildDocs,
  CHUNK_SIZE: CHUNK_SIZE
};
