import {continueRender, delayRender} from 'remotion';

const handle = delayRender('Loading fonts');

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap';

link.addEventListener('load', () => continueRender(handle));
link.addEventListener('error', () => continueRender(handle)); // non-fatal

document.head.appendChild(link);
