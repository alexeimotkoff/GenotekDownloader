// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3 || manifest.permissions || manifest.host_permissions) {
  throw new Error('Unexpected permissions or manifest version');
}

for (const script of manifest.content_scripts) {
  if (JSON.stringify(script.matches) !== '["https://lk.genotek.ru/*"]') {
    throw new Error('Unexpected host');
  }

  for (const file of script.js) {
    if (!fs.existsSync(path.join(projectRoot, 'extension', file))) {
      throw new Error('Missing script: ' + file);
    }
  }
}

const sourceDirectories = ['demo', 'extension', 'scripts', 'tests'];
const sourceFiles = sourceDirectories.flatMap((directory) =>
  fs
    .readdirSync(path.join(projectRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|cjs)$/.test(entry.name)),
);

for (const sourceFile of sourceFiles) {
  const filePath = path.join(sourceFile.parentPath, sourceFile.name);
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
}

console.log(
  `Syntax OK: ${sourceFiles.length} scripts. Manifest V3 OK. Site access: lk.genotek.ru only.`,
);
