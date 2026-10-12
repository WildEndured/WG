// ============================================================
//  ГЛОБАЛЬНАЯ КАРТА ДЛЯ ВАРГЕЙМА — script.js
//  Тайлы: OpenStreetMap (без API-ключа)
//  Регионы: реальные страны из Natural Earth GeoJSON
// ============================================================

// ---------- Состояние игры ----------
const state = {
  turn: 1,
  player: 'Игрок 1',
  players: ['Игрок 1', 'Игрок 2'],
  resources: { 'Игрок 1': 1000, 'Игрок 2': 1000 },
  regions: [],
  selectedId: null,
};

let map;
const regionLayers = {};

// ---------- Инициализация карты ----------
function initMap() {
  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 6,
    worldCopyJump: true,
    attributionControl: false,
    zoomControl: true,
  });

  // Бесплатные тайлы OpenStreetMap — БЕЗ ключа
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Затемняем подложку, чтобы регионы читались лучше
  const style = document.createElement('style');
  style.textContent = `
    .leaflet-tile-pane { filter: grayscale(0.7) brightness(0.55) contrast(1.15); }
  `;
  document.head.appendChild(style);
}

// ---------- Цвета по владельцу ----------
function ownerColor(owner) {
  if (owner === 'Игрок 1') return '#5e81ac';
  if (owner === 'Игрок 2') return '#bf616a';
  return '#7a8494';
}

// ---------- Загрузка регионов ----------
async function loadRegions() {
  // Пытаемся загрузить локальный файл, если есть
  const localPath = 'data/regions.json';

  try {
    const local = await fetch(localPath);
    if (local.ok) {
      const data = await local.json();
      // Если это простые полигоны — конвертируем в geometry
      state.regions = data.map(r => ({
        id: r.id,
        name: r.name,
        owner: r.owner || 'Нейтрал',
        resources: r.resources ?? 50,
        units: r.units ?? 1,
        geometry: r.polygon
          ? { type: 'Polygon', coordinates: [r.polygon.map(([lat, lng]) => [lng, lat])] }
          : r.geometry,
      }));
      console.log('✅ Загружены локальные регионы:', state.regions.length);
      renderRegions();
      return;
    }
  } catch (e) {
    console.warn('Локальный regions.json не найден, грузим страны мира...');
  }

  // Фолбэк — реальные страны мира
  await loadWorldCountries();
}

async function loadWorldCountries() {
  const url =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const geo = await res.json();

    state.regions = geo.features
      .filter(f => f.properties.ADMIN && f.geometry)
      .map((f, i) => ({
        id: 'c' + i,
        name: f.properties.ADMIN,
        owner: 'Нейтрал',
        resources: 50 + Math.floor(Math.random() * 150),
        units: 1 + Math.floor(Math.random() * 5),
        geometry: f.geometry,
      }));

    console.log('✅ Загружено стран:', state.regions.length);
    renderRegions();
  } catch (e) {
    console.error('❌ Ошибка загрузки стран:', e);
    alert('Не удалось загрузить карту мира. Проверь интернет или консоль (F12).');
  }
}

// ---------- Отрисовка регионов ----------
function renderRegions() {
  Object.values(regionLayers).forEach(l => map.removeLayer(l));
  for (const k in regionLayers) delete regionLayers[k];

  state.regions.forEach(r => {
    if (!r.geometry) return;

    const layer = L.geoJSON(
      { type: 'Feature', geometry: r.geometry, properties: {} },
      {
        style: {
          color: '#2e3440',
          weight: 1,
          fillColor: ownerColor(r.owner),
          fillOpacity: 0.55,
        },
      }
    ).addTo(map);

    layer.on('click', () => selectRegion(r.id));
    layer.bindTooltip(
      `<b>${r.name}</b><br>${r.owner}<br>⚔ ${r.units} | 💰 ${r.resources}`,
      { sticky: true }
    );

    regionLayers[r.id] = layer;
  });
}

// ---------- Выбор региона ----------
function selectRegion(id) {
  state.selectedId = id;
  const r = state.regions.find(x => x.id === id);
  if (!r) return;

  document.getElementById('region-name').textContent = r.name;
  document.getElementById('region-owner').textContent = r.owner;
  document.getElementById('region-resources').textContent = r.resources;
  document.getElementById('region-units').textContent = r.units;
  document.getElementById('selected-region').textContent = r.name;

  // Подсветка выбранного
  Object.entries(regionLayers).forEach(([rid, layer]) => {
    layer.setStyle({
      weight: rid === id ? 3 : 1,
      color: rid === id ? '#ebcb8b' : '#2e3440',
    });
  });
}

// ---------- Ходы и бой ----------
function moveTroops() {
  const r = state.regions.find(x => x.id === state.selectedId);
  if (!r) return alert('Сначала выбери свой регион на карте.');
  if (r.owner !== state.player) return alert(`Это регион игрока "${r.owner}", а не твой.`);
  if (r.units < 1) return alert('В регионе нет войск.');

  const targetName = prompt('Введите НАЗВАНИЕ региона для атаки/переброски:');
  if (!targetName) return;

  const t = state.regions.find(
    x => x.name.toLowerCase() === targetName.trim().toLowerCase()
  );
  if (!t) return alert('Регион не найден. Проверь название.');
  if (t.id === r.id) return alert('Нельзя переместить в тот же регион.');

  const amount = parseInt(prompt(`Сколько войск отправить? (у тебя ${r.units})`, '1'), 10);
  if (!amount || amount < 1 || amount > r.units)
    return alert('Некорректное число войск.');

  r.units -= amount;

  if (t.owner === r.owner) {
    // Переброска
    t.units += amount;
    alert(`✅ Переброшено ${amount} войск в "${t.name}".`);
  } else {
    // Бой: простая модель — атакующий побеждает, если его сил больше
    if (amount > t.units) {
      const survivors = amount - t.units;
      t.owner = r.owner;
      t.units = survivors;
      alert(`⚔️ Победа! "${t.name}" захвачен. Выжило: ${survivors}.`);
    } else {
      t.units -= amount;
      if (t.units < 0) t.units = 0;
      alert(`💥 Атака отбита. У защитника осталось ${t.units} войск.`);
    }
  }

  renderRegions();
  selectRegion(state.selectedId);
  updateHUD();
}

function endTurn() {
  // Доход с регионов текущего игрока
  state.regions.forEach(r => {
    if (r.owner === state.player) {
      state.resources[state.player] += Math.floor(r.resources / 10);
      r.resources += 5;
      // Регенерация гарнизона
      if (r.units < 20 && Math.random() < 0.3) r.units += 1;
    }
  });

  // Смена игрока
  const idx = state.players.indexOf(state.player);
  state.player = state.players[(idx + 1) % state.players.length];
  if (state.player === state.players[0]) state.turn += 1;

  updateHUD();
  renderRegions();
}

// ---------- HUD ----------
function updateHUD() {
  document.getElementById('turn').textContent = state.turn;
  document.getElementById('player').textContent = state.player;
  document.getElementById('resources').textContent = state.resources[state.player];
  document.getElementById('selected-region').textContent =
    state.regions.find(r => r.id === state.selectedId)?.name || '—';
}

// ---------- Запуск ----------
window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadRegions();
  updateHUD();

  document.getElementById('btn-move').onclick = moveTroops;
  document.getElementById('btn-end-turn').onclick = endTurn;

  // Клик по пустой карте — снять выделение
  map.on('click', e => {
    if (!e.originalEvent.target.closest('.leaflet-interactive')) {
      state.selectedId = null;
      updateHUD();
      Object.values(regionLayers).forEach(l =>
        l.setStyle({ weight: 1, color: '#2e3440' })
      );
    }
  });
});
