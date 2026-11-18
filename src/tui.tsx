import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { TextareaRenderable } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { PLUGIN_ID, registerScratchpad } from "./plugin.ts";
import { createStore, type Scratchpad } from "./store.ts";
import { optionDataDir, resolveDataDir, scratchpadPath } from "./paths.ts";
import { EDITOR_COMMAND_ID, editTextExternally } from "./editor.ts";

/** Most lines of a scratchpad the sidebar preview shows before it elides. */
const MAX_PREVIEW_LINES = 10;

/**
 * Bumped whenever the scratchpad file changes from a save. The sidebar preview
 * re-reads from disk only when its memo re-runs, so without this the read-only
 * row would stay stale while it remains expanded after an edit.
 */
const [scratchpadRevision, setScratchpadRevision] = createSignal(0);
const markScratchpadChanged = () => setScratchpadRevision((n) => n + 1);

function safeRead(store: Scratchpad): string {
  try {
    return store.read();
  } catch {
    return "";
  }
}

/** Resolves this project's directory from the plugin context. */
function projectDirectory(ctx: Context): string {
  return ctx.location?.directory ?? ctx.data.location.default().directory;
}

/** Resolves this project's scratchpad file path from the plugin context. */
function projectStore(ctx: Context): Scratchpad {
  const filePath = scratchpadPath(
    optionDataDir(ctx.options) ?? resolveDataDir(),
    projectDirectory(ctx),
    ctx.options?.ext,
  );
  return createStore(filePath);
}

/**
 * Bounded body height for the dialog textarea. The dialog box is content-sized,
 * so the body grows with the terminal but never past a comfortable reading
 * height, keeping the header and footer in view on tall terminals.
 */
function dialogBodyHeight(height: number): number {
  return Math.max(3, Math.min(16, Math.floor(height / 2) - 3));
}

/** First `MAX_PREVIEW_LINES` lines of the text, plus whether anything was cut. */
function truncatePreview(raw: string): { lines: string[]; truncated: boolean } {
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (normalized.trim().length === 0) return { lines: [], truncated: false };
  const all = normalized.split("\n");
  return {
    lines: all.slice(0, MAX_PREVIEW_LINES),
    truncated: all.length > MAX_PREVIEW_LINES,
  };
}

/**
 * The session-sidebar contribution: an always-present "Scratchpad" row that
 * expands in place to a read-only, truncated preview of the current text.
 *
 * The scratchpad is per-project, so `sessionID` is only a remount key; the
 * expanded/collapsed state lives in ephemeral storage keyed by the plugin id so
 * it survives session switches.
 */
export function ScratchpadSidebar(props: { ctx: Context; sessionID: string }) {
  const store = projectStore(props.ctx);
  // Captured, never destructured: each token is a live getter into the host theme.
  const theme = props.ctx.theme;

  const [state, setState] = props.ctx.storage.memory(PLUGIN_ID, {
    initial: { expanded: false },
  });
  const toggle = () =>
    setState((draft) => {
      draft.expanded = !draft.expanded;
    });

  // Re-read from disk whenever the section is expanded, so edits made in the
  // modal show up after collapsing and reopening the row.
  const preview = createMemo(() => {
    scratchpadRevision();
    if (!state.expanded) return null;
    return truncatePreview(safeRead(store));
  });

  // No padding or background here: the host already insets the
  // `sidebar.content` slot by 2 cells and gaps sibling sections.
  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1} width="100%" onMouseDown={toggle}>
        <text fg={theme.text.base}>{state.expanded ? "▼" : "▶"}</text>
        <text fg={theme.text.base}>
          <b>Scratchpad</b>
        </text>
      </box>

      <Show when={preview()}>
        {(view: () => { lines: string[]; truncated: boolean }) => (
          <box flexDirection="column" gap={1}>
            <Show
              when={view().lines.length > 0}
              fallback={<text fg={theme.text.muted}>No notes yet</text>}
            >
              <box flexDirection="column">
                <For each={view().lines}>
                  {(line) => (
                    <text
                      fg={theme.text.base}
                      width="100%"
                      wrapMode="none"
                      truncate
                    >
                      {line.length > 0 ? line : " "}
                    </text>
                  )}
                </For>
                <Show when={view().truncated}>
                  <text fg={theme.text.muted}>…</text>
                </Show>
              </box>
            </Show>
            <text fg={theme.text.muted}>Use /scratch to edit</text>
          </box>
        )}
      </Show>
    </box>
  );
}

/**
 * The modal editing surface, shown inside the host's command-palette shell. It
 * seeds from the store, saves on unmount, and keeps its textarea height bounded
 * to the renderer.
 */
function ScratchpadDialog(props: {
  ctx: Context;
  store: Scratchpad;
  onSaved: () => void;
}) {
  const initial = safeRead(props.store);
  // Captured, never destructured: each token is a live getter into the host theme.
  const theme = props.ctx.theme;
  const [value, setValue] = createSignal(initial);
  const [dirty, setDirty] = createSignal(false);

  let textarea: TextareaRenderable | undefined;
  let lastSaved = initial;

  const bodyHeight = dialogBodyHeight(props.ctx.renderer?.height ?? 0);

  const readCurrent = () => {
    try {
      return textarea?.plainText ?? value();
    } catch {
      return value();
    }
  };

  const persist = () => {
    const text = readCurrent();
    try {
      props.store.write(text);
    } catch {
      props.ctx.ui.toast.show({
        message: "Could not save scratchpad",
        variant: "error",
      });
      return;
    }
    lastSaved = text;
    setValue(text);
    setDirty(false);
    props.onSaved();
  };

  const handleChange = () => {
    const text = readCurrent();
    setValue(text);
    setDirty(text !== lastSaved);
  };

  const openInEditor = async () => {
    try {
      const updated = await editTextExternally({
        value: readCurrent(),
        cwd: projectDirectory(props.ctx),
        renderer: props.ctx.renderer,
      });
      if (updated === undefined) return;
      const node = textarea;
      if (node && !node.isDestroyed) {
        node.replaceText(updated);
        node.cursorOffset = updated.length;
      }
      setValue(updated);
      setDirty(updated !== lastSaved);
    } catch (error) {
      props.ctx.ui.toast.show({
        title: "Failed to open editor",
        message: error instanceof Error ? error.message : String(error),
        variant: "error",
      });
    }
  };

  // Enter is bound to the global input.submit action and consumed before it
  // reaches the textarea. A higher-priority layer that mirrors the host's own
  // dialog overrides (mode "modal", priority 1, scoped to the textarea) turns
  // return into a newline. Omitting a return value consumes the key so
  // input.submit does not also fire.
  props.ctx.keymap.layer(() => ({
    mode: "modal",
    priority: 1,
    target: () => textarea ?? null,
    commands: [
      {
        bind: "return",
        run: () => {
          textarea?.insertText("\n");
        },
      },
      {
        id: EDITOR_COMMAND_ID,
        title: "Open scratchpad in editor",
        group: "Plugins",
        bind: "<leader>e",
        run: () => {
          void openInEditor();
        },
      },
    ],
  }));

  // The dialog shell focuses nothing; the textarea must claim focus itself.
  onMount(() => {
    setTimeout(() => {
      const node = textarea;
      if (!node || node.isDestroyed) return;
      node.focus();
    }, 1);
  });

  // Esc, backdrop, or clear() all unmount the dialog; saving here keeps the
  // close path single-sourced.
  onCleanup(() => {
    if (dirty()) {
      try {
        props.store.write(readCurrent());
        props.onSaved();
      } catch {
        // Unmount is not the place to surface errors.
      }
    }
  });

  // The host shell pads top and paints the dialog surface; only the inset and
  // bottom pad are the dialog's own job (DIALOG_INSET is 3 in the host).
  return (
    <box
      flexDirection="column"
      gap={1}
      paddingLeft={3}
      paddingRight={3}
      paddingBottom={1}
    >
      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text fg={theme.text.base}>
          <b>Scratchpad</b>
        </text>
        <text fg={theme.text.muted}>esc</text>
      </box>

      <textarea
        ref={(node: TextareaRenderable) => {
          textarea = node;
        }}
        height={bodyHeight}
        initialValue={initial}
        placeholder="Type your notes…"
        wrapMode="word"
        textColor={theme.text.formfield.base}
        placeholderColor={theme.text.muted}
        onContentChange={handleChange}
      />

      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text fg={theme.text.muted}>
          Enter adds a line · leader+e opens editor · Esc saves
        </text>
        <Show
          when={dirty()}
          fallback={<text fg={theme.text.feedback.success.muted}>saved</text>}
        >
          <text fg={theme.text.feedback.warning.base}>● unsaved</text>
        </Show>
      </box>
    </box>
  );
}

/** Opens the scratchpad modal editor through the host's dialog shell. */
export function openScratchpadDialog(ctx: Context, store: Scratchpad): void {
  ctx.ui.dialog.show(
    () => (
      <ScratchpadDialog ctx={ctx} store={store} onSaved={markScratchpadChanged} />
    ),
    // Closed without edits still resolves the read side; saves bump it directly.
    () => markScratchpadChanged(),
  );
}

export default Plugin.define({
  id: PLUGIN_ID,
  setup(ctx) {
    return registerScratchpad(ctx, {
      createStore,
      resolveDataDir,
      scratchpadPath,
      renderSidebar: (sessionID) => (
        <ScratchpadSidebar ctx={ctx} sessionID={sessionID} />
      ),
      openDialog: (store) => openScratchpadDialog(ctx, store),
    });
  },
});
