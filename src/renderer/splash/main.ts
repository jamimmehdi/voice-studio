import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './splash.css';

// the main process passes the version as ?v=2.0.0
const version = new URLSearchParams(window.location.search).get('v');
const label = document.getElementById('version');
if (label && version) label.textContent = `v${version}`;
