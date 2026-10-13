import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  optionDataDir,
  projectKey,
  resolveDataDir,
  scratchpadDir,
  scratchpadPath,
} from "../src/paths";

describe("resolveDataDir", () => {
  test("uses OPENCODE_DATA_DIR when non-empty", () => {
    expect(resolveDataDir({ OPENCODE_DATA_DIR: "/custom/data" })).toBe(
      "/custom/data",
    );
  });

  test("falls back to default data dir when unset", () => {
    expect(resolveDataDir({})).toBe(
      path.join(os.homedir(), ".local", "share", "opencode"),
    );
  });

  test("falls back when OPENCODE_DATA_DIR is empty string", () => {
    expect(resolveDataDir({ OPENCODE_DATA_DIR: "" })).toBe(
      path.join(os.homedir(), ".local", "share", "opencode"),
    );
  });
});

describe("scratchpadDir", () => {
  test("appends scratchpad segment", () => {
    expect(scratchpadDir("/data/opencode")).toBe(
      path.join("/data/opencode", "scratchpad"),
    );
  });
});

describe("projectKey", () => {
  test("is deterministic for the same directory", () => {
    const dir = "/home/user/projects/app";
    expect(projectKey(dir)).toBe(projectKey(dir));
  });

  test("differs for different directories", () => {
    expect(projectKey("/home/user/a")).not.toBe(projectKey("/home/user/b"));
  });

  test("differs when basenames match but paths differ", () => {
    expect(projectKey("/one/app")).not.toBe(projectKey("/two/app"));
  });

  test("sanitizes basename into a slug", () => {
    expect(projectKey("/home/user/My Project!")).toMatch(/^my-project-[0-9a-f]{8}$/);
  });

  test("collapses runs of special characters", () => {
    expect(projectKey("/x/a___b")).toMatch(/^a-b-[0-9a-f]{8}$/);
  });

  test("falls back to 'project' when slug is empty", () => {
    expect(projectKey("/")).toMatch(/^project-[0-9a-f]{8}$/);
    expect(projectKey("!!!")).toMatch(/^project-[0-9a-f]{8}$/);
  });

  test("suffix is an 8-char sha1 hex slice", () => {
    const key = projectKey("/home/user/projects/app");
    expect(key.endsWith("-")).toBe(false);
    const suffix = key.slice(key.lastIndexOf("-") + 1);
    expect(suffix).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("scratchpadPath", () => {
  test("joins scratchpad dir with project key and default ext", () => {
    const dataDir = "/data/opencode";
    const dir = "/home/user/projects/app";
    expect(scratchpadPath(dataDir, dir)).toBe(
      path.join(scratchpadDir(dataDir), `${projectKey(dir)}.md`),
    );
  });

  test("honors a custom extension", () => {
    const dataDir = "/data/opencode";
    const dir = "/home/user/projects/app";
    expect(scratchpadPath(dataDir, dir, "txt")).toBe(
      path.join(scratchpadDir(dataDir), `${projectKey(dir)}.txt`),
    );
  });
});

describe("optionDataDir", () => {
  test("returns a non-empty string option", () => {
    expect(optionDataDir({ dataDir: "/custom/dir" })).toBe("/custom/dir");
  });

  test("returns undefined when options are missing", () => {
    expect(optionDataDir(undefined)).toBeUndefined();
    expect(optionDataDir({})).toBeUndefined();
  });

  test("ignores non-string, empty, and whitespace values", () => {
    expect(optionDataDir({ dataDir: 42 })).toBeUndefined();
    expect(optionDataDir({ dataDir: "" })).toBeUndefined();
    expect(optionDataDir({ dataDir: "   " })).toBeUndefined();
  });
});
