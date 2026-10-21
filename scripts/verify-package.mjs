// Verifies the packed artifact, not the source tree:
//  1. `pnpm pack` → install the tarball into a scratch consumer project
//  2. ESM import and CJS require of every public entry point
//  3. TypeScript resolution of every entry point (moduleResolution node16 + bundler, ESM + CJS)
//  4. Tree-shaking: bundle minimal consumers with esbuild and Rollup and check which modules survive
// Run after `pnpm build`. Exits non-zero on any failure.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const work = join(root, ".verify");
const consumer = join(work, "consumer");
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

rmSync(work, { recursive: true, force: true });
mkdirSync(consumer, { recursive: true });

// 1. Pack and install.
run("pnpm", ["pack", "--pack-destination", work]);
const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
const files = run("tar", ["-tzf", join(work, tarball)]).trim().split("\n");
console.log(`packed ${tarball} (${files.length} files)`);
check(files.every((f) => /^package\/(dist\/|docs\/migration\.md$|package\.json$|README\.md$|LICENSE$)/.test(f)), "tarball contains only dist, docs, metadata");
check(!files.some((f) => f.includes(".test.") || f.includes("__fixtures__")), "tarball excludes tests and fixtures");

writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", join(work, tarball)], consumer);

// 2. Runtime smoke tests.
const SPEC = "00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA53037045802VN63049E6F";
const esm = `
import Default, { PayCodeGen, generateVietQR, encodeTLV as rootEncode } from "napas-format";
import { encodeTLV, field } from "napas-format/tlv";
import { calculateCRC16, verifyCRC } from "napas-format/crc";
import { parseVietQR, validateVietQR } from "napas-format/vietqr";
import { transactionAmount } from "napas-format/vietqr/fields";
const out = {
  legacy: new Default().acquirer("970403").cosumer("0011012345678").cosumerType("A").toString(),
  sameClass: Default === PayCodeGen,
  generated: generateVietQR({ acquirerId: "970403", consumerId: "0011012345678" }),
  tlv: encodeTLV([field("01", "12")]),
  sameFn: rootEncode === encodeTLV,
  crc: calculateCRC16("123456789"),
  verify: verifyCRC("${SPEC}"),
  parsed: parseVietQR("${SPEC}").merchantAccount.consumerId,
  valid: validateVietQR("${SPEC}").valid,
  amount: transactionAmount(5).value,
};
console.log(JSON.stringify(out));`;
const cjs = `
const root = require("napas-format");
const { encodeTLV, field } = require("napas-format/tlv");
const { calculateCRC16 } = require("napas-format/crc");
const { generateVietQR } = require("napas-format/vietqr");
const { transactionAmount } = require("napas-format/vietqr/fields");
console.log(JSON.stringify({
  legacy: new root.default().acquirer("970403").cosumer("0011012345678").cosumerType("A").toString(),
  named: new root.PayCodeGen().acquirer("970403").cosumer("0011012345678").cosumerType("A").toString(),
  generated: generateVietQR({ acquirerId: "970403", consumerId: "0011012345678" }),
  tlv: encodeTLV([field("01", "12")]),
  crc: calculateCRC16("123456789"),
  amount: transactionAmount(5).value,
}));`;
writeFileSync(join(consumer, "smoke.mjs"), esm);
writeFileSync(join(consumer, "smoke.cjs"), cjs);
const e = JSON.parse(run("node", ["smoke.mjs"], consumer));
check(e.legacy === SPEC && e.generated === SPEC && e.sameClass, "ESM: legacy and functional API produce the spec payload");
check(e.tlv === "010212" && e.sameFn && e.crc === "29B1" && e.verify && e.parsed === "0011012345678" && e.valid && e.amount === "5", "ESM: all subpaths load and work");
const c = JSON.parse(run("node", ["smoke.cjs"], consumer));
check(c.legacy === SPEC && c.named === SPEC && c.generated === SPEC, "CJS: legacy and functional API produce the spec payload");
check(c.tlv === "010212" && c.crc === "29B1" && c.amount === "5", "CJS: all subpaths load and work");

// 3. Declaration resolution.
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const typesSrc = `
import PayCodeGen, { type ParsedVietQR } from "napas-format";
import { encodeTLV, field, type TLVNode } from "napas-format/tlv";
import { calculateCRC16 } from "napas-format/crc";
import { generateVietQR, VietQRError, type VietQRTransferInput } from "napas-format/vietqr";
import { tipOrConvenienceFee, type TipOrConvenienceFee } from "napas-format/vietqr/fields";
const nodes: TLVNode[] = [field("01", "12")];
const input: VietQRTransferInput = { acquirerId: "970403", consumerId: "1" };
const fee: TipOrConvenienceFee = { type: "tip" };
const s: string = encodeTLV(nodes) + calculateCRC16("x") + generateVietQR(input) + new PayCodeGen().toString();
const f: readonly { id: string }[] = tipOrConvenienceFee(fee);
// @ts-expect-error fixed fee requires a value
tipOrConvenienceFee({ type: "fixed" });
declare const p: ParsedVietQR;
export { s, f, p, VietQRError };
`;
writeFileSync(join(consumer, "types.mts"), typesSrc);
writeFileSync(join(consumer, "types.cts"), typesSrc.replace(/^import (.+) from (".+");$/gm, "import $1 from $2;"));
for (const [resolution, module] of [["node16", "node16"], ["bundler", "esnext"]]) {
  for (const file of ["types.mts", "types.cts"]) {
    if (resolution === "bundler" && file === "types.cts") continue;
    let ok = true;
    try {
      run("node", [tsc, "--noEmit", "--strict", "--skipLibCheck", "false", "--module", module, "--moduleResolution", resolution, "--target", "es2022", file], consumer);
    } catch {
      ok = false;
    }
    check(ok, `types resolve (${resolution}, ${file})`);
  }
}

// Every ```ts block in the README and migration guide must compile against the packed package.
let blocks = 0;
for (const doc of ["README.md", "docs/migration.md"]) {
  const text = readFileSync(join(root, doc), "utf8");
  for (const [, code] of text.matchAll(/```ts\n([\s\S]*?)```/g)) {
    const file = `doc-example-${++blocks}.mts`;
    writeFileSync(join(consumer, file), code + "\nexport {};\n");
    let ok = true;
    try {
      run("node", [tsc, "--noEmit", "--strict", "--module", "node16", "--moduleResolution", "node16", "--target", "es2022", file], consumer);
    } catch (error) {
      console.log(error.stdout?.toString());
      ok = false;
    }
    check(ok, `${doc} example #${blocks} compiles`);
  }
}

// 4. Tree-shaking.
const fixtures = {
  "tlv-encode": [`import { encodeTLV, field } from "napas-format/tlv"; console.log(encodeTLV([field("01", "12")]));`,
    { absent: ["TextEncoder", "A000000727", "Incomplete header", "cosumerType", "QRIBFTT"] }],
  "crc-only": [`import { calculateCRC16 } from "napas-format/crc"; console.log(calculateCRC16("x"));`,
    { present: ["TextEncoder"], absent: ["A000000727", "TLVError", "Incomplete header", "cosumerType"] }],
  "one-field": [`import { transactionAmount } from "napas-format/vietqr/fields"; console.log(transactionAmount(1));`,
    { present: ["Transaction Amount"], absent: ["TextEncoder", "Incomplete header", "cosumerType", "QRIBFTT", "Payload must be a string"] }],
  "generate": [`import { generateVietQR } from "napas-format/vietqr"; console.log(generateVietQR({ acquirerId: "970403", consumerId: "1" }));`,
    { present: ["TextEncoder", "QRIBFTT"], absent: ["Incomplete header", "cosumerType", "Payload must be a string"] }],
  "legacy": [`import PayCodeGen from "napas-format"; console.log(new PayCodeGen().toString());`,
    { present: ["cosumerType", "TextEncoder"], absent: ["Incomplete header", "Payload must be a string"] }],
  "root-tlv": [`import { encodeTLV, field } from "napas-format"; console.log(encodeTLV([field("01", "12")]));`,
    { absent: ["TextEncoder", "A000000727", "Incomplete header", "cosumerType", "QRIBFTT"] }],
};
const require = createRequire(import.meta.url);
const esbuild = require(join(root, "node_modules", "esbuild"));
const { rollup } = await import(join(root, "node_modules", "rollup", "dist", "es", "rollup.js"));
const { nodeResolve } = await import(join(root, "node_modules", "@rollup", "plugin-node-resolve", "dist", "es", "index.js"));
const rows = [];
for (const [name, [source, expect]] of Object.entries(fixtures)) {
  const entry = join(consumer, `${name}.mjs`);
  writeFileSync(entry, source);
  const esb = (await esbuild.build({ entryPoints: [entry], bundle: true, minify: true, format: "esm", write: false, absWorkingDir: consumer })).outputFiles[0].text;
  const bundle = await rollup({ input: entry, plugins: [nodeResolve()], logLevel: "silent" });
  const rol = (await bundle.generate({ format: "es" })).output[0].code;
  for (const [tool, code] of [["esbuild", esb], ["rollup", rol]]) {
    const missing = (expect.present ?? []).filter((m) => !code.includes(m));
    const leaked = (expect.absent ?? []).filter((m) => code.includes(m));
    check(!missing.length && !leaked.length, `tree-shaking ${name} (${tool})${missing.length ? ` missing ${missing}` : ""}${leaked.length ? ` leaked ${leaked}` : ""}`);
  }
  rows.push([name, esb.length, rol.length]);
}
console.log("\nbundle sizes (bytes): fixture | esbuild minified | rollup unminified");
for (const [name, a, b] of rows) console.log(`  ${name.padEnd(11)} | ${String(a).padStart(6)} | ${String(b).padStart(6)}`);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall package checks passed");
