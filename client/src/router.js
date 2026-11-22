import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './store.js';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', redirect: () => (auth.user?.role === 'admin' ? '/dashboard' : '/my-schedule') },
  { path: '/dashboard', component: () => import('./views/DashboardView.vue'), meta: { admin: true } },
  { path: '/my-schedule', component: () => import('./views/MyScheduleView.vue') },
  { path: '/schedule', component: () => import('./views/TeamScheduleView.vue') },
  { path: '/requests', component: () => import('./views/RequestsView.vue') },
  { path: '/team', component: () => import('./views/TeamView.vue'), meta: { admin: true } },
  { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { admin: true } },
  { path: '/profile', component: () => import('./views/ProfileView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (!to.meta.public && !auth.token) return '/login';
  if (to.path === '/login' && auth.token) return '/';
  if (to.meta.admin && auth.user?.role !== 'admin') return '/my-schedule';
});

export default router;
