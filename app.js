const byId = id => document.getElementById(id);
const canvas = byId('board');
const ctx = canvas.getContext('2d');
const slots = byId('slots');
const instructions = byId('instructions');
const dropButton = byId('drop');
const storageKey = 'plinko-save-v1';
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const costs = [10, 25, 50];
const rowCounts = [8, 12, 16];
const profiles = {
  calm: { label: 'Низкий', values: [0.7, 0.9, 1, 1.2, 1.5, 2, 3, 5, 8] },
  swing: { label: 'Средний', values: [0.4, 0.7, 1.1, 1.4, 2, 4, 7, 14, 25] },
  bold: { label: 'Высокий', values: [0.1, 0.4, 0.8, 1.4, 2.5, 5, 12, 30, 60] }
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

const saved = load();
let balance = Number.isFinite(saved.balance) && saved.balance >= 0 ? saved.balance : 1000;
let history = Array.isArray(saved.history) ? saved.history.slice(0, 8) : [];
let rows = rowCounts.includes(saved.rows) ? saved.rows : 12;
let risk = Object.hasOwn(profiles, saved.risk) ? saved.risk : 'swing';
let cost = costs.includes(saved.cost) ? saved.cost : 25;
let sound = saved.sound === true;
let animation = null;
let highlighted = -1;
let audio;

if (saved.pending && Number.isFinite(saved.pending.reward) && saved.pending.reward >= 0) {
  balance += saved.pending.reward;
  history = [saved.pending.multiplier, ...history].slice(0, 8);
}

function persist() {
  const pending = animation && { reward: animation.reward, multiplier: animation.multiplier };
  try {
    localStorage.setItem(storageKey, JSON.stringify({ balance, history, rows, risk, cost, sound, pending }));
  } catch {
    // Play still works when browser storage is unavailable.
  }
}

function multiplierText(value) {
  return '×' + number.format(value);
}

function multipliers() {
  const half = rows / 2;
  const values = profiles[risk].values;
  return Array.from({ length: rows + 1 }, (_, index) => {
    const distance = Math.abs(index - half);
    return values[Math.round(distance * (values.length - 1) / half)];
  });
}

function refreshSlots() {
  slots.replaceChildren(...multipliers().map(multiplier => {
    const slot = document.createElement('span');
    slot.className = 'slot';
    slot.textContent = multiplierText(multiplier);
    slot.style.backgroundColor = multiplier >= 10 ? '#f6a2e3' :
      multiplier >= 3 ? '#d5afff' :
      multiplier >= 1 ? '#dcff64' : '#a395c1';
    return slot;
  }));
  byId('row-label').textContent = rows === 8 ? '8 РЯДОВ' : rows === 12 ? '12 РЯДОВ' : '16 РЯДОВ';
}

function drawHistory() {
  const container = byId('history');
  if (!history.length) {
    container.textContent = 'Пока пусто';
    return;
  }
  container.replaceChildren(...history.map(value => {
    const chip = document.createElement('span');
    chip.textContent = multiplierText(value);
    return chip;
  }));
}

function optionGroup(id, entries, selected, change) {
  for (const [value, caption] of entries) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = id;
    input.value = value;
    input.checked = value === selected;
    input.addEventListener('change', () => {
      change(value);
      persist();
      refreshControls();
    });
    const title = document.createElement('span');
    title.textContent = caption;
    label.append(input, title);
    byId(id).append(label);
  }
}

function refreshControls() {
  byId('balance').textContent = number.format(balance);
  dropButton.disabled = Boolean(animation) || balance < cost;
  byId('reset').disabled = Boolean(animation);
  for (const input of document.querySelectorAll('.options input')) input.disabled = Boolean(animation);
  byId('sound').setAttribute('aria-pressed', sound);
}

function chooseBoard() {
  highlighted = -1;
  refreshSlots();
  draw();
}

optionGroup('costs', costs.map(value => [value, value]), cost, value => {
  cost = value;
  byId('status').textContent = balance < cost ? 'Недостаточно очков для этого броска.' : '';
});
optionGroup('risks', Object.entries(profiles).map(([key, profile]) => [key, profile.label]), risk, value => {
  risk = value;
  chooseBoard();
});
optionGroup('rows', rowCounts.map(value => [value, value]), rows, value => {
  rows = value;
  chooseBoard();
});

function center(index) {
  const width = canvas.clientWidth;
  const gap = 3;
  return (index * (width + gap) / (rows + 1) + (width - gap * rows) / (rows + 1) / 2) * 640 / width;
}

function rowY(index) {
  return 47 + index * 299 / (rows - 1);
}

function pinX(row, column) {
  return center(rows / 2 + column - row / 2);
}

function dot(x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function draw(ball) {
  if (!canvas.clientWidth) return;
  ctx.setTransform(canvas.width / 640, 0, 0, canvas.height / 385, 0, 0);
  ctx.clearRect(0, 0, 640, 385);
  ctx.strokeStyle = '#74589750';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(320, 19);
  ctx.lineTo(center(0), 365);
  ctx.lineTo(center(rows), 365);
  ctx.closePath();
  ctx.stroke();
  const radius = rows === 16 ? 3.3 : 4.3;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column <= row; column++) {
      const x = pinX(row, column);
      const y = rowY(row);
      dot(x, y, radius + 2.2, '#a77bd42d');
      dot(x, y, radius, '#e7d1ff');
    }
  }
  ctx.shadowColor = '#ddff66';
  ctx.shadowBlur = 16;
  if (ball) dot(ball.x, ball.y, 8, '#dcff64');
  else dot(320, 22, 7, '#dcff64');
  ctx.shadowBlur = 0;
}

function resize() {
  const width = canvas.clientWidth;
  const ratio = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  draw();
}

function chime(frequency, duration) {
  if (!sound) return;
  try {
    audio ||= new AudioContext();
    if (audio.state !== 'running') void audio.resume().catch(() => {});
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    const now = audio.currentTime;
    tone.type = 'sine';
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.06, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + duration);
    tone.connect(volume).connect(audio.destination);
    tone.start(now);
    tone.stop(now + duration);
  } catch {
    // Audio is optional.
  }
}

function finish() {
  const { index, multiplier, reward } = animation;
  animation = null;
  highlighted = index;
  slots.children[highlighted].classList.add('active');
  balance = Math.round((balance + reward) * 10) / 10;
  history = [multiplier, ...history].slice(0, 8);
  byId('status').textContent = multiplierText(multiplier) + ' · +' + number.format(reward) + ' очков';
  chime(multiplier >= 1 ? 680 : 410, 0.25);
  persist();
  drawHistory();
  refreshControls();
  draw();
}

function animate(time) {
  const { path, start } = animation;
  const position = (time - start) / 105;
  const step = Math.max(0, Math.floor(position));
  if (step >= path.length - 1) {
    finish();
    return;
  }
  const fraction = Math.max(0, position - step);
  const from = path[step];
  const to = path[step + 1];
  if (step && step !== animation.lastStep) chime(290 + step * 18, 0.065);
  animation.lastStep = step;
  draw({
    x: center(from.column + (to.column - from.column) * fraction),
    y: from.y + (to.y - from.y) * fraction ** 1.35 - Math.sin(Math.PI * fraction) * (step ? 7 : 0)
  });
  requestAnimationFrame(animate);
}

function drop() {
  if (animation || balance < cost) return;
  slots.children[highlighted]?.classList.remove('active');
  highlighted = -1;
  const path = [{ column: rows / 2, y: 22 }];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    path.push({ column: rows / 2 + index - row / 2, y: rowY(row) - 8 });
    index += Math.random() < 0.5 ? 0 : 1;
  }
  path.push({ column: index, y: 380 });
  const multiplier = multipliers()[index];
  balance -= cost;
  animation = { path, index, multiplier, reward: Math.round(cost * multiplier * 10) / 10, start: performance.now() };
  byId('status').textContent = 'Шарик в игре…';
  persist();
  refreshControls();
  chime(340, 0.15);
  if (reducedMotion.matches) finish();
  else requestAnimationFrame(animate);
}

dropButton.addEventListener('click', drop);
byId('reset').addEventListener('click', () => {
  if (animation) return;
  balance = 1000;
  history = [];
  byId('status').textContent = 'Новая игра';
  chooseBoard();
  drawHistory();
  refreshControls();
  persist();
});
byId('help').addEventListener('click', () => instructions.showModal());
byId('sound').addEventListener('click', () => {
  sound = !sound;
  if (sound) chime(520, 0.16);
  refreshControls();
  persist();
});
window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || instructions.open ||
      event.target.closest('button, a, input, textarea, select, [contenteditable]')) return;
  event.preventDefault();
  drop();
});
refreshSlots();
drawHistory();
refreshControls();
persist();
new ResizeObserver(resize).observe(canvas);
