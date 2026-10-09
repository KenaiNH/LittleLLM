import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './shared/global.css';
import { PetApp } from './pet/App';
import '@fontsource/courier-prime/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/cousine/400.css';
const InputApp = lazy(() => import('./input/App').then((module) => ({ default: module.InputApp })));
const SettingsApp = lazy(() =>
  import('./settings/App').then((module) => ({ default: module.SettingsApp })),
);
import { settingsPanelSchema } from '../shared/settings';
const root = document.getElementById('root');
if (!root) throw new Error('Missing renderer root');
const view = new URLSearchParams(location.search).get('view');
const panel = settingsPanelSchema.safeParse(view?.slice('settings:'.length));
createRoot(root).render(
  <React.StrictMode>
    <div data-testid="scaffold">
      <Suspense fallback={null}>
        {view?.startsWith('settings:') ? (
          <SettingsApp initialPanel={panel.success ? panel.data : 'General'} />
        ) : view === 'input' ? (
          <InputApp />
        ) : (
          <PetApp />
        )}
      </Suspense>
    </div>
  </React.StrictMode>,
);
