const sites = [
  {
    name: 'Марианская впадина', ocean: 'Тихий океан', depth: '≈ 10 900 м', latitude: 11.35, longitude: 142.2,
    summary: 'В Бездне Челленджера находится самая глубокая известная точка Мирового океана.',
    story: '23 января 1960 года Жак Пикар и Дон Уолш впервые достигли дна Бездны Челленджера на батискафе «Триест». Спуск занял несколько часов. На такой глубине давление воды превышает атмосферное у поверхности более чем в тысячу раз.',
    source: 'https://oceanservice.noaa.gov/facts/oceandepth.html'
  },
  {
    name: 'Атлантический каньон', ocean: 'Атлантический океан', depth: '≈ 3 500 м', latitude: 39.6, longitude: -72.25,
    summary: 'Каньон Гудзона прорезает континентальный склон у восточного побережья США.',
    story: 'Каньон Гудзона начинается у края континентального шельфа и спускается в глубокую Атлантику. NOAA исследует здесь глубоководные кораллы, губки и сообщества, обитающие рядом с выходами метана.',
    source: 'https://oceanexplorer.noaa.gov/'
  },
  {
    name: 'Затерянный город', ocean: 'Атлантический океан', depth: '≈ 800 м', latitude: 30.13, longitude: -42.12,
    summary: 'Светлые карбонатные башни поднимаются над дном Срединно-Атлантического хребта.',
    story: 'Гидротермальное поле открыли в 2000 году. Вода реагирует с горными породами и выносит растворённые вещества, из которых растут карбонатные башни. Эти условия поддерживают сообщества микроорганизмов, живущих без солнечного света.',
    source: 'https://oceanexplorer.noaa.gov/'
  },
  {
    name: 'Зондский жёлоб', ocean: 'Индийский океан', depth: '≈ 7 200 м', latitude: -11.1, longitude: 114.9,
    summary: 'Глубочайшая область Индийского океана лежит к югу от Индонезии.',
    story: 'Зондский жёлоб сформировался там, где океаническая плита погружается под соседнюю плиту. В 2019 году экспедиция Five Deeps выполнила пилотируемое погружение в этот район и уточнила его глубину.',
    source: 'https://fivedeeps.com/'
  },
  {
    name: 'Каньон Монтерей', ocean: 'Тихий океан', depth: '≈ 4 000 м', latitude: 36.7, longitude: -122.5,
    summary: 'Один из крупнейших подводных каньонов у тихоокеанского побережья Северной Америки.',
    story: 'Каньон начинается рядом с побережьем Калифорнии. Исследователи MBARI наблюдают, как по его склонам движутся плотные потоки воды и осадка. Они способны переносить большие объёмы песка и менять рельеф дна.',
    source: 'https://www.mbari.org/'
  }
];

const plot = document.querySelector('#plot');
const detail = document.querySelector('#detail');
const dialog = document.querySelector('#story');
const canvas = document.querySelector('#world');

function project(longitude, latitude) {
  return [(longitude + 180) / 360, (83 - latitude) / 157];
}

function drawMap() {
  const { width, height } = plot.getBoundingClientRect();
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / width, canvas.height / height);

  function coordinate(longitude, latitude) {
    const [x, y] = project(longitude, latitude);
    return [x * width, y * height];
  }

  ctx.strokeStyle = '#24475788';
  ctx.beginPath();
  for (let longitude = -150; longitude < 180; longitude += 30) {
    const [x] = coordinate(longitude, 0);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const [, y] = coordinate(0, latitude);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#427183';
  ctx.fillStyle = '#1d4050';
  for (const feature of land) {
    const { type, coordinates } = feature.geometry;
    const polygons = type === 'Polygon' ? [coordinates] : coordinates;
    for (const polygon of polygons) {
      ctx.beginPath();
      for (const ring of polygon) {
        ring.forEach(([longitude, latitude], index) => {
          const [x, y] = coordinate(longitude, latitude);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
  }
}

function openStory(site) {
  document.querySelector('#story-ocean').textContent = site.ocean.toUpperCase();
  document.querySelector('#story-title').textContent = site.name;
  document.querySelector('#story-description').textContent = site.story;
  document.querySelector('#story-source').href = site.source;
  dialog.showModal();
}

function storyButton(site) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button';
  button.textContent = 'Читать историю ↗';
  button.addEventListener('click', () => openStory(site));
  return button;
}

function showSite(index) {
  const site = sites[index];
  markers.forEach((marker, position) => marker.setAttribute('aria-pressed', position === index));
  detail.innerHTML = '<p class="meta"></p><h3></h3><p class="depth"></p><p class="summary"></p>';
  detail.querySelector('.meta').textContent = site.ocean.toUpperCase();
  detail.querySelector('h3').textContent = site.name;
  detail.querySelector('.depth').textContent = site.depth;
  detail.querySelector('.summary').textContent = site.summary;
  detail.append(storyButton(site));
}

const markers = sites.map((site, index) => {
  const marker = document.createElement('button');
  const [x, y] = project(site.longitude, site.latitude);
  marker.type = 'button';
  marker.className = 'marker';
  marker.style.left = `${x * 100}%`;
  marker.style.top = `${y * 100}%`;
  marker.title = site.name;
  marker.setAttribute('aria-label', site.name);
  marker.addEventListener('click', () => showSite(index));
  plot.append(marker);
  return marker;
});

for (const site of sites.slice(0, 3)) {
  const card = document.createElement('article');
  card.className = 'expedition-card';
  card.innerHTML = '<p class="meta"></p><h3></h3><p></p>';
  card.querySelector('.meta').textContent = site.ocean.toUpperCase();
  card.querySelector('h3').textContent = site.name;
  card.querySelector('p:last-child').textContent = site.summary;
  card.append(storyButton(site));
  document.querySelector('#expedition-list').append(card);
}

document.querySelector('#reset').addEventListener('click', () => showSite(0));
dialog.setAttribute('aria-labelledby', 'story-title');
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

const links = [...document.querySelectorAll('nav a')];
function updateNavigation() {
  const target = window.location.hash || '#top';
  for (const link of links) {
    const active = link.hash === target;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();
showSite(0);
new ResizeObserver(drawMap).observe(plot);
