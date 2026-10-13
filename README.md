# opencode-scratchpad

Per-project scratchpad TUI plugin for OpenCode: capture and edit notes per project, stored privately outside your repo.

## Why

OpenCode sessions come and go, but every project accumulates little things worth keeping: a command you keep re-deriving, a decision and its rationale, the next step you don't want to lose. Context switching to an external notes app breaks your flow and scatters your notes across tools.

`opencode-scratchpad` gives each project **one private scratchpad** — a single free-form text document you can capture into and edit without leaving the TUI. It is not a list of notes or a task manager; it is one surface per project, always in the same place.

## Features

- **One scratchpad per project**, keyed by the project's absolute path.
- **`/scratch` command**
  - `/scratch <text>` appends a line of text to the current project's scratchpad and shows a confirmation toast.
  - `/scratch` (no argument) opens the editing panel.
- **Editing panel** — an editable textarea with a header (title, project directory, file path) and a footer (key hints, saved indicator). `Ctrl+S` saves, `Esc` closes.
- **Private and local** — no network calls, no telemetry, and nothing written into your git repo.
- **Plain Markdown on disk** — one file per project, easy to back up, grep, or delete.

## Requirements

- **OpenCode v2.** Verified against OpenCode v2.0.27.
- The V2 TUI plugin API is currently **beta**. The plugin pins `@opencode/plugin@2.0.27`, and you should pin versions too — the API may change between releases.
- Runtime peers: `@opentui/core`, `@opentui/solid`, and `solid-js` (installed transitively by OpenCode).

## Installation

### From npm

Install the plugin:

```sh
npm install opencode-scratchpad
```

Register it in your OpenCode config (V2 uses the `plugins` key). See [`examples/opencode.json`](./examples/opencode.json) for a minimal config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-scratchpad"]
}
```

### Local development install

To use a working copy, register it by absolute `file://` path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["file:///absolute/path/to/opencode-scratchpad"]
}
```

OpenCode loads the local directory through the `tui.js` and `server.js` entry forwarders shipped at the repository root. Restart OpenCode afterwards. When you install the published npm package by name instead, OpenCode resolves the `./tui` and `./server` package exports and the forwarders are not used.

## Usage

### Capture a line

```
/scratch Remember to regenerate the API client after schema changes
```

The line is appended to the current project's scratchpad and a toast confirms the write.

### Open the panel

```
/scratch
```

> The panel opens **inside the current session**. On a fresh home screen with no active session, opening a panel is a no-op — start or resume a session first. You can also run **Scratchpad** from the command palette (`Ctrl+P`).

The panel is the single editing surface:

| Key     | Action      |
| ------- | ----------- |
| `Ctrl+S` | Save        |
| `Esc`    | Close panel |

The header shows the title, project directory, and file path; the footer shows the key hints and a saved indicator.

## Storage & Privacy

Everything is **local**. The plugin makes no network calls, collects no telemetry, and writes nothing into the git repo.

One Markdown file per project is stored at:

```
$OPENCODE_DATA_DIR/scratchpad/<projectKey>.md
```

`OPENCODE_DATA_DIR` defaults to `~/.local/share/opencode`, so the default path is:

```
~/.local/share/opencode/scratchpad/<projectKey>.md
```

`<projectKey>` is a slug of the project directory basename plus an 8-char hash of the absolute directory path, which keeps same-named directories in different locations from colliding.

- **Override the base directory** with the `OPENCODE_DATA_DIR` environment variable.
- **Notes are plaintext on disk.** For sensitive notes, rely on OS-level disk encryption.
- **Storage is keyed by absolute project path**, so moving or renaming a project directory creates a new scratchpad rather than following the project.

## Configuration

The plugin reads `options` from the OpenCode plugin context (`context.options`):

| Option    | Type     | Default                          | Description                          |
| --------- | -------- | -------------------------------- | ------------------------------------ |
| `dataDir` | `string` | `$OPENCODE_DATA_DIR` (or `~/.local/share/opencode`) | Base data directory to store scratchpads under. |
| `ext`     | `string` | `"md"`                           | File extension for scratchpad files. |

Pass options using the object form of a `plugins` entry (OpenCode reads them as `context.options`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-scratchpad",
      "options": {
        "dataDir": "/absolute/path/to/notes",
        "ext": "md"
      }
    }
  ]
}
```

`dataDir` must be an absolute path (the plugin does not expand `~`). When `dataDir` is omitted, the `OPENCODE_DATA_DIR` environment variable is used if set, otherwise `~/.local/share/opencode`.

## Development

```sh
bun install       # install dependencies
bun test          # run the test suite
bun run typecheck # type-check with tsc --noEmit
```

## Roadmap

- Search within the scratchpad.
- Timestamped captures.
- Optional per-project scratchpad templates.
- Configurable keybindings.

## Contributing

Issues and pull requests are welcome at `https://github.com/YOUR_GITHUB_USER/opencode-scratchpad`. Please run `bun test` and `bun run typecheck` before opening a PR, and keep the scope focused on the single-scratchpad-per-project model.

## License

[MIT](./LICENSE) © 2026 YOUR_GITHUB_USER
