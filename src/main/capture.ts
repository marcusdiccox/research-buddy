import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCaptureResult, type CapturePayload } from '../core/capture.js';
const unavailable = 'Selection capture is unavailable. Use Capture copied text in the tray.';
/** Warm, fixed-code worker: waits for an explicit request before reading foreground/clipboard. */
export class SelectionCapture {
  private child: ChildProcess | undefined;
  private ready = false;
  private stopped = false;
  private pending: ((result: CapturePayload) => void) | undefined;
  constructor(
    private assets: string,
    prewarm = true,
  ) {
    if (prewarm) this.start();
  }
  get available() {
    return this.ready;
  }
  private start() {
    if (this.child || this.stopped || !['win32', 'darwin'].includes(process.platform)) return;
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
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      this.child = child;
      let buffer = '';
      const warmup = setTimeout(() => {
        if (!this.ready) child.kill();
      }, 8000);
      warmup.unref();
      const ended = () => {
        clearTimeout(warmup);
        if (this.child !== child) return;
        this.ready = false;
        this.child = undefined;
        this.pending?.({ error: unavailable });
        this.pending = undefined;
      };
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > 2 * 1024 * 1024) {
          this.pending?.({ error: 'That text is too long. Capture a smaller passage.' });
          this.pending = undefined;
          child.kill();
          return;
        }
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          try {
            const value = JSON.parse(line);
            if ('ready' in value) {
              this.ready = value.ready === true;
              clearTimeout(warmup);
              if (!this.ready) child.kill();
              continue;
            }
          } catch {
            /* decodeCaptureResult gives a static error below */
          }
          const resolve = this.pending;
          this.pending = undefined;
          resolve?.(decodeCaptureResult(line));
        }
      });
      child.stdin?.on('error', () => {});
      child.once('error', ended);
      child.once('close', ended);
    } catch {
      this.ready = false;
    }
  }
  async capture(): Promise<CapturePayload> {
    if (this.pending) return { error: 'A capture is already in progress.' };
    if (!this.child || !this.ready) {
      this.start();
      return {
        error:
          'Capture is starting. Try the shortcut again, or use Capture copied text in the tray.',
      };
    }
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child?.kill();
        finish({
          error: 'Capture timed out. Copy the text and use Capture copied text in the tray.',
        });
      }, 5000);
      const finish = (result: CapturePayload) => {
        clearTimeout(timer);
        if (this.pending === finish) this.pending = undefined;
        resolve(result);
      };
      this.pending = finish;
      this.child!.stdin?.write('capture\n', (error) => {
        if (error) finish({ error: unavailable });
      });
    });
  }
  dispose() {
    this.stopped = true;
    this.ready = false;
    this.pending?.({ error: unavailable });
    this.pending = undefined;
    this.child?.kill();
  }
}
