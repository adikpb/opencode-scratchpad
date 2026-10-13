import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createTextAttributes, type TextareaRenderable } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { PLUGIN_ID, registerScratchpad } from "./plugin.ts";
import { createStore, type Scratchpad } from "./store.ts";
import { optionDataDir, resolveDataDir, scratchpadPath } from "./paths.ts";

/** Quiet secondary text: the terminal's own dim attribute, so we stay on-theme. */
const DIM = createTextAttributes({ dim: true });

/** Most lines of a scratchpad the sidebar preview shows before it elides. */
const MAX_PREVIEW_LINES = 10;

function safeRead(store: Scratchpad): string {
  try {
    return store.read();
  } catch {
    return "";
  }
}

/** Resolves this project's scratchpad file path from the plugin context. */
function projectStore(ctx: Context): Scratchpad {
  const directory = ctx.location?.directory ?? ctx.data.location.default().directory;
  const filePath = scratchpadPath(
    optionDataDir(ctx.options) ?? resolveDataDir(),
    directory,
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
    if (!state.expanded) return null;
    return truncatePreview(safeRead(store));
  });

  return (
    <box flexDirection="column" paddingY={1} gap={1}>
      <box
        flexDirection="row"
        gap={1}
        paddingX={1}
        width="100%"
        onMouseDown={toggle}
      >
        <text attributes={DIM}>{state.expanded ? "▾" : "▸"}</text>
        <text>
          <b>Scratchpad</b>
        </text>
      </box>

      <Show when={preview()}>
        {(view: () => { lines: string[]; truncated: boolean }) => (
          <box flexDirection="column" gap={1} paddingX={1}>
            <Show
              when={view().lines.length > 0}
              fallback={<text attributes={DIM}>No notes yet</text>}
            >
              <box flexDirection="column">
                <For each={view().lines}>
                  {(line) => (
                    <text wrapMode="none" truncate>
                      {line.length > 0 ? line : " "}
                    </text>
                  )}
                </For>
                <Show when={view().truncated}>
                  <text attributes={DIM}>…</text>
                </Show>
              </box>
            </Show>
            <text attributes={DIM}>Use /scratch to edit</text>
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
function ScratchpadDialog(props: { ctx: Context; store: Scratchpad }) {
  const initial = safeRead(props.store);
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
  };

  const handleChange = () => {
    const text = readCurrent();
    setValue(text);
    setDirty(text !== lastSaved);
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
      } catch {
        // Unmount is not the place to surface errors.
      }
    }
  });

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text>
          <b>Scratchpad</b>
        </text>
        <text attributes={DIM}>esc</text>
      </box>

      <textarea
        ref={(node: TextareaRenderable) => {
          textarea = node;
        }}
        height={bodyHeight}
        initialValue={initial}
        placeholder="Type your notes…"
        wrapMode="word"
        onContentChange={handleChange}
      />

      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text attributes={DIM}>Enter adds a line · Esc saves</text>
        <Show when={dirty()} fallback={<text attributes={DIM}>saved</text>}>
          <text>● unsaved</text>
        </Show>
      </box>
    </box>
  );
}

/** Opens the scratchpad modal editor through the host's dialog shell. */
export function openScratchpadDialog(ctx: Context, store: Scratchpad): void {
  ctx.ui.dialog.show(() => <ScratchpadDialog ctx={ctx} store={store} />, () => {});
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
