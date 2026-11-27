import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCaptureResult, type CapturePayload } from '../core/capture.js';
/** Runs fixed packaged code only; captured text never enters a command line or log. */
export class SelectionCapture {
  private child: ChildProcess | undefined;
  constructor(private assets: string) {}
  async capture(): Promise<CapturePayload> {
    if (this.child) return { error: 'A capture is already in progress.' };
    if (!['win32', 'darwin'].includes(process.platform))
      return { error: 'Copy the text and use Capture copied text in the tray.' };
    try {
      const source = readFileSync(
        join(
          this.assets,
          process.platform === 'win32'
            ? 'windows/capture-selection.ps1'
            : 'macos/capture-selection.js',
        ),
        'utf8',
      );
      const args =
        process.platform === 'win32'
          ? [
              '-NoProfile',
              '-NonInteractive',
              '-STA',
              '-EncodedCommand',
              Buffer.from(source, 'utf16le').toString('base64'),
            ]
          : ['-l', 'JavaScript', '-e', source];
      const executable =
        process.platform === 'win32'
          ? join(
              process.env.SystemRoot ?? 'C:\\Windows',
              'System32/WindowsPowerShell/v1.0/powershell.exe',
            )
          : '/usr/bin/osascript';
      return await new Promise((resolve) => {
        const child = spawn(executable, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        this.child = child;
        let output = '',
          finished = false;
        const finish = (payload: CapturePayload) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (this.child === child) this.child = undefined;
          resolve(payload);
        };
        const timer = setTimeout(() => {
          child.kill();
          finish({
            error: 'Capture timed out. Copy the text and use Capture copied text in the tray.',
          });
        }, 8000);
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          output += chunk;
          if (Buffer.byteLength(output, 'utf8') > 2 * 1024 * 1024) {
            child.kill();
            finish({ error: 'That text is too long. Capture a smaller passage.' });
          }
        });
        child.once('error', () =>
          finish({
            error: 'Selection capture is unavailable. Use Capture copied text in the tray.',
          }),
        );
        child.once('close', (code) =>
          finish(
            code === 0
              ? decodeCaptureResult(output.trim())
              : { error: 'Selection capture is unavailable. Use Capture copied text in the tray.' },
          ),
        );
      });
    } catch {
      return { error: 'Selection capture is unavailable. Use Capture copied text in the tray.' };
    }
  }
  dispose() {
    this.child?.kill();
  }
}
