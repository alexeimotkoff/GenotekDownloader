// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { person, graph } = require('./fixtures.cjs');
const script = fs.readFileSync(require.resolve('../extension/capture.js'), 'utf8');
const endpoint = 'https://lk2-back.genotek.ru/api/v1/genealogy-graph/test-patient?rand=1';
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function environment(fetch) {
  const events = [];
  const listeners = new Map();
  class XHR extends EventTarget {
    responseType = '';
    status = 0;
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send(body) {
      this.body = body;
    }
    finish(body, status = 200) {
      this.status = status;
      this.responseURL = this.url;
      this.response = this.responseType === 'json' ? body : JSON.stringify(body);
      this.responseText = JSON.stringify(body);
      this.dispatchEvent(new Event('loadend'));
    }
  }
  const win = {
    fetch,
    XMLHttpRequest: XHR,
    location: { origin: 'https://lk.genotek.ru', href: 'https://lk.genotek.ru/genealogical-tree' },
    postMessage: (event) => events.push(event),
    addEventListener: (type, callback) => listeners.set(type, callback),
  };
  vm.runInNewContext(script, {
    window: win,
    location: win.location,
    URL,
    Request,
    WeakMap,
    console,
  });
  return {
    win,
    events,
    XHR,
    message: (data) => listeners.get('message')({ source: win, origin: win.location.origin, data }),
  };
}

test('captures the current POST graph endpoint without changing the site response', async () => {
  const response = new Response(JSON.stringify({ data: graph([person('a')]) }));
  const { win, events } = environment(async () => response);
  const actual = await win.fetch(endpoint, { method: 'POST' });
  assert.equal(actual, response);
  assert.equal((await actual.json()).data.nodes.length, 1);
  await flush();
  assert.equal(events[0].status, 'loading');
  const ready = events.find((e) => e.status === 'ready');
  assert.equal(ready.graph.nodes.length, 1);
  assert.equal(ready.graph.nodes[0].id, 'a');
});

test('passes declared ethnicity and structured locations to the exporter without unrelated private fields', async () => {
  const place = { country: 'Россия', city: 'Тула', geo_lat: '54.1234567', geo_lon: '37.7654321' };
  const response = new Response(
    JSON.stringify({
      data: graph([
        person('synthetic', 'Male', {
          ethnicity: ['Тестовая группа А'],
          birthplaceParsed: [place],
          deathplaceParsed: [place],
          dnaResults: 'excluded-dna',
          email: 'excluded-contact',
          authToken: 'excluded-auth',
        }),
      ]),
    }),
  );
  const env = environment(async () => response);
  await env.win.fetch(endpoint);
  await flush();
  const card = JSON.parse(
    JSON.stringify(env.events.find((e) => e.status === 'ready').graph.nodes[0].card),
  );
  assert.deepEqual(card.ethnicity, ['Тестовая группа А']);
  assert.deepEqual(card.birthplaceParsed, [place]);
  assert.deepEqual(card.deathplaceParsed, [place]);
  assert.ok(!JSON.stringify(card).includes('excluded-'));
});

test('captures XHR with text or JSON responseType and does not mutate site settings', () => {
  const { XHR, events } = environment(async () => new Response(''));
  for (const type of ['', 'json']) {
    const xhr = new XHR();
    xhr.open('POST', endpoint);
    xhr.responseType = type;
    xhr.send('{}');
    xhr.finish({ data: graph([person('a')]) });
    assert.equal(xhr.responseType, type);
  }
  assert.equal(events.filter((e) => e.status === 'ready').length, 2);
});

test('ignores medical, auth, search, card-edit and unrelated hosts', async () => {
  const { win, events } = environment(
    async () => new Response(JSON.stringify({ data: graph([person('a')]) })),
  );
  for (const url of [
    'https://lk2-back.genotek.ru/api/v1/auth',
    endpoint.replace('?rand=1', '/search'),
    'https://lk2-back.genotek.ru/api/v1/genealogy-graph/card/one/two',
    'https://example.com/api/v1/genealogy-graph/test',
  ]) {
    await win.fetch(url);
  }
  await flush();
  assert.equal(events.length, 0);
});

test('a later graph request invalidates the old snapshot and ignores out-of-order responses', async () => {
  const pending = [];
  const { win, events } = environment(() => new Promise((resolve) => pending.push(resolve)));
  const first = win.fetch(endpoint);
  const second = win.fetch(endpoint);
  pending[1](new Response(JSON.stringify({ data: graph([person('new')]) })));
  await second;
  await flush();
  pending[0](new Response(JSON.stringify({ data: graph([person('old')]) })));
  await first;
  await flush();
  assert.deepEqual(
    events.filter((e) => e.status === 'ready').map((e) => e.graph.nodes[0].id),
    ['new'],
  );
});

test('failed and malformed responses cannot reuse an earlier successful snapshot', async () => {
  let next = () => new Response(JSON.stringify({ data: graph([person('a')]) }));
  const env = environment(async () => next());
  await env.win.fetch(endpoint);
  await flush();
  next = () => new Response('denied', { status: 401 });
  await env.win.fetch(endpoint);
  await flush();
  env.message({ channel: 'genotek-gedcom-v1', type: 'request-state' });
  assert.equal(env.events.at(-1).status, 'error');
  assert.equal(env.events.at(-1).graph, undefined);
  next = () => new Response(JSON.stringify({ data: { unexpected: [] } }));
  await env.win.fetch(endpoint);
  await flush();
  assert.equal(env.events.at(-1).status, 'error');
});

test('network errors remain visible to the site and snapshot requests never perform fetch', async () => {
  let calls = 0;
  const env = environment(async () => {
    calls++;
    throw new Error('network');
  });
  await assert.rejects(env.win.fetch(endpoint), /network/);
  await flush();
  env.message({ channel: 'genotek-gedcom-v1', type: 'request-state' });
  assert.equal(calls, 1);
  assert.equal(env.events.at(-1).status, 'error');
});

test('a late reset for the previous SPA route does not cancel the new-route graph', async () => {
  let resolve;
  const env = environment(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  env.win.location.href = 'https://lk.genotek.ru/genealogical-tree?profile=new';
  const request = env.win.fetch(endpoint);
  env.message({ channel: 'genotek-gedcom-v1', type: 'clear-state', previousRoute: '/dashboard' });
  resolve(new Response(JSON.stringify({ data: graph([person('new')]) })));
  await request;
  await flush();
  assert.equal(env.events.at(-1).status, 'ready');
  assert.equal(env.events.at(-1).graph.nodes[0].id, 'new');
});

test('a reset for the captured route discards its data and pending responses', async () => {
  let resolve;
  const env = environment(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const request = env.win.fetch(endpoint);
  env.win.location.href = 'https://lk.genotek.ru/dashboard';
  env.message({
    channel: 'genotek-gedcom-v1',
    type: 'clear-state',
    previousRoute: '/genealogical-tree',
  });
  resolve(new Response(JSON.stringify({ data: graph([person('old')]) })));
  await request;
  await flush();
  assert.equal(env.events.at(-1).status, 'idle');
  assert.equal(env.events.at(-1).graph, undefined);
});

test('full-tree provenance comes from the XHR body and the current full_tree counter is retained', () => {
  const env = environment(async () => new Response(''));
  const xhr = new env.XHR();
  xhr.open('POST', endpoint);
  xhr.send(
    JSON.stringify({
      full: true,
      relatives_only: false,
      direct_only: false,
      centralCardId: false,
      cardId: false,
    }),
  );
  xhr.finish({ data: { nodes: [person('a')], cards_count: { full_tree: 2 } } });
  assert.equal(env.events.at(-1).fullTreeRequested, true);
  assert.equal(env.events.at(-1).graph.cards_count.full_tree, 2);
});

test('filtered, edit and malformed request bodies never acquire full-tree provenance', () => {
  const env = environment(async () => new Response(''));
  for (const body of [
    {},
    { full: false },
    { full: true, relatives_only: true },
    { full: true, direct_only: true },
    { full: true, centralCardId: 'a' },
    { full: true, cardId: 'a' },
    { full: true, card: { name: ['a'] } },
    'invalid',
  ]) {
    const xhr = new env.XHR();
    xhr.open('POST', endpoint);
    xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
    xhr.finish({ data: graph([person('a')]) });
    assert.equal(env.events.at(-1).fullTreeRequested, false, JSON.stringify(body));
  }
});

test('fetch Request inspection preserves the original body and does not forward extra request fields', async () => {
  const request = new Request(endpoint, {
    method: 'POST',
    body: JSON.stringify({ full: true, privateUnusedField: 'not-for-the-bridge' }),
  });
  const env = environment(async (input) => {
    assert.equal(input, request);
    assert.equal(JSON.parse(await input.text()).full, true);
    return new Response(JSON.stringify({ data: graph([person('a')]) }));
  });
  await env.win.fetch(request);
  await flush();
  assert.equal(env.events.at(-1).fullTreeRequested, true);
  assert.ok(!JSON.stringify(env.events).includes('not-for-the-bridge'));
});

test('full-tree metadata belongs to each fetch response, not to a previous request', async () => {
  const env = environment(async () => new Response(JSON.stringify({ data: graph([person('a')]) })));
  await env.win.fetch(endpoint, { method: 'POST', body: JSON.stringify({ full: true }) });
  await flush();
  assert.equal(env.events.at(-1).fullTreeRequested, true);
  await env.win.fetch(endpoint, { method: 'POST', body: '{}' });
  await flush();
  assert.equal(env.events.at(-1).fullTreeRequested, false);
});
