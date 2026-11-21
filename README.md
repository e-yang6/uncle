# heads-isaac: one built head, kept off main

Isaac's head for the demo (`head/builds/isaac/head.glb`). People's heads never go on main (privacy: `.gitignore` ignores `head/builds/`), so this branch holds only the file, with no shared history.

On the server: `git fetch origin heads-isaac && git show origin/heads-isaac:head/builds/isaac/head.glb > head/builds/isaac/head.glb`
Then it loads at `/xr/?head=isaac`. Delete this branch when the head is no longer needed.
