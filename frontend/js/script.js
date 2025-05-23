import { apiFetch } from './api.js';

// ——— Ініціалізація даних у localStorage ———
if (!localStorage.getItem('itemsToSort')) {
  const sampleItems = [
    { id: 1, name: 'Виріб A', weight: 300, force: 7 },
    { id: 2, name: 'Виріб B', weight: 650, force: 13 },
    { id: 3, name: 'Виріб C', weight: 400, force: 9 },
    { id: 4, name: 'Виріб D', weight: 520, force: 11 }
  ];
  localStorage.setItem('itemsToSort', JSON.stringify(sampleItems));
}
if (!localStorage.getItem('sortEvents')) {
  localStorage.setItem('sortEvents', '[]');
}



// DOM-елементи
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('nav a');
const enableBtn   = document.getElementById('enableSystemBtn');
const disableBtn  = document.getElementById('disableSystemBtn');
const notificationContainer = document.getElementById('notification-container');



let sensorBatches = [];    // масив масивів
let batchIds       = [];   // список batchId, відсортований за зростанням
let currentBatch   = 0;    // індекс у списку batchIds
let sensorTimer    = null;





// Стан системи
let systemActive    = false;
let sensorInterval  = null;
const chartInstances = {};
// зверху, поряд із іншими let/const
let conveyorPaused = false;


// Підтягнути CSS-змінну --warning
const cssVars     = getComputedStyle(document.documentElement);
const warningColor = cssVars.getPropertyValue('--warning').trim();


// 1. Конфігурація графіків
const chartConfigs = [
  { id: 'tempChart',      sensorType: 'Температура',     type: 'line',    label: 'Температура'      },
  { id: 'weightChart',    sensorType: 'Вага виробу',     type: 'line',    label: 'Вага виробу'      },
  { id: 'forceChart',     sensorType: 'Зусилля захвату', type: 'line',    label: 'Зусилля захвату'  },
  { id: 'humidityChart',  sensorType: 'Вологість',        type: 'line',    label: 'Вологість'        }
];



// 2. Глобальні дані та ініціалізація полів
let allData = [];
chartConfigs.forEach(cfg => {
  cfg.nextIndex   = 10;
  cfg.chart       = null;
  cfg.batchLabels = [];
});

// Форматування часу в HH:MM:SS
function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// 3. Ініціалізація графіків
async function initAnalyticsCharts() {
  // Завантажуємо та групуємо дані
  allData = await apiFetch('/sensor_data');
  const byType = allData.reduce((acc, r) => {
    (acc[r.sensor_type] = acc[r.sensor_type] || []).push(r);
    return acc;
  }, {});

  // Для кожного графіка: перші 10 точок
  chartConfigs.forEach(cfg => {
    const series = (byType[cfg.sensorType] || [])
      .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(r => ({ v: +r.value, t: r.timestamp, batchId: r.batchId }));

    const initial = series.slice(0, 8);
    cfg.nextIndex = 8;
    cfg.batchLabels = initial.map(pt => pt.batchId);

    const labels = initial.map(pt => fmtTime(pt.t));
    const data   = initial.map(pt => pt.v);

    const ctx = document.getElementById(cfg.id).getContext('2d');
    cfg.chart = new Chart(ctx, {
      type: cfg.type,
      data: {
        labels: cfg.type === 'scatter' ? undefined : labels,
        datasets: [{
          label: cfg.label,
          data: cfg.type === 'scatter'
            ? initial.map(pt => ({ x: pt.v, y: pt.v, batchId: pt.batchId }))
            : data,
          fill: false,
          tension: 0.1,
          borderWidth: 2,
          showLine: cfg.type !== 'scatter'
        }]
      },
      plugins: [ ChartDataLabels ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          datalabels: {
            align: 'top',
            formatter: (val, ctx) => cfg.batchLabels[ctx.dataIndex],
            font: { size: 10 }
          },
          legend: { display: false }
        },
        scales: {
          x: cfg.type === 'scatter'
            ? { type: 'linear', position: 'bottom', title: { display: true, text: 'X' } }
            : { title: { display: true, text: 'Час' } },
          y: { title: { display: true, text: cfg.label } }
        }
      }
    });
  });

  setInterval(addNextToCharts, 2500);
}

function initCharts() {
  const total = 30;
  const initialCount = 8;
  const now = Date.now();

  // ——— 1) Підготовка серій ———
  const accuracySeries = Array.from({ length: total }, (_, i) => ({
    t: now + i*1000,
    v: +(Math.random()*10 + 90).toFixed(2)
  }));
  const errorSeries = Array.from({ length: total }, (_, i) => ({
    t: now + i*1000,
    v: Math.floor(Math.random()*5)
  }));
  const corrSeries = Array.from({ length: total }, (_, i) => {
    const w = +(Math.random()*500 + 100).toFixed(2);
    return { t: now + i*1000, x: w, y: +(Math.random()*5 + w/100).toFixed(2) };
  });
  // для гістограми ведемо просто лічильники по 5 класах
  let histCounts = Array.from({ length: 5 }, () => Math.floor(Math.random()*10 + 5));

  // ——— 2) Початкові лейбли та дані ———
  const accLabels = accuracySeries.slice(0, initialCount).map(p => fmtTime(p.t));
  const errLabels = errorSeries.slice(0, initialCount).map(p => fmtTime(p.t));
  const corLabels = corrSeries.slice(0, initialCount).map(p => fmtTime(p.t));
  const histLabels = ['Клас 1','Клас 2','Клас 3','Клас 4','Клас 5'];

  // ——— 3) Створюємо три “живі” графіки + гістограму ———
  chartInstances.accuracy = new Chart(
    document.getElementById('accuracyChart'), {
      type: 'line',
      data: {
        labels: accLabels,
        datasets: [{ label: 'Точність (%)', data: accuracySeries.slice(0,initialCount).map(p=>p.v), fill: true, tension: 0.4 }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    }
  );

  chartInstances.errorCount = new Chart(
    document.getElementById('errorCountChart'), {
      type: 'line',
      data: {
        labels: errLabels,
        datasets: [{ label: 'Помилки', data: errorSeries.slice(0,initialCount).map(p=>p.v) }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    }
  );

  chartInstances.correlation = new Chart(
    document.getElementById('correlationChart'), {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Вага vs Зусилля',
          data: corrSeries.slice(0,initialCount).map(p=>({ x: p.x, y: p.y }))
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    }
  );

  chartInstances.weightHist = new Chart(
    document.getElementById('weightHistChart'), {
      type: 'bar',
      data: {
        labels: histLabels,
        datasets: [{ label: 'К-ть виробів', data: histCounts }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    }
  );

  // ——— 4) Живе додавання точок, щосекунди ———
  let next = initialCount;
  const timer = setInterval(() => {
    if (next >= total) {
      clearInterval(timer);
      return;
    }

    // accuracy
    {
      const p = accuracySeries[next];
      const ch = chartInstances.accuracy;
      ch.data.labels.push(fmtTime(p.t));
      ch.data.datasets[0].data.push(p.v);
      ch.update();
    }
    // errors
    {
      const p = errorSeries[next];
      const ch = chartInstances.errorCount;
      ch.data.labels.push(fmtTime(p.t));
      ch.data.datasets[0].data.push(p.v);
      ch.update();
    }
    // correlation
    {
      const p = corrSeries[next];
      const ch = chartInstances.correlation;
      ch.data.datasets[0].data.push({ x: p.x, y: p.y });
      ch.update();
    }
    // гістограма: випадково інкрементуємо один із 5 класів
    {
      const idx = Math.floor(Math.random() * histCounts.length);
      histCounts[idx]++;
      const ch = chartInstances.weightHist;
      ch.data.datasets[0].data = histCounts;
      ch.update();
    }

    next++;
  }, 2000);
}


// 4. Додавання нових даних
function addNextToCharts() {
  const byType = allData.reduce((acc, r) => {
    (acc[r.sensor_type] = acc[r.sensor_type] || []).push(r);
    return acc;
  }, {});

  chartConfigs.forEach(cfg => {
    const series = (byType[cfg.sensorType] || [])
      .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(r => ({ v: +r.value, t: r.timestamp, batchId: r.batchId }));

    const chunk = series.slice(cfg.nextIndex, cfg.nextIndex + 1);
    if (!chunk.length) return;

    // Оновлення batchLabels
    cfg.batchLabels.push(...chunk.map(pt => pt.batchId));

    // Додавання даних
    chunk.forEach(pt => {
      if (cfg.type === 'scatter') {
        cfg.chart.data.datasets[0].data.push({ x: pt.v, y: pt.v, batchId: pt.batchId });
      } else {
        cfg.chart.data.labels.push(fmtTime(pt.t));
        cfg.chart.data.datasets[0].data.push(pt.v);
      }
    });
    cfg.chart.update();
    cfg.nextIndex += chunk.length;
  });
}


// Показ toast-повідомлення
function showNotification(message, duration = 3000) {
  const note = document.createElement('div');
  note.className = 'notification';
  note.textContent = message;
  notificationContainer.appendChild(note);
  requestAnimationFrame(() => note.classList.add('show'));
  setTimeout(() => {
    note.classList.remove('show');
    note.addEventListener('transitionend', () => note.remove(), { once: true });
  }, duration);
}

// Перемикання розділів
function showSection(id) {
  if (id === 'settings' && window.APP_ROLE !== 'admin') {
    showNotification('У вас немає доступу до налаштувань', 2000);
    return;
  }
  // 1) Переключити клас active
  sections.forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  // 2) Для кожної секції – без помилок, якщо щось не знайдено
  sections.forEach(sec => {
    const content = sec.querySelector('.section-content');
    const msg     = sec.querySelector('.disabled-msg');

    // Якщо контенту немає — нічого не робимо
    if (!content) return;

    // Якщо це settings і не admin
    if (sec.id === 'settings') {
      content.style.display = 'block';
      if (msg) msg.style.display = 'none';

    } else if (!systemActive) {
      // система викл: сховати контент, показати msg
      content.style.display = 'none';
      if (msg) {
        msg.style.display = 'block';
        msg.textContent   = '🔴 Система вимкнена';
      }

    } else {
      // система включ — показати контент, заховати msg
      content.style.display = (sec.id === 'analytics' ? 'grid' : 'block');
      if (msg) msg.style.display = 'none';
    }
  });

  // 3) Підганяємо чарти
  Object.values(chartInstances).forEach(c => c.resize());
}

async function loadAllBatches() {
  const all = await apiFetch('/sensor_data');
  const groups = all.reduce((acc, r) => {
    (acc[r.batchId] = acc[r.batchId] || []).push(r);
    return acc;
  }, {});
  batchIds       = Object.keys(groups).sort((a,b)=>a-b);
  sensorBatches = batchIds.map(id => groups[id]);
}

function renderBatch(index) {
  if (!sensorBatches.length) return;
  const batch = sensorBatches[index];
  const grid  = document.getElementById('sensorGrid');
  grid.innerHTML = '';

  batch.forEach(s => {
    const danger = s.warn !== undefined && +s.value > s.warn ? ' danger' : '';
    const card = document.createElement('div');
    card.className = 'sensor-card' + danger;
    card.innerHTML = `
      <div class="sensor-title">${s.icon} ${s.sensor_type}</div>
      <div class="sensor-value">${s.value} ${s.unit}</div>
    `;
    grid.appendChild(card);
    if (window.APP_ROLE === 'admin' && conveyorPaused) {
      const actions = document.createElement('div');
      actions.className = 'sensor-actions';
      actions.innerHTML = `<button class="editBtn" data-id="${s.id}">✏️ Редагувати</button>`;
      card.appendChild(actions);
    }
  });

  document.getElementById('batchLabel').textContent =
    `Об’єкт #${batchIds[index]}`;
}


function showNextBatch() {
  if (!sensorBatches.length) return;
  renderBatch(currentBatch);
  currentBatch = (currentBatch + 1) % sensorBatches.length;
}



function setSensorInterval() {
  clearInterval(sensorTimer);
  const sec = parseInt(document.getElementById('sensorInterval').value, 10);
  document.getElementById('sensorIntervalLabel').textContent = sec;
  sensorTimer = setInterval(showNextBatch, sec * 1000);
}

function getNextEventId() {
  const current = parseInt(localStorage.getItem('eventCounter') || '0', 10);
  const next = current + 1;
  localStorage.setItem('eventCounter', next.toString());
  return next;
}
function getNextItemId() {
  const current = parseInt(localStorage.getItem('itemCounter') || '0', 10);
  const next = current + 1;
  localStorage.setItem('itemCounter', next.toString());
  return next;
}


// 1) Рендеримо картки сортування
function performSort(itemId) {
  const items = JSON.parse(localStorage.getItem('itemsToSort'));
  const item  = items.find(i => i.id === itemId);

  let result = 'accepted', note = 'Параметри в нормі';

  if (item.weight < 200) {
    result = 'warning';
    note   = 'Замала вага для подальшої обробки';
  } else if (item.weight > 600) {
    result = 'rejected';
    note   = 'Вага перевищує граничне значення';
  } else if (item.force > 12) {
    result = 'rejected';
    note   = 'Зусилля перевищує безпечний поріг';
  }

  item.sortResult = result;
  item.sortNote   = note;

  localStorage.setItem('itemsToSort', JSON.stringify(items));

  const events = JSON.parse(localStorage.getItem('sortEvents'));
  events.unshift({
    id: getNextEventId(),
    timestamp: new Date().toISOString(),
    itemId,
    result,
    note
  });
  localStorage.setItem('sortEvents', JSON.stringify(events));

  loadSortingItems();
  renderSortLog();
}


function loadSortingItems() {
  const items = JSON.parse(localStorage.getItem('itemsToSort'));
  const grid  = document.getElementById('smartSensorGrid');
  grid.innerHTML = '';

  // Кнопки керування
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄 Оновити предмети';
  refreshBtn.className = 'btn';
  refreshBtn.id = 'refreshItemsBtn';
  refreshBtn.addEventListener('click', () => {
    regenerateSortingItems();
    loadSortingItems();
  });

  const sortAllBtn = document.createElement('button');
  sortAllBtn.textContent = '✅ Відсортувати усе';
  sortAllBtn.className = 'btn';
  sortAllBtn.id = 'sortAllBtn';
  sortAllBtn.addEventListener('click', () => {
    items.filter(i => !i.sortResult).forEach(i => performSort(i.id));
  });

  grid.append(refreshBtn);
  grid.append(sortAllBtn);

  items.forEach(item => {
    const result = item.sortResult || 'unsorted';
    const css    = result === 'accepted' ? 'accepted'
                  : result === 'rejected' ? 'rejected'
                  : result === 'warning' ? 'warning' : '';

    const card = document.createElement('div');
    card.className = 'sorting-card ' + css;
    card.innerHTML = `
      <div class="sensor-title">📦 ${item.name}</div>
      <div class="sensor-value">${item.weight} г, ${item.force} Н</div>
      ${item.sortNote ? `<div class="sort-note">📋 ${item.sortNote}</div>` : ''}
      ${!item.sortResult ? `<button class="btn sort-btn" data-id="${item.id}">Сортувати</button>` : ''}
    `;
    grid.append(card);
  });
}


// Генерація нових випадкових предметів
function regenerateSortingItems() {
  localStorage.setItem('itemCounter', '0');
  const newItems = Array.from({ length: 6 }, (_, i) => ({
    id: getNextItemId(),
    name: `Об'єкт ${i + 1}`,
    weight: Math.floor(Math.random() * 500) + 100,
    force: +(Math.random() * 20).toFixed(1)
  }));
  localStorage.setItem('itemsToSort', JSON.stringify(newItems));
}


// 3) Рендеримо таблицю журналу
function renderSortLog(filter = 'all') {
  const table = document.getElementById('logTable');
  table.querySelectorAll('tr:not(:first-child)').forEach(r => r.remove());
  
  const events = JSON.parse(localStorage.getItem('sortEvents')) || [];

  const filtered = filter === 'all' ? events : events.filter(ev => ev.result === filter);

  filtered.forEach(ev => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ev.id}</td>
      <td>${new Date(ev.timestamp).toLocaleString()}</td>
      <td>${ev.itemId}</td>
      <td>${ev.result}</td>
      <td>${ev.note}</td>
    `;
    table.append(tr);
  });
}




// 6) Логування системних подій
async function logSystem(message, level='info') {
  try {
    await apiFetch('/system_logs', {
      method:'POST',
      body: JSON.stringify({ message, level })
    });
  } catch {}
}

// Footer status
function updateFooterStatus() {
  const txt     = document.getElementById('statusText');
  const tmp     = document.getElementById('tempStatus');
  const alertEl = document.getElementById('alertStatus');
  if (systemActive) {
    txt.textContent = '🟢 Система активна';
    tmp.textContent = (Math.random()*30+30).toFixed(1)+'°C';
    const al = Math.random()>0.8 ? '❗ Перевищено навантаження' : 'Немає';
    alertEl.textContent = al;
    alertEl.style.color = al!=='Немає' ? warningColor : 'white';
  } else {
    txt.textContent = '🔴 Система вимкнена';
    tmp.textContent = '--';
    alertEl.textContent = '';
    alertEl.style.color = 'inherit';
  }
  enableBtn.disabled  =  systemActive;
  disableBtn.disabled = !systemActive;
}





// Вмикання/вимикання системи
function enableSystem() {
  if (systemActive) return;
  systemActive = true;
  showSection(document.querySelector('.section.active').id);
  showNextBatch();
  setSensorInterval();
  updateFooterStatus();
  logSystem('Система увімкнена','info');
}

function disableSystem() {
  if (!systemActive) return;
  systemActive = false;
  showSection(document.querySelector('.section.active').id);
  clearInterval(sensorInterval);
  updateFooterStatus();
  logSystem('Система вимкнена','warning');
}


// Старт скрипта
document.addEventListener('DOMContentLoaded', async()=>{

  await loadAllBatches();  // 1) підвантажили всі дані
  
  showNextBatch();         // 2) показали перший блок
  setSensorInterval();     // 3) запустили інтервал за поточним значенням повзунка

  // ініціалізація кнопки паузи
  const toggleBtn = document.getElementById('toggleConveyorBtn');

  toggleBtn.addEventListener('click', () => {
  conveyorPaused = !conveyorPaused;
  if (conveyorPaused) {
    clearInterval(sensorTimer);
    showNextBatch();               // ⬅️ Ось ця лінійка
    toggleBtn.textContent = '▶️ Запустити конвеєр';
  } else {
    showNextBatch();               // потрібно і тут, щоб прибрати кнопки
    setSensorInterval();
    toggleBtn.textContent = '⏸️ Зупинити конвеєр!';
  }
  });

  // ————— Слайдер для інтервалу оновлення сенсорів —————
  const sensorSlider = document.getElementById('sensorInterval');
  const sensorLabel  = document.getElementById('sensorIntervalLabel');
  if (sensorSlider && sensorLabel) {
    sensorLabel.textContent = sensorSlider.value;
    sensorSlider.addEventListener('input', e => {
      sensorLabel.textContent = e.target.value;
      setSensorInterval();
    });
  }
  
  await initAnalyticsCharts();
  initCharts();

  // 5) Налаштування вкладок у Аналітиці
  const tabSensorsBtn = document.getElementById('tabSensors');
  const tabSystemBtn  = document.getElementById('tabSystem');
  const sensorsGrid   = document.getElementById('analyticsSensors');
  const systemGrid    = document.getElementById('analyticsSystem');

  // початковий стан
  sensorsGrid.classList.remove('hidden');
  systemGrid.classList.add('hidden');
  tabSensorsBtn.classList.add('active');
  tabSystemBtn.classList.remove('active');

  tabSensorsBtn.addEventListener('click', () => {
    tabSensorsBtn.classList.add('active');
    tabSystemBtn .classList.remove('active');
    sensorsGrid .classList.remove('hidden');
    systemGrid  .classList.add('hidden');
    // resize сенсорних графіків
    ['tempChart','weightChart','forceChart','humidityChart']
      .forEach(id => chartInstances[id].resize());
  });

  tabSystemBtn.addEventListener('click', () => {
    tabSystemBtn .classList.add('active');
    tabSensorsBtn.classList.remove('active');
    systemGrid  .classList.remove('hidden');
    sensorsGrid .classList.add('hidden');
    // resize системних графіків
    ['accuracyChart','errorCountChart','weightHistChart','correlationChart']
      .forEach(id => chartInstances[id].resize());
  });

  showSection('smart');
  enableSystem();          // <<< важливо!

  navLinks.forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    showSection(a.dataset.section);
  }));

   // рендеримо сортування і журнал
  loadSortingItems();
  renderSortLog();

  // делегуємо клік на кнопку “Сортувати”
  document.getElementById('smartSensorGrid').addEventListener('click', e => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    performSort(Number(btn.dataset.id));
  });


  document.getElementById('logFilter').addEventListener('change', e => {
    renderSortLog(e.target.value);
  });

  document.getElementById('clearLogBtn').addEventListener('click', () => {
    if (confirm('Очистити журнал подій?')) {
      localStorage.setItem('sortEvents', '[]');
      localStorage.setItem('eventCounter', '0');

      // ОЧИЩЕННЯ предметів
      localStorage.setItem('itemCounter', '0');
      regenerateSortingItems();

      renderSortLog();
      loadSortingItems(); // оновлює відображення
    }
  });


  enableBtn  .addEventListener('click', enableSystem);
  disableBtn .addEventListener('click', disableSystem);
  
  

  // 7) Додати новий сенсор
  const addBtn = document.getElementById('addSensorBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const type = prompt('Тип сенсора:');
      const unit = prompt('Одиниця виміру:');
      const value = prompt('Початкове значення:');
      if (!type || !value) return;
      try {
        await apiFetch('/sensor_data', {
          method: 'POST',
          body: JSON.stringify({ sensor_type: type, value, unit })
        });
        showNotification('Сенсор додано');
      } catch {
        showNotification('Не вдалося додати сенсор');
      }
    });
  }

  // 8) Редагувати та видаляти — делегуємо по всьому body
  document.body.addEventListener('click', async e => {
  // 1) Зразу ж дивимось, чи клікнули на кнопку «Редагувати»
  const editBtn = e.target.closest('.editBtn');
  if (!editBtn) return;

  // 2) Беремо id і нове значення
  const id = editBtn.dataset.id;
  const newValue = prompt('Введіть нове значення сенсора:');
  if (newValue == null) return;

  try {
    // 3) Відправляємо запит на сервер
    await apiFetch(`/sensor_data/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ value: newValue })
    });
    showNotification('Значення оновлено');

    // 4) Оновлюємо локальний масив і рендеримо ту ж саму пачку
    const prevIndex = (currentBatch - 1 + sensorBatches.length) % sensorBatches.length;
    sensorBatches[prevIndex] = sensorBatches[prevIndex].map(s =>
      s.id === id ? { ...s, value: newValue } : s
    );
    renderBatch(prevIndex);

  } catch {
    showNotification('Не вдалося оновити значення', 2000);
  }
  });


});
