# napas-format

Build, parse and validate **VietQR** payment payload strings for the NAPAS247 fast-transfer service,
with small composable functions.

`napas-format` produces and reads the *text* encoded inside a VietQR code
(`00020101021138570010A000000727…6304XXXX`). It does **not**:

- render QR images (pass the string to any QR library),
- call bank APIs, initiate or confirm payments, or track settlement.

A valid payload only means the string follows the format. Whether a transfer succeeds is decided by the
banks and NAPAS.

Formerly published as `@pahm/pay-code-gen`. See the [migration guide](docs/migration.md).

## Installation

```bash
pnpm add napas-format
# or
npm install napas-format
```

- Node.js ≥ 18, or any modern browser/bundler (uses `TextEncoder` and `String.prototype.normalize`).
- ESM and CommonJS builds with TypeScript declarations. No runtime dependencies.

## Quick start

```ts
import { generateVietQR } from "napas-format/vietqr";

const payload = generateVietQR({
  acquirerId: "970403", // beneficiary bank BIN
  consumerId: "0011012345678", // account number
  initiation: "dynamic",
  amount: 180000,
  purpose: "thanh toan don hang",
});
// "00020101021238570010A000000727…5802VN62230819thanh toan don hang6304…"
```

## Three levels of API

| Import | Use it for |
| --- | --- |
| `napas-format/vietqr` | `generateVietQR`, `encodeVietQR`, `parseVietQR`, `validateVietQR`, all field factories |
| `napas-format/vietqr/fields` | Only the field factories |
| `napas-format/tlv` | Generic EMVCo-style TLV: `field`, `template`, `encodeTLV`, `decodeTLV`, `findNode` |
| `napas-format/crc` | `crc16`, `calculateCRC16`, `appendCRC`, `verifyCRC` |
| `napas-format` | Everything above plus the deprecated `PayCodeGen` builder (default export) |

### Level C — high-level generation

`generateVietQR` covers the common NAPAS247 transfer: merchant account (ID 38), currency, country,
an optional amount and additional data. Defaults: `service: "account"`, `initiation: "static"`,
`currency: 704` (VND), `country: "VN"`. Anything else is passed as composed `fields`:

```ts
import { generateVietQR, merchantName, tipOrConvenienceFee } from "napas-format/vietqr";

const payload = generateVietQR({
  acquirerId: "970403",
  consumerId: "9704031101234567",
  service: "card",
  additionalData: { billNumber: "NPS6869" },
  fields: [merchantName("QUAN COM TAM"), tipOrConvenienceFee({ type: "tip" })],
});
```

### Level B — compose only the fields you need

Each factory validates its own value and returns an immutable TLV node (or an array of nodes).
`encodeVietQR` flattens the list, adds the Payload Format Indicator (`00`) if absent, validates the whole
payload, orders root fields by id, and appends the CRC (`63`).

```ts
import {
  additionalData,
  countryCode,
  encodeVietQR,
  merchantAccount,
  pointOfInitiation,
  PROMPT,
  removeAccents,
  tipOrConvenienceFee,
  transactionAmount,
  transactionCurrency,
} from "napas-format/vietqr";

const payload = encodeVietQR([
  pointOfInitiation("dynamic"),
  merchantAccount({ acquirerId: "970403", consumerId: "0011012345678", service: "account" }),
  transactionCurrency(704),
  transactionAmount("180000"),
  tipOrConvenienceFee({ type: "fixed", value: 5000 }),
  countryCode("VN"),
  additionalData({
    billNumber: PROMPT, // "***": the banking app asks the payer
    purposeOfTransaction: removeAccents("Thanh toán đơn hàng"),
  }),
]);
```

For a different merchant-account network (IDs 02–51 other than 38), use
`merchantAccountInformation(id, guid, fields)`.

### Level A — generic TLV

No VietQR rules are applied here: only the TLV syntax (ids `00`–`99`, values of 1–99 characters).

```ts
import { decodeTLV, encodeTLV, field, findNode, template } from "napas-format/tlv";

const encoded = encodeTLV([field("00", "01"), template("62", [field("08", "hello")])]);
// "00020162090805hello"

const nodes = decodeTLV(encoded, { isTemplate: (path) => path.join(".") === "62" });
findNode(nodes, "62", "08"); // { id: "08", value: "hello" }
```

`decodeTLV` keeps unknown and duplicate ids in order. `isTemplate` may return `"try"` to decode a value as a
template when possible and keep it raw otherwise.

### Parsing and validation

```ts
import { parseVietQR, validateVietQR, VietQRError } from "napas-format/vietqr";

const scanned =
  "00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang63042E2E";

const result = validateVietQR(scanned); // never throws
if (!result.valid) console.log(result.issues);

try {
  const qr = parseVietQR(scanned);
  qr.merchantAccount?.consumerId; // "0011012345678"
  qr.amount; // "180000" (raw string)
  qr.additionalData?.purposeOfTransaction; // "thanh toan don hang"
} catch (error) {
  if (error instanceof VietQRError) console.log(error.issues);
}
```

- `parseVietQR` checks syntax only: TLV structure, `00` first, `63` last, and the CRC (disable with
  `{ verifyCRC: false }`). It returns raw strings and all nodes, including unknown ones.
- `validateVietQR` also applies every field and cross-field rule and returns
  `{ valid, issues }`.

### CRC

```ts
import { appendCRC, calculateCRC16, verifyCRC } from "napas-format/crc";

calculateCRC16("123456789"); // "29B1" (CRC-16/CCITT-FALSE check value)
const withCrc = appendCRC("000201"); // "0002016304" + checksum
verifyCRC(withCrc); // true
```

The checksum is CRC-16/CCITT-FALSE (polynomial `0x1021`, initial `0xFFFF`) over the UTF-8 bytes of
everything before it, including the `6304` header. `verifyCRC` compares hex case-insensitively.

## Supported fields

| ID | Factory | Rule enforced |
| --- | --- | --- |
| 00 | `payloadFormatIndicator()` (added automatically) | `"01"` |
| 01 | `pointOfInitiation("static" \| "dynamic")` | `11` / `12` |
| 38 | `merchantAccount({ acquirerId, consumerId, service? })` | GUID `A000000727`; acquirer id exactly 6 chars; consumer id ≤ 19; service `QRIBFTTA`/`QRIBFTTC` |
| 02–51 | `merchantAccountInformation(id, guid, fields)` | GUID 1–32 chars |
| 52 | `merchantCategoryCode(code)` | 4 digits (numbers zero-padded) |
| 53 | `transactionCurrency(code = 704)` | 3 digits (numbers zero-padded) |
| 54 | `transactionAmount(value)` | ≤ 13 chars, digits + optional `.`, non-zero; decimals match the currency exponent (Table 6 currencies) |
| 55–57 | `tipOrConvenienceFee({ type: "tip" \| "fixed" \| "percentage" })` | `56` only with `55=02`; `57` only with `55=03`, 0.01–99.99 |
| 58 | `countryCode(code = "VN")` | two upper-case letters |
| 59 | `merchantName(name)` | ANS, ≤ 25 |
| 60 | `merchantCity(city)` | ANS, ≤ 15 |
| 61 | `postalCode(code)` | ANS, ≤ 10 |
| 62 | `additionalData({ … }, extra?)` | 01–08 ANS ≤ 25 or `***`; 09 combination of `A`/`M`/`E`; ≥ 1 sub-object; 50–99 must be GUID templates |
| 63 | added by `encodeVietQR` | 4 hex digits, last |

ANS fields accept printable ASCII only. Text is never transliterated or truncated silently: call
`removeAccents()` yourself (it also maps `đ`/`Đ` to `d`/`D`). Lengths count Unicode code points.
ID 64 (alternate language) and IDs 65–99 have no dedicated factory; build them with `field`/`template`.
They are still validated (64.00/64.01 mandatory, 80–99 need a GUID) and preserved by the parser.

## Errors

| Error | Thrown by | Contents |
| --- | --- | --- |
| `TLVError` | `field`, `template`, `encodeTLV`, `decodeTLV` | `code` (`INVALID_ID`, `EMPTY_VALUE`, `VALUE_TOO_LONG`, `INVALID_LENGTH`, `TRUNCATED`, `INVALID_NODE`), `path` |
| `VietQRError` | VietQR factories, `encodeVietQR`, `generateVietQR`, `parseVietQR` | `issues: { code, path, message }[]` |

`encodeVietQR` reports all issues at once, e.g. `DUPLICATE_FIELD` when the same id is supplied twice.
Conflicting values are never silently dropped.

## Tree-shaking

The package is `"sideEffects": false` and exposes independent subpaths. `scripts/verify-package.mjs` bundles
minimal consumers of the packed tarball with esbuild and Rollup and asserts that unused modules are removed
(for example, importing only `napas-format/tlv` pulls in no CRC, VietQR rules or legacy builder; importing
`generateVietQR` pulls in no parser). Importing named exports from the root `napas-format` entry shakes the
same way.

Size measurements against the old `@pahm/pay-code-gen` (tarball and esbuild bundles per use case) are in
[docs/size-comparison.md](docs/size-comparison.md). Regenerate them with `pnpm size:compare`.

## Development

```bash
pnpm install
pnpm test            # Vitest
pnpm typecheck       # tsc --noEmit (strict)
pnpm build           # tsdown → dist/ (ESM .js, CJS .cjs, .d.ts/.d.cts, source maps)
pnpm lint:package    # publint + @arethetypeswrong/cli
pnpm verify:package  # pack, install tarball, ESM/CJS/types smoke tests, tree-shaking, README examples
pnpm check           # all of the above
pnpm size:compare    # package and bundle size vs. the old @pahm/pay-code-gen (needs network on first run)
```

Building requires Node.js ≥ 20.19 (tsdown); the published package runs on Node.js ≥ 18.

## Known limitations

- Implements NAPAS *Quy định về định dạng mã VietQR* v1.0 (09/2021) for NAPAS247 transfers only. Bank BINs
  are not checked against any registry.
- Currency decimal places are checked only for the currencies listed in the spec (Table 6).
- The country code is checked for shape, not against ISO 3166-1. (The spec's Table 7 lists non-ISO codes such
  as `RC`, `RI` and `RP`.)
- Duplicate ids within one template are rejected by VietQR validation. The VietQR document does not state this
  explicitly; it is an implementation choice that follows EMVCo practice.
- Spec example §6.1.1 is printed with a malformed length (`0112` for a 13-character account). This library
  produces and accepts only the well-formed version. See `docs/refactor-audit.md`.

## License

MIT
