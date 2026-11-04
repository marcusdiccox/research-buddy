# Pixel fox visual update

The user's supplied fox is the visual reference: oversized ears and shiny eyes, orange coat, cream bib and muzzle, brown socks, and a bushy white-tipped tail. Use original generated pixel artwork inspired by that reference, rendered with nearest-neighbor scaling at desktop-pet size and genuine alpha transparency.

Replace the smooth SVG with a four-frame sprite cycle for each existing behavior: seated idle/blink, walking with alternating legs, raised-paw wave, and curled sleeping/breathing. Keep the current native movement, transparent click-through, menu, settings and shortcut. Red remains default; derive Arctic and Midnight palettes consistently from the same artwork. Reduced motion freezes the selected pose.

Implementation choice: one generated sprite atlas rather than independently generated images, to preserve identity across frames. Normalize each row's ground baseline and canvas center before use. Check every frame for clipping and run the packaged application on the user's Windows desktop.

User refinement: reduce desktop art from130 to104px. Prefer1.8�4s rests,7�12s walks at32px/s. Add stand-up, sit-down, curl-up and waking stretch sequences; hold movement during posture changes. Remove the manual nap menu action. Automatically curl up after120s without fox interaction; hover entry, clicking, dragging and helper actions wake/reset inactivity. Ordinary keyboard use outside Pip is not monitored.
