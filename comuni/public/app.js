const find = id => document.getElementById(id);
const roomList = find('rooms');
const messageList = find('messages');
const conversation = find('conversation');
const messageInput = find('message');
const connection = find('connection');
const editor = find('editor');
const editValue = find('edit-value');
const notice = find('notice');
const inviteDialog = find('invite-dialog');
const general = { id: 'general', name: 'Общий чат' };

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current session also works with browser storage disabled.
  }
}

let name = readLocal('comuni.name', '') || 'Гость';
const rooms = new Map([[general.id, general]]);
for (const room of readLocal('comuni.rooms', [])) rooms.set(room.id, room);
let activeRoom;
let stream;
let navigation = 0;
let sending = false;
let editing;
const timeFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' });

async function request(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function roomURL(id) {
  const url = new URL('/', window.location.origin);
  if (id !== general.id) url.searchParams.set('room', id);
  return url;
}

function drawProfile() {
  find('display-name').textContent = name;
  find('initial').textContent = Array.from(name)[0].toUpperCase();
}

function setMenu(open) {
  find('sidebar').classList.toggle('open', open);
  find('menu').setAttribute('aria-expanded', open);
  find('menu').setAttribute('aria-label', open ? 'Скрыть комнаты' : 'Показать комнаты');
}

function drawRooms() {
  roomList.replaceChildren();
  for (const room of rooms.values()) {
    const link = document.createElement('a');
    link.className = 'room-link';
    link.href = roomURL(room.id);
    if (room.id === activeRoom?.id) link.setAttribute('aria-current', 'true');
    const icon = document.createElement('span');
    icon.textContent = '#';
    icon.className = 'hash';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = room.name;
    link.append(icon, label);
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(room.id);
    });
    roomList.append(link);
  }
}

function drawMessage(message) {
  const item = document.createElement('li');
  const meta = document.createElement('p');
  meta.className = 'message-meta';
  const author = document.createElement('strong');
  author.textContent = message.author;
  const time = document.createElement('time');
  time.dateTime = new Date(message.sent).toISOString();
  time.textContent = timeFormat.format(message.sent);
  const body = document.createElement('p');
  body.className = 'message-body';
  body.textContent = message.body;
  meta.append(author, time);
  item.append(meta, body);
  messageList.append(item);
}

function setConnection(message, online = false) {
  connection.textContent = message;
  connection.dataset.online = online;
  messageInput.disabled = !online;
  find('compose').querySelector('button').disabled = !online || sending;
}

function scrollToLatest() {
  conversation.scrollTop = conversation.scrollHeight;
}

async function openRoom(id) {
  const version = ++navigation;
  stream?.close();
  activeRoom = undefined;
  messageInput.value = '';
  find('invite').disabled = true;
  messageList.replaceChildren();
  find('welcome').hidden = true;
  notice.textContent = '';
  setConnection('Подключаемся…');
  try {
    if (!/^[a-z0-9-]{1,36}$/.test(id)) throw new Error('Комната не найдена.');
    const room = await request('/api/rooms/' + id);
    if (version !== navigation) return;
    activeRoom = room;
    rooms.set(id, room);
    writeLocal('comuni.rooms', [...rooms.values()].filter(entry => entry.id !== general.id));
    drawRooms();
    find('room-name').textContent = room.name;
    find('invite').disabled = false;

    const source = new EventSource('/api/rooms/' + id + '/events');
    stream = source;
    source.addEventListener('history', event => {
      if (version !== navigation) return;
      const messages = JSON.parse(event.data);
      messageList.replaceChildren();
      for (const message of messages) drawMessage(message);
      find('welcome').hidden = Boolean(messages.length);
      setConnection('На связи', true);
      scrollToLatest();
    });
    source.onmessage = event => {
      if (version !== navigation) return;
      const atBottom = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 60;
      find('welcome').hidden = true;
      drawMessage(JSON.parse(event.data));
      if (atBottom || sending) scrollToLatest();
    };
    source.onerror = () => {
      if (version === navigation) setConnection('Связь прервана · переподключаемся…');
    };
  } catch (error) {
    if (version !== navigation) return;
    find('room-name').textContent = 'Комната недоступна';
    setConnection('Нет подключения к комнате');
    notice.textContent = error.message;
    drawRooms();
  }
}

function navigate(id, updateHistory = true) {
  const url = roomURL(id);
  if (updateHistory && url.href !== location.href) history.pushState(null, '', url);
  setMenu(false);
  openRoom(id);
}

function currentRoom() {
  return new URLSearchParams(location.search).get('room') || general.id;
}

const compose = find('compose');
compose.addEventListener('submit', async event => {
  event.preventDefault();
  const room = activeRoom;
  const draft = messageInput.value;
  if (!room || !draft.trim() || sending) return;
  const version = navigation;
  sending = true;
  compose.querySelector('button').disabled = true;
  notice.textContent = '';
  try {
    await request('/api/rooms/' + room.id + '/messages', { author: name, body: draft });
    if (navigation === version && messageInput.value === draft) messageInput.value = '';
  } catch {
    if (navigation === version) notice.textContent = 'Сообщение не удалось отправить. Попробуй ещё раз.';
  } finally {
    sending = false;
    compose.querySelector('button').disabled = messageInput.disabled;
  }
});

messageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    compose.requestSubmit();
  }
});

function showEditor(mode) {
  editing = mode;
  const isRoom = mode === 'room';
  find('editor-title').textContent = isRoom ? 'Новая комната' : 'Мой профиль';
  find('edit-label').textContent = isRoom ? 'Название комнаты' : 'Имя в чате';
  find('save').textContent = isRoom ? 'Создать' : 'Сохранить';
  editValue.maxLength = isRoom ? 48 : 32;
  editValue.value = isRoom ? '' : name;
  find('edit-error').textContent = '';
  editor.showModal();
}

find('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const value = editValue.value.trim();
  if (!value) {
    find('edit-error').textContent = 'Введи хотя бы один символ.';
    return;
  }
  const save = find('save');
  save.disabled = true;
  try {
    if (editing === 'room') {
      const room = await request('/api/rooms', { name: value });
      if (editor.open) {
        editor.close();
        navigate(room.id);
      }
    } else {
      name = value;
      writeLocal('comuni.name', name);
      drawProfile();
      editor.close();
    }
  } catch (error) {
    find('edit-error').textContent = error.message;
  } finally {
    save.disabled = false;
  }
});

find('create').addEventListener('click', () => showEditor('room'));
find('profile').addEventListener('click', () => showEditor('profile'));
find('cancel').addEventListener('click', () => editor.close());
find('invite').addEventListener('click', () => {
  if (!activeRoom) return;
  find('invite-url').value = roomURL(activeRoom.id);
  find('copy-status').textContent = '';
  inviteDialog.showModal();
});
find('copy').addEventListener('click', async () => {
  const input = find('invite-url');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    find('copy-status').textContent = 'Ссылка скопирована.';
  } catch {
    find('copy-status').textContent = 'Ссылка выделена. Скопируй её вручную.';
  }
});
find('menu').addEventListener('click', () => setMenu(!find('sidebar').classList.contains('open')));
window.addEventListener('popstate', () => navigate(currentRoom(), false));
drawProfile();
drawRooms();
navigate(currentRoom(), false);
