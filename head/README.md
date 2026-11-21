# head/: building and aging the 3D head

Owner: Person 3. Spec: PLAN.md Part 3 (building and aging). Contracts: head files out (CONTRACTS.md).

Lives here: frame picking and MediaPipe segmentation, COLMAP camera recovery, landmark triangulation, fitting the MakeHuman head template and hair shape, painting the texture, the face-aging step (run on the Vultr GPU), grey hair, age shape changes, the prepared aged skin versions, and saving finished heads.

Based on [Punching Face](https://github.com/akashngb/punching-face). People's videos and heads stay out of git (.gitignore).

## Blend shapes the XR app drives

Every `head.glb` needs these morph targets (names exact): `jawOpen`, `mouthWide`, `mouthRound`, `eyeBlink_L`, `eyeBlink_R`. ARKit names (`mouthStretch_L/R`, `mouthFunnel`) also work. See `xr/head.js`.
