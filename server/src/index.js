import { load } from './db.js';
import { createApp } from './app.js';

load();
const PORT = Number(process.env.PORT) || 3000;
createApp().listen(PORT, () => {
  console.log(`Shift Management API running on http://localhost:${PORT}`);
});
