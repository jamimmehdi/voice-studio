import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts';
import { App } from './App';
import { RuntimeProvider } from './runtime/react';
import { createRuntime } from './runtime/runtime';

const runtime = createRuntime();

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>
    <RuntimeProvider runtime={runtime}>
      <App />
    </RuntimeProvider>
  </StrictMode>,
);

window.addEventListener('beforeunload', () => runtime.dispose());
