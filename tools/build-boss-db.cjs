// Run after editing boss_db.json: node tools/build-boss-db.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'boss_db.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'boss_db.js'),
  '// Generated from boss_db.json. Browser and Node.js compatible.\n(function(root){\n  var data = ' +
  JSON.stringify(data, null, 2) +
  ';\n  if (typeof module === "object" && module.exports) module.exports = data;\n  else root.MapleBossDB = data;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n');
