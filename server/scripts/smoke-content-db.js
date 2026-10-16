/** 无外部数据库的事务协议回归；真实连通性仍需在云托管环境验收。 */
const assert = require('assert');
const mysql = require('mysql2/promise');

const originalCreatePool = mysql.createPool;
let state = null;
let history = new Map();
let failHistoryWrite = false;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function execute(sql, args) {
  if (sql.startsWith('INSERT IGNORE INTO chalifang_content_state')) {
    if (!state) state = JSON.parse(args[0]);
    return [[], []];
  }
  if (sql.startsWith('INSERT IGNORE INTO chalifang_content_history')) {
    if (!history.has(1)) history.set(1, JSON.parse(args[0]));
    return [[], []];
  }
  if (sql.startsWith('SELECT document FROM chalifang_content_history')) {
    const found = history.get(args[0]);
    return [found ? [{ document: JSON.stringify(found) }] : [], []];
  }
  if (sql.startsWith('UPDATE chalifang_content_state')) {
    state = JSON.parse(args[1]);
    return [[], []];
  }
  if (sql.startsWith('INSERT INTO chalifang_content_history')) {
    if (failHistoryWrite) throw new Error('injected history write failure');
    history.set(args[0], JSON.parse(args[1]));
    return [[], []];
  }
  throw new Error('Unexpected execute: ' + sql);
}

function query(sql) {
  if (sql.startsWith('CREATE TABLE')) return [[], []];
  if (sql.startsWith('SELECT document FROM chalifang_content_state')) {
    return [state ? [{ document: JSON.stringify(state) }] : [], []];
  }
  if (sql.startsWith('SELECT version, action')) {
    return [[...history.values()].reverse().map(function (doc) {
      return { version: doc.version, action: doc.version === 1 ? 'seed' : 'publish',
        type: 'teas', actor: doc.updatedBy, changed_at: doc.updatedAt };
    }), []];
  }
  throw new Error('Unexpected query: ' + sql);
}

mysql.createPool = function () {
  return {
    query: async function (sql) { return query(sql); },
    getConnection: async function () {
      let snapshot;
      return {
        beginTransaction: async function () { snapshot = { state: clone(state), history: new Map(history) }; },
        query: async function (sql) { return query(sql); },
        execute: async function (sql, args) { return execute(sql, args); },
        commit: async function () {},
        rollback: async function () { state = snapshot.state; history = snapshot.history; },
        release: function () {}
      };
    }
  };
};

process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_DATABASE = 'test';
const db = require('../src/content-db.js');

(async function () {
  const seed = { schemaVersion: 1, version: 1, updatedAt: 1, updatedBy: 'seed', payload: { teas: ['A'] } };
  assert.deepStrictEqual(await db.init(seed), seed);
  assert.deepStrictEqual(history.get(1), seed);
  const published = await db.publish(1, { teas: ['B'] }, 'admin', 'teas');
  assert.strictEqual(published.doc.version, 2);
  assert.deepStrictEqual((await db.load()).payload.teas, ['B']);
  assert.strictEqual((await db.publish(1, { teas: ['C'] }, 'admin', 'teas')).conflict, true);
  assert.strictEqual((await db.load()).version, 2);
  failHistoryWrite = true;
  await assert.rejects(db.publish(2, { teas: ['C'] }, 'admin', 'teas'), /injected/);
  failHistoryWrite = false;
  assert.strictEqual((await db.load()).version, 2);
  assert.strictEqual(history.size, 2);
  const rollback = await db.restore('admin', 'rollback', seed.payload);
  assert.strictEqual(rollback.doc.version, 3);
  assert.deepStrictEqual(rollback.doc.payload, seed.payload);
  assert.strictEqual((await db.recent(10))[0].version, 3);
  assert.strictEqual((await db.init({ ...seed, payload: { teas: ['wrong'] } })).version, 3);
  console.log('✓ MySQL 播种、事务回滚、版本冲突、历史回滚和重启读取通过');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
}).finally(function () { mysql.createPool = originalCreatePool; });
