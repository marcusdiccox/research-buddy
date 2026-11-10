# Otter sprites

Created with the built-in image-generation tool on November 10, 2026, using the repository fox atlas as a style/grid reference. Selected assets: `otter-atlas-clean.png`, `otter-transitions-clean.png` and `otter-swimming-clean.png`.

Base prompt: a sweet warm-brown otter with round ears, cream muzzle/bib, whiskers, large shiny eyes, short paws and tapered tail. Transparent regular 4x4 atlas, four frames per row: seated blink; left-facing walk; paw rubbing/cheek washing; curled sleep/breathing. Keep scale, padding and ground baseline consistent. No labels, scene, shadows or accessories.

Transition prompt: the same otter, four incremental frames per row for sit-to-stand, stand-to-sit, curl-to-sleep and wake-to-stretch.

Special atlas prompt: four incremental rows for lowering from sit into a left-facing paddling pose; four alternating swimming/paddling strokes with tiny pale-blue ripples only; pushing up from swim into sitting; and a relaxed back-floating loop with paws on belly/cheeks. Transparent background without a water rectangle or scenery.

Cleanup edit prompt: preserve all poses and cells while removing exterior red/green/gray speckles to transparent alpha, retaining fur, whiskers and intentional blue ripples. The shared runtime renderer downsamples, alpha-tests, baseline-aligns and applies all three palettes. Swimming remains slow and pauses on hover. Reduced motion freezes animation.
