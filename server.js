const express = require('express');
const path = require('path');
// Ваш єдиний файл із усіма маршрутами (auth, sensor_data, sort_events тощо)
const apiRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Замість app.use('/api/auth', …) монтуємо весь роутер під /api
app.use('/api', apiRouter);

// Статичні файли фронтенда
app.use(express.static(path.join(__dirname, 'frontend')));

// Опціонально: fallback для SPA — всі невизначені маршрути віддавати index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
