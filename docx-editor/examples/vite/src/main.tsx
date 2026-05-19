// Bootstrap the deskApp host bridge first — it must define
// `window.__deskApp__` before any other module reads it.
import './desk-bridge-bootstrap';

import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
