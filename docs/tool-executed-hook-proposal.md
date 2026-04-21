---
summary: "Proposal: add tool:executed to the internal-hook event vocabulary"
read_when:
  - You want to understand the new tool-hook seam
  - You are considering upstreaming this change to openclaw/openclaw
  - You are writing a bundled hook that observes tool calls
title: "Tool-executed hook proposal"
---

# `tool:executed` internal-hook event

## Summary

Add `tool:executed` as a new `InternalHookEventType` so bundled hooks and
native plugins can observe agent tool calls the same way they already
observe commands, messages, session lifecycle, and gateway startup.

The change is additive and deliberately small:

- Widen `InternalHookEventType` to include `"tool"`.
- Add `ToolExecutedHookContext` / `ToolExecutedHookEvent` types alongside
  the existing `Message*`, `Session*`, and `AgentBootstrap*` types.
- Add `emitToolExecutedHook(context, opts?)` — a fire-and-forget helper
  that short-circuits when no handlers are registered.
- Add `isToolExecutedEvent(event)` type guard.
- Emit from `src/agents/pi-tool-definition-adapter.ts` after
  `normalizeToolExecutionResult` (success path) and after
  `buildToolExecutionErrorResult` (handled-error path).
- Document the new event in `src/hooks/bundled/README.md`.

No new bundled hooks ship with this change. The first consumer in this
fork is the out-of-tree `obsidian-agi` plugin; the upstream PR would leave
the consumer surface to follow-up work so the seam lands clean.

## Why

OpenClaw already has an internal-hook event system with solid coverage of
command / session / agent / gateway / message lifecycle. Tool calls are
the obvious missing surface. The existing README explicitly says
"More event types coming soon (session lifecycle, agent errors, etc.)" —
this proposal is one of those.

Concrete use cases the seam unlocks:

- **Audit logging.** A `command-logger`-style bundled hook for every tool
  invocation (name, args, duration, error flag).
- **Auto-knowledge-logging.** Plugins like `obsidian-agi` can write a
  knowledge note for every meaningful tool call without the agent having
  to call a separate `knowledge_log` tool.
- **Per-tool telemetry.** Emit OpenTelemetry spans per tool call from
  `diagnostics-otel` with no core change.
- **Cost controls.** A hook can short-circuit the agent's session or
  raise a user prompt if an expensive tool exceeds a budget.

## Design

### Event shape

```ts
export type ToolExecutedHookContext = {
  toolName: string;
  toolCallId?: string;
  args: Record<string, unknown>;
  result: unknown;
  isError: boolean;
  durationMs?: number;
  agentId?: string;
};

export type ToolExecutedHookEvent = InternalHookEvent & {
  type: "tool";
  action: "executed";
  context: ToolExecutedHookContext;
};
```

Deliberate choices:

- **`args` and `result` are `unknown` / `Record<string, unknown>`**, not
  typed. Tools have heterogenous shapes; typing this would either lock
  the event to a subset of tools or demand a giant union.
- **`durationMs` is optional.** Mostly populated, but I keep it optional
  so alternative tool runtimes can emit the event without carrying a
  timer.
- **`sessionKey` is the already-present top-level `InternalHookEvent`
  field.** We thread it through from the caller when available; we do
  not duplicate it in the context. The current adapter emit site does
  not have sessionKey in scope, so it emits with an empty string. A
  follow-up can widen the adapter signature if a consumer needs it.
- **`agentId` lives in context, not top-level.** The existing
  `InternalHookEvent` does not carry agent identity; keeping it local
  to this event's context is consistent with how message events handle
  channel-specific fields.

### Emission semantics

- **Fire-and-forget.** `emitToolExecutedHook` never throws. Listener
  errors are caught and logged by the existing `triggerInternalHook`
  machinery.
- **Short-circuit when idle.** `emitToolExecutedHook` checks
  `hasInternalHookListeners("tool", "executed")` before building the
  event. Tools fire frequently; this keeps the hot path cheap when no
  consumer is registered.
- **Emit after the final normalized result.** Not inside the try block
  on the raw execute, so the hook sees exactly what the agent sees.
- **Emit on handled errors too.** Both success and error paths fire, so
  audit and telemetry hooks see the complete picture. Aborts (signal
  aborted, `AbortError`) do not emit — the call was cancelled, not
  executed.

### Integration point

`src/agents/pi-tool-definition-adapter.ts` is the single provider-
agnostic tool wrapper. Emitting here covers every tool the agent
reaches (registered plugin tools, MCP tools, built-ins). Alternative
sites like `pi-tools.params.ts` and `pi-tools.read.ts` are downstream
of it; emitting there would double-fire.

### Test coverage

`src/hooks/tool-hooks.test.ts` covers:

- Short-circuit when no handlers are registered.
- Type handlers (`registerInternalHook("tool", ...)`) receive events.
- Action-specific handlers (`registerInternalHook("tool:executed", ...)`)
  receive events with the full typed context.
- Listener throws do not propagate.
- `setInternalHooksEnabled(false)` suppresses emission.
- `isToolExecutedEvent` narrows correctly, rejecting non-tool events and
  events missing required context fields.

## Non-goals

- **No pre-tool hook.** `runBeforeToolCallHook` already exists and is
  different in shape (it can mutate params or block the call). This
  proposal does not change it.
- **No bundled consumer.** The upstream PR should ship just the emit
  seam, letting the community decide what hooks they want. This fork's
  `obsidian-agi` plugin can be the first non-bundled consumer as proof
  the seam works for real plugins.
- **No sync/async config knob.** Hooks already run through
  `triggerInternalHook` which is async. Adding a sync mode now would
  lock us in.

## Migration

None — the change is purely additive. Existing hooks continue to work
unchanged. No new config, no new env var, no new CLI flag.

## File diff summary

```
src/hooks/internal-hook-types.ts         # +1 string to a union
src/hooks/internal-hooks.ts              # +ToolExecutedHook* types,
                                         #  emitToolExecutedHook(),
                                         #  isToolExecutedEvent()
src/hooks/bundled/README.md              # document the new event
src/hooks/tool-hooks.test.ts             # 7 tests, colocated
src/agents/pi-tool-definition-adapter.ts # two emit calls
```

Roughly 140 LOC added, zero removed, no existing tests touched.
