---
name: prize-page
description: Write or update one prize track's Part in DEVPOST.md, in the format of Ben Zhou's Pixie submission, with every number checked against the code, a test or BUILD.md's log. Use when asked for a prize page, a track write-up, or to update DEVPOST.md for a track.
---

# Prize page

1. Read the instructions at the top of DEVPOST.md, the track's brief in PLAN.md's tracks table, and that track's sponsor notes in BUILD.md.
2. Gather the evidence: what's built (read the code and BUILD.md's log), measured results (tests, timing runs), and screenshots or video timestamps.
3. Fill in that track's Part, keeping its structure:
   - "Uncle for the [track] track": one paragraph on what Uncle is for this sponsor.
   - The official challenge, restated plainly.
   - Why we built it.
   - The criteria table: each criterion in the sponsor's own words, what Uncle does, and where to look (gallery image or video time).
   - A deep-dive section that walks through one real example with real values.
   - Challenges we ran into, what we learned, limits and next steps.
4. Every number must come from a test, a measurement, the code or the live app. Write its source in BUILD.md's log if it isn't there. Never estimate; leave `[measure: ...]` if it hasn't been measured.
5. State limits honestly: what's a prototype, what's simulated, what we didn't build.
6. Write plainly: short sentences, no em dashes, no "it's not X, it's Y," no hype words.
7. End with a list of anything still `[TODO]` in that Part, so the human knows what's missing.
