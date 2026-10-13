/* =========================================================
   WarGame Map — рендер мировой карты в стиле OSM
   Без готового tile-сервера: рендерим GeoJSON на клиенте.
   ========================================================= */

// --- 1. Инициализация карты ---
const map = L.map('map', {
  center: [48.5, 31.0],   // центр (можно менять)
  zoom: 6,
  minZoom: 3,
  maxZoom: 18,             // ~1:1000 при крупных масштабах
  zoomControl: false,
  worldCopyJump: true,
  preferCanvas: true
});

// Фон-подложка в цвете суши OSM
map.getContainer().style.background = '#e8e4d8';

// --- 2. Кастомные панели управления ---
document.getElementById('zoom-in').onclick  = () => map.zoomIn();
document.getElementById('zoom-out').onclick = () => map.zoomOut();
document.getElementById('reset-view').onclick = () => map.setView([48.5, 31.0], 6);

// Отображение координат и масштаба
const coordsEl = document.getElementById('coords');
map.on('mousemove', e => {
  const scale = getScale(map.getZoom());
  coordsEl.textContent =
    `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)} · 1:${scale}`;
});

// Приблизительный масштаб (соответствие OSM-зумам)
function getScale(z) {
  // z=0 ≈ 1:590M, каждый шаг x2
  const scales = [590000000,295000000,147000000,74000000,37000000,18500000,
                  9200000,4600000,2300000,1150000,570000,290000,150000,
                  74000,37000,18500,9200,4600,2300,1100];
  return scales[Math.min(z, scales.length - 1)];
}

/* =========================================================
   3. Слои GeoJSON
   ========================================================= */

// Панели слоёв
const layers = {
  borders:  L.layerGroup().addTo(map),
  roads:    L.layerGroup().addTo(map),
  cities:   L.layerGroup().addTo(map),
  terrain:  L.layerGroup().addTo(map),
  labels:   L.layerGroup().addTo(map)
};

/* ---------------------------------------------------------
   3.1 ССЫЛКИ НА GEOJSON-ИСТОЧНИКИ
   Все — публичные, стабильные, работают через GitHub Pages.
   Можно заменить на свои файлы в /data/
   --------------------------------------------------------- */

const GEOJSON_SOURCES = {
  // Границы стран (Natural Earth 1:110m)
  countries: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',

  // Границы регионов/штатов (1:50m — крупнее)
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson',

  // Дороги мира (Natural Earth roads)
  roads: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson',

  // Города (крупные, 1:50m)
  cities: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson',

  // Реки
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson',

  // Озёра
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson',

  // Леса / землепользование (грубо)
  land: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson',

  // Океаны (для фона)
  ocean: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_ocean.geojson'
};

/* ---------------------------------------------------------
   3.2 Утилита загрузки GeoJSON
   --------------------------------------------------------- */
async function loadGeoJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ошибка загрузки: ' + url);
  return res.json();
}

/* ---------------------------------------------------------
   3.3 Стили (в духе OSM)
   --------------------------------------------------------- */

// Океан / вода
const styleOcean = {
  color: '#aad3df',
  weight: 0,
  fillColor: '#aad3df',
  fillOpacity: 1
};

// Суша (фон)
const styleLand = {
  color: '#c8c4b8',
  weight: 0.4,
  fillColor: '#f2efe9',
  fillOpacity: 1
};

// Границы стран — пунктир
const styleBorders = {
  color: '#9c8f7c',
  weight: 1.2,
  opacity: 0.9,
  dashArray: '4,3',
  fill: false
};

// Границы регионов
const styleStates = {
  color: '#b5a894',
  weight: 0.7,
  opacity: 0.7,
  dashArray: '2,3',
  fill: false
};

// Дороги — жёлто-оранжевые как в OSM
const styleRoads = {
  color: '#e8a33d',
  weight: 1.6,
  opacity: 0.85
};

// Реки
const styleRivers = {
  color: '#7fb6d9',
  weight: 1.2,
  opacity: 0.9
};

// Озёра
const styleLakes = {
  color: '#7fb6d9',
  weight: 0.6,
  fillColor: '#aad3df',
  fillOpacity: 1
};

/* ---------------------------------------------------------
   3.4 Подписи городов
   --------------------------------------------------------- */
function cityTooltip(feature) {
  const p = feature.properties;
  const name = p.NAME || p.name || '—';
  const pop  = p.POP_MAX || p.pop_max || p.population || '';
  return `<b>${name}</b>${pop ? '<br>Население: ' + Math.round(pop).toLocaleString() : ''}`;
}

function cityRadius(pop) {
  if (!pop) return 3;
  if (pop > 5_000_000) return 8;
  if (pop > 1_000_000) return 6;
  if (pop > 300_000)   return 5;
  if (pop > 100_000)   return 4;
  return 3;
}

/* ---------------------------------------------------------
   3.5 Загрузка и рендер всех слоёв
   --------------------------------------------------------- */
async function initLayers() {
  try {
    // ---- Океан (самый нижний слой) ----
    const ocean = await loadGeoJSON(GEOJSON_SOURCES.ocean);
    L.geoJSON(ocean, { style: styleOcean }).addTo(layers.terrain);

    // ---- Суша ----
    const land = await loadGeoJSON(GEOJSON_SOURCES.land);
    L.geoJSON(land, { style: styleLand }).addTo(layers.terrain);

    // ---- Границы стран ----
    const countries = await loadGeoJSON(GEOJSON_SOURCES.countries);
    L.geoJSON(countries, {
      style: styleBorders,
      onEachFeature: (f, l) => {
        const name = f.properties.ADMIN || f.properties.name || '';
        if (name) l.bindTooltip(name, { sticky: true, className: 'country-tip' });
      }
    }).addTo(layers.borders);

    // ---- Регионы (только при zoom >= 7) ----
    map.on('zoomend', () => {
      if (map.getZoom() >= 7 && !layers._statesLoaded) {
        loadGeoJSON(GEOJSON_SOURCES.states).then(data => {
          L.geoJSON(data, { style: styleStates }).addTo(layers.borders);
          layers._statesLoaded = true;
        });
      }
    });

    // ---- Дороги ----
    const roads = await loadGeoJSON(GEOJSON_SOURCES.roads);
    L.geoJSON(roads, {
      style: styleRoads,
      onEachFeature: (f, l) => {
        const t = f.properties.type || f.properties.TYPE || '';
        if (t) l.bindTooltip(t, { sticky: true });
      }
    }).addTo(layers.roads);

    // ---- Реки ----
    const rivers = await loadGeoJSON(GEOJSON_SOURCES.rivers);
    L.geoJSON(rivers, { style: styleRivers }).addTo(layers.terrain);

    // ---- Озёра ----
    const lakes = await loadGeoJSON(GEOJSON_SOURCES.lakes);
    L.geoJSON(lakes, { style: styleLakes }).addTo(layers.terrain);

    // ---- Города ----
    const cities = await loadGeoJSON(GEOJSON_SOURCES.cities);

    L.geoJSON(cities, {
      pointToLayer: (feature, latlng) => {
        const pop = feature.properties.POP_MAX || feature.properties.pop_max;
        return L.circleMarker(latlng, {
          radius: cityRadius(pop),
          color: '#fff',
          weight: 1.5,
          fillColor: '#d33',
          fillOpacity: 1
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(cityTooltip(feature), { direction: 'top' });

        // Подпись рядом с точкой
        const p = feature.properties;
        const name = p.NAME || p.name;
        const pop  = p.POP_MAX || p.pop_max || 0;
        if (name && pop > 200000) {
          const marker = L.marker(layer.getLatLng(), {
            icon: L.divIcon({
              className: 'city-label',
              html: name,
              iconSize: [0, 0]
            }),
            interactive: false
          });
          marker.addTo(layers.labels);
        }
      }
    }).addTo(layers.cities);

    console.log('✅ Все слои загружены');
  } catch (err) {
    console.error('Ошибка загрузки слоёв:', err);
    alert('Не удалось загрузить часть GeoJSON. Проверьте консоль.');
  }
}

initLayers();

/* =========================================================
   4. Переключатели слоёв
   ========================================================= */
document.getElementById('toggle-borders').onchange = e =>
  e.target.checked ? map.addLayer(layers.borders) : map.removeLayer(layers.borders);

document.getElementById('toggle-roads').onchange = e =>
  e.target.checked ? map.addLayer(layers.roads) : map.removeLayer(layers.roads);

document.getElementById('toggle-cities').onchange = e =>
  e.target.checked ? map.addLayer(layers.cities) : map.removeLayer(layers.cities);

document.getElementById('toggle-terrain').onchange = e =>
  e.target.checked ? map.addLayer(layers.terrain) : map.removeLayer(layers.terrain);

document.getElementById('toggle-labels').onchange = e =>
  e.target.checked ? map.addLayer(layers.labels) : map.removeLayer(layers.labels);

/* =========================================================
   5. Горячие клавиши (варгейм-стиль)
   ========================================================= */
document.addEventListener('keydown', e => {
  switch (e.key) {
    case '+': case '=': map.zoomIn(); break;
    case '-': case '_': map.zoomOut(); break;
    case 'r': case 'R': map.setView([48.5, 31.0], 6); break;
  }
});