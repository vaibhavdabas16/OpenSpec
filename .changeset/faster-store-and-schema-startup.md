---
"@fission-ai/openspec": patch
---

Commands start faster. Reading the `store:` pointer from `openspec/config.yaml`, which every command inside a project does, no longer loads zod, and store state files load yaml and zod only when one is read or written. `openspec store list` now loads 37 modules instead of 133. `openspec schemas` no longer loads the glob library, and `list` and `view` parse each schema once instead of once per change.
