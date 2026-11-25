import { auth, logout } from './store.js';
import { translateError } from './i18n.js';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && auth.token) logout();
  if (!res.ok) throw new Error(translateError(data?.error || `Request failed (${res.status})`));
  return data;
}

/** Download a file from the API (sends the login token) and save it. */
export async function download(path, filename) {
  const res = await fetch(`/api${path}`, {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && auth.token) logout();
    throw new Error(translateError(data?.error || `Request failed (${res.status})`));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Upload a file's raw bytes (POST) and return the JSON response. */
export async function upload(path, file) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && auth.token) logout();
  if (!res.ok) throw new Error(translateError(data?.error || `Request failed (${res.status})`));
  return data;
}
