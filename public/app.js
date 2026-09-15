import { api } from './modules/api.js';
import { loadConfig as fetchConfig } from './modules/config.js';

const app = document.querySelector('#app');
const state = { user: null, projects: [], requirements: [], releases: [], filters: { projectId: '', search: '', type: [], priority: [], status: [], complexity: [], release: [] }, sort: { key: null, direction: 0 } };
let statuses = [];
let types = [];
let priorities = [];
let complexities = [];
let sortOrders = {};
let filtersDirty = false;

function esc(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function optionList(values, selected) { return values.map((value) => `<option ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join(''); }
function multiOptionList(values, selected) { return values.map((value) => `<option value="${esc(value)}" ${selected.includes(value) ? 'selected' : ''}>${esc(value)}</option>`).join(''); }
function multiFilter(key, label, values) {
  const selected = state.filters[key];
  const summary = selected.length ? selected.length === 1 ? selected[0] : `Выбрано: ${selected.length}` : 'Все значения';
  return `<div class="field filter-field"><label>${label}</label><details class="multi-filter"><summary>${esc(summary)}<span aria-hidden="true">⌄</span></summary><div class="multi-filter-menu">${values.length ? values.map((value) => `<label class="filter-option"><input type="checkbox" data-filter="${key}" value="${esc(value)}" ${selected.includes(value) ? 'checked' : ''}><span>${esc(value)}</span></label>`).join('') : '<span class="filter-empty">Нет значений</span>'}</div></details></div>`;
}
document.addEventListener('click', (event) => {
  const openFilters = [...document.querySelectorAll('.multi-filter[open]')];
  const clickedInsideOpenFilter = openFilters.some((filter) => filter.contains(event.target));
  const clickedFilterSummary = event.target.closest('.multi-filter summary');
  const userMenu = document.querySelector('.user-menu[open]');
  const clickedInsideUserMenu = userMenu?.contains(event.target);
  if (userMenu && !clickedInsideUserMenu) userMenu.removeAttribute('open');
  if (clickedInsideOpenFilter && !clickedFilterSummary) return;
  openFilters.forEach((filter) => filter.removeAttribute('open'));
  if (filtersDirty) {
    filtersDirty = false;
    refresh();
  }
});
function badge(value) { const cls = value === 'Готово' ? 'done' : value === 'Критическая' || value === 'Высокая' ? 'high' : ''; return `<span class="badge ${cls}">${esc(value)}</span>`; }
function can(action) { return state.user?.role === 'Администратор' || Boolean(state.user?.permissions?.[action]); }
function sortRequirements() {
  if (!state.sort.key || !state.sort.direction) return;
  const key = state.sort.key;
  state.requirements.sort((first, second) => {
    const firstValue = String(first[key] ?? '');
    const secondValue = String(second[key] ?? '');
    if (sortOrders[key]) {
      const firstIndex = sortOrders[key].indexOf(firstValue);
      const secondIndex = sortOrders[key].indexOf(secondValue);
      const result = (firstIndex < 0 ? sortOrders[key].length : firstIndex) - (secondIndex < 0 ? sortOrders[key].length : secondIndex);
      return result * state.sort.direction;
    }
    const numericResult = Number(firstValue) - Number(secondValue);
    const result = firstValue !== '' && secondValue !== '' && Number.isFinite(numericResult) ? numericResult : firstValue.localeCompare(secondValue, 'ru', { numeric: true, sensitivity: 'base' });
    return result * state.sort.direction;
  });
}
function markdownToHtml(markdown = '') {
  if (!markdown.trim()) return '<p class="muted">Предпросмотр появится здесь</p>';
  const rawHtml = window.marked.parse(markdown, { breaks: true, gfm: true });
  return window.DOMPurify.sanitize(rawHtml);
}
function wrapSelection(textarea, before, after = before) {
  const start = textarea.selectionStart; const end = textarea.selectionEnd; const selected = textarea.value.slice(start, end) || 'текст';
  textarea.setRangeText(`${before}${selected}${after}`, start, end, 'select'); textarea.dispatchEvent(new Event('input'));
}
function renderLogin(error = '') {
  app.innerHTML = `<main class="auth-shell"><section class="auth-visual"><div class="brand">RMS<span>.</span></div><div><h1>Требования, которым можно доверять.</h1><p>Единое пространство для команд, решений и прозрачного жизненного цикла продукта.</p></div><div class="auth-footer">Requirements Management System · 2026</div></section><section class="auth-panel"><form class="auth-card" id="login-form"><h2>Добро пожаловать</h2><p class="sub">Войдите, чтобы продолжить работу</p><div class="field"><label for="username">Логин</label><input id="username" name="username" autocomplete="username" required value="admin"></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Введите пароль"></div>${error ? `<p class="error">${esc(error)}</p>` : ''}<button class="primary full">Войти в систему</button></form></section></main>`;
  document.querySelector('#login-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); state.user = result.user; await loadApp(); } catch (loginError) { renderLogin(loginError.message); } });
}
async function loadConfig() {
  const values = await fetchConfig(api);
  statuses = values.statuses;
  types = values.types;
  priorities = values.priorities;
  complexities = values.complexities;
  sortOrders = { priority: values.priorities.slice().reverse() };
  state.projects = (await api('/api/projects')).projects;
}
async function loadApp() { await loadConfig(); if (!state.projects.some((project) => project.id === state.filters.projectId)) state.filters.projectId = state.projects[0]?.id || ''; await loadRequirements(); renderApp(); }
async function loadRequirements() {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => Array.isArray(value) ? value.forEach((item) => params.append(key, item)) : value && params.set(key, value));
  const result = await api(`/api/requirements?${params}`);
  state.requirements = result.requirements;
  state.releases = result.releases || state.releases;
  sortRequirements();
}
function userMenu() {
  const adminLink = state.user.role === 'Администратор' ? '<button type="button" id="users-link">Пользователи и права</button>' : '';
  return `<details class="user-menu"><summary><span class="avatar">${esc((state.user.name || 'A')[0])}</span><span>${esc(state.user.name)}</span><span class="menu-chevron" aria-hidden="true">⌄</span></summary><div class="user-menu-list"><button type="button" id="profile-link">Профиль</button>${adminLink}<button type="button" id="logout">Выйти</button></div></details>`;
}
function projectPicker() {
  return `<div class="topbar-project field"><label for="project">Активный проект</label><select id="project">${state.projects.map((item) => `<option value="${item.id}" ${item.id === state.filters.projectId ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div>`;
}
function bindUserMenu() {
  document.querySelector('#profile-link').onclick = () => renderProfile();
  document.querySelector('#users-link')?.addEventListener('click', () => renderUsers());
  document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; renderLogin(); };
}
function bindProjectPicker() {
  document.querySelector('#project').onchange = async (event) => { state.filters.projectId = event.target.value; await refresh(); };
}
function renderProfile() {
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="topbar-start"><div class="brand">RMS<span>.</span></div>${projectPicker()}</div>${userMenu()}</header><main class="content profile-content"><div class="profile-heading"><div><p class="eyebrow">Личная информация</p><h1>Профиль пользователя</h1></div><button class="clear" id="back-to-requirements">К требованиям</button></div><section class="profile-card"><div class="profile-avatar">${esc((state.user.name || 'A')[0])}</div><div class="profile-details"><div><span class="profile-label">Имя</span><strong>${esc(state.user.name)}</strong></div><div><span class="profile-label">Логин</span><strong>${esc(state.user.username)}</strong></div><div><span class="profile-label">Идентификатор</span><strong>${esc(state.user.id)}</strong></div></div></section></main></div>`;
  bindUserMenu();
  bindProjectPicker();
  document.querySelector('#back-to-requirements').onclick = () => renderApp();
}
function renderAccessDenied(message = 'У вашей учетной записи нет права просматривать требования.') {
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="topbar-start"><div class="brand">RMS<span>.</span></div>${projectPicker()}</div>${userMenu()}</header><main class="content"><section class="access-denied"><p class="eyebrow">Доступ ограничен</p><h1>Недостаточно прав</h1><p>${esc(message)}</p></section></main></div>`;
  bindUserMenu(); bindProjectPicker();
}
async function renderUsers() {
  const result = await api('/api/users');
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="topbar-start"><div class="brand">RMS<span>.</span></div>${projectPicker()}</div>${userMenu()}</header><main class="content"><div class="profile-heading"><div><p class="eyebrow">Администрирование</p><h1>Пользователи и права</h1></div><button class="primary" id="add-user">+ Новый пользователь</button></div><div class="table-wrap"><table class="users-table"><thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Проекты</th><th>Права</th><th></th></tr></thead><tbody>${result.users.map((item) => `<tr><td class="description">${esc(item.name)}</td><td>${esc(item.username)}</td><td><span class="badge">${esc(item.role)}</span></td><td>${item.role === 'Администратор' ? 'Все проекты' : item.projectIds.map((id) => esc(state.projects.find((project) => project.id === id)?.code || id)).join(', ') || 'Не назначены'}</td><td>${item.role === 'Администратор' ? 'Полный доступ' : Object.entries(item.permissions).filter(([, enabled]) => enabled).map(([name]) => ({ create: 'Создание', read: 'Просмотр', update: 'Изменение', delete: 'Удаление' }[name])).join(', ') || 'Нет прав'}</td><td><div class="actions"><button class="icon-button user-edit" data-id="${item.id}" title="Редактировать">✎</button><button class="icon-button delete user-delete" data-id="${item.id}" title="Удалить">×</button></div></td></tr>`).join('')}</tbody></table></div></main></div>`;
  bindUserMenu(); bindProjectPicker();
  document.querySelector('#add-user').onclick = () => openUserModal();
  document.querySelectorAll('.user-edit').forEach((button) => { button.onclick = () => openUserModal(result.users.find((item) => item.id === button.dataset.id)); });
  document.querySelectorAll('.user-delete').forEach((button) => { button.onclick = () => deleteUser(button.dataset.id); });
}
function openUserModal(item = null) {
  const permissionLabels = { create: 'Создание требований', read: 'Просмотр требований', update: 'Изменение требований', delete: 'Удаление требований' };
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="user-modal"><form class="modal user-modal" id="user-form"><div class="modal-header"><div><p class="eyebrow">${item ? 'Редактирование' : 'Новая запись'}</p><h2>${item ? 'Изменить пользователя' : 'Добавить пользователя'}</h2></div><button type="button" class="close" id="user-close">×</button></div><div class="form-grid"><div class="field"><label>Имя *</label><input name="name" required value="${esc(item?.name || '')}"></div><div class="field"><label>Логин *</label><input name="username" required value="${esc(item?.username || '')}"></div><div class="field"><label>Роль *</label><select name="role" id="user-role"><option ${item?.role === 'Администратор' ? 'selected' : ''}>Администратор</option><option ${item?.role !== 'Администратор' ? 'selected' : ''}>Пользователь</option></select></div><div class="field"><label>Пароль ${item ? '' : '*'}</label><input name="password" type="password" ${item ? '' : 'required'} placeholder="${item ? 'Оставьте пустым без изменений' : 'Введите пароль'}"></div><div class="field wide user-access-section"><label>Доступные проекты</label><div class="check-grid">${state.projects.map((project) => `<label class="permission-option"><input type="checkbox" name="projectIds" value="${project.id}" ${item?.projectIds.includes(project.id) ? 'checked' : ''}><span>${esc(project.code)} · ${esc(project.name)}</span></label>`).join('')}</div></div><div class="field wide user-access-section"><label>Права на требования</label><div class="check-grid">${Object.entries(permissionLabels).map(([key, label]) => `<label class="permission-option"><input type="checkbox" name="permission-${key}" ${item?.permissions[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></div></div><p class="error" id="user-form-error"></p><div class="modal-actions"><button type="button" class="cancel" id="user-cancel">Отмена</button><button class="primary">${item ? 'Сохранить изменения' : 'Создать пользователя'}</button></div></form></div>`);
  const modal = document.querySelector('#user-modal'); const close = () => modal.remove(); document.querySelector('#user-close').onclick = close; document.querySelector('#user-cancel').onclick = close;
  const role = document.querySelector('#user-role'); const accessSections = document.querySelectorAll('.user-access-section'); const updateAccessVisibility = () => accessSections.forEach((section) => { section.hidden = role.value === 'Администратор'; }); role.onchange = updateAccessVisibility; updateAccessVisibility();
  document.querySelector('#user-form').onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = { name: form.get('name'), username: form.get('username'), role: form.get('role'), password: form.get('password'), projectIds: form.getAll('projectIds'), permissions: Object.fromEntries(Object.keys(permissionLabels).map((key) => [key, form.has(`permission-${key}`)])) }; try { await api(item ? `/api/users/${item.id}` : '/api/users', { method: item ? 'PUT' : 'POST', body: JSON.stringify(body) }); close(); await renderUsers(); } catch (error) { document.querySelector('#user-form-error').textContent = error.message; } };
}
async function deleteUser(id) { if (!confirm('Удалить пользователя?')) return; try { await api(`/api/users/${id}`, { method: 'DELETE' }); await renderUsers(); } catch (error) { alert(error.message); } }
function renderApp() {
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="topbar-start"><div class="brand">RMS<span>.</span></div>${projectPicker()}</div>${userMenu()}</header><main class="content"><div class="heading"><div><h1>Требования</h1></div></div><div class="toolbar"><div class="field project-field"><label for="search">Поиск</label><input id="search" placeholder="Номер, описание или тип" value="${esc(state.filters.search)}"></div>${multiFilter('type', 'Тип', types)}${multiFilter('priority', 'Важность', priorities)}${multiFilter('complexity', 'Сложность', complexities)}${multiFilter('status', 'Статус', statuses)}${multiFilter('release', 'Релиз', state.releases)}<button class="clear" id="clear">Сбросить</button>${can('create') ? '<button class="primary" id="add">+ Новое требование</button>' : ''}</div><div class="table-wrap"><table><thead><tr><th>Номер</th><th>Краткое описание</th><th>Тип</th><th>Важность</th><th>Сложность</th><th>Статус</th><th>Релиз</th><th></th></tr></thead><tbody>${state.requirements.length ? state.requirements.map((item) => `<tr><td>${can('update') ? `<button class="requirement-number edit" data-id="${item.id}" title="Редактировать требование">${esc(item.number)}</button>` : esc(item.number)}</td><td class="description">${esc(item.description)}</td><td>${esc(item.type)}</td><td>${badge(item.priority)}</td><td>${badge(item.complexity)}</td><td>${badge(item.status)}</td><td>${esc(item.release)}</td><td><div class="actions">${can('update') ? `<button class="icon-button edit" data-id="${item.id}" title="Редактировать">✎</button>` : ''}${can('delete') ? `<button class="icon-button delete" data-id="${item.id}" title="Удалить">×</button>` : ''}</div></td></tr>`).join('') : `<tr><td colspan="8" class="empty">В проекте пока нет требований</td></tr>`}</tbody></table></div></main></div>`;
  bindUserMenu();
  bindProjectPicker();
  document.querySelectorAll('[data-filter]').forEach((checkbox) => {
    checkbox.onchange = async (event) => {
      const key = event.target.dataset.filter;
      state.filters[key] = [...document.querySelectorAll(`[data-filter="${key}"]:checked`)].map((option) => option.value);
      filtersDirty = true;
    };
  });
  document.querySelector('#search').oninput = debounce(async (event) => { state.filters.search = event.target.value; await refresh(); }, 250);
  document.querySelector('#clear').onclick = async () => { filtersDirty = false; state.filters.search = ''; state.filters.type = []; state.filters.priority = []; state.filters.status = []; state.filters.complexity = []; state.filters.release = []; await refresh(); };
  document.querySelector('#add').onclick = () => openModal();
  document.querySelectorAll('.edit').forEach((button) => { button.onclick = () => openModal(state.requirements.find((item) => item.id === button.dataset.id)); });
  document.querySelectorAll('.delete').forEach((button) => { button.onclick = () => deleteRequirement(button.dataset.id); });
  const sortKeys = ['number', 'description', 'type', 'priority', 'complexity', 'status', 'release'];
  document.querySelectorAll('th').forEach((header, index) => {
    const key = sortKeys[index];
    if (!key) return;
    header.classList.add('sortable');
    header.title = 'Сортировать';
    const label = header.textContent;
    header.innerHTML = `<span>${label}</span><span class="sort-icon" aria-hidden="true">${state.sort.key === key && state.sort.direction === 1 ? '↑' : state.sort.key === key && state.sort.direction === -1 ? '↓' : '⇅'}</span>`;
    header.onclick = () => {
      state.sort.direction = state.sort.key === key ? (state.sort.direction === 1 ? -1 : state.sort.direction === -1 ? 0 : 1) : 1;
      state.sort.key = state.sort.direction ? key : null;
      sortRequirements();
      renderApp();
    };
  });
}
async function refresh() { await loadRequirements(); renderApp(); }
function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
function openModal(item = null) {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal"><form class="modal" id="requirement-form"><div class="modal-header"><div><p class="eyebrow">${item ? 'Редактирование' : 'Новая запись'}</p><h2>${item ? 'Изменить требование' : 'Добавить требование'}</h2></div><button type="button" class="close" id="close">×</button></div><div class="form-grid"><div class="field"><label>Номер</label><input name="number" value="${esc(item?.number || '')}" placeholder="Автоматически"></div><div class="field"><label>Краткое описание *</label><input name="description" required value="${esc(item?.description || '')}"></div><div class="field wide"><label>Детальное описание</label><div class="markdown-editor"><div class="markdown-toolbar"><button type="button" data-mark="bold" title="Жирный">B</button><button type="button" data-mark="italic" title="Курсив"><i>I</i></button><button type="button" data-mark="heading" title="Заголовок">H</button><button type="button" data-mark="bullet" title="Список">•</button><button type="button" data-mark="number" title="Нумерованный список">1.</button><button type="button" data-mark="code" title="Код">&lt;/&gt;</button><button type="button" id="preview-toggle" title="Предпросмотр">Предпросмотр</button></div><textarea id="details-markdown" name="detailsMarkdown" rows="8" placeholder="Опишите требование подробно в Markdown...">${esc(item?.detailsMarkdown || '')}</textarea><div id="markdown-preview" class="markdown-preview"></div></div></div><div class="field"><label>Тип требования *</label><select name="type" required><option value="">Выберите тип</option>${optionList(types, item?.type)}</select></div><div class="field"><label>Важность *</label><select name="priority" required><option value="">Выберите важность</option>${optionList(priorities, item?.priority)}</select></div><div class="field"><label>Сложность</label><select name="complexity"><option value="">Не указана</option>${optionList(complexities, item?.complexity)}</select></div><div class="field"><label>Статус *</label><select name="status" required>${optionList(statuses, item?.status || statuses[0])}</select></div><div class="field"><label>Номер релиза</label><input name="release" value="${esc(item?.release || '')}" placeholder="Например, 2.1"></div></div><p class="error" id="form-error"></p><div class="modal-actions"><button type="button" class="cancel" id="cancel">Отмена</button><button class="primary">${item ? 'Сохранить изменения' : 'Создать требование'}</button></div></form></div>`);
  const modal = document.querySelector('#modal'); const close = () => modal.remove(); document.querySelector('#close').onclick = close; document.querySelector('#cancel').onclick = close; document.querySelector('input[name="number"]').readOnly = true;
  const editor = document.querySelector('#details-markdown'); const preview = document.querySelector('#markdown-preview'); const updatePreview = () => { preview.innerHTML = markdownToHtml(editor.value); };
  const previewToggle = document.querySelector('#preview-toggle');
  const setPreviewMode = (isPreviewVisible) => {
    preview.classList.toggle('visible', isPreviewVisible);
    editor.classList.toggle('hidden', isPreviewVisible);
    previewToggle.textContent = isPreviewVisible ? 'Редактирование' : 'Предпросмотр';
    previewToggle.title = isPreviewVisible ? 'Редактирование' : 'Предпросмотр';
  };
  editor.oninput = updatePreview;
  editor.onfocus = () => setPreviewMode(false);
  editor.onblur = () => setPreviewMode(true);
  preview.onclick = () => { setPreviewMode(false); editor.focus(); };
  updatePreview();
  setPreviewMode(true);
  document.querySelectorAll('[data-mark]').forEach((button) => { button.onclick = () => { const marks = { bold: ['**', '**'], italic: ['_', '_'], heading: ['## ', ''], bullet: ['- ', ''], number: ['1. ', ''], code: ['`', '`'] }; wrapSelection(editor, ...marks[button.dataset.mark]); editor.focus(); }; });
  previewToggle.onmousedown = (event) => event.preventDefault();
  previewToggle.onclick = () => {
    const isPreviewVisible = !preview.classList.contains('visible');
    setPreviewMode(isPreviewVisible);
    if (!isPreviewVisible) editor.focus();
  };
  document.querySelector('#requirement-form').onsubmit = async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); body.projectId = item?.projectId || state.filters.projectId; try { await api(item ? `/api/requirements/${item.id}` : '/api/requirements', { method: item ? 'PUT' : 'POST', body: JSON.stringify(body) }); close(); await refresh(); } catch (error) { document.querySelector('#form-error').textContent = error.message; } };
}
async function deleteRequirement(id) { if (!confirm('Удалить это требование?')) return; await api(`/api/requirements/${id}`, { method: 'DELETE' }); await refresh(); }

(async () => { try { const result = await api('/api/auth/me'); if (result.user) { state.user = result.user; await loadApp(); } else renderLogin(); } catch (error) { if (error.status === 403) renderAccessDenied(error.message); else renderLogin('Сервер недоступен'); } })();
