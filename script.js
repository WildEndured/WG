// ---- Состояние игры ----
const state = {
  turn: 1,
  player: 'Игрок 1',
  resources: 1000,
  regions: [],
  selectedId: null,
};

let map, regionLayers = {};

// ---- Инициализация карты ----
function initMap() {
  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 5,
    worldCopyJump: true,
    attributionControl: false,
  });

  // Тёмная подложка (без внешних ключей)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

// ---- Цвет по владельцу ----
function ownerClass(owner) {
  if (owner === 'Игрок 1') return 'region-p1';
  if (owner === 'Игрок 2') return 'region-p2';
  return 'region-neutral';
}

// ---- Загрузка регионов ----
async function loadRegions() {
  const res = await fetch('data/regions.json');
  state.regions = await res.json();
  renderRegions();
}

function renderRegions() {
  // Очистка старых слоёв
  Object.values(regionLayers).forEach(l => map.removeLayer(l));
  regionLayers = {};

  state.regions.forEach(r => {
    const layer = L.polygon(r.polygon, {
      className: ownerClass(r.owner),
      weight: 2,
      color: '#2e3440',
      fillOpacity: 0.55,
    }).addTo(map);

    layer.on('click', () => selectRegion(r.id));
    layer.bindTooltip(r.name, { sticky: true });

    regionLayers[r.id] = layer;
  });
}

// ---- Выбор региона ----
function selectRegion(id) {
  state.selectedId = id;
  const r = state.regions.find(x => x.id === id);
  if (!r) return;

  document.getElementById('region-name').textContent = r.name;
  document.getElementById('region-owner').textContent = r.owner;
  document.getElementById('region-resources').textContent = r.resources;
  document.getElementById('region-units').textContent = r.units;
  document.getElementById('selected-region').textContent = r.name;

  // Подсветка
  Object.entries(regionLayers).forEach(([rid, layer]) => {
    layer.setStyle({ weight: rid === id ? 4 : 2, color: rid === id ? '#ebcb8b' : '#2e3440' });
  });
}

// ---- Действия ----
function moveTroops() {
  const r = state.regions.find(x => x.id === state.selectedId);
  if (!r) return alert('Выберите регион');
  if (r.owner !== state.player) return alert('Это не ваш регион!');
  if (r.units < 1) return alert('Нет войск для перемещения');

  const target = prompt('Введите ID региона для перемещения:');
  const t = state.regions.find(x => x.id === target);
  if (!t) return alert('Регион не найден');

  const amount = parseInt(prompt('Сколько войск переместить?', '1'), 10);
  if (!amount || amount < 1 || amount > r.units) return alert('Некорректное число');

  r.units -= amount;

  if (t.owner === r.owner) {
    t.units += amount;
  } else {
    // Бой: простое сравнение сил
    if (amount > t.units) {
      const survivors = amount - t.units;
      t.owner = r.owner;
      t.units = survivors;
    } else {
      t.units -= amount;
    }
  }

  renderRegions();
  selectRegion(state.selectedId);
}

function endTurn() {
  // Смена игрока и хода
  state.player = state.player === 'Игрок 1' ? 'Игрок 2' : 'Игрок 1';
  state.turn += 1;

  // Доход с регионов
  state.regions.forEach(r => {
    if (r.owner === state.player) {
      state.resources += Math.floor(r.resources / 10);
      r.resources += 5;
    }
  });

  document.getElementById('turn').textContent = state.turn;
  document.getElementById('player').textContent = state.player;
  document.getElementById('resources').textContent = state.resources;

  renderRegions();
}

// ---- Запуск ----
window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadRegions();

  document.getElementById('btn-move').onclick = moveTroops;
  document.getElementById('btn-end-turn').onclick = endTurn;
});
