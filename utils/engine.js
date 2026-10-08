/**
 * 规则引擎：体质评分 / 判定 / 茶方匹配
 * 采用「硬规则 + 固定映射」实现，避免生成式模型在体质判定上出现偏差。
 */

const constitutions = require('../data/constitutions.js');
const teas = require('../data/teas.js');
const questions = require('../data/questions.js');

/* ---------- 每套体质的理论最高分（用于计算倾向度百分比） ---------- */
const MAX_SCORE = (function () {
  const max = {};
  constitutions.ids.forEach(function (id) { max[id] = 0; });
  questions.list.forEach(function (q) {
    const per = {};
    q.options.forEach(function (o) {
      Object.keys(o.scores).forEach(function (k) {
        per[k] = Math.max(per[k] || 0, o.scores[k]);
      });
    });
    Object.keys(per).forEach(function (k) {
      max[k] = (max[k] || 0) + per[k];
    });
  });
  return max;
})();

/* ---------- 评分 ---------- */
function score(answers) {
  const s = {};
  constitutions.ids.forEach(function (id) { s[id] = 0; });
  (answers || []).forEach(function (optIdx, qi) {
    const q = questions.list[qi];
    if (!q || optIdx === null || typeof optIdx === 'undefined' || optIdx < 0) return;
    const opt = q.options[optIdx];
    if (!opt) return;
    Object.keys(opt.scores).forEach(function (k) {
      s[k] = (s[k] || 0) + opt.scores[k];
    });
  });
  return s;
}

function percentOf(id, raw) {
  const max = MAX_SCORE[id] || 1;
  return Math.min(100, Math.round((raw / max) * 100));
}

/* ---------- 判定主导体质 ---------- */
function resolve(rawScores) {
  const raw = rawScores || {};
  // 以「相对倾向度」比较（raw / 该体质理论最高分），避免平和质因题量大而被高估
  const ranked = constitutions.ids.map(function (id) {
    const r = raw[id] || 0;
    const max = MAX_SCORE[id] || 1;
    return {
      id: id,
      name: constitutions.map[id].name,
      color: constitutions.map[id].color,
      raw: r,
      ratio: max ? r / max : 0,
      percent: percentOf(id, r)
    };
  }).sort(function (a, b) { return b.ratio - a.ratio || b.raw - a.raw || a.id.localeCompare(b.id); });

  const total = ranked.reduce(function (a, b) { return a + b.raw; }, 0);
  const pinghe = ranked.filter(function (x) { return x.id === 'pinghe'; })[0];
  const others = ranked.filter(function (x) { return x.id !== 'pinghe'; });

  let main;
  if (!total || (pinghe && pinghe.ratio >= others[0].ratio)) {
    main = pinghe;
  } else {
    main = others[0];
  }

  let secondary = null;
  if (main.id !== 'pinghe') {
    const rest = ranked.filter(function (x) { return x.id !== main.id && x.id !== 'pinghe'; });
    if (rest.length && rest[0].ratio >= Math.max(0.2, main.ratio * 0.6)) secondary = rest[0];
  }

  const topPercent = main.percent;
  let level = '平和';
  let levelText = '状态较为均衡';
  if (main.id !== 'pinghe') {
    if (topPercent >= 60) { level = '明显'; levelText = '倾向比较明显'; }
    else if (topPercent >= 35) { level = '偏颇'; levelText = '有一定倾向'; }
    else { level = '轻度'; levelText = '倾向较轻'; }
  }

  const ranking = ranked.map(function (x) {
    return { id: x.id, name: x.name, color: x.color, raw: x.raw, percent: x.percent };
  });

  return {
    main: main.id,
    mainName: main.name,
    secondary: secondary ? secondary.id : '',
    secondaryName: secondary ? secondary.name : '',
    percent: topPercent,
    level: level,
    levelText: levelText,
    ranking: ranking,
    answeredAt: Date.now()
  };
}

function analyze(answers) {
  return resolve(score(answers));
}

/* ---------- 季节 ---------- */
function seasonOf(date) {
  const m = (date || new Date()).getMonth() + 1;
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

function seasonName(s) {
  return { '春': '春季', '夏': '夏季', '秋': '秋季', '冬': '冬季' }[s] || '当季';
}

/* ---------- 茶方匹配 ---------- */
function scoreTea(tea, opt) {
  let sc = 100;
  const season = opt.season;
  if (season && tea.season && tea.season.indexOf(season) > -1) sc += 14;
  if (opt.exclude && opt.exclude.indexOf(tea.id) > -1) sc -= 400;
  if (opt.preferTags) {
    opt.preferTags.forEach(function (t) {
      if (tea.tags && tea.tags.indexOf(t) > -1) sc += 8;
    });
  }
  if (tea.constitution === opt.primary) sc += 30;
  if (tea.constitution === opt.secondary) sc += 10;
  return sc;
}

/**
 * 为体质推荐茶方
 * @param {string} primary 主导体质 id
 * @param {object} opt { secondary, season, limit, exclude }
 */
function recommend(primary, opt) {
  opt = opt || {};
  const limit = opt.limit || 3;
  const season = opt.season || seasonOf();
  const pool = [];
  teas.list.forEach(function (t) {
    if (opt.exclude && opt.exclude.indexOf(t.id) > -1) return;
    const sameP = t.constitution === primary;
    const sameS = opt.secondary && t.constitution === opt.secondary;
    if (!sameP && !sameS) return;
    pool.push({
      tea: t,
      weight: scoreTea(t, {
        primary: primary,
        secondary: opt.secondary,
        season: season,
        preferTags: opt.preferTags
      })
    });
  });
  pool.sort(function (a, b) { return b.weight - a.weight; });

  let result = pool.slice(0, limit).map(function (x) { return x.tea; });

  // 兜底：主推不足时用平和质温和茶补齐
  if (result.length < limit) {
    teas.byConstitution('pinghe').forEach(function (t) {
      if (result.length < limit && !result.some(function (r) { return r.id === t.id; })) {
        result.push(t);
      }
    });
  }
  return result;
}

/** 通过 id 列表取茶方详情 */
function picks(ids) {
  return (ids || []).map(function (id) { return teas.map[id]; }).filter(Boolean);
}

/** 搜索 */
function search(kw) {
  const k = (kw || '').trim();
  if (!k) return teas.list.slice();
  const lower = k.toLowerCase();
  return teas.list.filter(function (t) {
    const text = [
      t.name, t.subtitle, t.nature, t.taste,
      t.tags.join(' '),
      t.scenes.join(' '),
      t.effects.join(' '),
      t.ingredients.map(function (i) { return i.name; }).join(' ')
    ].join(' ');
    if (text.toLowerCase().indexOf(lower) > -1) return true;
    const c = constitutions.map[t.constitution];
    return c && (c.name.indexOf(k) > -1 || c.short.indexOf(k) > -1);
  });
}

/** 关键词 → 体质 */
function constitutionByKeyword(text) {
  const t = text || '';
  let best = null;
  constitutions.list.forEach(function (c) {
    let hit = 0;
    c.keywords.forEach(function (k) {
      if (t.indexOf(k) > -1) hit += k.length;
    });
    if (hit > 0 && (!best || hit > best.hit)) best = { id: c.id, hit: hit };
  });
  return best ? best.id : '';
}

module.exports = {
  MAX_SCORE: MAX_SCORE,
  score: score,
  resolve: resolve,
  analyze: analyze,
  seasonOf: seasonOf,
  seasonName: seasonName,
  recommend: recommend,
  picks: picks,
  search: search,
  constitutionByKeyword: constitutionByKeyword
};
