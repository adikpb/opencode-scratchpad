# Release Checklist

A practical, ordered checklist for publishing `opencode-scratchpad` to npm and GitHub.

## 1. Pre-flight verification

- [ ] `bun install` — dependencies are current.
- [ ] `bun test` — the full test suite passes.
- [ ] `bun run typecheck` — `tsc --noEmit` reports no errors.
- [ ] Manually smoke-test in a real OpenCode v2 session:
  - [ ] `/scratch <text>` appends a line and shows the confirmation toast.
  - [ ] `/scratch` opens the panel; `Ctrl+S` saves and `Esc` closes.
  - [ ] The file lands at `$OPENCODE_DATA_DIR/scratchpad/<projectKey>.md`.

## 2. Package metadata

- [ ] Bump `version` in `package.json` (semver; the V2 TUI API is beta, so prefer `0.x`).
- [ ] Confirm `files` in `package.json` includes exactly what should ship (e.g. `src`, `tui.js`, `server.js`, `README.md`, `LICENSE`).
- [ ] Confirm `exports` in `package.json` is correct for the entry points (`.`, `./server`, `./tui`).
- [ ] Confirm the root `tui.js` and `server.js` forwarders still re-export the current source (needed for `file://` directory-form loading).
- [ ] Confirm `license` is `MIT` and matches `LICENSE`.
- [ ] Confirm the pinned `@opencode/plugin` version is the one you verified against.
- [ ] Confirm `description` and `keywords` are accurate.
- [ ] Verify the tarball contents before publishing:
  ```sh
  npm pack --dry-run
  ```

## 3. Documentation

- [ ] README is accurate: command, panel keys, storage path, privacy, configuration, development.
- [ ] `examples/opencode.json` matches the current V2 `plugins` config shape.
- [ ] `CHANGELOG` (optional) notes the user-visible changes for this version.

## 4. Publish to npm

> There is **no official OpenCode plugin registry** — npm is the distribution channel.

- [ ] `npm login` (confirm you are authenticated as the correct account).
- [ ] `npm publish --access public`
- [ ] Verify the published version is live:
  ```sh
  npm view opencode-scratchpad version
  ```
- [ ] Install from npm in a clean OpenCode project and confirm it loads.

## 5. Publish to GitHub

- [ ] Create the GitHub repository with the description:

  > Per-project scratchpad TUI plugin for OpenCode: capture and edit notes per project, stored privately outside your repo.

- [ ] Push the code and tags:
  ```sh
  git push origin main
  git push origin --tags
  ```
- [ ] Create a GitHub release for the version, summarizing the changes.
- [ ] Confirm the README renders correctly on the repo page.

## 6. Discoverability

- [ ] Submit the plugin to the **OpenCode Ecosystem** page.
- [ ] Submit a PR to the **`awesome-opencode/awesome-opencode`** list.
- [ ] Note again: **there is no official OpenCode plugin registry**, so the OpenCode Ecosystem page and the awesome list are the primary discovery channels.

## 7. Post-release

- [ ] Tag the release and bump to the next development version if applicable.
- [ ] Watch npm and GitHub issues for install/version-pinning problems.
