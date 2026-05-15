# AGPL removal from the editor fork

When the fork of `eigenpal/docx-editor` was inlined into this repo (2026-05-16),
the AGPL-3.0-licensed `@eigenpal/docx-editor-agents` package and everything that
imported from it were removed. This file preserves the record of that change for
provenance, since the fork's own git history (a single commit `a4cc67a2`) was
discarded when we collapsed it into the outer repo.

## Original commit message

```
fork: strip AGPL @eigenpal/docx-editor-agents and dependents

This fork removes the AGPL-3.0 packages/agent-use/ package and
everything that imported from it, leaving an MIT-only editor.

Removed:
- packages/agent-use/ (AGPL-3.0 package)
- packages/core/src/agent/ (orphaned helpers, only used by agent-use)
- packages/react/src/components/AgentChat.tsx (imported agent-use)
- examples/agent-use-demo/, examples/agent-chat-demo/ (demos for agent-use)
- specs/live-agent-chat.md, docs/agents.md
- openspec/changes/review-plugin/ (proposal for agent-use)

Updated:
- package.json: workspaces no longer reference removed demos; build
  script no longer filters @eigenpal/docx-editor-agents
- examples/vite/package.json: dropped @eigenpal/docx-editor-agents dep
- examples/vite/vite.config.ts: dropped agent-use aliases
- examples/vite/src/App.tsx: rewritten without AgentChat or agent
  E2E hooks; minimal open/save demo only
- .changeset/config.json: emptied "fixed" (was pairing the two pkgs)
- README.md: removed "Agent-ready"; added fork note
```

## Upstream sync

We pulled from `https://github.com/eigenpal/docx-editor` @ commit
`4b6e572dc85bc91cead13abafb1c2c5f572a5122` (2026-05-15). To pull future
upstream changes, clone upstream into a scratch directory, diff against
our `docx-editor/` tree, and apply changes selectively (re-applying the
AGPL removal where needed).
