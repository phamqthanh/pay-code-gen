import { defineConfig } from "tsup";
import { writeFileSync } from "fs";
import { join } from "path";
import packageJSON from "./package.json";
const outPut = JSON.parse(JSON.stringify(packageJSON));

export default defineConfig([
  {
    format: ["esm", "cjs"],
    minify: true,
    dts: true,
    outDir: "dist",
    entry: {
      index: "src/index.ts",
    },
    async onSuccess() {
      outPut.main = "./index.mjs";
      outPut.module = "./index.mjs";
      outPut.types = "./index.d.mts";
      outPut.exports = {
        ".": {
          types: "./index.d.mts",
          require: "./index.js",
          import: "./index.mjs",
          default: "./index.mjs",
        },
      };
      outPut.files = ["*"];
      delete outPut.publishConfig;
      delete outPut.scripts;
      writeFileSync(
        join(__dirname, "./dist/package.json"),
        JSON.stringify(outPut, null, 2)
      );
      return;
    },
  },
]);
