import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './assets/main.css';
import './i18n.js';

createApp(App).use(router).mount('#app');
