import { reactive } from 'vue';

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('ecg-auth') || 'null');
  } catch {
    return null;
  }
})();

export const auth = reactive({ token: saved?.token || null, user: saved?.user || null });

export function setAuth(token, user) {
  auth.token = token;
  auth.user = user;
  localStorage.setItem('ecg-auth', JSON.stringify({ token, user }));
}

export function logout() {
  auth.token = null;
  auth.user = null;
  localStorage.removeItem('ecg-auth');
  if (location.pathname !== '/login') location.assign('/login');
}

export const isAdmin = () => auth.user?.role === 'admin';

// Toast notifications
export const toasts = reactive([]);
export function toast(message, type = 'success') {
  const id = Math.random();
  toasts.push({ id, message, type });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3500);
}

// Shared reference data (team list + settings), loaded once per session.
export const base = reactive({ users: [], settings: null, loaded: false });

export async function loadBase(force = false) {
  if (base.loaded && !force) return base;
  const { api } = await import('./api.js');
  const [users, settings] = await Promise.all([api('/users'), api('/settings')]);
  base.users = users;
  base.settings = settings;
  base.loaded = true;
  return base;
}

export const userName = (id) => base.users.find((u) => u.id === id)?.name ?? (id ? 'Unknown' : '—');
export const shiftById = (id) => base.settings?.shifts.find((s) => s.id === id);
