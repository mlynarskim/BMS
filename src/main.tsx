import { createRoot } from 'react-dom/client'
import BMSReaderApp from './App'
import './index.css'

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const errorText = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return 'Nieznany błąd uruchamiania';
  }
};

const showFatalError = (reason: unknown): void => {
  const message = errorText(reason);
  container.innerHTML = '';

  const panel = document.createElement('main');
  panel.style.cssText =
    'min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#fff;color:#0f172a;font-family:system-ui,sans-serif;text-align:center';

  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Nie udało się uruchomić aplikacji';
  title.style.cssText = 'display:block;font-size:20px;margin-bottom:12px;color:#b91c1c';

  const description = document.createElement('p');
  description.textContent = message;
  description.style.cssText = 'margin:0;max-width:560px;word-break:break-word';

  content.append(title, description);
  panel.append(content);
  container.append(panel);
};

window.addEventListener('error', (event) => {
  showFatalError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason);
});

try {
  createRoot(container).render(<BMSReaderApp />);
} catch (error) {
  showFatalError(error);
}
