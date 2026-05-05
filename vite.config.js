import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/slip/",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: "vendor-editor-view",
              test: /node_modules[\\/](@codemirror[\\/]view|style-mod|w3c-keyname|crelt)[\\/]/,
              priority: 5,
            },
            {
              name: "vendor-editor-language",
              test: /node_modules[\\/](@codemirror[\\/](language|lang-markdown)|@lezer)[\\/]/,
              priority: 4,
            },
            {
              name: "vendor-editor-features",
              test: /node_modules[\\/]@codemirror[\\/](autocomplete|commands|search|state)[\\/]/,
              priority: 3,
            },
            {
              name: "vendor-render",
              test: /node_modules[\\/](katex|highlight\.js)[\\/]/,
              priority: 2,
            },
            {
              name: "vendor-archive",
              test: /node_modules[\\/](jszip|pako|lie|setimmediate|readable-stream|safe-buffer|core-util-is|inherits|string_decoder|util-deprecate)[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
});
