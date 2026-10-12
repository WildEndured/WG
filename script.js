// ============================================================
//  ГЛОБАЛЬНАЯ КАРТА ДЛЯ ВАРГЕЙМА — script.js
//  Тайлы: OpenStreetMap (без API-ключа)
//  Регионы: реальные страны (Natural Earth GeoJSON)
//  + Гексовая сетка с координатами (A1, B5, ...)
// ============================================================

const state = {
  turn: 1,
  player: 'Игрок 1',
  players: ['Игрок 1', 'Игрок 2'],
  resources: { 'Игрок 1': 1000, 'Игрок 2': 1000 },
  regions: [],
  selectedId: null,
  selectedHex: null,
};

let map;
const regionLayers = {};

// ---------- Настройки стилей ----------
const STYLE = {
  border: '#0d1117',
  borderHover: '#ebcb8b',
  borderSelected: '#f0c674',
  weight: 0.8,
  weightHover: 2.2,
  weightSelected: 2.8,
  fillOpacity: 0.55,
};

// ---------- Настройки гексовой сетки ----------
const HEX = {
  size: 8,              // радиус гекса в градусах (попробуй 5..15)
  showCoords: true,     // показывать ли буквы/цифры
  minZoomCoords: 4,     // на каком зуме начинать показывать подписи
  color: '#88c0d0',
  colorHover: '#ebcb8b',
  colorSelected: '#f0c674',
  weight: 0.6,
  weightHover: 1.6,
  fillOpacity: 0,
  fillOpacityHover: 0.15,
  fillOpacitySelected: 0.25,
};

let hexLayerGroup;         // группа для гексов
let hexData = [];          // [{ id, coord, lat, lng, polygon, layer }]
const hexLayers = {};      // id -> layer

// ---------- Инициализация карты ----------
function initMap() {
  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 6,
    worldCopyJump: true,
    attributionControl: false,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Затемнение подложки
  const s = document.createElement('style');
  s.textContent = `
    .leaflet-tile-pane { filter: grayscale(0.85) brightness(0.45) contrast(1.2); }
    .leaflet-interactive { transition: fill-opacity 0.15s, stroke-width 0.15s; }

    .hex-label {
      color: ${HEX.color};
      font-size: 9px;
      font-weight: 600;
      text-shadow: 0 0 3px #000, 0 0 3px #000;
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
      font-family: monospace;
    }
    .hex-label.selected { color: ${HEX.colorSelected}; font-size: 11px; }
  `;
  document.head.appendChild(s);
}

// ---------- Цвета владельцев ----------
function ownerColor(owner) {
  if (owner === 'Игрок 1') return '#5e81ac';
  if (owner === 'Игрок 2') return '#bf616a';
  return '#4c566a';
}

// ============================================================
//  ГЕКСОВАЯ СЕТКА
// ============================================================

// Конвертирует буквенный индекс в число: A=0, B=1, ..., Z=25, AA=26, ...
function colToLetter(col) {
  let s = '';
  col += 1;
  while (col > 0) {
    const r = (col - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

// Вершины гекса (flat-top) с центром (lat, lng)
function hexVertices(lat, lng, size) {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    verts.push([
      lat + size * Math.sin(angle),
      lng + size * Math.cos(angle),
    ]);
  }
  return verts;
}

// Ширина/высота гекса (flat-top)
// ширина = 2*size, высота = sqrt(3)*size
function hexSpacing(size) {
  return {
    dx: size * 1.5,               // шаг по X (потому что flat-top)
    dy: size * Math.sqrt(3),      // шаг по Y
  };
}

// Генерирует все гексы для заданной области (bounding box)
function buildHexGrid() {
  const size = HEX.size;
  const { dx, dy } = hexSpacing(size);

  // Границы мира: lat -60..75, lng -180..180
  const latMin = -60;
  const latMax = 75;
  const lngMin = -180;
  const lngMax = 180;

  hexData = [];
  let col = 0;

  for (let lng = lngMin; lng < lngMax; lng += dx) {
    let row = 0;
    // Смещение нечётных колонок на пол-шага (offset layout)
    const latOffset = (col % 2 === 1) ? dy / 2 : 0;

    for (let lat = latMin + latOffset; lat < latMax; lat += dy) {
      const coord = colToLetter(col) + (row + 1);
      const verts = hexVertices(lat + dy / 2, lng + size, size);

      hexData.push({
        id: coord,
        coord,
        col,
        row,
        center: [lat + dy / 2, lng + size],
        polygon: verts,
      });
      row++;
    }
    col++;
  }

  console.log('🔷 Сгенерировано гексов:', hexData.length);
}

// Отрисовка гексовой сетки
function renderHexGrid() {
  if (hexLayerGroup) {
    map.removeLayer(hexLayerGroup);
  }
  for (const k in hexLayers) delete hexLayers[k];

  hexLayerGroup = L.layerGroup().addTo(map);

  const showLabels = map.getZoom() >= HEX.minZoomCoords;

  hexData.forEach(h => {
    // Полигон
    const poly = L.polygon(h.polygon, {
      color: HEX.color,
      weight: HEX.weight,
      opacity: 0.55,
      fillColor: HEX.color,
      fillOpacity: HEX.fillOpacity,
      interactive: true,
    }).addTo(hexLayerGroup);

    // События
    poly.on({
      mouseover: e => {
        if (state.selectedHex !== h.id) {
          e.target.setStyle({
            weight: HEX.weightHover,
            color: HEX.colorHover,
            fillOpacity: HEX.fillOpacityHover,
          });
        }
      },
      mouseout: e => {
        if (state.selectedHex !== h.id) {
          e.target.setStyle({
            weight: HEX.weight,
            color: HEX.color,
            fillOpacity: HEX.fillOpacity,
          });
        }
      },
      click: e => {
        L.DomEvent.stopPropagation(e);
        selectHex(h.id);
      },
    });

    poly.bindTooltip(`Гекс ${h.coord}`, {
      sticky: true,
      className: 'hex-tooltip',
    });

    hexLayers[h.id] = { poly, data: h };

    // Подпись координат
    if (showLabels) {
      const label = L.marker(h.center, {
        icon: L.divIcon({
          className: 'hex-label-wrap',
          html: `<div class="hex-label" data-hex="${h.id}">${h.coord}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(hexLayerGroup);
      hexLayers[h.id].label = label;
    }
  });

  // Перерисовать при смене зума (чтобы показать/скрыть подписи)
  if (!map._hexZoomBound) {
    map.on('zoomend', () => {
      if (map.getZoom() >= HEX.minZoomCoords) {
        renderHexGrid();
      } else {
        // Убрать только подписи
        hexData.forEach(h => {
          const entry = hexLayers[h.id];
          if (entry && entry.label) {
            hexLayerGroup.removeLayer(entry.label);
            delete entry.label;
          }
        });
      }
    });
    map._hexZoomBound = true;
  }
}

// Выбор гекса
function selectHex(id) {
  state.selectedHex = id;

  // Сброс всех
  for (const hid in hexLayers) {
    const entry = hexLayers[hid];
    if (!entry || !entry.poly) continue;
    if (hid === id) {
      entry.poly.setStyle({
        weight: HEX.weightHover,
        color: HEX.colorSelected,
        fillColor: HEX.colorSelected,
        fillOpacity: HEX.fillOpacitySelected,
      });
      entry.poly.bringToFront();
      if (entry.label) {
        entry.label.getElement()?.querySelector('.hex-label')?.classList.add('selected');
      }
    } else {
      entry.poly.setStyle({
        weight: HEX.weight,
        color: HEX.color,
        fillColor: HEX.color,
        fillOpacity: HEX.fillOpacity,
      });
      if (entry.label) {
        entry.label.getElement()?.querySelector('.hex-label')?.classList.remove('selected');
      }
    }
  }

  // Показать в HUD
  document.getElementById('selected-region').textContent = 'Гекс ' + id;

  console.log('🔷 Выбран гекс:', id);
}

// ============================================================
//  РЕГИОНЫ (страны)
// ============================================================

async function loadRegions() {
  try {
    const local = await fetch('data/regions.json');
    if (local.ok) {
      const data = await local.json();
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
      console.log('✅ Локальные регионы:', state.regions.length);
      renderRegions();
      return;
    }
  } catch (e) {
    console.warn('Локальный data/regions.json не найден.');
  }

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
    alert('Не удалось загрузить карту мира.');
  }
}

function renderRegions() {
  Object.values(regionLayers).forEach(l => map.removeLayer(l));
  for (const k in regionLayers) delete regionLayers[k];

  state.regions.forEach(r => {
    if (!r.geometry) return;

    const layer = L.geoJSON(
      { type: 'Feature', geometry: r.geometry, properties: {} },
      {
        style: () => ({
          color: STYLE.border,
          weight: STYLE.weight,
          opacity: 0.9,
          fillColor: ownerColor(r.owner),
          fillOpacity: STYLE.fillOpacity,
          lineJoin: 'round',
        }),
        onEachFeature: (feature, lyr) => {
          lyr.on({
            mouseover: e => {
              if (state.selectedId !== r.id) {
                e.target.setStyle({
                  weight: STYLE.weightHover,
                  color: STYLE.borderHover,
                  fillOpacity: STYLE.fillOpacity + 0.15,
                });
                e.target.bringToFront();
              }
            },
            mouseout: e => {
              if (state.selectedId !== r.id) {
                e.target.setStyle({
                  weight: STYLE.weight,
                  color: STYLE.border,
                  fillOpacity: STYLE.fillOpacity,
                });
              }
            },
            click: () => selectRegion(r.id),
          });
        },
      }
    ).addTo(map);

    layer.bindTooltip(
      `<b>${r.name}</b><br>${r.owner}<br>⚔ ${r.units} | 💰 ${r.resources}`,
      { sticky: true, className: 'region-tooltip' }
    );

    regionLayers[r.id] = layer;
  });
}

function selectRegion(id) {
  state.selectedId = id;
  const r = state.regions.find(x => x.id === id);
  if (!r) return;

  document.getElementById('region-name').textContent = r.name;
  document.getElementById('region-owner').textContent = r.owner;
  document.getElementById('region-resources').textContent = r.resources;
  document.getElementById('region-units').textContent = r.units;
  document.getElementById('selected-region').textContent = r.name;

  Object.entries(regionLayers).forEach(([rid, layer]) => {
    layer.eachLayer(lyr => {
      if (rid === id) {
        lyr.setStyle({
          weight: STYLE.weightSelected,
          color: STYLE.borderSelected,
          fillOpacity: STYLE.fillOpacity + 0.2,
        });
        lyr.bringToFront();
      } else {
        lyr.setStyle({
          weight: STYLE.weight,
          color: STYLE.border,
          fillOpacity: STYLE.fillOpacity,
        });
      }
    });
  });
}

// ============================================================
//  ХОДЫ И БОЙ
// ============================================================

function moveTroops() {
  const r = state.regions.find(x => x.id === state.selectedId);
  if (!r) return alert('Сначала выбери свой регион на карте.');
  if (r.owner !== state.player) return alert(`Это регион игрока "${r.owner}".`);
  if (r.units < 1) return alert('В регионе нет войск.');

  const targetName = prompt('Введите НАЗВАНИЕ региона:');
  if (!targetName) return;

  const t = state.regions.find(
    x => x.name.toLowerCase() === targetName.trim().toLowerCase()
  );
  if (!t) return alert('Регион не найден.');
  if (t.id === r.id) return alert('Нельзя переместить в тот же регион.');

  const amount = parseInt(prompt(`Сколько войск? (у тебя ${r.units})`, '1'), 10);
  if (!amount || amount < 1 || amount > r.units)
    return alert('Некорректное число.');

  r.units -= amount;

  if (t.owner === r.owner) {
    t.units += amount;
    alert(`✅ Переброшено ${amount} в "${t.name}".`);
  } else {
    if (amount > t.units) {
      const survivors = amount - t.units;
      t.owner = r.owner;
      t.units = survivors;
      alert(`⚔️ Победа! "${t.name}" захвачен. Выжило: ${survivors}.`);
    } else {
      t.units -= amount;
      if (t.units < 0) t.units = 0;
      alert(`💥 Отбито. У защитника осталось ${t.units}.`);
    }
  }

  renderRegions();
  selectRegion(state.selectedId);
  updateHUD();
}

function endTurn() {
  state.regions.forEach(r => {
    if (r.owner === state.player) {
      state.resources[state.player] += Math.floor(r.resources / 10);
      r.resources += 5;
      if (r.units < 20 && Math.random() < 0.3) r.units += 1;
    }
  });

  const idx = state.players.indexOf(state.player);
  state.player = state.players[(idx + 1) % state.players.length];
  if (state.player === state.players[0]) state.turn += 1;

  updateHUD();
  renderRegions();
}

function updateHUD() {
  document.getElementById('turn').textContent = state.turn;
  document.getElementById('player').textContent = state.player;
  document.getElementById('resources').textContent = state.resources[state.player];
  document.getElementById('selected-region').textContent =
    state.selectedHex
      ? 'Гекс ' + state.selectedHex
      : (state.regions.find(r => r.id === state.selectedId)?.name || '—');
}

// ============================================================
//  ЗАПУСК
// ============================================================

window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadRegions();

  // Строим и рисуем гексовую сетку
  buildHexGrid();
  renderHexGrid();

  updateHUD();

  document.getElementById('btn-move').onclick = moveTroops;
  document.getElementById('btn-end-turn').onclick = endTurn;

  // Клик по пустому месту — снять выделения
  map.on('click', e => {
    const t = e.originalEvent.target;
    if (!t.closest('.leaflet-interactive')) {
      state.selectedId = null;
      state.selectedHex = null;
      updateHUD();
      Object.values(regionLayers).forEach(layer =>
        layer.eachLayer(lyr =>
          lyr.setStyle({
            weight: STYLE.weight,
            color: STYLE.border,
            fillOpacity: STYLE.fillOpacity,
          })
        )
      );
      for (const hid in hexLayers) {
        const entry = hexLayers[hid];
        if (entry?.poly) {
          entry.poly.setStyle({
            weight: HEX.weight,
            color: HEX.color,
            fillColor: HEX.color,
            fillOpacity: HEX.fillOpacity,
          });
        }
      }
    }
  });
});
