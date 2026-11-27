export interface CapturePayload {
  text?: string;
  error?: string;
}
export function validateCapture(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Copy some text first, then try capture.');
  if (value.length > 200000) throw new Error('That text is too long. Capture a smaller passage.');
  if (!value.trim()) throw new Error('Copy some text first, then try capture.');
  let characters = 0;
  for (const _ of value)
    if (++characters > 100000) throw new Error('That text is too long. Capture a smaller passage.');
  return value;
}
export function appendCapture(draft: string, captured: string): string {
  const addition = validateCapture(captured);
  return validateCapture(draft.length ? `${draft}\n\n${addition}` : addition);
}
export function decodeCaptureResult(raw: string): CapturePayload {
  try {
    const result = JSON.parse(raw);
    if (result.error === 'foreground_changed')
      return { error: 'The active app changed. Select the text and try again.' };
    if (result.error === 'keys_held')
      return { error: 'Release the shortcut keys, then try again.' };
    if (result.error === 'permission_required')
      return {
        error:
          'Enable Accessibility for Pip in macOS System Settings, or use Capture copied text in the tray.',
      };
    if (result.fresh !== true || result.error)
      return {
        error:
          'Could not copy that selection. Copy the text and use Capture copied text in the tray.',
      };
    return { text: validateCapture(result.text) };
  } catch {
    return { error: 'Could not capture that text. Copy a smaller passage and try again.' };
  }
}
