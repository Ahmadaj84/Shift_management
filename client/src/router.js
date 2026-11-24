import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './store.js';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', redirect: () => (auth.user?.role !== 'staff' ? '/dashboard' : '/my-schedule') },
  { path: '/dashboard', component: () => import('./views/DashboardView.vue'), meta: { manager: true } },
  { path: '/my-schedule', component: () => import('./views/MyScheduleView.vue'), meta: { noTeam: true } },
  { path: '/schedule', component: () => import('./views/TeamScheduleView.vue') },
  { path: '/requests', component: () => import('./views/RequestsView.vue') },
  { path: '/team', component: () => import('./views/TeamView.vue'), meta: { manager: true } },
  { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { manager: true } },
  { path: '/organization', component: () => import('./views/OrganizationView.vue'), meta: { orgAdmin: true, noTeam: true } },
  { path: '/profile', component: () => import('./views/ProfileView.vue'), meta: { noTeam: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (!to.meta.public && !auth.token) return '/login';
  if (to.path === '/login' && auth.token) return '/';
  const r = auth.user?.role;
  if (to.meta.manager && r === 'staff') return '/my-schedule';
  if (to.meta.orgAdmin && !['super_admin', 'hospital_admin'].includes(r)) return '/';
});

export default router;
