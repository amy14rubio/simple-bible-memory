// Lays out the website for Firebase Hosting from the app build (dist/, which Capacitor keeps using as it is):
//   /          the landing page          /es   the Spanish landing page
//   /app       the app (the build's index.html)
// Run after `npm run build`; the result is dist-web/.
import { cpSync, rmSync, renameSync, existsSync } from 'node:fs';

rmSync('dist-web', { recursive: true, force: true });
cpSync('dist', 'dist-web', { recursive: true });
renameSync('dist-web/index.html', 'dist-web/app.html');
// Data that is only hosted (never inside the app): the UBS Spanish dictionaries, CC BY-SA 4.0 (see web-data/ubs-es/README.md).
if (existsSync('web-data')) cpSync('web-data', 'dist-web', { recursive: true });
renameSync('dist-web/landing.html', 'dist-web/index.html');
if (existsSync('dist-web/es/landing.html')) renameSync('dist-web/es/landing.html', 'dist-web/es/index.html');
console.log('dist-web ready: / landing, /es landing, /app the app');
