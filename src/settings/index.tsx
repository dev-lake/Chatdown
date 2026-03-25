import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n/react';
import App from './App';
import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
