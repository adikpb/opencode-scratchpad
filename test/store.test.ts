import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../src/store";

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scratchpad-"));
  filePath = path.join(tmpDir, "nested", "doc.md");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createStore", () => {
  test("exposes the file path", () => {
    expect(createStore(filePath).path).toBe(filePath);
  });

  test("read() returns empty string for a missing file", () => {
    const store = createStore(filePath);
    expect(store.read()).toBe("");
  });

  test("exists() is false before write and true after", () => {
    const store = createStore(filePath);
    expect(store.exists()).toBe(false);
    store.write("hello");
    expect(store.exists()).toBe(true);
  });

  test("write/read round-trips content and creates parent dirs", () => {
    const store = createStore(filePath);
    store.write("line1\nline2");
    expect(store.exists()).toBe(true);
    expect(store.read()).toBe("line1\nline2");
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  test("append onto empty file", () => {
    const store = createStore(filePath);
    const result = store.append("first");
    expect(result).toBe("first\n");
    expect(store.read()).toBe("first\n");
  });

  test("append onto content without trailing newline", () => {
    const store = createStore(filePath);
    store.write("first");
    const result = store.append("second");
    expect(result).toBe("first\nsecond\n");
    expect(store.read()).toBe("first\nsecond\n");
  });

  test("append onto content with trailing newline", () => {
    const store = createStore(filePath);
    store.write("first\n");
    const result = store.append("second");
    expect(result).toBe("first\nsecond\n");
    expect(store.read()).toBe("first\nsecond\n");
  });

  test("successive appends accumulate", () => {
    const store = createStore(filePath);
    store.append("a");
    store.append("b");
    expect(store.read()).toBe("a\nb\n");
  });
});
