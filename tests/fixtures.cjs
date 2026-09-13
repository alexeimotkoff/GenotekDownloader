// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

function personType(gender) {
  if (gender === 'Female') {
    return 'FEMALE';
  }

  if (gender === 'Male') {
    return 'MALE';
  }

  return 'UNKNOWN';
}

function person(id, gender = 'Male', card = {}) {
  return {
    id,
    type: personType(gender),
    card: {
      name: ['Имя ' + id],
      surname: ['Тестовый'],
      middleName: [],
      maidenName: [],
      gender: [gender],
      birthdate: [],
      deathdate: [],
      birthplace: [],
      birthplaceParsed: [],
      deathplace: [],
      deathplaceParsed: [],
      liveOrDead: 1,
      relatives: [],
      relationships: [],
      ...card,
    },
  };
}

function graph(nodes) {
  return {
    treeId: 'synthetic-tree',
    nodes,
    edges: [],
    cards_count: {
      full_tree: nodes.filter((node) => !/^(fake|imaginary)/i.test(node.id)).length,
    },
  };
}

function blendedFamily() {
  return graph([
    person('father', 'Male', {
      birthplace: ['Россия, г Тула'],
      birthplaceParsed: [
        {
          country: 'Россия',
          country_iso_code: 'RU',
          region_iso_code: 'RU-TUL',
          region: 'Тульская',
          city: 'Тула',
          postal_code: '300000',
          federal_district: 'Центральный',
          geo_lat: '54.1234567',
          geo_lon: '37.7654321',
          qc_geo: '4',
        },
      ],
      ethnicity: ['Тестовая группа А'],
      relationships: [
        {
          with: 'mother1',
          type: 'official',
          from: [{ year: 1990 }],
          finished: 1,
          to: [{ year: 2000 }],
        },
        { with: 'mother2', type: 'unofficial', from: [{ year: 2002 }] },
      ],
    }),
    person('mother1', 'Female'),
    person('mother2', 'Female'),
    person('child1', 'Female', {
      relatives: [
        { id: 'father', relationType: 'parent' },
        { id: 'mother1', relationType: 'parent' },
      ],
    }),
    person('child2', 'Male', {
      relatives: [
        { id: 'father', relationType: 'parent' },
        { id: 'mother2', relationType: 'parent' },
      ],
    }),
    person('child3', 'Male', { relatives: [{ id: 'father', relationType: 'parent' }] }),
  ]);
}

module.exports = { person, graph, blendedFamily };
