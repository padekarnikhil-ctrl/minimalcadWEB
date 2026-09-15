import { defineConfig } from "vite";

// base: './' -- so the built dist/ folder works opened straight off disk
// (file://) or served from any subpath, not just a domain root. This is
// what makes "no install, just open it" actually true once built.
export default defineConfig({
  base: "./",
  server: {
    open: true,
  },
});
