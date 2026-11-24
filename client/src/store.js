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

// Shared reference data: organisation tree, the selected team and its members.
export const base = reactive({
  org: [], // hospitals → departments → teams (only what the user may see)
  teamId: null, // currently selected team
  team: null, // { id, name, department, hospital, settings, canManage }
  settings: null, // = team.settings (kept as its own field: most views read it)
  users: [], // members of the selected team
  names: {}, // id → name for anyone the user may see (approvers, editors…)
  loaded: false,
});

export const teamList = () =>
  base.org.flatMap((h) => h.departments.flatMap((d) => d.teams.map((t) => ({ ...t, department: d.name, hospital: h.name, hospitalId: h.id, departmentId: d.id }))));

const TEAM_KEY = 'ecg-team';

export async function loadBase(force = false) {
  if (base.loaded && !force) return base;
  const { api } = await import('./api.js');
  const [org, names] = await Promise.all([api('/org'), api('/users/names')]);
  base.org = org;
  base.names = names;
  const teams = teamList();
  let saved = null;
  try {
    saved = localStorage.getItem(TEAM_KEY);
  } catch { /* ignore */ }
  const pick = [base.teamId, saved, auth.user?.teamId, teams[0]?.id].find((id) => id && teams.some((t) => t.id === id));
  await selectTeam(pick || null, { silent: true });
  base.loaded = true;
  return base;
}

export async function selectTeam(teamId, { silent = false } = {}) {
  const { api } = await import('./api.js');
  if (!teamId) {
    Object.assign(base, { teamId: null, team: null, settings: null, users: [] });
    return;
  }
  const [team, users] = await Promise.all([api(`/teams/${teamId}`), api(`/users?teamId=${teamId}`)]);
  Object.assign(base, { teamId, team, settings: team.settings, users });
  try {
    localStorage.setItem(TEAM_KEY, teamId);
  } catch { /* ignore */ }
  if (!silent) toast(team.name);
}

/** API path inside the selected team, e.g. tp('/schedule/2026-11') */
export const tp = (path) => `/teams/${base.teamId}${path}`;

export const userName = (id) => base.users.find((u) => u.id === id)?.name ?? base.names[id] ?? (id ? '—' : '—');
export const shiftById = (id) => base.settings?.shifts.find((s) => s.id === id);

// ---- roles ----
export const role = () => auth.user?.role;
export const isSuper = () => role() === 'super_admin';
export const isOrgAdmin = () => ['super_admin', 'hospital_admin'].includes(role());
export const isManagerRole = () => role() && role() !== 'staff';
/** Can the user manage the selected team (schedule, members, approvals)? */
export const canManage = () => !!base.team?.canManage;
/** Kept for older call sites: "admin" now means "manages the selected team". */
export const isAdmin = canManage;
