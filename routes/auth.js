const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { nanoid } = require('nanoid');

const router = express.Router();
const JWT_SECRET = 'your_jwt_secret';

// Опис сенсорів для динамічної генерації даних
const sensorsDef = [
  { name: 'Температура',        icon: '🌡️', unit: '°C', value: () => (Math.random()*30+30).toFixed(1), warn: 60 },
  { name: 'Вага виробу',        icon: '⚖️', unit: 'г',  value: () => (Math.random()*500+100).toFixed(0), warn: 600 },
  { name: 'Колір (RGB)',        icon: '🎨', unit: '',   value: () => 'rgb(' + [0,0,0].map(()=>Math.floor(Math.random()*256)).join(',') + ')' },
  { name: 'Форма',              icon: '🔷', unit: '',   value: () => ['Кругла','Квадратна','Неправильна'][Math.floor(Math.random()*3)] },
  { name: 'Зусилля захвату',    icon: '🤖', unit: 'Н',  value: () => (Math.random()*10+5).toFixed(2), warn: 12 },
  { name: 'Металевість',        icon: '🛡️', unit: '',   value: () => Math.random()>0.5?'Так':'Ні' },
  { name: 'Центр маси',         icon: '🎯', unit: '',   value: () => 'X:' + (Math.random()*100).toFixed(1) + ' Y:' + (Math.random()*100).toFixed(1) },
  { name: 'Координати XYZ',     icon: '📍', unit: '',   value: () => 'X:' + (Math.random()*500).toFixed(0) + ' Y:' + (Math.random()*500).toFixed(0) + ' Z:' + (Math.random()*500).toFixed(0) },
  { name: 'Вологість',          icon: '💧', unit: '%',  value: () => (Math.random()*100).toFixed(1), warn: 80 },
  { name: 'Час перебування',    icon: '⏱️', unit: 'с',  value: () => (Math.random()*5+1).toFixed(2), warn: 6 }
];

// Ініціалізація БД
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({
  users: [],
  sensor_data: [],
  sort_events: [],
  settings: [],
  system_logs: []
}).write();





/** ========== AUTH ========== **/
// Реєстрація
router.post('/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  const allowed = ['operator', 'admin'];
  const userRole = allowed.includes(role) ? role : 'operator';
  if (db.get('users').find({ username }).value()) {
    return res.status(400).json({ error: 'Користувач вже існує' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: nanoid(), username, passwordHash, role: userRole };
  db.get('users').push(user).write();
  res.json({ message: 'OK', user: { id: user.id, username, role: userRole } });
});
// Логін
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username }).value();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Невірні дані' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role });
});
// Валідація токена
router.get('/auth/validate', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Немає токена' });
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    res.json({ role: payload.role });
  } catch {
    res.status(401).json({ error: 'Невірний токен' });
  }
});





router.get('/sensor_data', (req, res) => {
  res.json(db.get('sensor_data').value());
});


router.post('/sensor_data', (req, res) => {
  const { sensor_type, icon, value, unit, warn } = req.body;
  const newItem = {
    id:        nanoid(),
    timestamp: new Date().toISOString(),
    sensor_type,
    icon,
    value,
    unit,
    warn
  };
  db.get('sensor_data').push(newItem).write();
  res.status(201).json(newItem);
});
// Оновити існуючий запис
router.put('/sensor_data/:id', (req, res) => {
  const item = db.get('sensor_data').find({ id: req.params.id }).value();
  if (!item) return res.sendStatus(404);
  db.get('sensor_data')
    .find({ id: req.params.id })
    .assign(req.body)
    .write();
  res.json(db.get('sensor_data').find({ id: req.params.id }).value());
});

// Видалити запис
router.delete('/sensor_data/:id', (req, res) => {
  db.get('sensor_data').remove({ id: req.params.id }).write();
  res.sendStatus(204);
});


/** ========== CRUD sort_events ========== **/
router.get('/sort_events', (req, res) => {
  res.json(db.get('sort_events').value());
});
router.get('/sort_events/:id', (req, res) => {
  const ev = db.get('sort_events').find({ id: req.params.id }).value();
  if (!ev) return res.sendStatus(404);
  res.json(ev);
});
router.post('/sort_events', (req, res) => {
  const { weight, force, shape, result, note } = req.body;
  const newEv = { id: nanoid(), timestamp: new Date().toISOString(), weight, force, shape, result, note };
  db.get('sort_events').push(newEv).write();
  res.status(201).json(newEv);
});
router.put('/sort_events/:id', (req, res) => {
  if (!db.get('sort_events').find({ id: req.params.id }).value()) return res.sendStatus(404);
  db.get('sort_events').find({ id: req.params.id }).assign(req.body).write();
  res.json(db.get('sort_events').find({ id: req.params.id }).value());
});
router.delete('/sort_events/:id', (req, res) => {
  db.get('sort_events').remove({ id: req.params.id }).write();
  res.sendStatus(204);
});

/** ========== CRUD settings ========== **/
router.get('/settings', (req, res) => {
  res.json(db.get('settings').value());
});
router.get('/settings/:id', (req, res) => {
  const s = db.get('settings').find({ id: req.params.id }).value();
  if (!s) return res.sendStatus(404);
  res.json(s);
});
router.post('/settings', (req, res) => {
  const { parameter_name, value } = req.body;
  const newS = { id: nanoid(), parameter_name, value };
  db.get('settings').push(newS).write();
  res.status(201).json(newS);
});

router.put('/settings/:id', (req, res) => {
  const setting = db.get('settings').find({ id: req.params.id }).value();
  if (!setting) return res.sendStatus(404);

  db.get('settings').find({ id: req.params.id }).assign(req.body).write();

  // якщо ми оновили sensorInterval — перезапускаємо таймер
  if (setting.parameter_name === 'sensorInterval') {
    const newSec = parseInt(req.body.value, 10);
    startSensorPush(newSec);
  }

  res.json(db.get('settings').find({ id: req.params.id }).value());
});


router.delete('/settings/:id', (req, res) => {
  db.get('settings').remove({ id: req.params.id }).write();
  res.sendStatus(204);
});

/** ========== CRUD system_logs ========== **/
router.get('/system_logs', (req, res) => {
  res.json(db.get('system_logs').value());
});
router.get('/system_logs/:id', (req, res) => {
  const l = db.get('system_logs').find({ id: req.params.id }).value();
  if (!l) return res.sendStatus(404);
  res.json(l);
});
router.post('/system_logs', (req, res) => {
  const { message, level } = req.body;
  const newL = { id: nanoid(), timestamp: new Date().toISOString(), message, level };
  db.get('system_logs').push(newL).write();
  res.status(201).json(newL);
});
router.put('/system_logs/:id', (req, res) => {
  if (!db.get('system_logs').find({ id: req.params.id }).value()) return res.sendStatus(404);
  db.get('system_logs').find({ id: req.params.id }).assign(req.body).write();
  res.json(db.get('system_logs').find({ id: req.params.id }).value());
});
router.delete('/system_logs/:id', (req, res) => {
  db.get('system_logs').remove({ id: req.params.id }).write();
  res.sendStatus(204);
});

module.exports = router;
