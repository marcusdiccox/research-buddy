/** Do not turn a macOS login launch into an unsolicited notebook popup. */
export class ActivationGate {
  private ready = false;
  private first = true;
  private pending = false;
  private login = false;
  activate(): boolean {
    const first = this.first;
    this.first = false;
    if (!this.ready) {
      this.pending = true;
      return false;
    }
    return !(first && this.login);
  }
  markReady(openedAtLogin: boolean): boolean {
    this.ready = true;
    this.login = openedAtLogin;
    const show = this.pending && !this.login;
    this.pending = false;
    return show;
  }
}
