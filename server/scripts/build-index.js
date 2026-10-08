/**
 * 离线构建检索索引（含可选的向量索引）。
 *
 *   node scripts/build-index.js            # 只建 TF-IDF 稀疏索引并打印统计
 *   EMBEDDING_ENABLED=true node scripts/build-index.js --force   # 额外生成向量并落盘缓存
 *
 * 向量缓存在 server/.cache/embeddings.json，启动时命中缓存就不会重复调用接口。
 */
const rag = require('../src/rag.js');
const cfg = require('../src/config.js');
const corpus = require('../src/corpus.js');

(async function main() {
  const built = corpus.build();
  const byType = {};
  built.chunks.forEach(function (c) { byType[c.type] = (byType[c.type] || 0) + 1; });

  const idx = rag.buildIndex();
  console.log('文档数：' + built.docs.length + '，切块数：' + idx.chunks + '，词项数：' + idx.vocab);
  console.log('分块分布：' + Object.keys(byType).map(function (k) { return k + '=' + byType[k]; }).join('  '));

  if (!cfg.embedding.enabled) {
    console.log('EMBEDDING_ENABLED 未开启，仅构建稀疏索引。');
    return;
  }

  const force = process.argv.indexOf('--force') > -1;
  console.log('开始生成向量（模型 ' + cfg.embedding.model + '）…');
  const r = await rag.buildEmbeddings(force);
  console.log('向量索引完成：' + r.count + ' 条' + (r.cached ? '（命中缓存）' : '（已写入 ' + cfg.embedding.cacheFile + '）'));
})().catch(function (e) {
  console.error('构建失败：' + e.message);
  process.exit(1);
});
