import type { PetView } from '../shared/contracts';
export function PetPlay({ interaction }: { interaction: NonNullable<PetView['interaction']> }) {
  return <div className={`pet-play-props props-${interaction.kind}`} aria-hidden="true">
    <span className={interaction.kind === 'ball' ? 'pet-ball' : 'pet-treat'} />
    <span className="pet-play-heart">♥</span>
    <span className="pet-play-spark">✦</span>
  </div>;
}
