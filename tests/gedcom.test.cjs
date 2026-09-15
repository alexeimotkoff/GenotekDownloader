// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

const test = require('node:test');
const assert = require('node:assert/strict');
const { person, graph, blendedFamily } = require('./fixtures.cjs');
const { convertGraph } = require('../extension/core/gedcom.js');
const { formatDate } = require('../extension/core/dates.js');

const now = new Date('2026-09-13T10:00:00Z');
const convert = (data) => convertGraph(data, { now });

function records(text, kind) {
  return text.split(/(?=^0 )/m).filter((record) => record.split('\r\n')[0].endsWith(' ' + kind));
}

function id(record) {
  return record.split(' ')[1];
}

function personBySource(text, sourceId) {
  return records(text, 'INDI').find((record) => record.includes('1 REFN ' + sourceId + '\r\n'));
}

function familyFor(text, sourceId) {
  const personRecord = personBySource(text, sourceId);
  const familyXref = personRecord.match(/1 FAMC (@[^@]+@)/)?.[1];
  return records(text, 'FAM').find((record) => id(record) === familyXref);
}

test('exports a valid UTF-8 GEDCOM header, Cyrillic name and complete trailer', () => {
  const result = convert(
    graph([
      person('one', 'Male', { name: ['Имя'], middleName: ['Отчество'], surname: ['Фамилия'] }),
    ]),
  );
  assert.equal(result.peopleCount, 1);
  assert.match(
    result.text,
    /^0 HEAD\r\n1 SOUR GENOTEK_GEDCOM\r\n2 NAME Genotek GEDCOM Export\r\n2 VERS 1\.0\.7\r\n1 CHAR UTF-8\r\n1 DATE 13 SEP 2026\r\n1 GEDC\r\n2 VERS 5\.5\.1\r\n2 FORM Lineage-Linked\r\n1 SUBM @U1@\r\n0 @U1@ SUBM\r\n/,
  );
  assert.match(result.text, /1 NAME Имя Отчество \/Фамилия\//);
  assert.doesNotMatch(result.text.split(/^0 @/m)[0], /^1 (?:LANG|NOTE)\b/m);
  assert.match(result.text, /0 TRLR\r\n$/);
  assert.ok(!/(?<!\r)\n/.test(result.text));
});

test('writes current surnames as _MARNM and SURN only for explicit birth surnames', () => {
  const { text } = convert(
    graph([
      person('man', 'Male', { name: ['Алексей'], surname: ['Тестовый'] }),
      person('woman', 'Female', { surname: ['Иванова'] }),
      person('birth-only', 'Female', { surname: [], maidenName: ['Петрова'] }),
      person('alternatives', 'Male', { surname: ['Сидоров', 'Кузнецов'] }),
    ]),
  );

  const man = personBySource(text, 'man');
  assert.match(man, /1 NAME Алексей \/Тестовый\/\r\n2 GIVN Алексей\r\n2 _MARNM Тестовый/);
  assert.doesNotMatch(man, /^2 SURN\b/m);

  const woman = personBySource(text, 'woman');
  assert.match(woman, /^2 _MARNM Иванова$/m);
  assert.doesNotMatch(woman, /^2 SURN\b/m);

  const birthOnly = personBySource(text, 'birth-only');
  assert.match(birthOnly, /^2 SURN Петрова$/m);
  assert.doesNotMatch(birthOnly, /^2 _MARNM\b/m);

  const alternatives = personBySource(text, 'alternatives');
  assert.match(
    alternatives,
    /1 NAME Имя alternatives \/Сидоров\/\r\n2 GIVN Имя alternatives\r\n2 _MARNM Сидоров/,
  );
  assert.match(
    alternatives,
    /1 NAME Имя alternatives \/Кузнецов\/\r\n2 TYPE aka\r\n2 GIVN Имя alternatives\r\n2 _MARNM Кузнецов/,
  );
  assert.doesNotMatch(alternatives, /^2 SURN\b/m);
});

test('keeps children with their exact parents across multiple marriages', () => {
  const { text, familiesCount } = convert(blendedFamily());
  assert.equal(familiesCount, 3);
  const father = id(personBySource(text, 'father'));
  const firstMother = id(personBySource(text, 'mother1'));
  const secondMother = id(personBySource(text, 'mother2'));
  const first = familyFor(text, 'child1');
  const second = familyFor(text, 'child2');
  const single = familyFor(text, 'child3');
  assert.ok(first.includes('1 HUSB ' + father) && first.includes('1 WIFE ' + firstMother));
  assert.ok(second.includes('1 HUSB ' + father) && second.includes('1 WIFE ' + secondMother));
  assert.ok(single.includes('1 HUSB ' + father));
  assert.ok(!single.includes('1 WIFE'));
  assert.match(first, /1 MARR\r\n2 DATE 1990/);
  assert.match(first, /1 DIV\r\n2 DATE 2000/);
  assert.ok(!second.includes('1 MARR'));
});

test('all pointers resolve and family links are reciprocal', () => {
  const { text } = convert(blendedFamily());
  const all = new Map(
    text
      .split(/(?=^0 )/m)
      .filter((r) => /^0 @/.test(r))
      .map((r) => [id(r), r]),
  );
  for (const match of text.matchAll(/^\d+ \w+ (@[^@]+@)\r?$/gm)) {
    assert.ok(all.has(match[1]), match[1]);
  }
  for (const fam of records(text, 'FAM')) {
    for (const m of fam.matchAll(/^1 (HUSB|WIFE|CHIL) (@[^@]+@)\r?$/gm)) {
      assert.ok(all.get(m[2]).includes('1 ' + (m[1] === 'CHIL' ? 'FAMC' : 'FAMS') + ' ' + id(fam)));
    }
  }
});

test('deduplicates reciprocal relationships and reconstructs a one-sided child link', () => {
  const { familiesCount, text } = convert(
    graph([
      person('a', 'Male', {
        relationships: [{ with: 'b', type: 'official' }],
        relatives: [{ id: 'c', relationType: 'child' }],
      }),
      person('b', 'Female', { relationships: [{ with: 'a', type: 'official' }] }),
      person('c'),
    ]),
  );
  assert.equal(familiesCount, 2);
  assert.ok(!familyFor(text, 'c').includes('1 WIFE'));
});

test('skips layout placeholders and does not invent unknown-sex males', () => {
  const { text, peopleCount } = convert(
    graph([person('unknown', 'Unknown'), { id: 'fake-1' }, { id: 'imaginary-1' }]),
  );
  assert.equal(peopleCount, 1);
  assert.match(text, /1 SEX U/);
  assert.ok(!text.includes('1 SEX M'));
});

test('supports maiden names, alternate names, death without a date and places without dates', () => {
  const { text } = convert(
    graph([
      person('p', 'Female', {
        name: ['Имя', 'ДругоеИмя'],
        maidenName: ['ДевичьяФамилия'],
        surname: ['Фамилия'],
        liveOrDead: 0,
        birthplace: ['Тула'],
        deathplaceParsed: [{ country: 'Россия', city: 'Ярославль' }],
      }),
    ]),
  );
  assert.match(
    text,
    /1 NAME Имя \/ДевичьяФамилия\/\r\n2 GIVN Имя\r\n2 SURN ДевичьяФамилия\r\n2 _MARNM Фамилия/,
  );
  assert.doesNotMatch(text, /2 TYPE birth/);
  assert.match(text, /1 NAME ДругоеИмя \/ДевичьяФамилия\//);
  assert.match(text, /1 BIRT\r\n2 PLAC Тула/);
  assert.match(text, /1 DEAT\r\n2 PLAC Россия, город Ярославль/);
});

test('exports a readable Genotek place and a GEDCOM map with source coordinate precision', () => {
  const { text } = convert(
    graph([
      person('place-example', 'Male', {
        birthplace: ['Россия, г Тула'],
        birthplaceParsed: [
          {
            postal_code: '300000',
            country: 'Россия',
            country_iso_code: 'RU',
            federal_district: 'Центральный',
            region_iso_code: 'RU-TUL',
            region: 'Тульская',
            area: null,
            city: 'Тула',
            city_district: null,
            settlement: null,
            history_values: null,
            geo_lat: '54.1234567',
            geo_lon: '37.7654321',
            qc_geo: '4',
          },
        ],
      }),
    ]),
  );
  assert.match(
    text,
    /1 BIRT\r\n2 PLAC Россия, Тульская область, город Тула\r\n3 MAP\r\n4 LATI N54\.1234567\r\n4 LONG E37\.7654321\r\n/,
  );
  assert.ok(!text.includes('300000'));
  assert.ok(!text.includes('RU-TUL'));
  assert.doesNotMatch(text, /^2 NOTE\b/m);
});

test('exports explicit nationality values as NATI without inferring missing values', () => {
  const { text } = convert(
    graph([
      person('ethnicity-example', 'Male', {
        ethnicity: ['Тестовая группа А', '', null, 'Тестовая группа Б', 'Тестовая группа А'],
      }),
      person('without-ethnicity', 'Female'),
    ]),
  );
  assert.match(
    personBySource(text, 'ethnicity-example'),
    /1 NATI Тестовая группа А\r\n1 NATI Тестовая группа Б\r\n/,
  );
  assert.ok(!personBySource(text, 'without-ethnicity').includes('1 NATI'));
});

test('omits nationality and birth tags when their source fields are empty', () => {
  const cards = [undefined, null, [], [null], [''], [' \t\r\n ']].map((value) => ({
    ethnicity: value,
    birthdate: value,
    birthplace: value,
    birthplaceParsed: value,
  }));
  cards.push({
    ethnicity: ['', null, '   '],
    birthdate: [{}, { year: null, month: null, day: null }, { year: 0, month: 0, day: 0 }],
    birthplace: [],
    birthplaceParsed: [{}, { country: ' ', city: '', geo_lat: null, geo_lon: null }],
  });
  for (const card of cards) {
    const result = convert(graph([person('empty-fields', 'Male', card)]));
    const record = personBySource(result.text, 'empty-fields');
    assert.equal(result.peopleCount, 1);
    assert.doesNotMatch(
      record,
      /^(?:1 (?:NATI|BIRT)|2 (?:DATE|PLAC|NOTE))\b/m,
      JSON.stringify(card),
    );
    assert.deepEqual(result.warnings, []);
  }
});

test('keeps populated birth data while skipping whitespace-only dates and places', () => {
  const result = convert(
    graph([
      person('date-only', 'Male', { birthdate: [' \t ', { year: 1900 }], birthplace: [' \t '] }),
      person('place-only', 'Female', {
        birthdate: [' \t '],
        birthplace: [' \t ', 'Тестовое место'],
      }),
    ]),
  );
  const dateOnly = personBySource(result.text, 'date-only');
  const placeOnly = personBySource(result.text, 'place-only');
  assert.match(dateOnly, /1 BIRT\r\n2 DATE 1900\r\n/);
  assert.doesNotMatch(dateOnly, /^2 (?:PLAC|NOTE)\b/m);
  assert.match(placeOnly, /1 BIRT\r\n2 PLAC Тестовое место\r\n/);
  assert.doesNotMatch(placeOnly, /^2 (?:DATE|NOTE)\b/m);
  assert.deepEqual(result.warnings, []);
});

test('keeps unknown places without coordinates and protects place and nationality text from injection', () => {
  const birthplace = 'У старой мельницы, участок 12, дом 34';
  const { text } = convert(
    graph([
      person('fallback', 'Male', {
        birthplace: [birthplace],
        deathplaceParsed: [{ description: 'Старая слобода', detail: 'у реки' }],
        ethnicity: ['Название @группы@\n0 TRLR'],
      }),
    ]),
  );
  assert.match(text, /2 PLAC У старой мельницы, участок 12, дом 34\r\n/);
  assert.match(text, /2 PLAC Старая слобода, у реки\r\n/);
  assert.ok(!text.includes('3 MAP'));
  assert.match(text, /1 NATI Название @@группы@@\r\n2 CONT 0 TRLR/);
  assert.equal((text.match(/^0 TRLR/gm) || []).length, 1);
});

test('writes coordinates at the correct levels without technical alternative-place notes', () => {
  const { text } = convert(
    graph([
      person('hemispheres', 'Male', {
        birthplaceParsed: [
          { city: 'Первая точка', geo_lat: -12.5, geo_lon: -45.25 },
          { city: 'Вторая точка', geo_lat: '10.25', geo_lon: '20.5' },
        ],
        deathplaceParsed: [{ city: 'Нулевая точка', geo_lat: 0, geo_lon: 0 }],
      }),
    ]),
  );
  assert.match(text, /2 PLAC Первая точка\r\n3 MAP\r\n4 LATI S12\.5\r\n4 LONG W45\.25/);
  assert.doesNotMatch(text, /^2 NOTE\b/m);
  assert.match(text, /1 DEAT\r\n2 PLAC Нулевая точка\r\n3 MAP\r\n4 LATI N0\r\n4 LONG E0/);
});

test('serializes long notes without line injection, broken Unicode or overlong lines', () => {
  const note = 'Кириллица 🌳 @семья@ '.repeat(100) + '\n0 TRLR\nПродолжение';
  const { text } = convert(graph([person('p', 'Male', { notes: [note] })]));
  assert.equal((text.match(/^0 TRLR/gm) || []).length, 1);
  assert.ok(!text.includes('Примечания:'));
  assert.match(text, /@@семья@@/);
  assert.match(text, /2 CONT 0 TRLR/);
  for (const line of text.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') + 2 <= 255, line);
  }
  assert.equal(Buffer.from(text).toString('utf8'), text);
});

test('rejects truncated, malformed and duplicate-ID graphs instead of silently losing people', () => {
  assert.throws(() => convertGraph(graph([person('a')]), { expectedCount: 2 }), /непол|получено/i);
  assert.throws(() => convert(graph([person('a'), person('a')])), /повтор|дублик/i);
  assert.throws(() => convert({ nodes: [{ id: 'a' }] }), /карточ|формат/i);
  assert.throws(() => convert({ nodes: [] }), /пуст|люд/i);
});

test('rejects unresolved real relatives but tolerates layout-placeholder links', () => {
  assert.throws(
    () =>
      convert(
        graph([person('a', 'Male', { relatives: [{ id: 'absent', relationType: 'parent' }] })]),
      ),
    /отсутств|связ/i,
  );
  assert.equal(
    convert(
      graph([person('a', 'Male', { relatives: [{ id: 'imaginary-1', relationType: 'parent' }] })]),
    ).peopleCount,
    1,
  );
});

test('rejects cycles and ambiguous biological parent sets', () => {
  assert.throws(
    () =>
      convert(
        graph([
          person('a', 'Male', { relatives: [{ id: 'b', relationType: 'parent' }] }),
          person('b', 'Female', { relatives: [{ id: 'a', relationType: 'parent' }] }),
        ]),
      ),
    /цикл/i,
  );
  assert.throws(
    () =>
      convert(
        graph([
          person('a'),
          person('b'),
          person('c'),
          person('kid', 'Male', {
            relatives: ['a', 'b', 'c'].map((id) => ({ id, relationType: 'parent' })),
          }),
        ]),
      ),
    /родител/i,
  );
});

test('exports human text without technical labels or JSON notes', () => {
  const { text } = convert(
    graph([
      person('p', 'Male', {
        notes: ['Пользовательская заметка', { internal: true }],
        biography: 'Жил в деревне',
        occupation: ['Учитель'],
        education: ['Школа'],
      }),
    ]),
  );
  const record = personBySource(text, 'p');
  assert.match(record, /^1 OCCU Учитель$/m);
  assert.match(record, /^1 EDUC Школа$/m);
  assert.match(record, /^1 NOTE Пользовательская заметка$/m);
  assert.match(record, /^1 NOTE Жил в деревне$/m);
  assert.doesNotMatch(record, /Примечания:|Биография:|\{"internal":true\}/);
});

test('does not invent precise dates or serialize invalid source dates as notes', () => {
  assert.equal(formatDate({ year: 1901 }), '1901');
  assert.equal(formatDate({ year: 1901, month: 2 }), 'FEB 1901');
  assert.equal(formatDate({ year: 1904, month: 2, day: 29 }), '29 FEB 1904');
  assert.equal(formatDate({ year: 1901, month: 2, day: 29 }), null);
  assert.equal(formatDate({ year: 1901, month: 0, day: 0 }), '1901');
  assert.equal(formatDate({ year: 1901, month: 0, day: 15 }), null);
  assert.equal(formatDate('1901-02-03'), '3 FEB 1901');
  assert.equal(formatDate('03.02.1901'), '3 FEB 1901');
  const { text, warnings } = convert(
    graph([person('p', 'Male', { birthdate: [{ year: 1901, month: 2, day: 29 }] })]),
  );
  assert.ok(warnings.length > 0);
  assert.ok(!text.includes('2 DATE 29 FEB 1901'));
  assert.doesNotMatch(personBySource(text, 'p'), /^2 NOTE\b/m);
});

test('skips empty date alternatives without losing the first populated date', () => {
  const { text } = convert(
    graph([
      person('p', 'Male', {
        birthdate: [{}, { year: 1901 }],
        deathdate: [{ year: 0, month: 0, day: 0 }, { year: 1980 }],
      }),
    ]),
  );
  assert.match(text, /1 BIRT\r\n2 DATE 1901/);
  assert.match(text, /1 DEAT\r\n2 DATE 1980/);
});

test('keeps GEDCOM at-sign escape pairs on a single line and removes literal tabs', () => {
  for (let length = 180; length <= 250; length++) {
    const { text } = convert(
      graph([person('p', 'Male', { notes: ['a'.repeat(length) + '@end\tone'] })]),
    );
    assert.ok(!text.includes('\t'));
    for (const line of text.split('\r\n').filter((l) => /^\d+ (NOTE|CONC|CONT)( |$)/.test(l))) {
      assert.ok(!line.replace(/@@/g, '').includes('@'), line);
    }
  }
});

test('null or empty life status does not imply death', () => {
  for (const liveOrDead of [null, [null], [''], '', false, undefined]) {
    assert.ok(!convert(graph([person('p', 'Male', { liveOrDead })])).text.includes('1 DEAT'));
  }
});

test('a confirmed full-tree response exports 42 people despite the site counter 43', () => {
  const data = {
    nodes: Array.from({ length: 42 }, (_, i) => person(String(i))),
    cards_count: { full_tree: 43 },
  };
  const result = convertGraph(data, { now, expectedCount: 43, fullTreeRequested: true });
  assert.equal(result.peopleCount, 42);
  assert.ok(result.warnings.some((warning) => warning.includes('43') && warning.includes('42')));
  const header = result.text.split(/^0 @/m)[0];
  assert.doesNotMatch(header, /^1 NOTE\b/m);
});

test('does not serialize partnership metadata as family notes', () => {
  const { text } = convert(blendedFamily());
  for (const family of records(text, 'FAM')) {
    assert.doesNotMatch(family, /^1 NOTE\b/m);
  }
  assert.ok(!text.includes('Исходные сведения о партнёрстве Genotek'));
  assert.ok(!text.includes('"type":"official"'));
});

test('the full_tree counter still blocks unknown or filtered requests', () => {
  const data = { nodes: [person('a')], cards_count: { full_tree: 2 } };
  assert.throws(() => convertGraph(data, { now }), /получено|непол/i);
  assert.throws(() => convertGraph(data, { now, fullTreeRequested: false }), /получено|непол/i);
});

test('counter tolerance does not tolerate broken references or duplicate people', () => {
  const options = { now, expectedCount: 3, fullTreeRequested: true };
  assert.throws(
    () =>
      convertGraph(
        {
          nodes: [person('a', 'Male', { relatives: [{ id: 'missing', relationType: 'parent' }] })],
        },
        options,
      ),
    /отсутств|связ/i,
  );
  assert.throws(
    () => convertGraph({ nodes: [person('a'), person('a')] }, options),
    /повтор|дублик/i,
  );
});
