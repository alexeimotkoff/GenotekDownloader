// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GenotekPlaces = factory();
  }
})(globalThis, function () {
  'use strict';

  function list(value) {
    if (value == null) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    return [value];
  }

  function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function comparisonKey(value) {
    return stringValue(value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  }

  function createPlaceType([label, pattern, after]) {
    return {
      label,
      after,
      prefix: new RegExp(`^(?:${pattern})\\s+(.+)$`, 'iu'),
      suffix: new RegExp(`^(.+?)\\s+(?:${pattern})$`, 'iu'),
    };
  }

  const placeFields = ['country', 'region', 'area', 'city', 'city_district', 'settlement'];
  const knownFields = new Set([
    ...placeFields.flatMap((field) => [
      field,
      field + '_with_type',
      field + '_type',
      field + '_type_full',
    ]),
    'postal_code',
    'country_iso_code',
    'federal_district',
    'region_iso_code',
    'history_values',
    'geo_lat',
    'geo_lon',
    'qc_geo',
  ]);
  // Только известные типы ISO-регионов: неизвестный регион не определяется
  // как область исключительно по окончанию названия.
  const oblasts = new Set([
    'AMU',
    'ARK',
    'AST',
    'BEL',
    'BRY',
    'CHE',
    'IRK',
    'IVA',
    'KEM',
    'KGD',
    'KGN',
    'KIR',
    'KLU',
    'KOS',
    'KRS',
    'LEN',
    'LIP',
    'MAG',
    'MOS',
    'MUR',
    'NGR',
    'NIZ',
    'NVS',
    'OMS',
    'ORE',
    'ORL',
    'PNZ',
    'PSK',
    'ROS',
    'RYA',
    'SAK',
    'SAM',
    'SAR',
    'SMO',
    'SVE',
    'TAM',
    'TOM',
    'TUL',
    'TVE',
    'TYU',
    'ULY',
    'VGG',
    'VLA',
    'VLG',
    'VOR',
    'YAR',
  ]);
  const krais = new Set(['ALT', 'KAM', 'KDA', 'KHA', 'KYA', 'PER', 'PRI', 'STA', 'ZAB']);
  const placeTypes = [
    ['область', 'обл\\.?|область', true],
    ['край', 'край', true],
    ['республика', 'респ\\.?|республика', false],
    ['район', 'р-н|район', true],
    ['город', 'г\\.?|город', false],
    ['село', 'с\\.?|село', false],
    ['поселок городского типа', 'пгт\\.?|пос[её]лок городского типа', false],
    ['рабочий поселок', 'рп\\.?|рабочий пос[её]лок', false],
    ['деревня', 'д\\.?|деревня', false],
    ['поселок', 'п\\.?|пос[её]лок', false],
    ['станица', 'ст-ца|станица', false],
    ['хутор', 'х\\.?|хутор', false],
    ['улус', 'у\\.?|улус', true],
    ['автономный округ', 'ао|автономный округ', true],
  ].map(createPlaceType);

  function describe(value) {
    const text = stringValue(value);
    for (const type of placeTypes) {
      const match = text.match(type.prefix) || text.match(type.suffix);
      if (match) {
        return {
          name: match[1],
          type: type.label,
          text: type.after ? `${match[1]} ${type.label}` : `${type.label} ${match[1]}`,
        };
      }
    }
    return { name: text, type: '', text };
  }

  function decimal(value) {
    if (typeof value !== 'number') {
      return typeof value === 'string' ? value.trim() : '';
    }
    if (!Number.isFinite(value)) {
      return '';
    }
    const text = String(value);
    if (!/e/i.test(text)) {
      return text;
    }
    const [mantissa, exponent] = Math.abs(value).toString().split('e');
    const digits = mantissa.replace('.', '');
    const point = mantissa.split('.')[0].length + Number(exponent);
    let expanded;

    if (point <= 0) {
      expanded = '0.' + '0'.repeat(-point) + digits;
    } else if (point >= digits.length) {
      expanded = digits + '0'.repeat(point - digits.length);
    } else {
      expanded = digits.slice(0, point) + '.' + digits.slice(point);
    }

    return (value < 0 ? '-' : '') + expanded;
  }

  function coordinate(value, limit, positive, negative) {
    const text = decimal(value);
    if (
      !/^[+-]?\d+(?:\.\d+)?$/.test(text) ||
      !Number.isFinite(Number(text)) ||
      Math.abs(Number(text)) > limit
    ) {
      return null;
    }
    const magnitude = text.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
    const direction = text.startsWith('-') && /[1-9]/.test(magnitude) ? negative : positive;
    return direction + magnitude;
  }

  function coordinates(place) {
    const latitude = coordinate(place.geo_lat, 90, 'N', 'S');
    const longitude = coordinate(place.geo_lon, 180, 'E', 'W');
    if (!latitude || !longitude) {
      return null;
    }

    return { latitude, longitude };
  }

  function unpack(value) {
    const parts = value.split(',').map((part) => part.trim());
    const countryIndex = /^\d{6}$/.test(parts[0]) ? 1 : 0;
    const iso = parts[countryIndex + 1];
    if (!/^[A-Z]{2}$/.test(iso || '') || !/^[0-5]$/.test(parts.at(-1))) {
      return null;
    }
    const regionIndex = [countryIndex + 2, countryIndex + 3].find((i) =>
      new RegExp(`^${iso}-[A-Z0-9]{1,3}$`).test(parts[i] || ''),
    );
    if (regionIndex == null || regionIndex + 1 >= parts.length - 3) {
      return null;
    }
    const names = parts.slice(regionIndex + 1, -3);
    if (!parts[countryIndex] || names.some((name) => !name || /^[\d. +-]+$/.test(name))) {
      return null;
    }
    const place = {
      country: parts[countryIndex],
      country_iso_code: iso,
      region_iso_code: parts[regionIndex],
      region: names[0],
      geo_lat: parts.at(-3),
      geo_lon: parts.at(-2),
    };
    // Без полной сигнатуры и пары координат обычная строка остаётся исходным текстом.
    if (!coordinates(place)) {
      return null;
    }

    return { place, remaining: names.slice(1) };
  }

  function matchingHints(place, remaining, raw) {
    const names = [
      ...placeFields.map((field) => describe(place[field + '_with_type'] || place[field]).name),
      ...remaining.map((value) => describe(value).name),
    ].filter(Boolean);
    const known = new Set(names.map(comparisonKey));
    const mostSpecific = comparisonKey(names.at(-1));
    return raw
      .filter((value) => typeof value === 'string')
      .flatMap((value) => {
        const parts = value.split(',').map(describe);
        // Все части должны соответствовать тому же месту; совпадения одного имени недостаточно.
        const allPartsBelongToPlace = parts.every((part) => known.has(comparisonKey(part.name)));
        const containsMostSpecificPart = parts.some(
          (part) => comparisonKey(part.name) === mostSpecific,
        );

        return allPartsBelongToPlace && containsMostSpecificPart ? parts : [];
      });
  }

  function isRussianPlace(place) {
    if (place.country_iso_code === 'RU') {
      return true;
    }
    if (place.country_iso_code) {
      return false;
    }
    return /^(россия|российская федерация)$/.test(comparisonKey(place.country));
  }

  function regionTypeFromIsoCode(place) {
    if (!/^RU-[A-Z]{3}$/.test(place.region_iso_code || '')) {
      return '';
    }

    const code = place.region_iso_code.slice(3);
    if (oblasts.has(code)) {
      return 'область';
    }
    if (krais.has(code)) {
      return 'край';
    }
    return '';
  }

  function typeFromMatchingHints(name, hints) {
    const matches = hints.filter(
      (hint) => hint.type && comparisonKey(hint.name) === comparisonKey(name),
    );
    if (new Set(matches.map((hint) => hint.type)).size !== 1) {
      return '';
    }
    return matches[0].text;
  }

  function formatPlaceComponent(place, hints, russian, value, field) {
    const name = stringValue(value);
    if (!name) {
      return '';
    }

    const nameWithType = field && stringValue(place[field + '_with_type']);
    if (nameWithType) {
      return nameWithType;
    }

    const described = describe(name);
    if (described.type) {
      return described.text;
    }

    const explicitType = field && stringValue(place[field + '_type_full']);
    if (explicitType) {
      const explicitlyTypedName = describe(`${name} ${explicitType}`);
      return explicitlyTypedName.type ? explicitlyTypedName.text : `${explicitType} ${name}`;
    }

    const hintedName = typeFromMatchingHints(name, hints);
    if (hintedName) {
      return hintedName;
    }

    if (field === 'region') {
      const regionType = regionTypeFromIsoCode(place);
      if (regionType) {
        return `${name} ${regionType}`;
      }
    }
    if (russian && field === 'city') {
      return `город ${name}`;
    }
    if (russian && (field === 'area' || field === 'city_district')) {
      return `${name} район`;
    }
    return name;
  }

  function removeDuplicateCityRegion(parts) {
    // У города-региона может повторяться одно имя; разные уровни с указанными типами сохраняются.
    if (
      parts[1] &&
      parts[3] &&
      !describe(parts[1]).type &&
      comparisonKey(parts[1]) === comparisonKey(describe(parts[3]).name)
    ) {
      parts[1] = '';
    }
  }

  function joinUniqueParts(parts) {
    const unique = new Map();
    for (const part of parts.filter(Boolean)) {
      const key = comparisonKey(part);
      if (!unique.has(key)) {
        unique.set(key, part);
      }
    }
    return [...unique.values()].join(', ');
  }

  function humanPlace(place, remaining, raw) {
    const hints = matchingHints(place, remaining, raw);
    const russian = isRussianPlace(place);
    const parts = [
      ...placeFields.map((field) =>
        formatPlaceComponent(
          place,
          hints,
          russian,
          place[field] || place[field + '_with_type'],
          field,
        ),
      ),
      ...remaining.map((value) => formatPlaceComponent(place, hints, russian, value)),
    ];
    removeDuplicateCityRegion(parts);
    return joinUniqueParts(parts);
  }

  function legacyPlace(place) {
    if (typeof place === 'string') {
      return place;
    }
    if (!place || typeof place !== 'object') {
      return '';
    }
    return [
      ...new Set(Object.values(place).filter((value) => typeof value === 'string' && value.trim())),
    ].join(', ');
  }

  function normalizePlace(source, raw) {
    let place = source;
    let remaining = [];
    if (typeof source === 'string') {
      const packed = unpack(source);
      if (!packed) {
        return { text: source, coordinates: null };
      }
      ({ place, remaining } = packed);
    }
    if (!place || typeof place !== 'object' || Array.isArray(place)) {
      return null;
    }
    const map = coordinates(place);
    const unknown = Object.entries(place)
      .filter(([field, value]) => !knownFields.has(field) && stringValue(value))
      .map(([, value]) => value);
    // Частично знакомая схема не должна стирать нераспознанные подробности адреса.
    let text;
    if (unknown.length > 0 && !map) {
      text = legacyPlace(source);
    } else {
      text =
        [humanPlace(place, remaining, raw), ...unknown].filter(Boolean).join(', ') ||
        legacyPlace(source);
    }

    return text ? { text, coordinates: map } : null;
  }

  function normalizePlaces(parsed, raw) {
    const rawValues = list(raw);
    const sources = [...list(parsed), ...rawValues];
    const values = sources
      .map((place) => normalizePlace(place, rawValues))
      .filter((place) => place?.text?.trim());

    // Упакованное значение сохраняется как альтернатива: это исходная строка Genotek без догадок о типах.
    for (const source of sources) {
      if (typeof source === 'string' && unpack(source)) {
        values.push({ text: source, coordinates: null });
      }
    }
    const unique = new Map();
    for (const place of values) {
      unique.set(JSON.stringify(place), place);
    }
    return [...unique.values()];
  }

  return { normalizePlaces };
});
