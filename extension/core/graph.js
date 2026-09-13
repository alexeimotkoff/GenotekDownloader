// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GenotekGraph = api;
  }
})(globalThis, function () {
  'use strict';

  function isPlaceholder(id) {
    return /^(imaginary|fake)/i.test(String(id));
  }

  function list(value) {
    if (value == null) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    return [value];
  }

  function first(value) {
    return list(value)[0];
  }

  function sexOf(node) {
    const gender = String(first(node.card.gender) || node.type || '').toUpperCase();
    if (gender === 'MALE' || gender === 'M') {
      return 'M';
    }
    if (gender === 'FEMALE' || gender === 'F') {
      return 'F';
    }
    return 'U';
  }

  function extractGraph(input) {
    const graph = input?.data?.nodes ? input.data : input;
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new Error('Изменился формат ответа Genotek: нет списка людей.');
    }
    return graph;
  }

  function readPeople(nodes) {
    const people = [];
    const peopleById = new Map();

    for (const node of nodes) {
      if (node?.id == null || String(node.id) === '') {
        throw new Error('В графе есть карточка без идентификатора.');
      }

      const id = String(node.id);
      if (isPlaceholder(id)) {
        continue;
      }
      if (!node.card || typeof node.card !== 'object' || Array.isArray(node.card)) {
        throw new Error('Изменился формат карточки человека.');
      }
      if (peopleById.has(id)) {
        throw new Error('В графе повторяется идентификатор человека.');
      }

      for (const field of ['relatives', 'relationships']) {
        if (node.card[field] != null && !Array.isArray(node.card[field])) {
          throw new Error('Изменился формат семейных связей.');
        }
      }

      const person = {
        id,
        card: node.card,
        sex: sexOf(node),
        parents: new Set(),
        famc: [],
        fams: [],
      };
      people.push(person);
      peopleById.set(id, person);
    }

    if (!people.length) {
      throw new Error('Древо пусто: нет людей для экспорта.');
    }

    return { people, peopleById };
  }

  function validatePeopleCounts(graph, options, peopleCount) {
    const serverCount = graph.cards_count?.full_tree ?? graph.cards_count?.full;
    const expectedCounts = [
      ...new Set(
        [options.expectedCount, serverCount]
          .filter((count) => count != null && count !== '')
          .map(Number),
      ),
    ];
    const warnings = [];

    for (const count of expectedCounts) {
      if (!Number.isSafeInteger(Number(count)) || Number(count) < 0) {
        throw new Error('Изменился формат счётчика людей.');
      }
      if (peopleCount === count) {
        continue;
      }
      if (options.fullTreeRequested !== true) {
        throw new Error(
          `Получено ${peopleCount} из ${count} людей. Полный запрос древа не подтверждён: выберите «Все» и дождитесь загрузки.`,
        );
      }
      warnings.push(
        `Счётчик Genotek: ${count}; получено ${peopleCount}. Выполнен запрос полного древа. Экспортированы все полученные карточки; причина расхождения счётчика неизвестна.`,
      );
    }

    return warnings;
  }

  function comparePeopleById(leftPerson, rightPerson) {
    if (leftPerson.id < rightPerson.id) {
      return -1;
    }
    if (leftPerson.id > rightPerson.id) {
      return 1;
    }
    return 0;
  }

  function assignPersonReferences(people) {
    people.sort(comparePeopleById);
    people.forEach((person, index) => {
      person.xref = `@I${index + 1}@`;
    });
  }

  function resolvePerson(peopleById, id) {
    if (id == null || String(id) === '') {
      throw new Error('Семейная связь без идентификатора.');
    }
    if (isPlaceholder(id)) {
      return null;
    }

    const person = peopleById.get(String(id));
    if (!person) {
      throw new Error(
        'В древе отсутствует человек, на которого ссылается семейная связь. Экспорт остановлен.',
      );
    }
    return person;
  }

  function createFamilyStore(peopleById) {
    const families = [];
    const familiesByMembers = new Map();

    function getOrCreateFamily(members) {
      // Порядок ссылок не должен создавать две семьи для одной пары родителей или супругов.
      const memberIds = [...new Set(members.map((member) => member.id))].sort();
      const familyKey = JSON.stringify(memberIds);
      if (familiesByMembers.has(familyKey)) {
        return familiesByMembers.get(familyKey);
      }

      const family = {
        xref: `@F${families.length + 1}@`,
        members: memberIds.map((id) => peopleById.get(id)),
        children: [],
        relationships: [],
      };
      for (const person of family.members) {
        person.fams.push(family.xref);
      }
      families.push(family);
      familiesByMembers.set(familyKey, family);
      return family;
    }

    return { families, getOrCreateFamily };
  }

  function connectRelative(person, relative, context) {
    if (!relative || typeof relative !== 'object') {
      throw new Error('Изменился формат родственных связей.');
    }

    const relationType = String(relative.relationType || '').toLowerCase();
    if (!['parent', 'child', 'spouse'].includes(relationType)) {
      context.warnings.push('Неизвестный тип родственной связи сохранён в примечании.');
      return;
    }

    const relatedPerson = resolvePerson(context.peopleById, relative.id);
    if (!relatedPerson) {
      return;
    }
    if (relatedPerson === person) {
      throw new Error('Обнаружен цикл: человек связан сам с собой.');
    }

    if (relationType === 'parent') {
      person.parents.add(relatedPerson.id);
    } else if (relationType === 'child') {
      relatedPerson.parents.add(person.id);
    } else {
      context.getOrCreateFamily([person, relatedPerson]);
    }
  }

  function connectRelationship(person, relationship, context) {
    if (!relationship || typeof relationship !== 'object') {
      throw new Error('Изменился формат супружеских связей.');
    }

    const relatedPerson = resolvePerson(context.peopleById, relationship.with);
    if (!relatedPerson) {
      return;
    }
    if (relatedPerson === person) {
      throw new Error('Обнаружена связь человека с самим собой.');
    }

    context.getOrCreateFamily([person, relatedPerson]).relationships.push(relationship);
  }

  function connectRelationships(people, context) {
    for (const person of people) {
      for (const relative of person.card.relatives || []) {
        connectRelative(person, relative, context);
      }
      for (const relationship of person.card.relationships || []) {
        connectRelationship(person, relationship, context);
      }
    }
  }

  function validateParentHierarchy(people) {
    const remainingParentCounts = new Map(people.map((person) => [person.id, person.parents.size]));
    const childrenByParent = new Map(people.map((person) => [person.id, []]));

    for (const person of people) {
      if (person.parents.size > 2) {
        throw new Error(
          'У человека больше двух родителей. Неоднозначные связи требуют отдельного сопоставления.',
        );
      }
      for (const parentId of person.parents) {
        childrenByParent.get(parentId).push(person.id);
      }
    }

    // Топологический обход находит циклы и не переполняет стек на глубоких деревьях.
    const queue = people.filter((person) => person.parents.size === 0).map((person) => person.id);
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const parentId = queue[queueIndex];
      for (const childId of childrenByParent.get(parentId)) {
        remainingParentCounts.set(childId, remainingParentCounts.get(childId) - 1);
        if (remainingParentCounts.get(childId) === 0) {
          queue.push(childId);
        }
      }
    }

    if (queue.length !== people.length) {
      throw new Error('Обнаружен цикл в связях родителей и детей.');
    }
  }

  function connectChildrenToFamilies(people, peopleById, getOrCreateFamily) {
    for (const person of people) {
      if (!person.parents.size) {
        continue;
      }

      const parents = [...person.parents].map((id) => peopleById.get(id));
      const family = getOrCreateFamily(parents);
      family.children.push(person);
      person.famc.push(family.xref);
    }
  }

  function normalizeGraph(input, options = {}) {
    const graph = extractGraph(input);
    const { people, peopleById } = readPeople(graph.nodes);
    const warnings = validatePeopleCounts(graph, options, people.length);
    assignPersonReferences(people);

    const { families, getOrCreateFamily } = createFamilyStore(peopleById);
    connectRelationships(people, { peopleById, getOrCreateFamily, warnings });
    validateParentHierarchy(people);
    connectChildrenToFamilies(people, peopleById, getOrCreateFamily);

    return { people, families, warnings };
  }

  return { normalizeGraph, list, first, isPlaceholder };
});
