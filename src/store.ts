import fs from "node:fs";
import path from "node:path";

export interface Scratchpad {
  readonly path: string;
  read(): string;
  write(content: string): void;
  append(line: string): string;
  exists(): boolean;
}

export function createStore(filePath: string): Scratchpad {
  return {
    path: filePath,

    read(): string {
      if (!fs.existsSync(filePath)) {
        return "";
      }
      return fs.readFileSync(filePath, "utf8");
    },

    write(content: string): void {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    },

    append(line: string): string {
      const current = this.read();
      const next =
        current.length === 0 || current.endsWith("\n")
          ? current + line + "\n"
          : current + "\n" + line + "\n";
      this.write(next);
      return next;
    },

    exists(): boolean {
      return fs.existsSync(filePath);
    },
  };
}
