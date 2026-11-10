import { useEffect, useState, type CSSProperties } from 'react';
import type { PetPreferences, PetView } from '../shared/contracts';
import atlasSource from '../../assets/fox/fox-atlas.png';
import transitionSource from '../../assets/fox/fox-transitions.png';
import pandaAtlas from '../../assets/red-panda/red-panda-atlas-clean.png';
import pandaTransitions from '../../assets/red-panda/red-panda-transitions-clean.png';
import otterAtlas from '../../assets/otter/otter-atlas-clean.png';
import otterTransitions from '../../assets/otter/otter-transitions-clean.png';
import otterSwimming from '../../assets/otter/otter-swimming-clean.png';
import './pet.css';

type Appearance = PetPreferences['petAppearance'];
const atlases = new Map<string, Promise<string>>();
/** Prepare the atlas once per skin. A 64px frame keeps pixels crisp at 2x size. */
function spriteAtlas(appearance: Appearance, source = atlasSource): Promise<string> {
  const key = `${appearance}:${source}`;
  const cached = atlases.get(key);
  if (cached) return cached;
  const result = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      // Every frame is inset, with a common baseline. Do not stretch walking or sleeping poses.
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          ctx.drawImage(
            image,
            (col * image.width) / 4,
            (row * image.height) / 4,
            image.width / 4,
            image.height / 4,
            col * 64 + 2,
            row * 64 + 2,
            60,
            60,
          );
        }
      const pixels = ctx.getImageData(0, 0, 256, 256);
      const p = pixels.data;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i],
          g = p[i + 1],
          b = p[i + 2];
        // Alpha testing avoids a colored fringe on transparent desktop backgrounds.
        if (p[i + 3] < 210 || (r > 180 && g < 65 && b < 65) || (g > r * 1.1 && g > b * 1.5)) {
          p[i + 3] = 0;
          continue;
        }
        p[i + 3] = 255;
        if (appearance === 'red') continue;
        const light = r * 0.3 + g * 0.59 + b * 0.11;
        const coat = r > g * 1.25 && r > b * 1.5;
        if (appearance === 'arctic') {
          if (coat && light > 100) {
            p[i] = 170 + light * 0.3;
            p[i + 1] = 180 + light * 0.28;
            p[i + 2] = 193 + light * 0.23;
          } else if (light < 125) {
            p[i] = light * 0.65;
            p[i + 1] = light * 0.82;
            p[i + 2] = light;
          }
        } else {
          if (coat) {
            p[i] = 33 + light * 0.24;
            p[i + 1] = 38 + light * 0.25;
            p[i + 2] = 55 + light * 0.33;
          } else if (light > 140) {
            p[i] = light * 0.76;
            p[i + 1] = light * 0.77;
            p[i + 2] = light * 0.9;
          }
        }
      }
      ctx.putImageData(pixels, 0, 0);
      // Put every cell on the same ground line after alpha testing; preserve character scale.
      const aligned = document.createElement('canvas');
      aligned.width = aligned.height = 256;
      const output = aligned.getContext('2d')!;
      output.imageSmoothingEnabled = false;
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          let left = 64,
            right = -1,
            top = 64,
            bottom = -1;
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              if (p[((row * 64 + y) * 256 + col * 64 + x) * 4 + 3]) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            }
          if (right < 0) continue;
          const width = right - left + 1,
            height = bottom - top + 1;
          output.drawImage(
            canvas,
            col * 64 + left,
            row * 64 + top,
            width,
            height,
            col * 64 + Math.floor((64 - width) / 2),
            row * 64 + 61 - height,
            width,
            height,
          );
        }
      resolve(aligned.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Could not load fox sprites.'));
    image.src = source;
  });
  atlases.set(key, result);
  return result;
}

export function Fox({
  species = 'fox',
  appearance = 'red',
  pose = 'idle',
  direction = 1,
}: {
  species?: PetPreferences['petSpecies'];
  appearance?: Appearance;
  pose?: PetView['pose'];
  direction?: 1 | -1;
}) {
  const [atlas, setAtlas] = useState<{
    key: string;
    base: string;
    transitions: string;
    special?: string;
  }>();
  const atlasKey = `${species}:${appearance}`;
  useEffect(() => {
    let active = true;
    const sources =
      species === 'red-panda'
        ? [pandaAtlas, pandaTransitions]
        : species === 'otter'
          ? [otterAtlas, otterTransitions, otterSwimming]
          : [atlasSource, transitionSource];
    void Promise.all(sources.map((source) => spriteAtlas(appearance, source)))
      .then(([base, transitions, special]) => {
        if (active) setAtlas({ key: atlasKey, base, transitions, special });
      })
      .catch(() => {
        if (active) setAtlas(undefined);
      });
    return () => {
      active = false;
    };
  }, [appearance, species]);
  const transition = ['standing-up', 'sitting-down', 'curling-up', 'waking-up'].includes(pose);
  const special = ['entering-swim', 'swimming', 'leaving-swim', 'floating'].includes(pose);
  const ready = atlas?.key === atlasKey;
  const image = ready
    ? special
      ? atlas?.special
      : transition
        ? atlas?.transitions
        : atlas?.base
    : undefined;
  return (
    <span
      className={`fox fox-${appearance} fox-${pose} fox-facing-${direction === 1 ? 'right' : 'left'}`}
      data-appearance={appearance}
      data-species={species}
      data-pose={pose}
      data-ready={ready}
      aria-hidden="true"
    >
      <span
        key={pose}
        className="fox-sprite"
        style={{ backgroundImage: image ? `url(${image})` : undefined } as CSSProperties}
      />
    </span>
  );
}
