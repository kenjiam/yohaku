'use strict';
const M = Yohaku;
const KEY = 'yohaku.data.v1';
const $ = selector => document.querySelector(selector);
let state, storageBlocked = false, activeCategory, history = false, editingItem, editingCategory, encounterId, toastTimer;
try {
  const saved = localStorage.getItem(KEY);
  state = saved ? M.validate(JSON.parse(saved)) : M.initial();
} catch (error) {
  storageBlocked = true;
  state = M.initial();
}
activeCategory = state.categories[0].id;
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(text, className, action) {
  const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el;
}
function toast(message, undo, persistent = false) {
  clearTimeout(toastTimer);
  $('#toast span').textContent = message;
  const btn = $('#toast button'); btn.hidden = !undo; btn.onclick = () => { undo(); $('#toast').hidden = true; };
  $('#toast').hidden = false;
  if (!persistent) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, undo ? 12000 : 5500);
}
function commit(next) {
  if (storageBlocked) { toast('保存データを保護するため編集を停止中です。設定から元データを書き出してください。', null, true); return false; }
  try { M.validate(next); localStorage.setItem(KEY, JSON.stringify(next)); }
  catch (error) { toast('保存できませんでした。空き容量やブラウザの保存設定を確認してください。', null, true); return false; }
  state = next; render(); return true;
}
function mutate(fn) { const next = structuredClone(state); fn(next); return commit(next); }
function relative(date) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 86400000));
  if (!days) return '今日'; if (days === 1) return '昨日'; if (days < 30) return `${days}日前`; if (days < 365) return `${Math.floor(days / 30)}か月前`; return `${Math.floor(days / 365)}年前`;
}
const categoryFor = item => state.categories.find(c => c.id === item.categoryId);
function chooseEncounter() {
  const candidates = state.items.filter(i => i.status === 'open' && i.id !== encounterId);
  if (!candidates.length) return;
  // Older ideas gently surface more often, without hiding recent ones.
  const weights = candidates.map(i => 1 + Math.min(12, Math.max(0, (Date.now() - Date.parse(i.createdAt)) / 86400000) / 7));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  encounterId = candidates[candidates.length - 1].id;
  for (let n = 0; n < candidates.length; n++) { pick -= weights[n]; if (pick <= 0) { encounterId = candidates[n].id; break; } }
}
function renderEncounter() {
  const target = $('#encounter'); target.replaceChildren();
  if (!state.items.some(i => i.id === encounterId && i.status === 'open')) chooseEncounter();
  const item = state.items.find(i => i.id === encounterId && i.status === 'open');
  target.hidden = !item;
  if (!item) return;
  target.append(node('p', 'eyebrow', 'ピックアップ'));
  target.append(node('h2', '', item.title));
  const bottom = node('div', 'encounter-bottom');
  bottom.append(node('p', '', `${categoryFor(item).name} · ${relative(item.createdAt)}に追加`));
  const actions = node('div', 'encounter-actions');
  actions.append(button('別の項目 ↻', 'quiet', () => { chooseEncounter(); renderEncounter(); }), button('開く', 'secondary', () => openItem(item.id)));
  bottom.append(actions); target.append(bottom);
}
function balloon(value, color, motion = false) {
  const slot = node('div', 'balloon-slot');
  slot.style.setProperty('--balloon-color', color);
  slot.style.setProperty('--balloon-size', (20 + 42 * value) + 'px');
  slot.classList.toggle('sway', motion);
  slot.classList.toggle('full', value >= 1);
  slot.setAttribute('role', 'img'); slot.setAttribute('aria-label', '風船 ' + Math.round(value * 100) + '%');
  slot.title = slot.getAttribute('aria-label');
  slot.append(node('span', 'balloon')); return slot;
}
function dueLabel(item) {
  const days = M.dueDays(item);
  return days === null ? '' : days < 0 ? Math.abs(days) + '日超過 · ' + item.dueDate : days === 0 ? '今日が期限' : days === 1 ? '明日が期限' : item.dueDate + ' · あと' + days + '日';
}
function render() {
  if (!state.categories.some(c => c.id === activeCategory)) activeCategory = state.categories[0].id;
  const category = state.categories.find(c => c.id === activeCategory);
  document.documentElement.style.setProperty('--accent', category.color);
  const tabs = $('#categories'); tabs.replaceChildren();
  for (const c of state.categories) {
    const tab = button('', 'tab', () => { activeCategory = c.id; history = false; render(); });
    tab.style.setProperty('--box-color', c.color); tab.setAttribute('aria-pressed', String(!history && c.id === activeCategory));
    tab.append(node('span', 'tab-name', c.name), node('span', 'tab-count', String(state.items.filter(i => i.categoryId === c.id && i.status === 'open').length)));
    tabs.append(tab);
  }
  const add = button('＋', 'tab add-tab', () => openCategory()); add.setAttribute('aria-label', '箱を追加'); tabs.append(add);
  $('#box-title').textContent = category.name; $('#box-description').textContent = category.description;
  $('#box-view').hidden = history; $('#history-toggle').textContent = history ? '一覧に戻る' : '完了履歴'; $('#history-toggle').setAttribute('aria-pressed', String(history));
  const config = M.settings(category);
  const filtered = state.items.filter(i => history ? i.status === 'done' : i.status === 'open' && i.categoryId === activeCategory);
  const items = history ? filtered.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)) : M.sortItems(filtered, category);
  $('#sort-controls').hidden = history;
  $('#item-sort option[value=pressure]').disabled = !config.pressure;
  $('#item-sort').value = config.sort === 'pressure' && !config.pressure ? 'newest' : config.sort;
  $('#list-heading').replaceChildren(node('span', '', history ? '完了履歴' : '未完了'), node('span', '', `${items.length}件`));
  const list = $('#items'); list.replaceChildren();
  if (!items.length) {
    const empty = node('div', 'empty'); empty.append(node('p', '', history ? '完了した項目はありません。' : '項目はありません。'));
    if (!history) empty.append(button('追加する', 'secondary', () => $('#capture-title').focus()));
    list.append(empty);
  }
  for (const item of items) {
    const card = node('article', 'item'); card.dataset.id = item.id;
    const value = M.pressure(item, category);
    if (!history && value !== null) {
      card.classList.add('pressure-item');
      if (value >= 1) card.classList.add('pressure-full');
      card.append(balloon(value, category.color, config.motion));
    }
    const body = button('', 'item-body', () => openItem(item.id));
    body.append(node('span', 'item-title', item.title));
    if (!history && item.nextStep) body.append(node('span', 'next-step', '次：' + item.nextStep));
    if (item.note) body.append(node('span', 'item-note', item.note));
    body.append(node('span', 'item-meta', history ? `${categoryFor(item).name} · ${relative(item.completedAt)}に完了` : `${relative(item.createdAt)}に追加${item.note ? ' · メモあり' : ''}`));
    if (item.dueDate) body.append(node('span', 'due-badge' + (!history && M.dueDays(item) < 0 ? ' overdue' : ''), history ? '期限 ' + item.dueDate : dueLabel(item)));
    if (!history && config.pressure && config.basis === 'deadline' && !item.dueDate) body.append(node('span', 'item-meta', '期限未設定'));
    const done = button(history ? '箱に戻す' : '完了 ✓', 'done-button', () => setDone(item.id, !history));
    done.setAttribute('aria-label', `${item.title}を${history ? '箱に戻す' : '完了にする'}`);
    card.append(body, done); list.append(card);
  }
  renderEncounter();
}
function setDone(id, done) {
  const previous = structuredClone(state.items.find(i => i.id === id));
  const slot = [...document.querySelectorAll('.item')].find(el => el.dataset.id === id)?.querySelector('.balloon-slot');
  const rect = slot?.getBoundingClientRect();
  const ghost = done && slot ? slot.cloneNode(true) : null;
  if (mutate(next => { const i = next.items.find(i => i.id === id); i.status = done ? 'done' : 'open'; i.completedAt = done ? M.now() : null; i.updatedAt = M.now(); })) {
    if (ghost && rect && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ghost.className = 'balloon-slot balloon-pop';
      Object.assign(ghost.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', zIndex: '20', pointerEvents: 'none' });
      ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost); setTimeout(() => ghost.remove(), 450);
    }
    toast(done ? '完了にしました。' : '未完了に戻しました。', () => mutate(next => { const index = next.items.findIndex(i => i.id === id); if (index >= 0) next.items[index] = { ...previous, updatedAt: M.now() }; }));
  }
}
function openItem(id) {
  const item = state.items.find(i => i.id === id); if (!item) return;
  editingItem = id; $('#item-title').value = item.title; $('#item-note').value = item.note;
  $('#item-category').replaceChildren(...state.categories.map(c => { const option = node('option', '', c.name); option.value = c.id; return option; }));
  $('#item-category').value = item.categoryId;
  $('#item-due').value = item.dueDate || ''; $('#item-next').value = item.nextStep || '';
  $('#item-date').textContent = `${new Date(item.createdAt).toLocaleDateString('ja-JP')} に追加`;
  $('#item-dialog').showModal();
}
function openCategory(id) {
  editingCategory = id;
  const c = state.categories.find(c => c.id === id);
  $('#category-name').value = c?.name || ''; $('#category-description').value = c?.description || ''; $('#category-color').value = c?.color || '#64846b';
  $('#category-delete').hidden = !c; $('#category-delete').disabled = state.categories.length === 1;
  const config = M.settings(c || { id: '' });
  $('#category-pressure').checked = config.pressure; $('#pressure-basis').value = config.basis;
  $('#pressure-days').value = config.days; $('#pressure-motion').checked = config.motion; $('#category-sort').value = config.sort;
  updatePressureOptions(); $('#category-dialog').showModal();
}
$('#capture').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#capture-title'); const title = input.value.trim(); if (!title) { input.focus(); return; }
  const date = M.now();
  if (mutate(next => next.items.push({ id: M.id(), categoryId: activeCategory, title, note: '', status: 'open', createdAt: date, updatedAt: date, completedAt: null, metadata: {} }))) { input.value = ''; input.focus(); }
});
function updatePressureOptions() {
  const enabled = $('#category-pressure').checked;
  $('#pressure-options').hidden = !enabled; $('#pressure-days').disabled = !enabled;
  $('#category-sort option[value=pressure]').disabled = !enabled;
  if (!enabled && $('#category-sort').value === 'pressure') $('#category-sort').value = 'newest';
  const deadline = $('#pressure-basis').value === 'deadline';
  $('#pressure-days-label').textContent = deadline ? '期限の何日前から膨らむか' : '最大になるまでの日数';
  $('#pressure-help').textContent = deadline ? '期限当日に最大になります。期限なしの項目は風船を表示せず、大きい順では末尾になります。' : '期限がある項目は期限を優先し、設定日数前から膨らんで期限当日に最大になります。期限がない項目は登録日からの日数で膨らみます。';
  $('#pressure-preview').replaceChildren(...[0, .5, 1].map(value => {
    const example = node('div'); example.append(balloon(value, $('#category-color').value, $('#pressure-motion').checked), node('span', 'muted', value === 0 ? '開始' : value === 1 ? '最大' : '途中')); return example;
  }));
}
['#category-pressure', '#pressure-basis', '#pressure-motion', '#category-color'].forEach(selector => $(selector).addEventListener('input', updatePressureOptions));
$('#due-clear').onclick = () => { $('#item-due').value = ''; };
$('#item-sort').onchange = event => {
  const sort = event.target.value;
  if (!mutate(next => { const c = next.categories.find(c => c.id === activeCategory); c.settings = { ...M.settings(c), sort }; c.updatedAt = M.now(); })) render();
};
$('#history-toggle').onclick = () => { history = !history; render(); };
$('#category-edit').onclick = () => openCategory(activeCategory);
$('#settings-open').onclick = () => $('#settings-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => btn.closest('dialog').close());
$('#item-form').onsubmit = event => {
  event.preventDefault(); const title = $('#item-title').value.trim(); if (!title) return;
  if (mutate(next => { const item = next.items.find(i => i.id === editingItem); if (item) Object.assign(item, { title, note: $('#item-note').value, categoryId: $('#item-category').value, dueDate: $('#item-due').value || null, nextStep: $('#item-next').value.trim(), updatedAt: M.now() }); })) $('#item-dialog').close();
};
$('#item-delete').onclick = () => {
  const item = structuredClone(state.items.find(i => i.id === editingItem));
  if (mutate(next => { next.items = next.items.filter(i => i.id !== editingItem); })) {
    $('#item-dialog').close(); toast('項目を削除しました。', () => mutate(next => { if (!next.categories.some(c => c.id === item.categoryId)) item.categoryId = next.categories[0].id; next.items.push({ ...item, updatedAt: M.now() }); }));
  }
};
$('#category-form').onsubmit = event => {
  event.preventDefault(); const name = $('#category-name').value.trim(); if (!name) return;
  const id = editingCategory || M.id(), date = M.now();
  if (mutate(next => { const values = { name, description: $('#category-description').value, color: $('#category-color').value, settings: { ...M.settings(next.categories.find(c => c.id === id) || { id }), pressure: $('#category-pressure').checked, basis: $('#pressure-basis').value, days: $('#category-pressure').checked ? Number($('#pressure-days').value) : M.settings(next.categories.find(c => c.id === id) || { id }).days, motion: $('#pressure-motion').checked, sort: $('#category-sort').value }, updatedAt: date }; const c = next.categories.find(c => c.id === id); if (c) Object.assign(c, values); else next.categories.push({ id, createdAt: date, ...values }); })) { activeCategory = id; history = false; render(); $('#category-dialog').close(); }
};
$('#category-delete').onclick = () => {
  if (state.categories.length <= 1) return;
  const destination = state.categories.find(c => c.id !== editingCategory);
  const count = state.items.filter(i => i.categoryId === editingCategory).length;
  if (!confirm(count ? `この箱を削除し、中身${count}件（完了分を含む）を「${destination.name}」へ移しますか？` : 'この空の箱を削除しますか？')) return;
  if (mutate(next => { next.categories = next.categories.filter(c => c.id !== editingCategory); next.items.forEach(i => { if (i.categoryId === editingCategory) { i.categoryId = destination.id; i.updatedAt = M.now(); } }); })) $('#category-dialog').close();
};
$('#export').onclick = () => {
  let data;
  try { data = storageBlocked ? localStorage.getItem(KEY) : JSON.stringify({ ...state, exportedAt: M.now() }, null, 2); } catch { toast('保存領域を読み出せません。ブラウザの設定を確認してください。'); return; }
  if (!data) { toast('書き出せる保存データがありません。'); return; }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = node('a'); a.href = url; a.download = `yohaku${storageBlocked ? '-recovery' : ''}-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('ファイルは20MB以内にしてください。');
    const imported = M.validate(JSON.parse(await file.text()));
    const merged = M.merge(state, imported);
    if (commit(merged)) toast('バックアップを読み込みました。');
  } catch (error) { toast(error instanceof SyntaxError ? 'JSONを読み取れませんでした。元のデータは変更していません。' : error.message); }
  finally { event.target.value = ''; }
};
// A second tab must not silently overwrite edits made in the first one.
window.addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  try {
    const raw = localStorage.getItem(KEY); state = raw ? M.validate(JSON.parse(raw)) : M.initial(); storageBlocked = false;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); render(); toast('別のタブの変更を反映しました。');
  } catch { storageBlocked = true; toast('保存データを読み込めません。元データを保護しています。', null, true); }
});
render();
if (storageBlocked) toast('保存データを読み込めません。編集を停止しています。設定から元データを書き出せます。', null, true);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});

// Refresh elapsed time after returning to the app without interrupting an edit.
function refreshTime() { if (!document.hidden && !document.querySelector('dialog[open]')) render(); }
document.addEventListener('visibilitychange', refreshTime);
setInterval(refreshTime, 60000);
