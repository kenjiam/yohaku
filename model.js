(function (root) {
  'use strict';
  const VERSION = 1;
  const id = () => globalThis.crypto.randomUUID();
  const now = () => new Date().toISOString();
  function initial() {
    const date = now();
    return { schemaVersion: VERSION, categories: [
      ['want', 'WANT', 'やりたいこと、興味、夢、思いつき。', '#b56b43'],
      ['said', 'SAID', 'やると言ったこと。いつか回収したい約束。', '#7c78a5'],
      ['work', 'WORK', '仕事や、お金のためにやること。', '#507c8c'],
      ['base', 'BASE', '暮らしと、自分の調子を整えること。', '#64846b']
    ].map(([id, name, description, color]) => ({ id, name, description, color, createdAt: date, updatedAt: date })), items: [] };
  }
  const dateOK = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const DAY = 86400000;
  function settings(category) {
    return { pressure: false, basis: category.id === 'work' ? 'deadline' : 'age', days: 30, motion: false, sort: category.id === 'work' ? 'due' : 'newest', ...category.settings };
  }
  function validDue(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dueDays(item, time = Date.now()) {
    if (!item.dueDate) return null;
    const today = new Date(time);
    const localDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((Date.parse(`${item.dueDate}T00:00:00Z`) - localDay) / DAY);
  }
  function pressure(item, category, time = Date.now()) {
    const config = settings(category);
    if (!config.pressure || item.status !== 'open') return null;
    if (config.basis === 'deadline' && !item.dueDate) return null;
    const value = item.dueDate ? 1 - dueDays(item, time) / config.days : (time - Date.parse(item.createdAt)) / (DAY * config.days);
    return Math.min(1, Math.max(0, value));
  }
  function sortItems(items, category, time = Date.now()) {
    const mode = settings(category).sort;
    return [...items].sort((a, b) => {
      const oldest = Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
      if (mode === 'oldest') return oldest;
      if (mode === 'pressure' && settings(category).pressure) return (pressure(b, category, time) ?? -1) - (pressure(a, category, time) ?? -1) || (dueDays(a, time) ?? Infinity) - (dueDays(b, time) ?? Infinity) || oldest;
      if (mode === 'due') return (dueDays(a, time) ?? Infinity) - (dueDays(b, time) ?? Infinity) || oldest;
      return -oldest;
    });
  }
  function validate(data) {
    if (!data || data.schemaVersion !== VERSION || !Array.isArray(data.categories) || !data.categories.length || data.categories.length > 200 || !Array.isArray(data.items) || data.items.length > 50000) throw new Error('対応するバックアップ形式ではありません。');
    const ids = new Set();
    for (const c of data.categories) {
      if (!c || !str(c.id, 100) || !c.id || ids.has(c.id) || !str(c.name, 30) || !c.name.trim() || !str(c.description, 160) || !/^#[\da-f]{6}$/i.test(c.color) || !dateOK(c.createdAt) || !dateOK(c.updatedAt)) throw new Error('箱のデータが正しくありません。');
      ids.add(c.id);
      if (c.settings !== undefined) {
        const s = c.settings;
        if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.pressure !== 'boolean' || !['age', 'deadline'].includes(s.basis) || !Number.isInteger(s.days) || s.days < 1 || s.days > 3650 || typeof s.motion !== 'boolean' || !['newest', 'oldest', 'due', 'pressure'].includes(s.sort)) throw new Error('カテゴリ設定が正しくありません。');
      }
    }
    const itemIds = new Set();
    for (const i of data.items) {
      if (!i || !str(i.id, 100) || !i.id || itemIds.has(i.id) || !str(i.title, 500) || !i.title.trim() || !str(i.note, 20000) || !ids.has(i.categoryId) || !['open', 'done'].includes(i.status) || !dateOK(i.createdAt) || !dateOK(i.updatedAt) || !(i.completedAt === null || dateOK(i.completedAt)) || (i.status === 'done' && !dateOK(i.completedAt))) throw new Error('項目のデータが正しくありません。');
      itemIds.add(i.id);
      if (i.dueDate !== undefined && i.dueDate !== null && !validDue(i.dueDate)) throw new Error('期限の日付が正しくありません。');
      if (i.nextStep !== undefined && !str(i.nextStep, 500)) throw new Error('次の一手が長すぎます。');
    }
    return data;
  }
  function merge(a, b) {
    validate(a); validate(b);
    const combine = (left, right) => {
      const map = new Map(left.map(v => [v.id, v]));
      for (const value of right) if (!map.has(value.id) || Date.parse(value.updatedAt) > Date.parse(map.get(value.id).updatedAt)) map.set(value.id, value);
      return [...map.values()];
    };
    return validate({ ...a, categories: combine(a.categories, b.categories), items: combine(a.items, b.items) });
  }
  const api = { VERSION, id, now, initial, validate, merge, settings, validDue, dueDays, pressure, sortItems };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Yohaku = api;
})(globalThis);
