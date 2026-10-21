// Compares package size and consumer bundle size between the old `@pahm/pay-code-gen`
// (rebuilt from the baseline commit with its own tsup config, packed from dist/ as its
// publishConfig.directory specified) and the current `napas-format` build.
//
// Usage: pnpm build && node scripts/compare-size.mjs [baseline-ref]
// Writes docs/size-comparison.md. The first run needs network access to install the old devDependencies.
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const baseline = process.argv[2] ?? "1d16c56";
const work = join(root, ".size");
const oldSrc = join(work, "old-src");
const packs = join(work, "packs");
const consumer = join(work, "consumer");
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

rmSync(work, { recursive: true, force: true });
for (const dir of [oldSrc, packs, consumer]) mkdirSync(dir, { recursive: true });

// 1. Old package: extract the baseline commit, build with its tsup config, pack dist/.
execSync(`git archive ${baseline} | tar -x -C "${oldSrc}"`, { cwd: root });
run("pnpm", ["install", "--ignore-workspace", "--config.confirmModulesPurge=false"], oldSrc);
run("pnpm", ["run", "build"], oldSrc);
run("npm", ["pack", "--pack-destination", packs], join(oldSrc, "dist"));

// 2. New package.
run("pnpm", ["pack", "--pack-destination", packs]);

const tarballs = readdirSync(packs).filter((f) => f.endsWith(".tgz"));
const oldTgz = tarballs.find((f) => f.startsWith("pahm-"));
const newTgz = tarballs.find((f) => f.startsWith("napas-format-"));

// 3. Package metrics from the tarballs.
function packageStats(tgz) {
  const dir = join(work, "unpacked", tgz);
  mkdirSync(dir, { recursive: true });
  run("tar", ["-xzf", join(packs, tgz), "-C", dir]);
  const files = run("tar", ["-tzf", join(packs, tgz)]).trim().split("\n");
  const sum = (filter) =>
    files.filter(filter).reduce((total, f) => total + statSync(join(dir, f)).size, 0);
  return {
    tarball: statSync(join(packs, tgz)).size,
    unpacked: sum(() => true),
    files: files.length,
    jsEsm: sum((f) => (tgz.startsWith("pahm-") ? f.endsWith(".mjs") : f.endsWith(".js"))),
    jsCjs: sum((f) => (tgz.startsWith("pahm-") ? f.endsWith("/index.js") : f.endsWith(".cjs"))),
    dts: sum((f) => /\.d\.(m|c)?ts$/.test(f)),
    maps: sum((f) => f.endsWith(".map")),
    other: sum((f) => !/\.(m?js|cjs|map)$/.test(f) && !/\.d\.(m|c)?ts$/.test(f)),
  };
}
const oldPkg = packageStats(oldTgz);
const newPkg = packageStats(newTgz);

// 4. Consumer bundles.
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "size-consumer", private: true, type: "module" }));
run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", join(packs, oldTgz), join(packs, newTgz)], consumer);

const OLD = "@pahm/pay-code-gen";
const NEW = "napas-format";
const staticBuilder = (pkg) => `import PayCodeGen from "${pkg}";
console.log(new PayCodeGen().acquirer("970403").cosumer("0011012345678").cosumerType("A").toString());`;
// ASCII content (the spec §6.1.4 example) so old and new must print the same payload.
const dynamicBuilder = (pkg, content = "thanh toan don hang") => `import PayCodeGen, { BILL_NUMBER } from "${pkg}";
console.log(new PayCodeGen().dynamic().acquirer("970403").cosumer("9704031101234567").cosumerType("C")
  .amount(180000).additional(BILL_NUMBER, "NPS6869").content(${JSON.stringify(content)}).toString());`;

/** [id, description, old source | null, new source] — rows with the same id print the same payload. */
const scenarios = [
  ["static-builder", "Static QR to account, PayCodeGen builder", staticBuilder(OLD), staticBuilder(NEW)],
  ["dynamic-builder", "Dynamic QR to card + amount + bill + content, PayCodeGen builder", dynamicBuilder(OLD), dynamicBuilder(NEW)],
  ["dynamic-builder-vi", "Same as above with Vietnamese content \"thanh toán đơn hàng\" (expected to differ, see note)",
    dynamicBuilder(OLD, "thanh toán đơn hàng"), dynamicBuilder(NEW, "thanh toán đơn hàng")],
  ["static-generate", "Static QR to account, generateVietQR (new) vs builder (old)", staticBuilder(OLD),
    `import { generateVietQR } from "${NEW}/vietqr";
console.log(generateVietQR({ acquirerId: "970403", consumerId: "0011012345678" }));`],
  ["dynamic-generate", "Dynamic QR to card, generateVietQR (new) vs builder (old)", dynamicBuilder(OLD),
    `import { generateVietQR, removeAccents } from "${NEW}/vietqr";
console.log(generateVietQR({ acquirerId: "970403", consumerId: "9704031101234567", service: "card", initiation: "dynamic",
  amount: 180000, purpose: removeAccents("thanh toán đơn hàng"), additionalData: { billNumber: "NPS6869" } }));`],
  ["dynamic-composed", "Dynamic QR to card, field factories + encodeVietQR (new) vs builder (old)", dynamicBuilder(OLD),
    `import { additionalData, countryCode, encodeVietQR, merchantAccount, pointOfInitiation, transactionAmount, transactionCurrency } from "${NEW}/vietqr";
console.log(encodeVietQR([pointOfInitiation("dynamic"), merchantAccount({ acquirerId: "970403", consumerId: "9704031101234567", service: "card" }),
  transactionCurrency(704), transactionAmount(180000), countryCode("VN"),
  additionalData({ billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" })]));`],
  ["parse", "parseVietQR (new only)", null,
    `import { parseVietQR } from "${NEW}/vietqr";
console.log(parseVietQR("00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA53037045802VN63049E6F").merchantAccount.consumerId);`],
  ["validate", "validateVietQR (new only)", null,
    `import { validateVietQR } from "${NEW}/vietqr";
console.log(validateVietQR("00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA53037045802VN63049E6F").valid);`],
  ["tlv", "encodeTLV only (new only)", null,
    `import { encodeTLV, field } from "${NEW}/tlv";
console.log(encodeTLV([field("01", "12")]));`],
  ["crc", "calculateCRC16 only (new only)", null,
    `import { calculateCRC16 } from "${NEW}/crc";
console.log(calculateCRC16("123456789"));`],
];

const require = createRequire(import.meta.url);
const esbuild = require(join(root, "node_modules", "esbuild"));
const esbuildVersion = esbuild.version;

async function measure(name, source) {
  const entry = join(consumer, `${name}.mjs`);
  writeFileSync(entry, source);
  const result = await esbuild.build({
    entryPoints: [entry], bundle: true, minify: true, format: "esm", platform: "neutral",
    target: "es2020", write: false, absWorkingDir: consumer, mainFields: ["module", "main"],
  });
  const code = result.outputFiles[0].text;
  const out = join(consumer, `${name}.bundle.mjs`);
  writeFileSync(out, code);
  return {
    min: Buffer.byteLength(code),
    gzip: gzipSync(code, { level: 9 }).length,
    brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    output: run("node", [out], consumer).trim(),
  };
}

const rows = [];
for (const [id, description, oldSource, newSource] of scenarios) {
  const oldResult = oldSource ? await measure(`${id}.old`, oldSource) : null;
  const newResult = await measure(`${id}.new`, newSource);
  rows.push({ id, description, oldResult, newResult });
}

// 5. Report.
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const delta = (a, b) => (a ? `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(0)}%` : "—");
const oldVersion = JSON.parse(readFileSync(join(oldSrc, "package.json"), "utf8")).version;
const newVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const pkgRow = (label, key) => `| ${label} | ${kb(oldPkg[key])} | ${kb(newPkg[key])} | ${delta(oldPkg[key], newPkg[key])} |`;
const lines = [
  "# Size comparison: `@pahm/pay-code-gen` vs `napas-format`",
  "",
  `Generated by \`pnpm size:compare\` on ${new Date().toISOString().slice(0, 10)}.`,
  "",
  `- **Old:** \`@pahm/pay-code-gen@${oldVersion}\`. It was never published publicly, so it is rebuilt from commit \`${baseline}\` with its own`,
  "  tsup config and packed from `dist/`, as its `publishConfig.directory` specified.",
  `- **New:** \`napas-format@${newVersion}\` from the working tree (\`pnpm build\` + \`pnpm pack\`).`,
  `- **Bundler:** esbuild ${esbuildVersion} (\`bundle\`, \`minify\`, ESM, target es2020). gzip level 9 and brotli quality 11 are`,
  "  computed on the minified output. Each bundle is executed with Node, and the printed payload is compared.",
  "",
  "## Package size (npm tarball)",
  "",
  "| | Old | New | Change |",
  "| --- | ---: | ---: | ---: |",
  pkgRow("Tarball (compressed)", "tarball"),
  pkgRow("Unpacked total", "unpacked"),
  pkgRow("ESM JavaScript", "jsEsm"),
  pkgRow("CJS JavaScript", "jsCjs"),
  pkgRow("Type declarations", "dts"),
  pkgRow("Source maps", "maps"),
  pkgRow("Other (package.json, README, LICENSE, docs)", "other"),
  `| Files | ${oldPkg.files} | ${newPkg.files} | |`,
  "",
  "The old build was minified and shipped without source maps. The new build is not minified (consumers' bundlers",
  "minify it), ships source maps, and has five entry points. Installed size does not affect what ends up in an",
  "application. The bundle sizes below do.",
  "",
  "## Bundle size in a consumer application",
  "",
  "| Scenario | Old min | New min | Old gzip | New gzip | Old brotli | New brotli | gzip change | Same payload |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
  ...rows.map(({ description, oldResult: o, newResult: n }) =>
    `| ${description} | ${o ? kb(o.min) : "—"} | ${kb(n.min)} | ${o ? kb(o.gzip) : "—"} | ${kb(n.gzip)} | ${o ? kb(o.brotli) : "—"} | ${kb(n.brotli)} | ${o ? delta(o.gzip, n.gzip) : "—"} | ${o ? (o.output === n.output ? "yes" : "**no**") : "n/a"} |`),
  "",
  "## Why the new bundles are larger, and what you get for it",
  "",
  "The old builder serialised whatever it was given and validated nothing. The new code paths that generate a",
  "payload include the VietQR rule table, the field validation, the cross-field checks (fee indicator, decimals vs",
  "currency, duplicates, required fields) and the error messages. These rules are what prevent the invalid",
  "payloads described in `docs/refactor-audit.md`. Code that is not used is tree-shaken: generating a payload does",
  "not include the parser, and the TLV and CRC subpaths include no VietQR code. The old package had no",
  "parser, validator, or standalone TLV/CRC exports, so those rows have no old value.",
  "",
];
const mismatches = rows.filter(({ oldResult: o, newResult: n }) => o && o.output !== n.output);
if (mismatches.length) {
  lines.push("## Payload differences", "");
  for (const { description, oldResult, newResult } of mismatches) {
    lines.push(`**${description}**`, "", "```text", `old: ${oldResult.output}`, `new: ${newResult.output}`, "```", "");
  }
  lines.push(
    "The old `removeAccents` leaves `đ`/`Đ` in place (they have no Unicode decomposition), so the old payload",
    "contains a non-ASCII character in an ANS field. The new version maps them to `d`/`D`. See `docs/migration.md`.",
    "",
  );
}
writeFileSync(join(root, "docs", "size-comparison.md"), lines.join("\n"));
console.log(lines.join("\n"));
rmSync(work, { recursive: true, force: true });
