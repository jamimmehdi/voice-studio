import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts';
import { IconApp } from './IconApp';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>
    <IconApp />
  </StrictMode>,
);
