/** 云托管 Webshell 只读连接检查：不打印账号、密码、地址或 SQL 错误详情。 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config.js');

async function main() {
  const db = cfg.storage.mysql;
  if (!db.host || !db.user || !db.password || !db.database) {
    console.error('MYSQL_CONFIG_MISSING');
    process.exitCode = 1;
    return;
  }
  let conn;
  try {
    conn = await mysql.createConnection({
      host: db.host, port: db.port, user: db.user, password: db.password,
      database: db.database, charset: 'utf8mb4', connectTimeout: 30000
    });
    const [rows] = await conn.query('SELECT DATABASE() AS db');
    if (!rows.length || rows[0].db !== db.database) throw new Error('DATABASE_MISMATCH');
    console.log('MYSQL_LOGIN_OK');
  } catch (error) {
    console.error('MYSQL_LOGIN_FAILED ' + (error.code || 'UNKNOWN'));
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(function () {
  console.error('MYSQL_LOGIN_FAILED UNKNOWN');
  process.exitCode = 1;
});
