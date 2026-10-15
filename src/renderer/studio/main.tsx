import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts';
import { App } from './App';
import { RuntimeProvider } from './runtime/react';
import { createRuntime } from './runtime/runtime';
import { restoreFromBackup } from './store/persistence';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

async function start(): Promise<void> {
  // browser storage can come back empty; the copy kept by the main process puts the settings back
  await restoreFromBackup(window.localStorage, () => window.studio.stateBackup.read()).catch(() => false);

  const runtime = createRuntime();
  createRoot(container!).render(
    <StrictMode>
      <RuntimeProvider runtime={runtime}>
        <App />
      </RuntimeProvider>
    </StrictMode>,
  );
  window.addEventListener('beforeunload', () => runtime.dispose());
}

void start();
