import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setupAutoUpdate } from './lib/autoUpdate';
import { assertSafeDeploymentOrigin } from './lib/environment';

assertSafeDeploymentOrigin();
setupAutoUpdate();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
