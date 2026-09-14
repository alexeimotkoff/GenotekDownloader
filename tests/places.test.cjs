// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

const test = require('node:test');
const assert = require('node:assert/strict');
const { convertGraph } = require('../extension/core/gedcom.js');
const { graph, person } = require('./fixtures.cjs');

function exported(parsed, raw = []) {
  return convertGraph(
    graph([
      person('synthetic-place', 'Male', {
        birthplaceParsed: parsed,
        birthplace: raw,
      }),
    ]),
  ).text;
}

test('uses locality types from the matching original address and expands abbreviations', () => {
  const text = exported(
    [
      {
        country: 'Россия',
        country_iso_code: 'RU',
        region_iso_code: 'RU-TUL',
        region: 'Тульская',
        area: 'Примерный',
        settlement: 'Вымышленное',
        geo_lat: '55.1',
        geo_lon: '70.2',
      },
    ],
    ['Россия, Тульская обл, Примерный р-н, с Вымышленное'],
  );
  assert.match(text, /2 PLAC Россия, Тульская область, Примерный район, село Вымышленное\r\n3 MAP/);
});

test('recognizes the full urban-settlement type without matching the shorter village type first', () => {
  const text = exported(
    [{ country: 'Россия', settlement: 'Примерный' }],
    ['Россия, поселок городского типа Примерный'],
  );
  assert.match(text, /2 PLAC Россия, поселок городского типа Примерный\r\n/);
});

test('prefers explicit place types and does not label a republic as an oblast', () => {
  const text = exported([
    {
      country: 'Россия',
      country_iso_code: 'RU',
      region: 'Карелия',
      region_iso_code: 'RU-KR',
      region_with_type: 'Республика Карелия',
      settlement: 'Примерный',
      settlement_type_full: 'поселок',
    },
  ]);
  assert.match(text, /2 PLAC Россия, Республика Карелия, поселок Примерный\r\n/);
  assert.ok(!text.includes('область'));
  assert.match(
    exported([{ country: 'Россия', region: 'Карелия', region_iso_code: 'RU-KR' }]),
    /2 PLAC Россия, Карелия\r\n/,
  );
});

test('does not borrow a village type from an address in a different region', () => {
  const text = exported(
    [
      {
        country: 'Россия',
        region: 'Тульская',
        region_iso_code: 'RU-TUL',
        settlement: 'Примерное',
      },
    ],
    ['Россия, Ярославская обл, с Примерное'],
  );
  assert.match(text, /2 PLAC Россия, Тульская область, Примерное\r\n/);
});

test('recognizes a legacy flattened place only with ISO markers and a valid coordinate pair', () => {
  const packed =
    '300000, Россия, RU, Центральный, RU-TUL, Тульская, Тула, 54.1234567, 37.7654321, 4';
  assert.match(
    exported([packed]),
    /2 PLAC Россия, Тульская область, Тула\r\n3 MAP\r\n4 LATI N54\.1234567\r\n4 LONG E37\.7654321/,
  );
  assert.match(exported([], [packed]), /2 PLAC Россия, Тульская область, Тула\r\n3 MAP/);
  assert.match(
    exported([packed], ['Россия, г Тула']),
    /2 PLAC Россия, Тульская область, город Тула\r\n3 MAP/,
  );
});

test('ordinary and unrecognized coordinate-free strings retain their original text', () => {
  for (const address of [
    'Тула, Кремль',
    'Ярославль, Богоявленская пл., 25',
    'Урочище без названия',
    'Россия, Тульская обл, деревня Старая',
    '  Старое название  ',
    'Дом 12, участок 34, 4',
    'Россия, RU, неизвестно, RU-XYZ, Старое, 12, 34',
    '300000, Россия, RU, Центральный, RU-TUL, Тульская, Тула',
  ]) {
    assert.ok(exported([], [address]).includes('2 PLAC ' + address + '\r\n'), address);
    assert.ok(!exported([], [address]).includes('3 MAP'), address);
  }
});

test('preserves unknown address details even when a country field is present', () => {
  assert.match(
    exported([{ country: 'Россия', description: 'Старая слобода', detail: 'у реки' }]),
    /2 PLAC Россия, Старая слобода, у реки\r\n/,
  );
  assert.match(
    exported([{ country: 'Россия', description: 'Старая слобода', geo_lat: '55', geo_lon: '70' }]),
    /2 PLAC Россия, Старая слобода\r\n3 MAP\r\n4 LATI N55\r\n4 LONG E70/,
  );
});

test('does not duplicate a converted packed place as a technical note', () => {
  const packed =
    '300000, Россия, RU, Центральный, RU-TUL, Тульская, Тула, 54.1234567, 37.7654321, 4';
  const text = exported([], [packed]);
  assert.match(
    text,
    /2 PLAC Россия, Тульская область, Тула\r\n3 MAP\r\n4 LATI N54\.1234567\r\n4 LONG E37\.7654321/,
  );
  assert.doesNotMatch(text, /^2 NOTE\b/m);
  assert.ok(!text.includes(packed));
});

test('rejects empty, partial, non-finite, injected and out-of-range coordinate pairs', () => {
  for (const [geo_lat, geo_lon] of [
    ['', '34'],
    [null, '34'],
    [undefined, '34'],
    [false, '34'],
    ['12', ''],
    ['12', null],
    ['91', '34'],
    ['12', '-181'],
    ['NaN', '34'],
    [Infinity, 34],
    ['12junk', '34'],
    ['12\n0 TRLR', '34'],
    ['12,1', '34,2'],
  ]) {
    const text = exported([{ city: 'Тестовое место', geo_lat, geo_lon }]);
    assert.match(text, /2 PLAC Тестовое место\r\n/);
    assert.ok(!text.includes('3 MAP'), JSON.stringify([geo_lat, geo_lon]));
  }
});

test('accepts boundary coordinates and small numbers without scientific notation', () => {
  assert.match(
    exported([{ city: 'Граница', geo_lat: '-90', geo_lon: '180' }]),
    /4 LATI S90\r\n4 LONG E180/,
  );
  assert.match(
    exported([{ city: 'Малая точка', geo_lat: 1e-7, geo_lon: -1e-7 }]),
    /4 LATI N0\.0000001\r\n4 LONG W0\.0000001/,
  );
});

test('deduplicates city and region names and keeps unknown administrative types unchanged', () => {
  assert.match(
    exported([{ country: 'Россия', region: 'Москва', city: 'Москва' }]),
    /2 PLAC Россия, город Москва\r\n/,
  );
  assert.match(
    exported([{ country: 'Другая страна', region: 'Неизвестная', city: 'Тестовый' }]),
    /2 PLAC Другая страна, Неизвестная, Тестовый\r\n/,
  );
});

test('keeps same-name places at different administrative levels', () => {
  assert.match(
    exported([
      { country: 'Россия', region: 'Тульская', region_iso_code: 'RU-TUL', settlement: 'Тульская' },
    ]),
    /2 PLAC Россия, Тульская область, Тульская\r\n/,
  );
});

test('uses the first same-name place without a technical alternatives note', () => {
  const text = exported([
    { city: 'Одинаковое название', geo_lat: '10', geo_lon: '20' },
    { city: 'Одинаковое название', geo_lat: '11', geo_lon: '21' },
  ]);
  assert.match(text, /4 LATI N10\r\n4 LONG E20/);
  assert.doesNotMatch(text, /^2 NOTE\b/m);
});
