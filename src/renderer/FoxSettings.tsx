import { Keyboard, Heart } from 'lucide-react';
import { Fox } from './Fox';
import { SettingToggle } from './components';
import type { Settings, Snapshot } from '../shared/contracts';
const shortcutLabel = (key: string) => key.replace('Control', 'Ctrl').replaceAll('+', ' + ');
export function FoxSettings({
  settings,
  runtime,
  busy,
  onChange,
}: {
  settings: Settings;
  runtime: Snapshot['companion'];
  busy: boolean;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <section className="settings-card fox-settings-card">
      <h2>
        <Heart size={19} />
        Pip the little fox
      </h2>
      <div className={`fox-settings-preview ${settings.petReducedMotion ? 'motion-reduced' : ''}`}>
        <div className="fox-preview">
          <Fox appearance={settings.petAppearance} />
        </div>
        <p>
          A small friend with a big tail.
          <br />
          Click Pip for help. Drag the fox to move it.
        </p>
      </div>
      <fieldset className="fox-settings-fieldset" disabled={busy}>
        <SettingToggle
          label="Show Pip on my desktop"
          detail="Hide or restore Pip anytime with your shortcut."
          checked={settings.petVisible}
          onChange={(v) => onChange({ petVisible: v })}
        />
        <SettingToggle
          label="Keep Pip above other windows"
          detail="Pip stays nearby while your notebook stays a regular window."
          checked={settings.alwaysOnTop}
          onChange={(v) => onChange({ alwaysOnTop: v })}
        />
        <div className="fox-settings-choices">
          <label>
            Fox appearance
            <select
              value={settings.petAppearance}
              onChange={(e) =>
                onChange({ petAppearance: e.target.value as Settings['petAppearance'] })
              }
            >
              <option value="red">Red Fox · light</option>
              <option value="arctic">Arctic Fox · snowy white</option>
              <option value="midnight">Midnight Fox · dark</option>
            </select>
          </label>
          <label>
            Where Pip roams
            <select
              value={settings.petRoamArea}
              onChange={(e) => onChange({ petRoamArea: e.target.value as Settings['petRoamArea'] })}
            >
              <option value="bottom">Along the bottom edge</option>
              <option value="desktop">Around the whole screen</option>
              <option value="parked">Stay where I put Pip</option>
            </select>
          </label>
          <label>
            Joke style
            <select
              value={settings.petJokeStyle}
              onChange={(e) =>
                onChange({ petJokeStyle: e.target.value as Settings['petJokeStyle'] })
              }
            >
              <option value="wholesome">Cute &amp; wholesome</option>
              <option value="dad">Dad jokes &amp; puns</option>
              <option value="nerdy">Nerdy little jokes</option>
            </select>
          </label>
        </div>
        <p className="fox-choice-description">
          Pip stays on the screen where you place it, avoids the taskbar, and pauses when you
          interact. Pip shares little jokes automatically. Speech bubbles are silent and disappear
          after a moment.
        </p>
        <SettingToggle
          label="Reduce motion"
          detail="Keep Pip still and turn off animated movements. Windows reduced-motion settings are respected, too."
          checked={settings.petReducedMotion}
          onChange={(v) => onChange({ petReducedMotion: v })}
        />
        <label>
          Show / hide shortcut
          <select
            value={settings.petShortcut}
            onChange={(e) => onChange({ petShortcut: e.target.value as Settings['petShortcut'] })}
          >
            <option value="Control+Alt+P">Ctrl + Alt + P · default</option>
            <option value="Control+Shift+Space">Ctrl + Shift + Space</option>
            <option value="Alt+Shift+P">Alt + Shift + P</option>
          </select>
        </label>
      </fieldset>
      {runtime?.shortcutAvailable === false ? (
        <p className="shortcut-unavailable">
          That shortcut is being used by another app. Choose another one.
          {runtime.activeShortcut
            ? ` ${shortcutLabel(runtime.activeShortcut)} still works.`
            : ' You can always restore Pip from the system tray.'}
        </p>
      ) : (
        <div className="fox-shortcut">
          <Keyboard size={18} />
          <span>
            <kbd>{shortcutLabel(runtime?.activeShortcut ?? settings.petShortcut)}</kbd> shows or
            hides Pip, even while you’re in another app.
          </span>
        </div>
      )}
    </section>
  );
}
