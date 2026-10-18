import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const App =
  new URLSearchParams(location.search).get('workspace') === 'classic'
    ? lazy(() => import('./App'))
    : lazy(() => import('./workbench/Workbench'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div className="app-loading">Opening Signalhive Charts…</div>}>
    <App />
  </Suspense>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* App remains usable without offline storage. */
    });
  });
}
