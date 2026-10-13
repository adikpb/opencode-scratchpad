// v2 TUI entry forwarder for directory-form plugin loading, e.g.
//   "plugins": ["file:///absolute/path/to/this/checkout"]
// Package-name installs resolve `exports["./tui"]` instead and never load this file.
export { default } from "./src/tui.tsx";
