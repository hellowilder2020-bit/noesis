/**
 * Legacy CommonJS helper retained for compatibility.
 * Intentionally contains unsafe and safe command execution.
 */

const { exec, execFile } = require("child_process");

function backup(fileName, callback) {
  // VULNERABLE: untrusted name interpolates into a shell command
  exec(`tar -czf /tmp/backup.tgz ${fileName}`, { timeout: 10000 }, callback);
}

function backupSafe(fileName, callback) {
  // SAFE: argv array, no shell interpretation
  execFile("tar", ["-czf", "/tmp/backup.tgz", fileName], { timeout: 10000 }, callback);
}

function cleanup(daysOld, callback) {
  // VULNERABLE: find with string interpolation into shell
  exec(`/usr/bin/find /tmp/uploads -mtime +${daysOld} -delete`, callback);
}

module.exports = { backup, backupSafe, cleanup };
