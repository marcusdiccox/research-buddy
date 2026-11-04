# Fox sprite artwork

`fox-atlas.png` was generated with the built-in image-generation tool on 2026-11-04 using the fox reference supplied in the project conversation. A second image-generation pass cleaned the transparent surroundings. The user's reference itself is not redistributed.

Final prompt: preserve the same sweet red fox across a regular 4-by-4 transparent pixel-art atlas. Rows are seated blink/tail twitch, four-step left-facing walk, seated paw wave, and curled sleep/breathing. Keep large ears, shiny brown eyes, cream muzzle/chest, brown socks, and a cream-tipped bushy tail; no text, scenery, labels, shadows or accessories. Remove stray exterior halo pixels and preserve cell locations and alpha.

Runtime rendering downsamples each frame to 64 logical pixels, uses alpha testing for crisp transparent edges, and applies Arctic/Midnight palette swaps. CSS uses nearest-neighbor scaling and steps between frames. Reduced motion disables the frame cycle. No network or image generation happens while the app runs.

`fox-transitions.png` is a second atlas generated with the built-in tool using the first atlas as the identity reference. Prompt: same fox, transparent regular 4-by-4 atlas, four incremental frames each for seated-to-standing, standing-to-seated, seated-to-curled sleep, and curled sleep-to-stretch-to-standing. Preserve orange coat, cream bib and tail tip, dark socks, large ears/eyes, common ground baseline and safe padding. No labels, scenery, accessories or shadows. Runtime per-cell alpha bounds align every frame to ground row60 without stretching poses.
