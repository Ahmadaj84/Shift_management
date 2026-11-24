// Organisation model: hospitals → departments → teams, plus roles/permissions.
//
// Roles:
//   super_admin    – everything, everywhere
//   hospital_admin – departments, teams and staff of one hospital (user.hospitalId)
//   leader         – one team (user.teamId): schedule, members, approvals
//   staff          – member of one team (user.teamId)

export const ROLES = ['super_admin', 'hospital_admin', 'leader', 'staff'];

export const SHIFT_TEMPLATES = {
  three8: {
    staffPerShift: 3,
    assignExtraStaff: true,
    shifts: [
      { id: 'morning', name: 'صباحي', short: 'ص', start: '07:00', end: '15:00', color: '#f59e0b' },
      { id: 'evening', name: 'مسائي', short: 'م', start: '15:00', end: '23:00', color: '#3b82f6' },
      { id: 'night', name: 'ليلي', short: 'ل', start: '23:00', end: '07:00', color: '#8b5cf6' },
    ],
  },
  two12: {
    staffPerShift: 3,
    assignExtraStaff: true,
    shifts: [
      { id: 'day', name: 'نهاري', short: 'ن', start: '07:00', end: '19:00', color: '#f59e0b' },
      { id: 'night', name: 'ليلي', short: 'ل', start: '19:00', end: '07:00', color: '#8b5cf6' },
    ],
  },
};
export const templateSettings = (key = 'three8') => structuredClone(SHIFT_TEMPLATES[key] || SHIFT_TEMPLATES.three8);

// ---------- lookups ----------
export const findTeam = (d, id) => d.teams.find((t) => t.id === id);
export const findDepartment = (d, id) => d.departments.find((x) => x.id === id);
export const findHospital = (d, id) => d.hospitals.find((x) => x.id === id);

export function teamHospitalId(d, teamId) {
  const team = findTeam(d, teamId);
  return team ? findDepartment(d, team.departmentId)?.hospitalId ?? null : null;
}

export function userHospitalId(d, u) {
  if (!u) return null;
  if (u.role === 'hospital_admin') return u.hospitalId ?? null;
  if (u.teamId) return teamHospitalId(d, u.teamId);
  return u.hospitalId ?? null;
}

/** Names for a team: { team, department, hospital } */
export function teamLabels(d, teamId) {
  const team = findTeam(d, teamId);
  const dep = team && findDepartment(d, team.departmentId);
  const hos = dep && findHospital(d, dep.hospitalId);
  return { team: team?.name ?? '', department: dep?.name ?? '', hospital: hos?.name ?? '' };
}

/**
 * A team-scoped view with the same shape the scheduler expects
 * ({ settings, users, requests, schedules }). Users are the same objects,
 * so changes (e.g. days off) persist.
 */
export function teamCtx(d, team) {
  d.schedules[team.id] ??= {};
  return {
    team,
    settings: team.settings,
    users: d.users.filter((u) => u.teamId === team.id),
    requests: d.requests,
    schedules: d.schedules[team.id],
  };
}

// ---------- permissions ----------
export function canManageHospital(d, u, hospitalId) {
  return u.role === 'super_admin' || (u.role === 'hospital_admin' && !!hospitalId && u.hospitalId === hospitalId);
}

export function canManageTeam(d, u, teamId) {
  if (!teamId || !findTeam(d, teamId)) return false;
  if (u.role === 'super_admin') return true;
  if (u.role === 'hospital_admin') return teamHospitalId(d, teamId) === u.hospitalId;
  if (u.role === 'leader') return u.teamId === teamId;
  return false;
}

export const canViewTeam = (d, u, teamId) => canManageTeam(d, u, teamId) || (!!teamId && u.teamId === teamId);

/** Roles the actor may give to someone. */
export function assignableRoles(actor) {
  if (actor.role === 'super_admin') return ROLES;
  if (actor.role === 'hospital_admin') return ['leader', 'staff'];
  if (actor.role === 'leader') return ['staff'];
  return [];
}

/** Can the actor edit/remove this user (as they currently are)? */
export function canManageUser(d, actor, target) {
  if (actor.role === 'super_admin') return true;
  if (!target || target.role === 'super_admin') return false;
  if (actor.role === 'hospital_admin') {
    return target.role !== 'hospital_admin' && userHospitalId(d, target) === actor.hospitalId;
  }
  if (actor.role === 'leader') return target.role === 'staff' && target.teamId === actor.teamId;
  return false;
}

export function visibleTeamIds(d, u) {
  return d.teams.filter((t) => canViewTeam(d, u, t.id)).map((t) => t.id);
}

/** Organisation tree trimmed to what the user may see. */
export function orgTree(d, u) {
  const teamIds = new Set(visibleTeamIds(d, u));
  const members = (tid) => d.users.filter((x) => x.teamId === tid && x.active !== false);
  return d.hospitals
    .filter((h) => u.role === 'super_admin' || canManageHospital(d, u, h.id) || d.departments.some((dp) => dp.hospitalId === h.id && d.teams.some((t) => t.departmentId === dp.id && teamIds.has(t.id))))
    .map((h) => ({
      id: h.id,
      name: h.name,
      manageable: canManageHospital(d, u, h.id),
      admins: canManageHospital(d, u, h.id)
        ? d.users.filter((x) => x.role === 'hospital_admin' && x.hospitalId === h.id && x.active !== false).map((x) => ({ id: x.id, name: x.name, username: x.username }))
        : [],
      departments: d.departments
        .filter((dp) => dp.hospitalId === h.id)
        .filter((dp) => canManageHospital(d, u, h.id) || d.teams.some((t) => t.departmentId === dp.id && teamIds.has(t.id)))
        .map((dp) => ({
          id: dp.id,
          name: dp.name,
          teams: d.teams
            .filter((t) => t.departmentId === dp.id && teamIds.has(t.id))
            .map((t) => ({
              id: t.id,
              name: t.name,
              manageable: canManageTeam(d, u, t.id),
              memberCount: members(t.id).length,
              leaders: members(t.id).filter((x) => x.role === 'leader').map((x) => ({ id: x.id, name: x.name })),
              shiftCount: t.settings.shifts.length,
              staffPerShift: t.settings.staffPerShift,
            })),
        })),
    }));
}

// ---------- migration from the single-team (v1) format ----------
export function migrate(data) {
  if ((data.version || 1) >= 2) return false;
  const now = new Date().toISOString();
  const old = data.settings || templateSettings();
  data.hospitals = [{ id: 'h1', name: 'المستشفى الرئيسي', createdAt: now }];
  const deptName = !old.departmentName || old.departmentName === 'ECG Department' ? 'قسم تخطيط القلب' : old.departmentName;
  data.departments = [{ id: 'dp1', hospitalId: 'h1', name: deptName, createdAt: now }];
  data.teams = [{
    id: 't1',
    departmentId: 'dp1',
    name: 'فريق تخطيط القلب',
    settings: { staffPerShift: old.staffPerShift ?? 3, assignExtraStaff: old.assignExtraStaff ?? true, shifts: old.shifts || templateSettings().shifts },
    createdAt: now,
  }];
  for (const u of data.users || []) {
    if (u.role === 'admin') {
      u.role = 'super_admin';
      u.teamId = u.inRotation ? 't1' : null;
    } else {
      u.role = 'staff';
      u.teamId = 't1';
    }
    u.hospitalId = null;
  }
  const teamOf = new Map((data.users || []).map((u) => [u.id, u.teamId]));
  for (const r of data.requests || []) r.teamId = teamOf.get(r.userId) || 't1';
  data.schedules = { t1: data.schedules || {} };
  delete data.settings;
  data.counters = { ...(data.counters || {}), hospital: 1, department: 1, team: 1 };
  data.version = 2;
  return true;
}
