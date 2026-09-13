// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(() => {
  'use strict';

  const CHANNEL = 'genotek-gedcom-v1';

  function currentRoute() {
    const url = new URL(window.location.href);
    return url.pathname + url.search;
  }

  // Каждая новая загрузка делает предыдущие асинхронные ответы устаревшими.
  let revision = 0;
  let state = {
    channel: CHANNEL,
    type: 'state',
    status: 'idle',
    revision,
    route: currentRoute(),
  };
  const CARD_FIELDS = [
    'name',
    'surname',
    'middleName',
    'maidenName',
    'gender',
    'birthdate',
    'deathdate',
    'birthplace',
    'birthplaceParsed',
    'deathplace',
    'deathplaceParsed',
    'ethnicity',
    'liveOrDead',
    'relatives',
    'relationships',
    'notes',
    'note',
    'biography',
    'description',
    'comment',
    'occupation',
    'education',
  ];

  function isGraphUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (
        url.protocol !== 'https:' ||
        !['lk2-back.genotek.ru', 'lk.genotek.ru'].includes(url.hostname)
      ) {
        return false;
      }
      return (
        /^\/api\/v1\/genealogy-graph\/[^/]+\/?$/.test(url.pathname) ||
        /^\/api\/v1\/patients\/[^/]+\/genealogy-graph\/?$/.test(url.pathname) ||
        /^\/api\/v1\/site\/1\/relatives\/[^/]+\/[^/]+\/genealogy-graph\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  function publish(nextState) {
    state = { channel: CHANNEL, type: 'state', revision, route: state.route, ...nextState };
    window.postMessage(state, window.location.origin);
  }

  function selectCardFields(node) {
    const sourceCard = node?.card;
    if (!sourceCard || typeof sourceCard !== 'object' || Array.isArray(sourceCard)) {
      return undefined;
    }

    return Object.fromEntries(
      CARD_FIELDS.filter((field) => Object.hasOwn(sourceCard, field)).map((field) => [
        field,
        sourceCard[field],
      ]),
    );
  }

  function isFullTreeRequest(method, body) {
    if (
      String(method).toUpperCase() !== 'POST' ||
      typeof body !== 'string' ||
      body.length > 65536
    ) {
      return false;
    }
    try {
      const options = JSON.parse(body);
      return (
        options?.full === true &&
        !options.relatives_only &&
        !options.direct_only &&
        !options.centralCardId &&
        !options.cardId &&
        !Object.hasOwn(options, 'card')
      );
    } catch {
      return false;
    }
  }

  function inspectFetchRequest(input, init) {
    const method = init?.method || input?.method || 'GET';
    if (init && Object.hasOwn(init, 'body')) {
      return Promise.resolve(isFullTreeRequest(method, init.body));
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        // Читаем клон: тело исходного Request должно остаться доступным сайту.
        return input
          .clone()
          .text()
          .then(
            (body) => isFullTreeRequest(method, body),
            () => false,
          );
      } catch {
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(false);
  }

  function begin() {
    revision++;
    publish({ status: 'loading', route: currentRoute() });
    return revision;
  }

  function fail(
    requestRevision,
    message = 'Не удалось прочитать ответ древа. Обновите страницу и попробуйте снова.',
  ) {
    if (requestRevision === revision) {
      publish({ status: 'error', message });
    }
  }

  function httpErrorMessage(status) {
    if (status === 401 || status === 403) {
      return 'Нет доступа к древу. Проверьте вход в Genotek и обновите страницу.';
    }
    return `Genotek вернул ошибку HTTP ${status}. Повторите загрузку древа.`;
  }

  function complete(requestRevision, response, status, fullTreeRequested = false) {
    if (requestRevision !== revision) {
      return;
    }
    if (status < 200 || status >= 300) {
      fail(requestRevision, httpErrorMessage(status));
      return;
    }
    try {
      const payload = typeof response === 'string' ? JSON.parse(response) : response;
      const graph = payload?.data?.nodes ? payload.data : payload;
      if (!graph || !Array.isArray(graph.nodes)) {
        fail(
          requestRevision,
          'Ответ Genotek не содержит граф древа. Дождитесь загрузки или обновите страницу.',
        );
        return;
      }
      // Передаём только генеалогические поля, без авторизации, фотографий, ДНК и данных раскладки.
      const nodes = graph.nodes.map((node) => ({
        id: node?.id,
        type: node?.type,
        card: selectCardFields(node),
      }));
      const cardCounts = graph.cards_count;
      publish({
        status: 'ready',
        fullTreeRequested,
        graph: {
          nodes,
          treeId: graph.treeId,
          cards_count: cardCounts
            ? { full_tree: cardCounts.full_tree, full: cardCounts.full }
            : undefined,
        },
      });
    } catch {
      fail(requestRevision);
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      if (!isGraphUrl(url)) {
        return originalFetch.apply(this, arguments);
      }
      const requestRevision = begin();
      const fullTreeRequest = inspectFetchRequest(input, init);
      let promise;
      try {
        promise = originalFetch.apply(this, arguments);
      } catch (error) {
        fail(requestRevision);
        throw error;
      }
      return promise.then(
        (response) => {
          if (requestRevision === revision) {
            try {
              // Ответ клонируется, поэтому обёртка возвращает сайту исходный Response без изменений.
              Promise.all([response.clone().text(), fullTreeRequest]).then(
                ([body, fullTreeRequested]) => {
                  complete(requestRevision, body, response.status, fullTreeRequested);
                },
                () => {
                  fail(requestRevision);
                },
              );
            } catch {
              fail(requestRevision);
            }
          }
          return response;
        },
        (error) => {
          fail(requestRevision);
          throw error;
        },
      );
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;
    const requests = new WeakMap();
    XHR.prototype.open = function (method, url) {
      const result = originalOpen.apply(this, arguments);
      requests.set(this, { isGraph: isGraphUrl(url), method });
      return result;
    };
    XHR.prototype.send = function () {
      const request = requests.get(this);
      if (!request?.isGraph) {
        return originalSend.apply(this, arguments);
      }
      const requestRevision = begin();
      const fullTreeRequested = isFullTreeRequest(request.method, arguments[0]);
      this.addEventListener(
        'loadend',
        () => {
          try {
            const body = this.responseType === 'json' ? this.response : this.responseText;
            complete(requestRevision, body, this.status, fullTreeRequested);
          } catch {
            fail(requestRevision);
          }
        },
        { once: true },
      );
      try {
        return originalSend.apply(this, arguments);
      } catch (error) {
        fail(requestRevision);
        throw error;
      }
    };
  }

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.channel !== CHANNEL
    ) {
      return;
    }
    if (event.data.type === 'request-state') {
      window.postMessage(state, window.location.origin);
    }
    if (event.data.type === 'clear-state') {
      // Запоздалый сброс старого SPA-маршрута не должен стереть данные уже открытого древа.
      if (state.route === event.data.previousRoute) {
        revision++;
        publish({ status: 'idle', route: currentRoute() });
      } else {
        window.postMessage(state, window.location.origin);
      }
    }
  });
})();
