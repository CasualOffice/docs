import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setSpellAssetUrls, setWriterWorkerUrl } from '@eigenpal/docx-js-editor';
// Vite asset imports — Hunspell dictionary files served as static
// assets with hashed URLs. The lib doesn't pre-bundle these (its tsup
// build has no loader for .aff / .dic); the demo provides them at
// runtime via `setSpellAssetUrls`. Relative path resolves through the
// workspace into `packages/react/src/assets/spellcheck/`.
import affUrl from '../../../packages/react/src/assets/spellcheck/en.aff?url';
import dicUrl from '../../../packages/react/src/assets/spellcheck/en.dic?url';

setSpellAssetUrls(affUrl, dicUrl);

// Writing-assistant worker — Vite produces a hashed JS asset for the
// worker module. Same shape as the spell-asset URL injection above.
const writerWorkerUrl = new URL(
  '../../../packages/react/src/lib/writer/writer.worker.ts',
  import.meta.url
).toString();
setWriterWorkerUrl(writerWorkerUrl);

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
