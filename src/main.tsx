import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { audioEngine } from './audio/audioEngine';
import './ui/theme/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Works offline after the first visit (spec rule 10). Service workers need HTTPS or localhost.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

// Development and test builds: expose the audio log so sequencing can be checked from the console.
if (__ALLOW_PLACEHOLDERS__) {
  (window as unknown as { __ksm: unknown }).__ksm = { audio: audioEngine };
}
