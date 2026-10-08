/**
 * 知识库检索层（RAG 的 R）。
 *
 * 链路：文档切块 → 稀疏检索（TF-IDF 余弦 + 词项加权）∥ 稠密检索（向量余弦）
 *      → 双路分数融合 → 重排（标题命中 / 文档类型先验 / 去重 / 续块降权）→ TopK
 *
 * 为什么默认不依赖向量库：中文养生语料的查询多是「湿气重」「手脚冰凉」这类短词，
 * 稀疏检索召回已经很稳；向量检索作为可选增强（EMBEDDING_ENABLED=true 时启用），
 * 用 /embeddings 接口 + 本地磁盘缓存实现，省掉一个 ChromaDB 进程。
 * 若需要独立向量库，只需把 denseScore() 换成 Chroma/pgvector 的查询即可，
 * 融合与重排逻辑完全不用改。
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config.js');
const corpus = require('./corpus.js');
const llm = require('./llm.js');

/* ---------------- 分词 ---------------- */

const STOP = new Set(['的', '了', '是', '我', '你', '他', '吗', '呢', '吧', '啊', '有', '在', '和', '就', '都', '不', '很', '会', '要', '能', '该', 'the', 'a', 'is']);

/**
 * 疑问/口语填充短语。
 * 不剔掉它们，「湿气重怎么办」会被「怎么办」带偏到「喝了不舒服怎么办」这类文档上——
 * 这是中文短查询检索里最典型的噪声来源。
 */
const STOP_PHRASES = [
  '怎么办', '怎么样', '怎么样才', '是什么', '有什么', '有什么作用', '能不能', '可以吗', '可以不可以',
  '可不可以', '请问', '一下', '多少', '多久', '怎么', '什么', '哪些', '这种', '这个', '有没有', '帮我', '我想'
];

function stripPhrases(s) {
  let out = s;
  STOP_PHRASES.forEach(function (p) { out = out.split(p).join('　'); });
  return out;
}

function tokenize(text) {
  const s = stripPhrases(String(text || '').toLowerCase());
  const out = [];
  (s.match(/[a-z0-9]+/g) || []).forEach(function (w) { out.push({ w: w, weight: 1.2 }); });
  (s.match(/[\u4e00-\u9fa5　]+/g) || []).forEach(function (block) {
    block.split('　').forEach(function (run) {
      if (!run) return;
      for (let i = 0; i < run.length; i++) {
        if (!STOP.has(run[i])) out.push({ w: run[i], weight: 0.3 });
      }
      for (let i = 0; i < run.length - 1; i++) out.push({ w: run.slice(i, i + 2), weight: 2.0 });
      // 三元组是中文短查询的关键：「睡不好」「手脚凉」这类词不会被切成 bigram 命中
      for (let i = 0; i < run.length - 2; i++) out.push({ w: run.slice(i, i + 3), weight: 2.4 });
      if (run.length >= 2 && run.length <= 4) out.push({ w: run, weight: 1.5 });
    });
  });
  return out;
}

/* ---------------- 索引 ---------------- */

const STATE = {
  chunks: [],
  df: {},
  idf: {},
  vectors: [],
  postings: {},
  embeddings: null,
  embedDim: 0,
  ready: false
};

function buildIndex() {
  const built = corpus.build();
  STATE.chunks = built.chunks;
  STATE.df = {};
  STATE.postings = {};

  const N = STATE.chunks.length;
  STATE.vectors = STATE.chunks.map(function (chunk, idx) {
    const tf = {};
    tokenize(chunk.title + '。' + chunk.text).forEach(function (tk) {
      tf[tk.w] = (tf[tk.w] || 0) + tk.weight;
    });
    Object.keys(tf).forEach(function (w) {
      STATE.df[w] = (STATE.df[w] || 0) + 1;
      (STATE.postings[w] = STATE.postings[w] || []).push(idx);
    });
    return tf;
  });

  Object.keys(STATE.df).forEach(function (w) {
    STATE.idf[w] = Math.log(1 + (N - STATE.df[w] + 0.5) / (STATE.df[w] + 0.5));
  });

  // 转成 idf 加权并归一化
  STATE.vectors = STATE.vectors.map(function (tf) {
    const v = {};
    let norm = 0;
    Object.keys(tf).forEach(function (w) {
      const val = tf[w] * (STATE.idf[w] || 0);
      v[w] = val;
      norm += val * val;
    });
    norm = Math.sqrt(norm) || 1;
    Object.keys(v).forEach(function (w) { v[w] = v[w] / norm; });
    return v;
  });

  STATE.ready = true;
  return { chunks: N, vocab: Object.keys(STATE.idf).length };
}

function ensureIndex() {
  if (!STATE.ready) buildIndex();
}

/* ---------------- 稀疏检索 ---------------- */

function sparseScore(queryVec, chunkIdx) {
  const v = STATE.vectors[chunkIdx];
  let dot = 0;
  Object.keys(queryVec).forEach(function (w) {
    if (v[w]) dot += queryVec[w] * v[w];
  });
  return dot;
}

/**
 * 查询向量。两处关键约束：
 * 1) 索引里不存在的词项直接丢弃（不给兜底 idf），否则任何生僻词都能蹭到分数；
 * 2) 候选集与打分只使用长度 ≥ 2 的强词项（bigram / 整体词 / 英文数字），
 *    单字仅在查询本身就只有单字时才启用，避免「恐龙蛋化石」靠「化」「石」命中化痰类文档。
 */
function buildQueryVector(query) {
  const tf = {};
  tokenize(query).forEach(function (tk) {
    if (!STATE.idf[tk.w]) return;
    tf[tk.w] = (tf[tk.w] || 0) + tk.weight;
  });

  const strong = Object.keys(tf).filter(function (w) { return w.length >= 2; });
  const use = strong.length ? strong : Object.keys(tf);

  const v = {};
  let norm = 0;
  use.forEach(function (w) {
    const val = tf[w] * STATE.idf[w];
    v[w] = val;
    norm += val * val;
  });
  norm = Math.sqrt(norm) || 1;
  Object.keys(v).forEach(function (w) { v[w] = v[w] / norm; });
  return v;
}

/* ---------------- 稠密检索（可选） ---------------- */

function loadEmbeddingCache() {
  if (!cfg.embedding.enabled) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(cfg.embedding.cacheFile, 'utf8'));
    if (raw.model !== cfg.embedding.model) return false;
    if (!raw.items || raw.items.length !== STATE.chunks.length) return false;
    if (raw.items.some(function (it, i) { return it.id !== STATE.chunks[i].id; })) return false;
    STATE.embeddings = raw.items.map(function (it) { return it.vector; });
    STATE.embedDim = (STATE.embeddings[0] || []).length;
    return true;
  } catch (e) {
    return false;
  }
}

function saveEmbeddingCache() {
  const dir = path.dirname(cfg.embedding.cacheFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cfg.embedding.cacheFile, JSON.stringify({
    model: cfg.embedding.model,
    builtAt: new Date().toISOString(),
    items: STATE.chunks.map(function (c, i) {
      return { id: c.id, vector: STATE.embeddings[i] };
    })
  }));
}

async function buildEmbeddings(force) {
  ensureIndex();
  if (!cfg.embedding.enabled) return { enabled: false, count: 0 };
  if (!force && loadEmbeddingCache()) return { enabled: true, count: STATE.embeddings.length, cached: true };

  const vectors = [];
  const batch = 32;
  for (let i = 0; i < STATE.chunks.length; i += batch) {
    const slice = STATE.chunks.slice(i, i + batch);
    const res = await llm.embed(slice.map(function (c) { return c.title + '。' + c.text; }));
    res.forEach(function (v) { vectors.push(v); });
  }
  STATE.embeddings = vectors;
  STATE.embedDim = (vectors[0] || []).length;
  saveEmbeddingCache();
  return { enabled: true, count: vectors.length, cached: false };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function denseScores(query) {
  if (!STATE.embeddings) return null;
  const [qv] = await llm.embed([query]);
  if (!qv) return null;
  return STATE.embeddings.map(function (v) { return cosine(qv, v); });
}

/* ---------------- 融合 + 重排 ---------------- */

const TYPE_PRIOR = { faq: 1.0, ingredient: 0.98, tea: 0.96, constitution: 0.94 };

function fuseKeywords(text) {
  return (String(text).match(/[\u4e00-\u9fa5]{2,4}/g) || []);
}

/**
 * @param {string} query
 * @param {{topK?:number, types?:string[], excludeDocIds?:string[]}} opt
 */
async function retrieve(query, opt) {
  ensureIndex();
  opt = opt || {};
  const topK = opt.topK || cfg.retriever.topK;
  const q = (query || '').trim();
  if (!q) return { query: q, hits: [], mode: 'empty' };

  const qv = buildQueryVector(q);
  const cand = new Set();
  Object.keys(qv).forEach(function (w) {
    (STATE.postings[w] || []).forEach(function (i) { cand.add(i); });
  });

  const dense = STATE.embeddings ? await denseScores(q) : null;
  const terms = fuseKeywords(q);
  const rawKw = [];
  const rawDense = [];

  cand.forEach(function (idx) {
    const chunk = STATE.chunks[idx];
    if (opt.types && opt.types.length && opt.types.indexOf(chunk.type) === -1) return;
    rawKw.push([idx, sparseScore(qv, idx)]);
    if (dense) rawDense.push([idx, dense[idx]]);
  });

  const denseMap = {};
  rawDense.forEach(function (p) { denseMap[p[0]] = p[1]; });

  const w = dense ? cfg.retriever.vectorWeight : 0;
  const scored = rawKw.map(function (p) {
    const idx = p[0];
    const chunk = STATE.chunks[idx];
    const kw = p[1];                 // 原始 TF-IDF 余弦，保留绝对量级以便设阈值
    const vs = denseMap[idx] || 0;
    const base = w ? w * vs + (1 - w) * kw : kw;

    // ---- 重排特征：标题命中做乘法加成，避免低分文档靠加成虚高 ----
    const titleHit = terms.some(function (t) { return chunk.title.indexOf(t) > -1; }) ? 1 : 0;
    const typePrior = TYPE_PRIOR[chunk.type] || 0.9;
    const continuation = chunk.offset > 0 ? -0.02 : 0;
    const final = base * (1 + 0.3 * titleHit) + (typePrior - 0.9) * 0.05 + continuation;

    return {
      id: chunk.id,
      docId: chunk.docId,
      type: chunk.type,
      title: chunk.title,
      source: chunk.source,
      text: chunk.text,
      meta: chunk.meta,
      score: Number(final.toFixed(4)),
      keywordScore: Number(kw.toFixed(4)),
      vectorScore: Number(vs.toFixed(4))
    };
  });

  // 同一文档只保留得分最高的一块
  const best = {};
  scored.forEach(function (s) {
    if (!best[s.docId] || s.score > best[s.docId].score) best[s.docId] = s;
  });

  let hits = Object.keys(best).map(function (k) { return best[k]; })
    .filter(function (s) {
      if (opt.excludeDocIds && opt.excludeDocIds.indexOf(s.docId) > -1) return false;
      return s.score >= cfg.retriever.minScore;
    })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, topK);

  return {
    query: q,
    mode: dense ? 'hybrid(vector+keyword)' : 'sparse(tf-idf)',
    hits: hits
  };
}

module.exports = {
  retrieve: retrieve,
  buildIndex: buildIndex,
  buildEmbeddings: buildEmbeddings,
  tokenize: tokenize,
  _state: STATE
};
