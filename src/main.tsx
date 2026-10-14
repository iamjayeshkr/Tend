import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-500.css';
import '@fontsource/caveat/latin-400.css';
import App from './App';
import { TendAuthProvider } from './auth/TendAuthProvider';
import { readPublicEnvironment } from './security/env';
import './styles.css';
import './experience.css';
const environment = readPublicEnvironment({
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TendAuthProvider environment={environment}>
      <App environment={environment}/>
    </TendAuthProvider>
  </React.StrictMode>,
);
if(import.meta.env.PROD && 'serviceWorker' in navigator && !(window as any).AndroidBridge) navigator.serviceWorker.register('./sw.js').catch(()=>{});
