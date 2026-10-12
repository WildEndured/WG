/* =========================================================
   ГЛОБАЛЬНАЯ КАРТА ДЛЯ ВАРГЕЙМА
   ========================================================= */

// ---------- 1. Инициализация карты ----------
const map = L.map('map', {
    center: [48.5, 31.0],
    zoom: 5,
    minZoom: 2,
    maxZoom: 12,
    worldCopyJump: true,
    zoomControl: true
});

// Тайлы (тёмная тема CartoDB)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// ---------- 2. Данные территорий и юнитов ----------
const territories = {
    kyiv:    { name: 'Киевская зона',    owner: 'blue',   troops: 12, supply: 85, lat: 50.45, lng: 30.52, flag: '🔵' },
    kharkiv: { name: 'Харьковский сектор', owner: 'red',  troops: 8,  supply: 60, lat: 49.99, lng: 36.23, flag: '🔴' },
    odesa:   { name: 'Одесский порт',    owner: 'blue',   troops: 6,  supply: 90, lat: 46.48, lng: 30.73, flag: '🔵' },
    lviv:    { name: 'Львовский округ',  owner: 'green',  troops: 5,  supply: 70, lat: 49.84, lng: 24.03, flag: '🟢' },
    dnipro:  { name: 'Днепровский узел', owner: 'red',    troops: 10, supply: 55, lat: 48.46, lng: 35.05, flag: '🔴' },
    crimea:  { name: 'Крымский плацдарм', owner: 'yellow', troops: 15, supply: 95, lat: 45.30, lng: 34.40, flag: '🟡' }
};

const factionColors = {
    blue:   '#1f6feb',
    red:    '#da3633',
    green:  '#238636',
    yellow: '#d29922'
};

// ---------- 3. Слои ----------
const unitsLayer   = L.layerGroup().addTo(map);
const gridLayer    = L.layerGroup();
let selectedKey    = null;
let markers        = {};

// ---------- 4. Отрисовка юнитов ----------
function renderUnits() {
    unitsLayer.clearLayers();
    markers = {};

    Object.entries(territories).forEach(([key, t]) => {
        const icon = L.divIcon({
            className: '',
            html: `<div class="unit-marker faction-${t.owner}">${t.troops}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        const marker = L.marker([t.lat, t.lng], { icon })
            .bindTooltip(`${t.name} — ${t.troops} ед.`, { direction: 'top' })
            .on('click', () => selectTerritory(key));

        marker.addTo(unitsLayer);
        markers[key] = marker;
    });
}

// ---------- 5. Обработка выбора территории ----------
function selectTerritory(key) {
    selectedKey = key;
    const t = territories[key];
    const info = document.getElementById('info');

    info.innerHTML = `
        <div class="flag">${t.flag}</div>
        <div class="row"><span>Регион</span><span class="value">${t.name}</span></div>
        <div class="row"><span>Владелец</span><span class="value" style="color:${factionColors[t.owner]}">${t.owner.toUpperCase()}</span></div>
        <div class="row"><span>Войска</span><span class="value">${t.troops}</span></div>
        <div class="row"><span>Снабжение</span><span class="value">${t.supply}%</span></div>
    `;

    // Подсветка выбранного маркера
    Object.values(markers).forEach(m => m.setZIndexOffset(0));
    markers[key].setZIndexOffset(1000);

    addLog(`Выбран регион: ${t.name}`);
}

// ---------- 6. Действия ----------
function attack() {
    if (!selectedKey) return addLog('⚠️ Сначала выберите регион');
    const t = territories[selectedKey];

    // Находим ближайшего врага
    const enemies = Object.entries(territories).filter(([k, v]) => v.owner !== t.owner);
    if (!enemies.length) return addLog('Нет врагов для атаки');

    const [enemyKey, enemy] = enemies.sort((a, b) =>
        dist(t, a[1]) - dist(t, b[1])
    )[0];

    // Простая боёвка: сила = войска * мораль(random)
    const attackPower = t.troops * (0.7 + Math.random() * 0.6);
    const defPower    = enemy.troops * (0.8 + Math.random() * 0.5);

    if (attackPower > defPower) {
        const loss = Math.ceil(t.troops * 0.3);
        t.troops   = Math.max(1, t.troops - loss);
        enemy.owner = t.owner;
        enemy.troops = Math.max(1, Math.floor(enemy.troops * 0.5));
        enemy.flag = t.flag;
        addLog(`⚔️ ${t.name} захватил ${enemy.name}! Потери: ${loss}`);
    } else {
        t.troops = Math.max(1, Math.floor(t.troops * 0.7));
        addLog(`🛡️ ${enemy.name} отбил атаку. Потери: ${t.troops}`);
    }

    renderUnits();
    refreshInfo();
}

function moveTroops() {
    if (!selectedKey) return addLog('⚠️ Сначала выберите регион');
    const t = territories[selectedKey];
    if (t.troops < 2) return addLog('⚠️ Недостаточно войск для переброски');

    // Ищем союзника рядом
    const allies = Object.entries(territories)
        .filter(([k, v]) => k !== selectedKey && v.owner === t.owner);
    if (!allies.length) return addLog('Нет союзных регионов');

    const [, ally] = allies.sort((a, b) => dist(t, a[1]) - dist(t, b[1]))[0];
    const send = Math.floor(t.troops / 2);
    t.troops -= send;
    ally.troops += send;

    addLog(`🚀 Переброшено ${send} ед. в ${ally.name}`);
    renderUnits();
    refreshInfo();
}

function fortify() {
    if (!selectedKey) return addLog('⚠️ Сначала выберите регион');
    const t = territories[selectedKey];
    if (t.supply < 10) return addLog('⚠️ Недостаточно снабжения');

    t.supply -= 10;
    t.troops += 2;
    addLog(`🛡️ ${t.name} укреплён: +2 войск, -10 снабжения`);
    renderUnits();
    refreshInfo();
}

function resetGame() {
    territories.kyiv.owner = 'blue';
    territories.kharkiv.owner = 'red';
    territories.odesa.owner = 'blue';
    territories.lviv.owner = 'green';
    territories.dnipro.owner = 'red';
    territories.crimea.owner = 'yellow';

    const initial = { kyiv: 12, kharkiv: 8, odesa: 6, lviv: 5, dnipro: 10, crimea: 15 };
    const flags = { blue: '🔵', red: '🔴', green: '🟢', yellow: '🟡' };

    Object.entries(territories).forEach(([k, t]) => {
        t.troops = initial[k];
        t.supply = Math.floor(60 + Math.random() * 35);
        t.flag = flags[t.owner];
    });

    addLog('🔄 Игра сброшена');
    renderUnits();
    refreshInfo();
}

// ---------- 7. Вспомогательные ----------
function dist(a, b) {
    return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

function addLog(msg) {
    const log = document.getElementById('log');
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    li.textContent = `[${time}] ${msg}`;
    log.prepend(li);
    if (log.children.length > 30) log.lastChild.remove();
}

function refreshInfo() {
    if (selectedKey) selectTerritory(selectedKey);
}

// ---------- 8. Сетка координат ----------
function buildGrid() {
    gridLayer.clearLayers();
    for (let lat = -80; lat <= 80; lat += 10) {
        L.polyline([[-80, lat * 3], [80, lat * 3]], { color: '#21262d', weight: 0.5 }).addTo(gridLayer);
    }
    for (let lng = -180; lng <= 180; lng += 10) {
        L.polyline([[-80, lng], [80, lng]], { color: '#21262d', weight: 0.5 }).addTo(gridLayer);
    }
}

// ---------- 9. Привязка UI ----------
document.getElementById('btn-attack').onclick  = attack;
document.getElementById('btn-move').onclick    = moveTroops;
document.getElementById('btn-fortify').onclick = fortify;
document.getElementById('btn-reset').onclick   = resetGame;

document.getElementById('toggle-units').onchange = e => {
    e.target.checked ? map.addLayer(unitsLayer) : map.removeLayer(unitsLayer);
};
document.getElementById('toggle-grid').onchange = e => {
    e.target.checked ? map.addLayer(gridLayer) : map.removeLayer(gridLayer);
};
document.getElementById('toggle-borders').onchange = e => {
    // пример: можно показать слой границ (заглушка)
    addLog(`Границы: ${e.target.checked ? 'вкл' : 'выкл'}`);
};

// ---------- 10. Старт ----------
buildGrid();
renderUnits();
addLog('Карта готова. Выберите регион.');
