# Red panda sprites

Created with the built-in image-generation tool on November 10, 2026, using the repository fox atlas as a style/grid reference. The selected project assets are `red-panda-atlas-clean.png` and `red-panda-transitions-clean.png`.

Base prompt: a sweet rust-red panda with rounded cream-rimmed ears, white cheek/eyebrow mask, dark chocolate belly/paws and a long ringed tail. Transparent regular 4x4 atlas, four frames per row: seated blink/tail twitch; left-facing walk; seated tail hug/peek; curled sleep/breathing. Consistent scale and identity, common ground line, generous cell padding, no labels, scenery, shadows or accessories.

Transition prompt: preserve the same panda in a transparent 4x4 atlas, four incremental frames per row for seated-to-standing, standing-to-seated, seated-to-curled sleep and sleep-to-wake/stretch. Keep anatomy, mask, tail rings and scale consistent.

Cleanup edit prompt: preserve all sixteen poses and cell positions while removing exterior red/green/gray speckles and halo pixels to transparent alpha. Runtime downsamples to 64px cells, alpha-tests edges, aligns each frame's baseline, applies Natural/Arctic/Midnight palettes and respects reduced motion. No image generation happens at runtime.
