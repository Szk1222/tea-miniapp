const fs = require('fs');
const path = require('path');
const cfg = require('./config.js');

function verify() {
  const mount = cfg.storage.mountPath;
  if (!mount) {
    if (process.env.NODE_ENV === 'production' && (cfg.admin.openids.length || cfg.admin.token)) {
      throw new Error('启用在线管理前必须配置 STORAGE_MOUNT_PATH 和持久化挂载');
    }
    return;
  }
  const expected = path.resolve(mount);
  const dir = path.resolve(cfg.storage.dir);
  if (dir !== expected && !dir.startsWith(expected + path.sep)) {
    throw new Error('STORAGE_DIR 必须位于 STORAGE_MOUNT_PATH 内');
  }
  if (process.platform === 'linux') {
    const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
    const found = mounts.some(function (line) {
      const fields = line.split(' ');
      return fields[4] === expected.replace(/ /g, '\\040');
    });
    if (!found) throw new Error('持久化挂载不存在：' + expected);
  }
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.write-probe-' + process.pid);
  fs.writeFileSync(probe, 'ok', { flag: 'wx' });
  fs.unlinkSync(probe);
}

module.exports = { verify: verify };
