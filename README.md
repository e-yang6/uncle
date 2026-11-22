# Uncle

Meet yourself at 70, in mixed reality, with your own face and aged voice. Built at Hack Western.

**[Try the live app](https://uncle.health)**

Scan your face or choose one from the library, record a short interview, and confirm your answers. Open the prepared session in a Quest using the four-letter pairing code. You can browse the app and saved faces from a laptop too.

Your future self talks about money, retirement and health using numbers from our seeded simulation. Gemini chooses calculations and writes the conversation; checked placeholders fill in the computed values. Ask what happens if you save more, change a habit or work toward a savings goal, then explore the results in simple green charts.

The headset shows your aged face with animated speech, captions, outfits and backgrounds. Controllers let you adjust inputs and compare the new projection with where you started. These are simulated scenarios, not guarantees about your future.

## Code

- `server/` — website, onboarding, face library, question tools and voice streaming.
- `sim/` — life simulation, financial goals, scenarios and source data.
- `voice/` — interview extraction, speech recognition, cloning and voice aging.
- `head/` — video-to-head reconstruction, textures and mouth shapes.
- `xr/` — Quest scene, avatar, charts and controls.
- `words/` — model training and evaluation.

Third-party asset credits are in `xr/assets/CREDITS.md`.
