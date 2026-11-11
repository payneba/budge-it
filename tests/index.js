// Entry point so that `node --test tests/` works: Node resolves the directory
// argument to this file, which loads every *.test.js suite beside it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

for (const f of fs.readdirSync(__dirname).sort()) {
  if (f.endsWith('.test.js')) require(path.join(__dirname, f));
}
