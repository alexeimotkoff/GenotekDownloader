// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dates.js'), require('./graph.js'), require('./places.js'));
  } else {
    root.GenotekGedcom = factory(root.GenotekDates, root.GenotekGraph, root.GenotekPlaces);
  }
})(globalThis, function (dates, graphApi, placesApi) {
  'use strict';

  const { formatDate, MONTHS } = dates;
  const { normalizeGraph, list, first } = graphApi;
  const { normalizePlaces } = placesApi;
  const PERSON_NOTE_FIELDS = ['notes', 'note', 'biography', 'description', 'comment'];
  const PERSON_FACT_FIELDS = [
    ['occupation', 'OCCU'],
    ['education', 'EDUC'],
  ];

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\t/g, ' ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n?/g, '\n');
  }

  function serializeValue(value) {
    if (typeof value === 'object' && value != null) {
      return JSON.stringify(value);
    }

    return cleanText(value);
  }

  function uniqueValues(values) {
    const populatedValues = values.filter((value) => value != null && value !== '');
    return [...new Set(populatedValues.map(serializeValue))];
  }

  class Writer {
    constructor() {
      this.lines = [];
      this.encoder = new TextEncoder();
    }

    raw(line) {
      this.lines.push(line);
    }

    field(level, tag, value = '') {
      const text = cleanText(value);
      const parts = text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        let prefix = i === 0 ? `${level} ${tag}` : `${level + 1} CONT`;
        let chunk = '';
        // Соблюдаем ограничение в 255 байт UTF-8 и ограничение стандарта по длине строки.
        for (const source of parts[i]) {
          const character = source === '@' ? '@@' : source;
          if (this.encoder.encode(prefix + ' ' + chunk + character).length + 2 > 255) {
            this.lines.push(prefix + (chunk ? ' ' + chunk : ''));
            prefix = `${level + 1} CONC`;
            chunk = '';
          }
          chunk += character;
        }
        this.lines.push(prefix + (chunk ? ' ' + chunk : ''));
      }
    }

    pointer(level, tag, xref) {
      this.raw(`${level} ${tag} ${xref}`);
    }

    toString() {
      return this.lines.join('\r\n') + '\r\n';
    }
  }

  function userTextValues(value) {
    return [
      ...new Set(
        list(value)
          .filter((item) => typeof item === 'string')
          .map(cleanText)
          .filter((item) => item.trim()),
      ),
    ];
  }

  function writeTextFields(writer, tag, value) {
    for (const item of userTextValues(value)) {
      writer.field(1, tag, item);
    }
  }

  function hasDateContent(value) {
    if (value == null) {
      return false;
    }
    if (typeof value !== 'object') {
      return true;
    }
    return Object.values(value).some((part) => part != null && part !== '' && part !== 0);
  }

  function writeEvent(
    writer,
    warnings,
    { tag, sourceDates, places = [], label, knownEvent = false },
  ) {
    const values = list(sourceDates).filter((value) => formatDate(value) !== '');
    const primary = values[0];
    const date = formatDate(primary);

    if (!knownEvent && !hasDateContent(primary) && !places.length) {
      return;
    }

    // Значение Y допустимо, только когда отсутствуют и DATE, и PLAC.
    writer.field(1, tag, !date && !places.length && knownEvent ? 'Y' : '');
    if (date) {
      writer.field(2, 'DATE', date);
    }
    if (places.length) {
      writer.field(2, 'PLAC', places[0].text);
      if (places[0].coordinates) {
        writer.field(3, 'MAP');
        writer.field(4, 'LATI', places[0].coordinates.latitude);
        writer.field(4, 'LONG', places[0].coordinates.longitude);
      }
    }
    if (date === null) {
      warnings.push(`${label}: некорректная исходная дата не выгружена.`);
    }
    if (values.length > 1) {
      warnings.push(`${label}: выгружена только первая дата.`);
    }
    if (places.length > 1) {
      warnings.push(`${label}: выгружено только первое место.`);
    }
  }

  function writeHeader(writer, currentDate) {
    const gedcomDate = [
      currentDate.getUTCDate(),
      MONTHS[currentDate.getUTCMonth()],
      currentDate.getUTCFullYear(),
    ].join(' ');

    writer.raw('0 HEAD');
    writer.field(1, 'SOUR', 'GENOTEK_GEDCOM');
    writer.field(2, 'NAME', 'Genotek GEDCOM Export');
    writer.field(2, 'VERS', '1.0.7');
    writer.field(1, 'CHAR', 'UTF-8');
    writer.field(1, 'DATE', gedcomDate);
    writer.field(1, 'GEDC');
    writer.field(2, 'VERS', '5.5.1');
    writer.field(2, 'FORM', 'Lineage-Linked');
    writer.pointer(1, 'SUBM', '@U1@');
    writer.raw('0 @U1@ SUBM');
    writer.field(1, 'NAME', 'Владелец древа Genotek');
  }

  function cleanNamePart(value) {
    return cleanText(value).replace(/[\n/]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function writeName(
    writer,
    givenName,
    middleName,
    displaySurname,
    nameType,
    birthSurname,
    currentSurnames = [],
  ) {
    // Косая черта разделяет фамилию в GEDCOM, поэтому части имени предварительно очищаются.
    const components = [givenName, middleName, displaySurname].map(cleanNamePart);
    const firstNames = [components[0], components[1]].filter(Boolean).join(' ');
    if (!firstNames && !components[2]) {
      return;
    }

    writer.field(1, 'NAME', `${firstNames} /${components[2]}/`.trim());
    if (nameType) {
      writer.field(2, 'TYPE', nameType);
    }
    if (firstNames) {
      writer.field(2, 'GIVN', firstNames);
    }
    // В эталоне SURN означает фамилию при рождении, а _MARNM — текущую фамилию независимо от пола.
    if (birthSurname) {
      writer.field(2, 'SURN', cleanNamePart(birthSurname));
    }
    for (const currentSurname of uniqueValues(currentSurnames.map(cleanNamePart))) {
      writer.field(2, '_MARNM', currentSurname);
    }
  }

  function writePerson(writer, warnings, person) {
    const card = person.card;
    writer.raw(`0 ${person.xref} INDI`);

    const names = uniqueValues(list(card.name));
    const middleNames = uniqueValues(list(card.middleName));
    const surnames = uniqueValues(list(card.surname));
    const maidenNames = uniqueValues(list(card.maidenName));
    const birthSurname = maidenNames[0] || null;
    const displaySurname = birthSurname || surnames[0];
    const currentSurnames = maidenNames.length ? surnames : surnames.slice(0, 1);

    writer.field(1, 'REFN', person.id);
    writer.field(2, 'TYPE', 'Genotek card ID');
    writeName(
      writer,
      names[0],
      middleNames[0],
      displaySurname,
      null,
      birthSurname,
      currentSurnames,
    );
    for (const alternativeMaidenName of maidenNames.slice(1)) {
      writeName(
        writer,
        names[0],
        middleNames[0],
        alternativeMaidenName,
        'aka',
        alternativeMaidenName,
        currentSurnames,
      );
    }
    for (const alternativeName of names.slice(1)) {
      writeName(
        writer,
        alternativeName,
        middleNames[0],
        displaySurname,
        'aka',
        birthSurname,
        currentSurnames,
      );
    }
    if (!maidenNames.length) {
      for (const alternativeSurname of surnames.slice(1)) {
        writeName(writer, names[0], middleNames[0], alternativeSurname, 'aka', null, [
          alternativeSurname,
        ]);
      }
    }
    for (const alternativeMiddleName of middleNames.slice(1)) {
      writeName(
        writer,
        names[0],
        alternativeMiddleName,
        displaySurname,
        'aka',
        birthSurname,
        currentSurnames,
      );
    }

    const allNameParts = [...names, ...middleNames, ...surnames, ...maidenNames];
    if (allNameParts.some((namePart) => /[\n/]/.test(namePart))) {
      warnings.push('Имена с переводами строк или косыми чертами нормализованы.');
    }

    writer.field(1, 'SEX', person.sex);
    const ethnicities = list(card.ethnicity).filter(
      (value) => typeof value === 'string' && value.trim(),
    );
    for (const ethnicity of uniqueValues(ethnicities)) {
      writer.field(1, 'NATI', ethnicity);
    }
    writeEvent(writer, warnings, {
      tag: 'BIRT',
      sourceDates: card.birthdate,
      places: normalizePlaces(card.birthplaceParsed, card.birthplace),
      label: 'Рождение',
    });
    const lifeStatus = first(card.liveOrDead);
    writeEvent(writer, warnings, {
      tag: 'DEAT',
      sourceDates: card.deathdate,
      places: normalizePlaces(card.deathplaceParsed, card.deathplace),
      label: 'Смерть',
      knownEvent: lifeStatus === 0 || lifeStatus === '0',
    });

    const unknownRelations = (card.relatives || []).filter(
      (relation) =>
        !['parent', 'child', 'spouse'].includes(String(relation.relationType).toLowerCase()),
    );
    if (unknownRelations.length) {
      warnings.push('Дополнительные родственные связи не выгружены.');
    }

    for (const [field, tag] of PERSON_FACT_FIELDS) {
      writeTextFields(writer, tag, card[field]);
    }
    for (const familyXref of person.famc) {
      writer.pointer(1, 'FAMC', familyXref);
    }
    for (const familyXref of person.fams) {
      writer.pointer(1, 'FAMS', familyXref);
    }
    for (const field of PERSON_NOTE_FIELDS) {
      writeTextFields(writer, 'NOTE', card[field]);
    }
  }

  function writeFamilyMembers(writer, family) {
    const maleMember = family.members.find((member) => member.sex === 'M');
    const femaleMember = family.members.find((member) => member.sex === 'F');
    if (family.members.length === 1) {
      const role = family.members[0].sex === 'F' ? 'WIFE' : 'HUSB';
      writer.pointer(1, role, family.members[0].xref);
      return;
    }

    const husband =
      maleMember || family.members.find((member) => member !== femaleMember) || family.members[0];
    const wife = family.members.find((member) => member !== husband);
    writer.pointer(1, 'HUSB', husband.xref);
    writer.pointer(1, 'WIFE', wife.xref);
  }

  function hasAmbiguousFamilyRoles(family) {
    return (
      family.members.some((member) => member.sex === 'U') ||
      (family.members.length === 2 && family.members[0].sex === family.members[1].sex)
    );
  }

  function uniqueRelationships(relationships) {
    return [...new Map(relationships.map((item) => [JSON.stringify(item), item])).values()];
  }

  function relationshipDates(relationships, field) {
    return uniqueValues(relationships.flatMap((relationship) => list(relationship[field]))).map(
      (value) => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      },
    );
  }

  function writeFamily(writer, warnings, family) {
    writer.raw(`0 ${family.xref} FAM`);
    writeFamilyMembers(writer, family);

    if (hasAmbiguousFamilyRoles(family)) {
      warnings.push(
        'В семье с неизвестным или одинаковым полом родителей HUSB/WIFE обозначают позиции формата.',
      );
    }
    for (const child of family.children) {
      writer.pointer(1, 'CHIL', child.xref);
    }

    const relationships = uniqueRelationships(family.relationships);
    const officialRelationships = relationships.filter(
      (relationship) => relationship.type === 'official',
    );
    if (officialRelationships.length) {
      writeEvent(writer, warnings, {
        tag: 'MARR',
        sourceDates: relationshipDates(officialRelationships, 'from'),
        label: 'Брак',
        knownEvent: true,
      });

      const finishedRelationships = officialRelationships.filter(
        (relationship) => relationship.finished === 1 || relationship.finished === true,
      );
      if (finishedRelationships.length) {
        writeEvent(writer, warnings, {
          tag: 'DIV',
          sourceDates: relationshipDates(finishedRelationships, 'to'),
          label: 'Развод',
          knownEvent: true,
        });
      }
    }
  }

  function convertGraph(graph, options = {}) {
    const { people, families, warnings } = normalizeGraph(graph, options);
    const writer = new Writer();
    const currentDate = options.now || new Date();
    writeHeader(writer, currentDate);

    for (const person of people) {
      writePerson(writer, warnings, person);
    }

    for (const family of families) {
      writeFamily(writer, warnings, family);
    }
    writer.raw('0 TRLR');
    return {
      text: writer.toString(),
      peopleCount: people.length,
      familiesCount: families.length,
      warnings: [...new Set(warnings)],
    };
  }

  return { convertGraph };
});
