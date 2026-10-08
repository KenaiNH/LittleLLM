import React from 'react';
import { createRoot } from 'react-dom/client';
import './shared/global.css';
import { PetApp } from './pet/App';
import { InputApp } from './input/App';
import '@fontsource/courier-prime/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/cousine/400.css';
import { SettingsApp } from './settings/App';
import { settingsPanelSchema } from '../shared/settings';
const root = document.getElementById('root');
if (!root) throw new Error('Missing renderer root');
const view = new URLSearchParams(location.search).get('view');
const panel = settingsPanelSchema.safeParse(view?.slice('settings:'.length));
createRoot(root).render(
  <React.StrictMode>
    <div data-testid="scaffold">
      {view?.startsWith('settings:') ? (
        <SettingsApp initialPanel={panel.success ? panel.data : 'General'} />
      ) : view === 'input' ? (
        <InputApp />
      ) : (
        <PetApp />
      )}
    </div>
  </React.StrictMode>,
);
