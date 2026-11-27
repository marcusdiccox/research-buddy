export interface CapturePayload {
  text?: string;
  error?: string;
}
export function validateCapture(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Copy some text first, then try capture.');
  if ([...value].length > 100000 || new TextEncoder().encode(value).byteLength > 2 * 1024 * 1024)
    throw new Error('That text is too long. Capture a smaller passage.');
  return value.trim();
}
export function appendCapture(draft: string, captured: string): string {
  const addition = validateCapture(captured);
  return validateCapture(draft.trim() ? `${draft}\n\n${addition}` : addition);
}
export function decodeCaptureResult(raw: string): CapturePayload {
  try {
    const result = JSON.parse(raw);
    if (result.error === 'foreground_changed')
      return { error: 'The active app changed. Select the text and try again.' };
    if (result.error === 'keys_held')
      return { error: 'Release the shortcut keys, then try again.' };
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
