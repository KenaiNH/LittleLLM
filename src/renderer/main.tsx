import React from 'react';
import { createRoot } from 'react-dom/client';
import './shared/global.css';
import { PetApp } from './pet/App';
const root=document.getElementById('root');if(!root)throw new Error('Missing renderer root');
createRoot(root).render(<React.StrictMode><div data-testid="scaffold"><PetApp/></div></React.StrictMode>);
