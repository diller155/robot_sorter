(function(){
  const publicPages = ['login.html','register.html'];
  const path = window.location.pathname.split('/').pop();
  if (publicPages.includes(path)) return;
  const token = localStorage.getItem('token');
  if (!token) return window.location = 'login.html';
  fetch('/api/auth/validate', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(res=> {
    if (!res.ok) throw new Error();
    return res.json();
  }).then(({ role }) => {
    window.APP_ROLE = role;
    localStorage.setItem('role', role);

    document.addEventListener('DOMContentLoaded', () => {
    // пробуємо взяти й ім'я, якщо воно збережене
    const username = localStorage.getItem('username') || 'Гість';
    document.getElementById('userName').textContent = username;
    document.getElementById('userRole').textContent = role;
    });

    // якщо оператор — ховаємо секцію налаштувань
    if (role === 'operator') {
      const settingsLink = document.querySelector('nav a[data-section="settings"]');
      if (settingsLink) settingsLink.style.display = 'none';
    }
  }).catch(()=>{
    localStorage.removeItem('token');
    window.location = 'login.html';
  });
})();