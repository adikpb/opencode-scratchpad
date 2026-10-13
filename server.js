// v2 server entry forwarder for directory-form plugin loading, e.g.
//   "plugins": ["file:///absolute/path/to/this/checkout"]
// Package-name installs resolve `exports["./server"]`/`exports["."]` instead and
// never load this file.
export { default } from "./src/index.ts";
