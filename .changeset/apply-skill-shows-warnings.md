---
"@fission-ai/openspec": patch
---

The apply skill and command no longer ignore `warnings` from `openspec instructions apply`. When the CLI warns that a ready change has no delta specs and does not declare `skip_specs: true`, or that a delta file is not a capability's `spec.md`, the agent now shows the warnings and asks whether to fix them before implementing, instead of implementing a change that `openspec validate` rejects. The `/openspec` router's fallback for running apply without its skill does the same.
