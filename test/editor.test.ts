import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EDITOR_COMMAND_ID,
  editTextExternally,
  resolveEditorCommand,
  type EditorRunArgs,
  type RendererControl,
} from "../src/editor.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scratchpad-editor-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Fixed clock so the scratch filename is deterministic. */
const now = () => 1234567890;

describe("EDITOR_COMMAND_ID", () => {
  test("is the stable bindable id", () => {
    expect(EDITOR_COMMAND_ID).toBe("opencode-scratchpad.editor");
  });
});

describe("resolveEditorCommand", () => {
  test("returns undefined when neither is set", () => {
    expect(resolveEditorCommand({})).toBeUndefined();
  });

  test("treats empty and whitespace-only values as unset", () => {
    expect(resolveEditorCommand({ VISUAL: "", EDITOR: "  " })).toBeUndefined();
  });

  test("$VISUAL takes precedence over $EDITOR", () => {
    expect(resolveEditorCommand({ VISUAL: "vim", EDITOR: "nano" })).toBe("vim");
  });

  test("falls back to $EDITOR", () => {
    expect(resolveEditorCommand({ EDITOR: "nano" })).toBe("nano");
  });
});

describe("editTextExternally", () => {
  test("throws when neither $VISUAL nor $EDITOR is set", async () => {
    await expect(
      editTextExternally({ value: "hello", env: {}, tmpDir, now }),
    ).rejects.toThrow("Set $VISUAL or $EDITOR to open an external editor");
  });

  test("passes the resolved command (VISUAL wins) to the editor", async () => {
    let seen: EditorRunArgs | undefined;
    await editTextExternally({
      value: "hello",
      env: { VISUAL: "vim", EDITOR: "nano" },
      tmpDir,
      now,
      runEditor: async (args) => {
        seen = args;
      },
    });
    expect(seen?.command).toBe("vim");
  });

  test("writes the initial value to the temp file before the editor runs", async () => {
    await editTextExternally({
      value: "initial notes",
      env: { EDITOR: "nano" },
      tmpDir,
      now,
      runEditor: async ({ file }) => {
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.readFileSync(file, "utf8")).toBe("initial notes");
      },
    });
  });

  test("returns the edited content when the editor writes non-empty text", async () => {
    const result = await editTextExternally({
      value: "before",
      env: { EDITOR: "nano" },
      tmpDir,
      now,
      runEditor: async ({ file }) => {
        fs.writeFileSync(file, "after", "utf8");
      },
    });
    expect(result).toBe("after");
  });

  test("returns undefined when the editor leaves the file empty", async () => {
    const result = await editTextExternally({
      value: "before",
      env: { EDITOR: "nano" },
      tmpDir,
      now,
      runEditor: async ({ file }) => {
        fs.writeFileSync(file, "", "utf8");
      },
    });
    expect(result).toBeUndefined();
  });

  test("deletes the temp file afterward", async () => {
    const file = path.join(tmpDir, `${now()}.md`);
    await editTextExternally({
      value: "before",
      env: { EDITOR: "nano" },
      tmpDir,
      now,
      runEditor: async ({ file: runFile }) => {
        expect(runFile).toBe(file);
      },
    });
    expect(fs.existsSync(file)).toBe(false);
  });

  test("suspends the renderer before the editor and resumes after", async () => {
    const calls: string[] = [];
    const renderer: RendererControl = {
      suspend: async () => {
        calls.push("suspend");
      },
      resume: async () => {
        calls.push("resume");
      },
      requestRender: () => {
        calls.push("requestRender");
      },
    };

    await editTextExternally({
      value: "before",
      env: { EDITOR: "nano" },
      tmpDir,
      now,
      renderer,
      runEditor: async () => {
        calls.push("runEditor");
      },
    });

    expect(calls).toEqual(["suspend", "runEditor", "resume", "requestRender"]);
  });

  test("cleans up and preserves renderer lifecycle when the editor fails", async () => {
    const calls: string[] = [];
    const renderer: RendererControl = {
      suspend: async () => {
        calls.push("suspend");
      },
      resume: async () => {
        calls.push("resume");
      },
      requestRender: () => {
        calls.push("requestRender");
      },
    };
    const file = path.join(tmpDir, `${now()}.md`);

    await expect(
      editTextExternally({
        value: "before",
        env: { EDITOR: "nano" },
        tmpDir,
        now,
        renderer,
        runEditor: async () => {
          calls.push("runEditor");
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(fs.existsSync(file)).toBe(false);
    expect(calls).toEqual(["suspend", "runEditor", "resume", "requestRender"]);
  });
});
