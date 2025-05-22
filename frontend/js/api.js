// js/api.js
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {})
    },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  // якщо 204 No Content — повертаємо null
  if (res.status === 204) return null;
  return res.json();
}
