// js/register.js
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const username = form.get('username');
  const password = form.get('password');
  const role     = form.get('role');        // ← отримуємо роль

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username, password, role })
  });

  if (!res.ok) {
    const err = await res.json();
    return alert(err.error || 'Помилка реєстрації');
  }
  alert('Реєстрація успішна');
  window.location = 'login.html';
});
