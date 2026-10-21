import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    tlv: "src/core/tlv/index.ts",
    crc: "src/core/crc/index.ts",
    vietqr: "src/vietqr/index.ts",
    "vietqr/fields": "src/vietqr/fields.ts",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2020",
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
