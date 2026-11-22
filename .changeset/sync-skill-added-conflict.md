---
"@fission-ai/openspec": patch
---

The sync skill no longer overwrites a requirement that a change ADDs when the main spec already has it. Identical content is left alone, as before. Different content now stops the sync for that capability and reports the conflict, as `openspec archive` does. Before, syncing an earlier change again could silently revert a later change's edit to the same requirement.
