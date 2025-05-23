import { apiFetch } from './api.js';



// DOM-елементи
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('nav a');
const simulateBtn = document.getElementById('simulateLogsBtn');
const smartBtn    = document.getElementById('smartSortBtn');
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
  { id: 'humidityChart',  sensorType: 'Вологість',        type: 'line',    label: 'Вологість'        },
  { id: 'cycleChart',     sensorType: 'Час перебування',  type: 'line',    label: 'Час перебування'  }
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

    const initial = series.slice(0, 10);
    cfg.nextIndex = 10;
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

  // Інтервал для додавання по 5 точок кожні 10 с
  setInterval(addNextToCharts, 10000);
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

    const chunk = series.slice(cfg.nextIndex, cfg.nextIndex + 5);
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


// 3) Розумне сортування + POST в sort_events
async function smartSort() {
  if (!systemActive) {
    showNotification('Система вимкнена! Увімкніть систему для сортування.', 2500);
    return;
  }
  const weight = +(Math.random() * 400 + 200).toFixed(0);
  const force  = +(Math.random() * 10 + 5).toFixed(2);
  const shape  = ['Кругла','Квадратна','Неправильна'][Math.floor(Math.random()*3)];
  let result = 'accepted', reason = '';
  if (weight>600 && force>12) { result='rejected'; reason=`Вага й зусилля понад ліміт`; }
  else if (shape!=='Кругла')    { result='warning';  reason=`Форма: ${shape}`; }

  // Відобразити у UI
  const entry = document.createElement('div');
  entry.className = `log-entry ${result}`;
  entry.innerHTML = `<strong>${
    result==='accepted' ? '✔️ Прийнято' 
      : result==='rejected' ? '❌ Відхилено' 
      : '⚠️ Попередження'
  }</strong> — ${reason||'OK'}`;
  document.getElementById('logOutput').prepend(entry);

  // POST
  try {
    await apiFetch('/sort_events', {
      method: 'POST',
      body: JSON.stringify({ weight, force, shape, result, note: reason })
    });
  } catch {
    showNotification('Не вдалося зберегти подію сортування', 2000);
  }
}

// 4) Завантажити журнал sort_events
async function loadSortLog() {
  try {
    const events = await apiFetch('/sort_events');
    const table = document.getElementById('logTable');
    table.querySelectorAll('tr:not(:first-child)').forEach(r => r.remove());
    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ev.id}</td>
        <td>${new Date(ev.timestamp).toLocaleString()}</td>
        <td>${ev.result}</td>
        <td>${ev.weight}</td>
        <td>${ev.force}</td>
        <td>${ev.shape}</td>
      `;
      table.appendChild(tr);
    });
  } catch {
    showNotification('Не вдалося завантажити журнал сортувань', 2000);
  }
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
  smartBtn.disabled   = !systemActive;
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
    toggleBtn.textContent = '⏸️ Пауза конвеєра';
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
  
  initAnalyticsCharts();
  showSection('smart');
  enableSystem();          // <<< важливо!

  navLinks.forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    showSection(a.dataset.section);
  }));
  simulateBtn.addEventListener('click', loadSortLog);
  smartBtn   .addEventListener('click', smartSort);
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
