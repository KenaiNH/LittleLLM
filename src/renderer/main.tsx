import React from 'react';
import { createRoot } from 'react-dom/client';
import './shared/global.css';
import { PetApp } from './pet/App';
import { InputApp } from './input/App';
import '@fontsource/courier-prime/400.css';
const root=document.getElementById('root');if(!root)throw new Error('Missing renderer root');
const view=new URLSearchParams(location.search).get('view');
createRoot(root).render(<React.StrictMode><div data-testid="scaffold">{view==='input'?<InputApp/>:<PetApp/>}</div></React.StrictMode>);
