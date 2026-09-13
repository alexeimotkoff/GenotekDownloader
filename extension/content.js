// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(() => {
  'use strict';

  if (document.getElementById('genotek-gedcom-export')) {
    return;
  }
  const CHANNEL = 'genotek-gedcom-v1';
  const host = document.createElement('span');
  host.id = 'genotek-gedcom-export';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: block;
      position: relative;
      flex: 0 0 40px;
      width: 40px;
      height: 40px;
      font: 14px/1.4 ALSStory, Helvetica, Arial, sans-serif;
      color: #142536;
      z-index: 3;
    }

    * {
      box-sizing: border-box;
    }

    button {
      font: inherit;
      cursor: pointer;
    }

    .download {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: #fff;
      color: #737373;
      box-shadow: 0 2px 25px #0000001a;
      transition: background-color 0.25s, color 0.25s;
    }

    .download:hover:not(:disabled),
    .download:focus-visible {
      background: #113566;
      color: #fff;
    }

    .download:focus-visible,
    .close:focus-visible {
      outline: 2px solid #113566;
      outline-offset: 3px;
    }

    .download:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .icon {
      width: 32px;
      height: 32px;
    }

    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .spinner {
      display: none;
      width: 18px;
      height: 18px;
      border: 2px solid #73737340;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .download[aria-busy="true"] .icon {
      display: none;
    }

    .download[aria-busy="true"] .spinner {
      display: block;
    }

    .tooltip {
      position: absolute;
      right: calc(100% + 8px);
      top: 50%;
      transform: translateY(-50%);
      width: max-content;
      max-width: calc(100vw - 88px);
      padding: 8px 16px;
      border-radius: 8px;
      color: #fff;
      background: #142536;
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .download:hover:not(:disabled) ~ .tooltip,
    .download:focus-visible ~ .tooltip {
      visibility: visible;
      opacity: 1;
    }

    .notice {
      position: absolute;
      top: 0;
      right: calc(100% + 12px);
      width: min(360px, calc(100vw - 88px));
      max-height: calc(100dvh - 32px);
      overflow: auto;
      padding: 16px 38px 16px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 2px 25px #0000001a;
      overflow-wrap: anywhere;
    }

    .notice.error {
      border-color: #e4b6b6;
      color: #8a2929;
    }

    .notice:not([hidden]) ~ .tooltip {
      display: none;
    }

    .close {
      position: absolute;
      right: 7px;
      top: 7px;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #737373;
      font-size: 22px;
      line-height: 24px;
    }

    .close:hover {
      background: #f4f4f6;
      color: #113566;
    }

    .details {
      margin-top: 8px;
      font-size: 12px;
      white-space: pre-line;
    }

    .notice[hidden] {
      display: none;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .download,
      .tooltip {
        transition: none;
      }

      .spinner {
        animation: none;
      }
    }
  `;
  const button = document.createElement('button');
  button.className = 'download';
  button.type = 'button';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('viewBox', '0 0 32 32');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.7');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2Zm0 0v6h6M12 11v7m-3-3 3 3 3-3',
  );
  path.setAttribute('transform', 'translate(5 2) scale(0.9166667)');
  const format = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  format.setAttribute('x', '16');
  format.setAttribute('y', '30');
  format.setAttribute('text-anchor', 'middle');
  format.setAttribute('font-family', 'Arial, sans-serif');
  format.setAttribute('font-size', '7');
  format.setAttribute('font-weight', '700');
  format.setAttribute('fill', 'currentColor');
  format.setAttribute('stroke', 'none');
  format.setAttribute('textLength', '30');
  format.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  format.textContent = 'GEDCOM';
  icon.append(path, format);
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Скачать GEDCOM';
  button.append(icon, spinner, label);
  const tooltip = document.createElement('span');
  tooltip.className = 'tooltip';
  tooltip.textContent = 'Скачать GEDCOM';
  tooltip.setAttribute('aria-hidden', 'true');
  const notice = document.createElement('div');
  notice.className = 'notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const message = document.createElement('div');
  const details = document.createElement('div');
  details.className = 'details';
  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Закрыть сообщение');
  close.addEventListener('click', () => {
    notice.hidden = true;
  });
  notice.append(message, details, close);
  shadow.append(style, button, notice, tooltip);

  let snapshot = null;
  let revision = -1;
  let loading = false;
  let pending = false;
  let timeout = null;
  let fullTreeRequested = false;
  let route = location.pathname + location.search;

  function isTreePage() {
    return /^\/genealogical-tree(?:\/|$)/.test(location.pathname);
  }

  function findAllTab() {
    return [...document.querySelectorAll('.graph-mode-filters__tab')].find((tab) => {
      const labelText = tab.querySelector('.graph-mode-filters__tab-label')?.textContent?.trim();
      return (
        labelText === 'Все' ||
        labelText === 'All' ||
        [...tab.classList].some((className) => className.endsWith('--all'))
      );
    });
  }

  function expectedPeopleCount() {
    const value = findAllTab()
      ?.querySelector('.graph-mode-filters__tab-number')
      ?.textContent.replace(/\s/g, '');

    if (!value || !/^\d+$/.test(value)) {
      return undefined;
    }

    return Number(value);
  }

  function show(text, error = false, extra = '') {
    message.textContent = text;
    details.textContent = extra;
    notice.classList.toggle('error', error);
    notice.hidden = false;
    positionNotice();
  }

  function positionNotice() {
    if (notice.hidden || !host.isConnected) {
      return;
    }
    notice.style.maxWidth = `${Math.max(0, host.getBoundingClientRect().left - 28)}px`;
    notice.style.top = '0px';
    const noticeRect = notice.getBoundingClientRect();
    const visibleTop = Math.max(16, Math.min(noticeRect.top, innerHeight - noticeRect.height - 16));
    notice.style.top = `${visibleTop - noticeRect.top}px`;
  }

  function stop() {
    pending = false;
    clearTimeout(timeout);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    label.textContent = 'Скачать GEDCOM';
  }

  function sameTree() {
    if (!snapshot?.treeId) {
      return true;
    }
    const tabClassNames = [...(findAllTab()?.classList || [])].filter(
      (className) =>
        className.startsWith('graph-mode-filters__tab--') && className.endsWith('--all'),
    );
    return (
      tabClassNames.length === 0 ||
      tabClassNames.some(
        (className) => className === `graph-mode-filters__tab--${snapshot.treeId}--all`,
      )
    );
  }

  function exportOptions() {
    if (!sameTree()) {
      throw new Error('Профиль древа изменился. Обновите страницу перед экспортом.');
    }

    const expectedPeople = expectedPeopleCount();
    if (
      expectedPeople == null &&
      snapshot.cards_count?.full_tree == null &&
      snapshot.cards_count?.full == null
    ) {
      throw new Error(
        'Не удалось проверить полноту древа: отсутствует счётчик людей. Обновите страницу.',
      );
    }

    return {
      expectedCount: expectedPeople,
      fullTreeRequested:
        fullTreeRequested && !!findAllTab()?.classList.contains('graph-mode-filters__tab--active'),
    };
  }

  function downloadGedcom(text) {
    const gedcomFile = new Blob([text], { type: 'application/octet-stream' });
    const downloadUrl = URL.createObjectURL(gedcomFile);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `genotek-tree-${new Date().toISOString().slice(0, 10)}.ged`;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  }

  function showExportResult(exportResult) {
    const summary =
      `Файл GEDCOM передан на скачивание. ` +
      `Людей: ${exportResult.peopleCount}, семей: ${exportResult.familiesCount}.`;
    const exportDetails = exportResult.warnings.length
      ? 'Примечания к экспорту:\n' + exportResult.warnings.join('\n')
      : 'UTF-8 · GEDCOM 5.5.1';
    show(summary, false, exportDetails);
  }

  function saveSnapshot() {
    try {
      if (!snapshot || loading) {
        return;
      }

      const exportResult = globalThis.GenotekGedcom.convertGraph(snapshot, exportOptions());
      downloadGedcom(exportResult.text);
      showExportResult(exportResult);
      stop();
    } catch (error) {
      show(error.message || 'Не удалось создать GEDCOM.', true);
      stop();
    }
  }

  function waitForFullTree(allPeopleTab) {
    // Частичный снимок нельзя переиспользовать после переключения фильтра на «Все».
    pending = true;
    snapshot = null;
    fullTreeRequested = false;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    label.textContent = 'Загрузка древа…';
    show('Включаю «Все» и жду полное древо…');
    timeout = setTimeout(() => {
      stop();
      show(
        'Древо ещё не загружено. Дождитесь его появления и нажмите кнопку снова. Если данные не получены, обновите страницу.',
        true,
      );
    }, 30000);
    allPeopleTab.click();
  }

  function handleDownloadClick() {
    if (!isTreePage()) {
      return;
    }

    const allPeopleTab = findAllTab();
    if (allPeopleTab && !allPeopleTab.classList.contains('graph-mode-filters__tab--active')) {
      waitForFullTree(allPeopleTab);
      return;
    }
    if (loading) {
      show('Genotek загружает древо. Дождитесь окончания загрузки.');
      return;
    }
    if (!snapshot) {
      show(
        'Данные древа ещё не получены. После установки расширения обновите эту страницу. Затем нажмите «Скачать GEDCOM».',
        true,
      );
      window.postMessage({ channel: CHANNEL, type: 'request-state' }, location.origin);
      return;
    }
    saveSnapshot();
  }

  button.addEventListener('click', handleDownloadClick);

  function isCurrentCapturedState(event, capturedState) {
    return (
      event.source === window &&
      event.origin === location.origin &&
      capturedState?.channel === CHANNEL &&
      capturedState.type === 'state' &&
      capturedState.route === location.pathname + location.search &&
      Number.isSafeInteger(capturedState.revision) &&
      capturedState.revision >= revision
    );
  }

  function receiveCapturedState(event) {
    const capturedState = event.data;
    if (!isCurrentCapturedState(event, capturedState)) {
      return;
    }

    // Ревизия не позволяет запоздалому ответу заменить более новый снимок древа.
    revision = capturedState.revision;
    loading = capturedState.status === 'loading';
    snapshot =
      capturedState.status === 'ready' && Array.isArray(capturedState.graph?.nodes)
        ? capturedState.graph
        : null;
    fullTreeRequested = !!snapshot && capturedState.fullTreeRequested === true;
    if (capturedState.status === 'error' && isTreePage()) {
      show(capturedState.message || 'Не удалось загрузить древо.', true);
      stop();
    }
    if (pending && snapshot) {
      requestAnimationFrame(saveSnapshot);
    }
  }

  window.addEventListener('message', receiveCapturedState);

  function attachButtonToToolbar(toolbar) {
    const pdfButton = toolbar.querySelector('.icon-download')?.closest('.tree__actions-btn');
    if (pdfButton?.parentElement === toolbar) {
      if (pdfButton.nextElementSibling !== host) {
        pdfButton.after(host);
      }
      return;
    }
    if (host.parentElement !== toolbar) {
      toolbar.insertBefore(
        host,
        toolbar.querySelector(':scope > .tree__actions-btn-box, :scope > .tree__zoom'),
      );
    }
  }

  function mount() {
    const currentRoute = location.pathname + location.search;
    if (currentRoute !== route) {
      // Genotek меняет страницы без перезагрузки, поэтому снимок привязан к SPA-маршруту.
      const previousRoute = route;
      route = currentRoute;
      snapshot = null;
      fullTreeRequested = false;
      stop();
      notice.hidden = true;
      window.postMessage({ channel: CHANNEL, type: 'clear-state', previousRoute }, location.origin);
    }
    if (!isTreePage()) {
      host.remove();
      return;
    }
    const toolbar = document.querySelector('.tree__actions');
    if (!toolbar) {
      host.remove();
      return;
    }
    attachButtonToToolbar(toolbar);
    positionNotice();
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(mount, 1000);
  window.addEventListener('resize', positionNotice);
  mount();
  window.postMessage({ channel: CHANNEL, type: 'request-state' }, location.origin);
})();
