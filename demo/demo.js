// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(() => {
  'use strict';

  const GRAPH_ENDPOINT = 'https://lk2-back.genotek.ru/api/v1/genealogy-graph/demo';
  const originalFetch = window.fetch.bind(window);

  let failed = false;
  let mode = 'close';
  let inflatedCounter = false;

  window.fetch = async function (url, options) {
    if (url !== GRAPH_ENDPOINT) {
      return originalFetch(url, options);
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (failed) {
      return new Response('{}', { status: 503 });
    }
    const data = await (await originalFetch('/demo/fixture')).json();
    if (inflatedCounter) {
      data.cards_count.full_tree++;
    }
    if (mode === 'close') {
      data.nodes = data.nodes.slice(0, 3);
    }
    return new Response(JSON.stringify({ status: 'success', data }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    async function loadGraph() {
      document.getElementById('status').textContent = 'Загрузка древа…';
      const response = await window.fetch(GRAPH_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ full: mode === 'all' }),
      });
      if (!response.ok) {
        document.getElementById('status').textContent = 'Ошибка сети';
        return;
      }
      const { data } = await response.json();
      document.querySelector('[data-mode="all"] .graph-mode-filters__tab-number').textContent =
        data.cards_count.full_tree;
      const cards = document.getElementById('cards');
      cards.replaceChildren();
      for (const node of data.nodes) {
        const cardElement = document.createElement('div');
        cardElement.className = 'person';

        const titleElement = document.createElement('strong');
        titleElement.textContent = node.card.name[0] + ' ' + node.card.surname[0];

        const descriptionElement = document.createElement('p');
        descriptionElement.textContent = 'Вымышленная карточка';

        cardElement.append(titleElement, descriptionElement);
        cards.appendChild(cardElement);
      }
      document.getElementById('status').textContent = 'Загружено людей: ' + data.nodes.length;
    }

    for (const tabElement of document.querySelectorAll('[data-mode]')) {
      tabElement.addEventListener('click', () => {
        mode = tabElement.dataset.mode;
        document
          .querySelector('.graph-mode-filters__tab--active')
          ?.classList.remove('graph-mode-filters__tab--active');
        tabElement.classList.add('graph-mode-filters__tab--active');
        loadGraph();
      });
    }

    document.getElementById('simulate-count').addEventListener('click', () => {
      inflatedCounter = true;
      loadGraph();
    });

    document.getElementById('simulate-error').addEventListener('click', () => {
      failed = true;
      loadGraph();
    });

    document.getElementById('restore').addEventListener('click', () => {
      failed = false;
      inflatedCounter = false;
      loadGraph();
    });

    loadGraph();
  });
})();
