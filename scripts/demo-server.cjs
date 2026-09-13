// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { blendedFamily } = require('../tests/fixtures.cjs');

const projectRoot = path.resolve(__dirname, '..');
const demoPort = Number(process.env.GENOTEK_DEMO_PORT || 8766);
const allowedFiles = new Set([
  'demo/index.html',
  'demo/demo.js',
  'extension/capture.js',
  'extension/content.js',
  'extension/core/dates.js',
  'extension/core/graph.js',
  'extension/core/places.js',
  'extension/core/gedcom.js',
]);

http
  .createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    response.setHeader('Cache-Control', 'no-store');

    if (requestUrl.pathname === '/demo/fixture') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(blendedFamily()));
      return;
    }

    const requestedFile =
      requestUrl.pathname === '/genealogical-tree' || requestUrl.pathname === '/'
        ? 'demo/index.html'
        : requestUrl.pathname.slice(1);

    if (!allowedFiles.has(requestedFile)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.setHeader(
      'Content-Type',
      requestedFile.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/javascript; charset=utf-8',
    );
    response.end(fs.readFileSync(path.join(projectRoot, requestedFile)));
  })
  .listen(demoPort, '127.0.0.1', () => {
    console.log(`Demo: http://127.0.0.1:${demoPort}/genealogical-tree`);
  });
