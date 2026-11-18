# AGENTS.md

Per-project scratchpad TUI plugin for OpenCode v2: one plain Markdown file per project, stored outside the repo. No build step, no network calls, no writes into the git repo.

## Commands

```sh
bun install
bun test                      # bun's runner, not jest/vitest
bun test test/paths.test.ts   # one file
bun test -t "projectKey"      # filter by test name
bun run typecheck             # tsc --noEmit
```

No build, lint, or format step (`noEmit`). Run `bun test` and `bun run typecheck` before considering work done.

## Architecture

Two plugin entrypoints, both defined with `Plugin.define`:

- `src/tui.tsx` — the real TUI plugin (`id: PLUGIN_ID`, `setup` calls `registerScratchpad`).
- `src/index.ts` — server entry, an intentional **no-op** (`setup() {}`) so the package resolves in server contexts. It is not dead code.

`src/plugin.ts` (`registerScratchpad`) holds all host wiring: one global keymap command (`COMMAND_ID = opencode-scratchpad.open`, palette + `/scratch`) and a `sidebar.content` slot claim. It takes injected `ScratchpadDeps` and is free of JSX, filesystem, and env access so it stays unit-testable. `src/tui.tsx` supplies the real deps (store, paths, sidebar renderer, dialog opener).

`src/paths.ts` owns data-dir resolution and the project key; `src/store.ts` owns file read/write/append; `src/editor.ts` owns the `$VISUAL`/`$EDITOR` spawn via a temp file and is injection-friendly (`runEditor`, `renderer`, `now`). Purity split is deliberate: put testable logic there and in `plugin.ts`, not in `tui.tsx`.

`package.json` `exports` point `.`/`./server` → `src/index.ts` and `./tui` → `src/tui.tsx`. The root `tui.js`/`server.js` are **forwarders used only for `file://` directory-form loading**; npm package-name installs resolve `exports` and never load them. Keep forwarders in sync if entry paths change.

## Conventions & quirks

- **Dev tooling is Bun.** Source is ESM using `node:` builtins. Imports usually carry explicit `.ts`/`.tsx` specifiers (tests are extensionless); both resolve under `moduleResolution: "bundler"` + `allowImportingTsExtensions`. `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- **JSX is SolidJS via OpenTUI, not React.** `jsxImportSource: "@opentui/solid"`. Components use `solid-js` primitives (`createSignal`, `createMemo`, `Show`, `For`, `onMount`, `onCleanup`), not React hooks.
- **Modal keybinding gotcha:** `Enter` is globally bound to `input.submit` and fires before the textarea sees it. The dialog installs a `mode: "modal"`, `priority: 1` keymap layer scoped to the textarea whose `return` binding inserts `"\n"` and returns nothing — a return value would let submit fire too. Saving is single-sourced in `onCleanup` on unmount and only runs when dirty.
- The dialog shell focuses nothing; the textarea claims focus itself in `onMount` via `setTimeout(..., 1)`.
- Sidebar expanded/collapsed state lives in ephemeral memory keyed by `PLUGIN_ID` (`ctx.storage.memory`), not per-session state, so it survives session switches. A module-level `scratchpadRevision` signal is bumped on save so the sidebar memo re-reads disk while the row stays expanded.
- **`@opencode/plugin` is pinned to `2.0.27` and the V2 TUI API is beta.** Verified against OpenCode v2.0.27. Do not loosen the pin or assume API stability; peer deps are `@opentui/core`, `@opentui/solid`, `solid-js`.

## Storage

Path: `$OPENCODE_DATA_DIR/scratchpad/<projectKey>.md` (default `~/.local/share/opencode/...`); the extension comes from the `ext` option (default `md`).

- `<projectKey>` = slug of the directory basename + 8-char SHA-1 of the **absolute** directory path. Storage is keyed by absolute path, so moving/renaming a project directory creates a new scratchpad.
- The `dataDir` plugin option must be absolute; `~` is **not** expanded. Empty/whitespace option values are ignored.
- Resolution order for the base dir: `ctx.options.dataDir` → `OPENCODE_DATA_DIR` env → `~/.local/share/opencode`.

## Testing

Tests cover `plugin.ts`, `paths.ts`, `store.ts`, and `editor.ts` — there is no `tui.tsx` test. `test/plugin.test.ts` drives `registerScratchpad` through an injected fake `ctx`/deps harness (`createHarness`); extend that harness rather than making `plugin.ts` depend on real OpenCode objects. Filesystem tests use `fs.mkdtemp` under `os.tmpdir()` and clean up in `afterEach`.

## Distribution

Not a registry plugin — npm is the only channel, published by hand (`files` whitelist ships `src` plus the forwarders). There is no CI, release checklist, or changeset tooling. `examples/opencode.json` is the minimal `plugins` config shape.
