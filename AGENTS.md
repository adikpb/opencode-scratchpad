# AGENTS.md

Per-project scratchpad TUI plugin for OpenCode v2. One plain Markdown file per project, stored outside the repo. No build step, no network, no writes into the git repo.

## Commands

```sh
bun install
bun test          # bun's test runner, not jest/vitest
bun run typecheck # tsc --noEmit
```

There is no build, lint, or format step; `tsconfig.json` sets `noEmit`. Run `bun test` and `bun run typecheck` before considering work done.

## Architecture

Two plugin entrypoints, both defined with `Plugin.define`:

- `src/tui.tsx` — the real TUI plugin (`id: PLUGIN_ID`, `setup` calls `registerScratchpad`).
- `src/index.ts` — server entry, an intentional **no-op** (`setup() {}`) so the package resolves in server contexts. It is not dead code.

`package.json` `exports` point `.`/`./server` → `src/index.ts` and `./tui` → `src/tui.tsx`. The root `tui.js`/`server.js` are **forwarders used only for `file://` directory-form loading**; npm package-name installs resolve `exports` and never load them. Keep forwarders in sync if entry paths change.

Core logic lives in `src/plugin.ts` (`registerScratchpad`), which takes injected `ScratchpadDeps` and is free of JSX, filesystem, and env access so it stays unit-testable. `src/tui.tsx` supplies the real deps (store, paths, sidebar renderer, dialog opener). Put testable logic in `plugin.ts`/`paths.ts`/`store.ts`, not `tui.tsx`.

`src/paths.ts` owns data-dir resolution and the project key; `src/store.ts` owns file read/write/append. Purity split is deliberate.

## Conventions & quirks

- **Runtime is Bun.** Scripts assume `bun`; there is no Node/npm script path.
- **JSX is SolidJS via OpenTUI, not React.** `jsxImportSource: "@opentui/solid"`. Components use `solid-js` primitives (`createSignal`, `createMemo`, `Show`, `For`, `onCleanup`), not React hooks.
- **Import with explicit `.ts`/`.tsx` extensions** (e.g. `./paths.ts`); `allowImportingTsExtensions` is on. `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- **`@opencode/plugin` is pinned to `2.0.27` and the V2 TUI API is beta.** Verified against OpenCode v2.0.27. Do not loosen the pin or assume API stability; peer deps are `@opentui/core`, `@opentui/solid`, `solid-js`.
- **Modal keybinding gotcha:** `Enter` is globally bound to `input.submit` and would fire before the textarea sees it. The dialog installs a `mode: "modal"`, `priority: 1` keymap layer scoped to the textarea that turns return into a newline (returning nothing consumes the key). Saving is single-sourced in `onCleanup` on unmount.

## Storage

Path: `$OPENCODE_DATA_DIR/scratchpad/<projectKey>.md` (default `~/.local/share/opencode/...`).

- `<projectKey>` = slug of the directory basename + 8-char SHA-1 of the **absolute** directory path. Storage is keyed by absolute path, so moving/renaming a project directory creates a new scratchpad.
- The `dataDir` plugin option must be absolute; `~` is **not** expanded.
- Resolution order for the base dir: `ctx.options.dataDir` → `OPENCODE_DATA_DIR` env → `~/.local/share/opencode`.

## Testing

Tests cover `plugin.ts`, `paths.ts`, and `store.ts` only — there is no `tui.tsx` test. `test/plugin.test.ts` drives `registerScratchpad` through an injected fake `ctx`/deps harness; extend that harness rather than making `plugin.ts` depend on real OpenCode objects.

## Distribution

Not a registry plugin — npm is the only channel. See `RELEASE_CHECKLIST.md` for the ordered publish flow; the current shape is `examples/opencode.json`.
