// SPDX-FileCopyrightText: 2026 alexeimotkoff
// SPDX-License-Identifier: GPL-3.0-only

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GenotekDates = api;
  }
})(globalThis, function () {
  'use strict';

  const MONTHS = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DATE_FIELDS = new Set(['year', 'month', 'day', 'approximate']);
  const ISO_DATE_PATTERN = /^(\d{3,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;
  const RUSSIAN_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{3,4})$/;

  function parseDateString(value) {
    const text = value.trim();
    if (!text) {
      return '';
    }

    const isoDate = ISO_DATE_PATTERN.exec(text);
    if (isoDate) {
      return { year: isoDate[1], month: isoDate[2], day: isoDate[3] };
    }

    const russianDate = RUSSIAN_DATE_PATTERN.exec(text);
    if (!russianDate) {
      return null;
    }

    return { year: russianDate[3], month: russianDate[2], day: russianDate[1] };
  }

  function parseDate(value) {
    if (typeof value === 'number') {
      return { year: value };
    }
    if (typeof value === 'string') {
      return parseDateString(value);
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  function hasUnknownFields(value) {
    return Object.entries(value).some(
      ([key, fieldValue]) => !DATE_FIELDS.has(key) && fieldValue != null && fieldValue !== '',
    );
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function maximumDay(year, month) {
    if (month === 2 && isLeapYear(year)) {
      return 29;
    }
    return DAYS_IN_MONTH[month - 1];
  }

  function hasValidParts(year, month, day) {
    if (
      !Number.isInteger(year) ||
      year < 1 ||
      year > 9999 ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 0 ||
      day > 31
    ) {
      return false;
    }
    if (day && !month) {
      return false;
    }
    return !day || day <= maximumDay(year, month);
  }

  function joinDateParts(year, month, day) {
    return [day || '', month ? MONTHS[month - 1] : '', String(year).padStart(4, '0')]
      .filter(Boolean)
      .join(' ');
  }

  function formatDate(value) {
    if (value == null || value === '') {
      return '';
    }

    const parsedDate = parseDate(value);
    if (parsedDate === '') {
      return '';
    }
    if (!parsedDate) {
      return null;
    }

    // Неизвестные уточнения даты сохраняются в исходном примечании.
    if (hasUnknownFields(parsedDate)) {
      return null;
    }

    const year = Number(parsedDate.year || 0);
    const month = Number(parsedDate.month || 0);
    const day = Number(parsedDate.day || 0);
    if (!year && !month && !day) {
      return '';
    }
    if (!hasValidParts(year, month, day)) {
      return null;
    }

    const date = joinDateParts(year, month, day);
    return parsedDate.approximate === true ? `ABT ${date}` : date;
  }

  return { formatDate, MONTHS };
});
