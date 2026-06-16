import * as NodePath from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@t3tools\/contracts$/,
        replacement: NodePath.resolve(import.meta.dirname, "./packages/contracts/src/index.ts"),
      },
    ],
  },
});
