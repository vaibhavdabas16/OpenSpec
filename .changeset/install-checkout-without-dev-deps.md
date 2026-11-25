---
"@fission-ai/openspec": patch
---

Installing a checkout of OpenSpec with `npm install --omit=dev`, which is how the Pi coding agent installs git packages, no longer fails in `prepare`. When TypeScript is not installed during an install, the build is skipped with a warning. `npm pack` and `npm publish` still fail without TypeScript, so a published package is never missing `dist/`.
