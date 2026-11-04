import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CompactNotepad } from './CompactNotepad';
import { CompactSettings } from './CompactSettings';
import { PetWindow } from './PetWindow';
import './styles.css';
const petMode = location.hash === '#pet';
document.documentElement.classList.toggle('pet-mode', petMode);
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {petMode ? (
      <PetWindow />
    ) : location.hash === '#notepad' ? (
      <CompactNotepad />
    ) : location.hash === '#fox-settings' ? (
      <CompactSettings />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
