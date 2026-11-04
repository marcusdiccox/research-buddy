import { contextBridge, ipcRenderer } from 'electron';
const actions = new Set([
  'snapshot',
  'createProject',
  'saveNote',
  'importFile',
  'summary',
  'ask',
  'revision',
  'saveJournal',
  'saveReminder',
  'completeReminder',
  'snoozeReminder',
  'calendarPreview',
  'googleCalendar',
  'calendarFile',
  'export',
  'settings',
  'showWorkspace',
  'showNotepad',
  'showFoxSettings',
  'calendarStatus',
  'calendarConfigure',
  'calendarConnect',
  'calendarDisconnect',
  'calendarSync',
  'calendarCancelConnect',
  'showPet',
  'hidePet',
  'togglePet',
  'petState',
  'petAction',
  'petRegions',
  'petDrag',
  'petSystemMotion',
  'seedDemo',
]);
contextBridge.exposeInMainWorld('buddy', {
  async call(action: string, data?: unknown) {
    if (!actions.has(action)) throw new Error('That action is not available.');
    const result = await ipcRenderer.invoke('buddy', action, data);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  onChange(handler: () => void) {
    const listener = () => handler();
    ipcRenderer.on('buddy:changed', listener);
    return () => ipcRenderer.removeListener('buddy:changed', listener);
  },
  onPetState(handler: (state: unknown) => void) {
    const listener = (_event: unknown, state: unknown) => handler(state);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  },
  onNavigate(handler: (action: unknown) => void) {
    const listener = (_event: unknown, action: unknown) => handler(action);
    ipcRenderer.on('buddy:navigate', listener);
    return () => ipcRenderer.removeListener('buddy:navigate', listener);
  },
});
