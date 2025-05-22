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
  }).then(({ role })=>{
    window.APP_ROLE = role;
    localStorage.setItem('role', role);
    if (role === 'operator') {
      document.addEventListener('DOMContentLoaded', () => {
        const settingsLink = document.querySelector('nav a[data-section="settings"]');
        if (settingsLink) settingsLink.style.display = 'none';
      });
    }
  }).catch(()=>{
    localStorage.removeItem('token');
    window.location = 'login.html';
  });
})();