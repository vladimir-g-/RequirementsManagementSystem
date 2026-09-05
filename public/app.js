const app = document.querySelector('#app');
const state = { user: null, projects: [], requirements: [], filters: { projectId: '', search: '', status: '' }, sort: { key: null, direction: 0 } };
let statuses = [];
let types = [];
let priorities = [];
let complexities = [];
let sortOrders = {};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(payload.error || 'Ошибка запроса');
  return payload;
}
function esc(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function optionList(values, selected) { return values.map((value) => `<option ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join(''); }
function badge(value) { const cls = value === 'Готово' ? 'done' : value === 'Критическая' || value === 'Высокая' ? 'high' : ''; return `<span class="badge ${cls}">${esc(value)}</span>`; }
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
  let html = esc(markdown).replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  return html ? `<p>${html}</p>`.replace(/<p>(<h[234]>)/g, '$1').replace(/(<\/h[234]>)<\/p>/g, '$1') : '<p class="muted">Предпросмотр появится здесь</p>';
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
  const files = ['statuses', 'priorities', 'complexities', 'types', 'projects'];
  const config = await Promise.all(files.map(async (name) => [name, await fetch(`/config/${name}.json`).then((response) => response.json())]));
  const values = Object.fromEntries(config);
  statuses = values.statuses;
  types = values.types;
  priorities = values.priorities;
  complexities = values.complexities;
  sortOrders = { priority: values.priorities.slice().reverse() };
  state.projects = values.projects;
}
async function loadApp() { await loadConfig(); state.filters.projectId = state.filters.projectId || state.projects[0]?.id || ''; await loadRequirements(); renderApp(); }
async function loadRequirements() { const params = new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value)); state.requirements = (await api(`/api/requirements?${params}`)).requirements; sortRequirements(); }
function renderApp() {
  app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand">RMS<span>.</span></div><div class="user"><span class="avatar">${esc((state.user.name || 'A')[0])}</span><span>${esc(state.user.name)}</span><button class="link-button" id="logout">Выйти</button></div></header><main class="content"><div class="heading"><div><p class="eyebrow">Рабочая область</p><h1>Требования</h1></div><div class="project-picker field"><label for="project">Активный проект</label><select id="project">${state.projects.map((item) => `<option value="${item.id}" ${item.id === state.filters.projectId ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div></div><div class="toolbar"><div class="field project-field"><label for="search">Поиск</label><input id="search" placeholder="Номер, описание или тип" value="${esc(state.filters.search)}"></div><div class="field"><label for="status-filter">Статус</label><select id="status-filter"><option value="">Все статусы</option>${statuses.map((value) => `<option ${value === state.filters.status ? 'selected' : ''}>${value}</option>`).join('')}</select></div><button class="clear" id="clear">Сбросить</button><button class="primary" id="add">+ Новое требование</button></div><div class="table-wrap"><table><thead><tr><th>Номер</th><th>Краткое описание</th><th>Тип</th><th>Важность</th><th>Сложность</th><th>Статус</th><th>Релиз</th><th></th></tr></thead><tbody>${state.requirements.length ? state.requirements.map((item) => `<tr><td>${esc(item.number)}</td><td class="description">${esc(item.description)}</td><td>${esc(item.type)}</td><td>${badge(item.priority)}</td><td>${badge(item.complexity)}</td><td>${badge(item.status)}</td><td>${esc(item.release)}</td><td><div class="actions"><button class="icon-button edit" data-id="${item.id}" title="Редактировать">✎</button><button class="icon-button delete" data-id="${item.id}" title="Удалить">×</button></div></td></tr>`).join('') : `<tr><td colspan="8" class="empty">В проекте пока нет требований</td></tr>`}</tbody></table></div></main></div>`;
    app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand">RMS<span>.</span></div><div class="user"><span class="avatar">${esc((state.user.name || 'A')[0])}</span><span>${esc(state.user.name)}</span><button class="link-button" id="logout">Выйти</button></div></header><main class="content"><div class="heading"><div><p class="eyebrow">Рабочая область</p><h1>Требования</h1></div><div class="project-picker field"><label for="project">Активный проект</label><select id="project">${state.projects.map((item) => `<option value="${item.id}" ${item.id === state.filters.projectId ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div></div><div class="toolbar"><div class="field project-field"><label for="search">Поиск</label><input id="search" placeholder="Номер, описание или тип" value="${esc(state.filters.search)}"></div><div class="field"><label for="status-filter">Статус</label><select id="status-filter"><option value="">Все статусы</option>${statuses.map((value) => `<option ${value === state.filters.status ? 'selected' : ''}>${value}</option>`).join('')}</select></div><button class="clear" id="clear">Сбросить</button><button class="primary" id="add">+ Новое требование</button></div><div class="table-wrap"><table><thead><tr><th>Номер</th><th>Краткое описание</th><th>Тип</th><th>Важность</th><th>Сложность</th><th>Статус</th><th>Релиз</th><th></th></tr></thead><tbody>${state.requirements.length ? state.requirements.map((item) => `<tr><td><button class="requirement-number edit" data-id="${item.id}" title="Открыть требование">${esc(item.number)}</button></td><td class="description">${esc(item.description)}</td><td>${esc(item.type)}</td><td>${badge(item.priority)}</td><td>${badge(item.complexity)}</td><td>${badge(item.status)}</td><td>${esc(item.release)}</td><td><div class="actions"><button class="icon-button edit" data-id="${item.id}" title="Редактировать">✎</button><button class="icon-button delete" data-id="${item.id}" title="Удалить">×</button></div></td></tr>`).join('') : `<tr><td colspan="8" class="empty">В проекте пока нет требований</td></tr>`}</tbody></table></div></main></div>`;
  document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; renderLogin(); };
  document.querySelector('#project').onchange = async (event) => { state.filters.projectId = event.target.value; await refresh(); };
  document.querySelector('#status-filter').onchange = async (event) => { state.filters.status = event.target.value; await refresh(); };
  document.querySelector('#search').oninput = debounce(async (event) => { state.filters.search = event.target.value; await refresh(); }, 250);
  document.querySelector('#clear').onclick = async () => { state.filters.search = ''; state.filters.status = ''; await refresh(); };
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
  const modal = document.querySelector('#modal'); const close = () => modal.remove(); document.querySelector('#close').onclick = close; document.querySelector('#cancel').onclick = close;
  const editor = document.querySelector('#details-markdown'); const preview = document.querySelector('#markdown-preview'); const updatePreview = () => { preview.innerHTML = markdownToHtml(editor.value); };
  editor.oninput = updatePreview; updatePreview();
  document.querySelectorAll('[data-mark]').forEach((button) => { button.onclick = () => { const marks = { bold: ['**', '**'], italic: ['_', '_'], heading: ['## ', ''], bullet: ['- ', ''], number: ['1. ', ''], code: ['`', '`'] }; wrapSelection(editor, ...marks[button.dataset.mark]); editor.focus(); }; });
  const previewToggle = document.querySelector('#preview-toggle');
  previewToggle.onclick = () => {
    const isPreviewVisible = preview.classList.toggle('visible');
    editor.classList.toggle('hidden', isPreviewVisible);
    previewToggle.textContent = isPreviewVisible ? 'Редактирование' : 'Предпросмотр';
    previewToggle.title = isPreviewVisible ? 'Редактирование' : 'Предпросмотр';
  };
  document.querySelector('#requirement-form').onsubmit = async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); body.projectId = item?.projectId || state.filters.projectId; try { await api(item ? `/api/requirements/${item.id}` : '/api/requirements', { method: item ? 'PUT' : 'POST', body: JSON.stringify(body) }); close(); await refresh(); } catch (error) { document.querySelector('#form-error').textContent = error.message; } };
}
async function deleteRequirement(id) { if (!confirm('Удалить это требование?')) return; await api(`/api/requirements/${id}`, { method: 'DELETE' }); await refresh(); }

(async () => { try { const result = await api('/api/auth/me'); if (result.user) { state.user = result.user; await loadApp(); } else renderLogin(); } catch { renderLogin('Сервер недоступен'); } })();
