import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CompactNotepad } from './CompactNotepad';
import { CompactSettings } from './CompactSettings';
import { PetWindow } from './PetWindow';
import { QuickBubble } from './QuickBubble';
import './styles.css';
const petMode = location.hash === '#pet';
document.documentElement.classList.toggle('pet-mode', petMode);
document.documentElement.classList.toggle(
  'floating-mode',
  ['#bubble', '#fox-settings'].includes(location.hash),
);
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {petMode ? (
      <PetWindow />
    ) : location.hash === '#bubble' ? (
      <QuickBubble />
    ) : location.hash === '#notepad' ? (
      <CompactNotepad />
    ) : location.hash === '#fox-settings' ? (
      <CompactSettings />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
