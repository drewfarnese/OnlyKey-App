import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme } from './utils/theme';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const isDesktopShell =
  typeof nw !== 'undefined' ||
  (typeof window !== 'undefined' && !!window.electronAPI?.isDesktop);

if (isDesktopShell) {
  import('./desktop/initDesktop').then((m) => m.initDesktop()).catch(console.error);
}