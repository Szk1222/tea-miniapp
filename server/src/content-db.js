/** MySQL 持久化：一行当前内容 + 不可变版本历史，发布与回滚在事务内完成。 */
const mysql = require('mysql2/promise');
const cfg = require('./config.js');

let pool;

function getPool() {
  if (!pool) {
    const db = cfg.storage.mysql;
    if (!db.host || !db.user || !db.password || !db.database) {
      throw new Error('MySQL 内容库缺少 MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE');
    }
    pool = mysql.createPool({
      host: db.host, port: db.port, user: db.user, password: db.password,
      database: db.database, charset: 'utf8mb4',
      waitForConnections: true, connectionLimit: 3, queueLimit: 20,
      // 云开发 MySQL 自动暂停后首次连接可能需要唤醒时间。
      connectTimeout: 30000, enableKeepAlive: true
    });
  }
  return pool;
}

function parseDoc(value) {
  const doc = typeof value === 'string' ? JSON.parse(value) : value;
  if (!doc || !doc.payload || !Number.isSafeInteger(doc.version)) throw new Error('MySQL 内容文档结构损坏');
  return doc;
}

async function init(seed) {
  const db = getPool();
  await db.query('CREATE TABLE IF NOT EXISTS chalifang_content_state (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, version BIGINT UNSIGNED NOT NULL, document LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  await db.query('CREATE TABLE IF NOT EXISTS chalifang_content_history (version BIGINT UNSIGNED NOT NULL PRIMARY KEY, document LONGTEXT NOT NULL, action VARCHAR(24) NOT NULL, type VARCHAR(32) NOT NULL, actor VARCHAR(80) NOT NULL, changed_at BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  await transaction(async function (conn) {
    await conn.execute('INSERT IGNORE INTO chalifang_content_state (id, version, document) VALUES (1, 1, ?)', [JSON.stringify(seed)]);
    const current = await currentForUpdate(conn);
    if (current.version === 1) {
      await conn.execute('INSERT IGNORE INTO chalifang_content_history (version, document, action, type, actor, changed_at) VALUES (1, ?, ?, ?, ?, ?)',
        [JSON.stringify(current), 'seed', '*', current.updatedBy, current.updatedAt]);
    }
  });
  return load();
}

async function load() {
  const [rows] = await getPool().query('SELECT document FROM chalifang_content_state WHERE id = 1');
  if (rows.length !== 1) throw new Error('MySQL 当前内容记录丢失');
  return parseDoc(rows[0].document);
}

async function transaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function currentForUpdate(conn) {
  const [rows] = await conn.query('SELECT document FROM chalifang_content_state WHERE id = 1 FOR UPDATE');
  if (rows.length !== 1) throw new Error('MySQL 当前内容记录丢失');
  return parseDoc(rows[0].document);
}

async function writeVersion(conn, doc, action, type) {
  const raw = JSON.stringify(doc);
  await conn.execute('UPDATE chalifang_content_state SET version = ?, document = ? WHERE id = 1', [doc.version, raw]);
  await conn.execute('INSERT INTO chalifang_content_history (version, document, action, type, actor, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    [doc.version, raw, action, type, doc.updatedBy, doc.updatedAt]);
}

async function publish(expectedVersion, nextPayload, actor, type) {
  return transaction(async function (conn) {
    const current = await currentForUpdate(conn);
    if (current.version !== expectedVersion) return { conflict: true, current: current };
    const doc = {
      schemaVersion: current.schemaVersion,
      version: current.version + 1,
      updatedAt: Date.now(), updatedBy: actor, payload: nextPayload
    };
    await writeVersion(conn, doc, 'publish', type);
    return { doc: doc };
  });
}

async function restore(actor, mode, seedPayload) {
  return transaction(async function (conn) {
    const current = await currentForUpdate(conn);
    let payload = seedPayload;
    if (mode === 'rollback') {
      const [rows] = await conn.execute('SELECT document FROM chalifang_content_history WHERE version = ?', [current.version - 1]);
      if (!rows.length) return { missing: true };
      payload = parseDoc(rows[0].document).payload;
    }
    const doc = {
      schemaVersion: current.schemaVersion,
      version: current.version + 1,
      updatedAt: Date.now(), updatedBy: actor + '(' + mode + ')', payload: payload
    };
    await writeVersion(conn, doc, mode, '*');
    return { doc: doc };
  });
}

async function recent(limit) {
  const count = Math.max(1, Math.min(200, Math.floor(Number(limit) || 30)));
  const [rows] = await getPool().query('SELECT version, action, type, actor, changed_at FROM chalifang_content_history ORDER BY version DESC LIMIT ' + count);
  return rows.map(function (row) {
    return { at: Number(row.changed_at), action: row.action, type: row.type,
      actor: row.actor, ok: true, version: Number(row.version) };
  });
}

module.exports = { init: init, load: load, publish: publish, restore: restore, recent: recent };
