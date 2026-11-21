# Design rules (Uncle)

Every agent follows this for anything visual: the AR scene, the screens, the website, the videos and the Devpost page.

## The feeling

Calm, warm, honest. Uncle is the warm older relative who has been through it all: calm, kind and straight with you.

## Colors

| Role | Color | Use |
|---|---|---|
| Ink | #15130F | Backgrounds and text. A warm near-black, never pure black |
| Paper | #F3EEE4 | Light surfaces and text on dark. A warm off-white, never pure white (#FFFFFF) |
| Dusk grey | #8A8378 | Secondary text, labels, dividers |
| Evening amber | #C8893A | The one accent. Used for one thing at a time: the slider being moved, the number being explained |

That's the whole palette. No other colors, including for charts.

## Type

- One font family: IBM Plex Sans, in two weights, Regular (400) and SemiBold (600).
- Numbers use tabular figures so they don't jump when sliders move.
- In AR, text is large enough to read at arm's length; test it in the headset, not on a laptop.

## Shape

- Small, consistent corners: 4 px everywhere. No big soft rounded corners.
- Flat surfaces separated by space or a thin 1 px Dusk grey line. No drop shadows.
- In AR, the mirror frame is simple and thin, and sliders are big enough to pinch, with clear labels.

## Motion

- Motion only when something actually changes: the face aging, a number updating, the mouth moving.
- Slow and smooth, about 300 to 500 ms. Nothing bounces, pulses or loops for decoration.
- No hover animations or animated arrows.

## Tone and words

- The future self is warm, never scary. No red "danger" numbers, no countdowns, no guilt.
- Talk about agency and options, not fear (this is what Canada Life's research says works for Gen Z).
- Plain sentences. Specific numbers with their range and source.

## Do

- Show the real product: real screenshots, real recordings from the headset, real numbers.
- Show progress honestly while things load: a skeleton or a plain progress line for the head build and the simulation, never a blank screen or a spinner alone.
- Every screen has one obvious main action.
- Real content only, no lorem ipsum.

## Don't (these make a project look vibe-coded)

**Color**
- Pure white backgrounds
- Purple and black
- Harsh gradients
- Rainbow coloring
- Neon colors
- Basic pastel colors

**Effects and decoration**
- Drop shadows
- Liquid glass or frosted glass panels
- Radial glowing orbs
- Dot-grid backgrounds
- Sparkle icons, or any "AI magic" sparkles
- Emoji

**Layout**
- Three feature cards in a row
- Bento grids
- A colored stripe down the left edge of cards
- Checkmark bullets
- Fake terminal windows

**Type and icons**
- Inter, Geist or Space Grotesk
- Lucide icons (or any default icon set used as decoration). Use icons only where they help, from one consistent set, and prefer words

**Writing**
- Em dashes
- "It's not X, it's Y" sentences
- Fake testimonials or made-up user quotes. Only real quotes, with the source

## Learn from

- Halide: a camera app that's calm and precise, with nothing extra on screen
- Apple Health: showing trends and ranges over time without drama
- Wealthsimple: a calm, plain-spoken Canadian money app
- Things 3: restraint, spacing and one clear action per screen
