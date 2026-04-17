/**
 * Authenticated fetch wrapper.
 * Reads kado_token from localStorage and adds Bearer header automatically.
 */
export function authFetch(url, options = {}) {
  const token = localStorage.getItem('kado_token');
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
