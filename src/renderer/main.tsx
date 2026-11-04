import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PetWindow } from './components';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{location.hash === '#pet' ? <PetWindow /> : <App />}</React.StrictMode>,
);
