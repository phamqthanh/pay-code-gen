# Refactor audit — `@pahm/pay-code-gen` → `napas-format`

Audit date: 2026-10-21. Baseline commit: `1d16c56` (branch `main`).
Specification: *Tài liệu quy định về định dạng mã VietQR trong dịch vụ chuyển nhanh NAPAS247*, v1.0, 09/2021
(`QR_Format_T&C_v1.0_VN_092021.pdf`, downloaded from vietqr.net, 35 pages). Section numbers below refer to it.

## 1. Current architecture

| File | Role |
| --- | --- |
| `src/pay-code-content.ts` | `PayCodeContent` base class. Holds a mutable `payload: Map<number, string \| number \| Map>`; `set(keys, value)` writes nested paths, `remove(...ids)` deletes root ids, `build()` serialises recursively (ids sorted ascending, empty values skipped, `id + pad2(length) + value`). |
| `src/index.ts` | `PayCodeGen extends PayCodeContent` (default export). Builder methods map directly to TLV paths; `toString()` appends `6304` and the CRC. Re-exports `constants/additional`. |
| `src/helpers/crc16-ccitt.ts` | Bitwise CRC-16 (poly `0x1021`, init `0xFFFF`), returns a number. |
| `src/helpers/format.ts` | `padStart(2, "0")`. |
| `src/helpers/remove-accents.ts` | NFD + strip combining marks U+0300–U+036F. |
| `src/constants/additional.ts` | Numeric ids for Additional Data (ID 62) sub-objects 01–09. |

There is no separation between TLV encoding and VietQR rules: the builder writes raw paths and the
serializer knows nothing about the specification. There is no parser and no validation (`validate()` is
an empty hook).

## 2. Existing public API (package `@pahm/pay-code-gen@0.0.1`)

Default export `class PayCodeGen`, plus the named constants `BILL_NUMBER`, `MOBILE_NUMBER`, `STORE_LABEL`,
`LOYALTY_NUMBER`, `REFERENCE_LABEL`, `CUSTOMER_LABEL`, `TERMINAL_LABEL`, `PURPOSE_OF_TRANSACTION`,
`ADDITIONAL_CONSUMER_DATA_REQUEST`, and `type CurrencySupport = number`.

| Member | Behaviour (verified from source) |
| --- | --- |
| `constructor()` | Sets `00=01`, `01=11` (static), `53=704`, `58=VN`. |
| `guid` (public field) | `"A000000727"`; read whenever a 38 method runs. |
| `payload` (public field) | The internal mutable `Map`. |
| `static()` / `dynamic()` | `01=11` / `01=12`. |
| `acquirer(id)` | `38.00=guid`, `38.01.00=id`. |
| `cosumer(data)` (sic) | `38.00=guid`, `38.01.01=data`. |
| `cosumerType("A"\|"C" = "A")` (sic) | `38.00=guid`, `38.02="QRIBFTT"+type`. |
| `category(id)` | `52=String(id)`. |
| `currency(code = 704)` | `53=String(code)`. |
| `amount(value)` | `54=String(value)`. |
| `tip()` | `55=01`, deletes 56/57. **Returns `undefined`** (see B2). |
| `fixedFee(value)` | `56=value`, deletes **54** and 57. Does not set 55. Returns `undefined`. |
| `percentFee(value)` | `57=value`, deletes **54** and 56. Does not set 55. Returns `undefined`. |
| `country(code = "VN")` | `58=code`. |
| `bankName(name)` / `city(name)` / `portal(code)` | `59` / `60` / `61` (merchant name, city, postal code). |
| `additional(id, content)` | `62.<id>=removeAccents(content)`. |
| `content(content)` | `62.08=removeAccents(content)` (purpose of transaction). |
| `toString()` | Serialised payload + `6304` + CRC. |

The README documents a `consumer(data)` method that does not exist (only `cosumer`).

## 3. Baseline results (before any change)

Environment: Node v24.2.0, pnpm 10.15.0 / npm 11 (no lockfile in the repository).

| Check | Result |
| --- | --- |
| `vitest --watch=false` | 6/6 tests passed (`src/index.test.ts`). |
| `tsc --noEmit` | **Failed**: 3 errors, all in `tsup.config.ts` (`fs`, `path`, `__dirname` — `@types/node` is not installed). `src/` itself type-checks. |
| `tsup` build | Succeeded: `dist/index.{js,mjs,d.ts,d.mts}` + generated `dist/package.json`. |
| Lint / format | Not configured. |
| Coverage | Script present, not run as part of baseline. |
| `.gitignore` | Missing (`node_modules/`, `dist/` would be committed). |

Existing tests cover: the four NAPAS examples (§6.1.1–6.1.4, with the 6.1.1 caveat below), MCC output, and
skipping an empty `content("")`. Not covered: fees, tip, `bankName`/`city`/`portal`, length overflow,
non-ASCII, CRC padding, any parsing.

## 4. Specification findings

CRC values below were cross-checked with Python's `binascii.crc_hqx(data, 0xFFFF)` (an independent
CRC-16/CCITT-FALSE implementation). Check value for `"123456789"` is `29B1`, which matches the catalogue
value for CRC-16/CCITT-FALSE, confirming §5.2.15 parameters (poly `1021`, init `FFFF`, no reflection, no xorout).

| # | Spec rule | Current behaviour | Classification |
| --- | --- | --- | --- |
| S1 | §5.1: ids `00`–`99`, length `01`–`99`, value 1–99 characters. | Lengths ≥ 100 are emitted as 3 digits (silently corrupt). | **Bug** → throw. |
| S2 | §5.2.15: CRC is 4 characters (`63` length `04`). | `toString(16)` without padding; CRC `< 0x1000` yields 3 characters (e.g. amount `3` → CRC `0155` emitted as `155`). | **Bug** → pad to 4. |
| S3 | §5.2.7–5.2.9: `55` ∈ {01,02,03}; `56` present iff `55=02`; `57` present iff `55=03`; `57` in `00.01`–`99.99`. | `fixedFee`/`percentFee` write 56/57 without 55 and delete the transaction amount (54); nothing in the spec ties fees to absence of amount. | **Bug** → set 55, keep 54. |
| S4 | §5.2.6/5.2.8: amount/fixed fee: non-zero, digits plus optional single `.`, ≤ 13 chars, decimals match ISO 4217 exponent, no other characters. | No validation (`amount(-1)`, `amount(1e21)`, `"50 000"` all emitted). | Missing validation. |
| S5 | §5.1 / §5.2.11–5.2.14: `59`/`60`/`61`/`62.xx` are ANS (EMV common character set). | `bankName`/`city`/`portal` emit any Unicode. `removeAccents` leaves `đ`/`Đ` untouched (they have no NFD decomposition), so `content("đơn")` emits non-ASCII. | **Bug** (đ) / missing validation. |
| S6 | §5.2.14 / Table 8: 62 sub-objects 01–08 ≤ 25 chars, 09 ≤ 3 chars of `A`,`M`,`E` each once, 62 total ≤ 99, ≥ 1 sub-object; `***` = prompt consumer. | No limits. | Missing validation. |
| S7 | Table 4: 38.00 GUID ≤ 32; 38.01.00 acquirer/BNB id length 6; 38.01.01 consumer id ≤ 19; 38.02 service code ≤ 10 (`QRIBFTTA`/`QRIBFTTC`). | No limits. | Missing validation. |
| S8 | §5.2.4/5.2.5/5.2.10: MCC N4, currency N3 (ISO 4217), country 2 chars (ISO 3166-1 alpha-2). | `currency(36)` emits `36` (should be `036`). | Missing validation / normalisation. |
| S9 | §5.1: `00` first, `63` last, all others in any order. | Sorted ascending, which satisfies the rule. | OK — keep ascending order (matches spec examples, deterministic). |
| S10 | §5.1: lengths count **characters**; §5.1 value formats are encoded "per Unicode". | `String.length` (UTF-16 code units). CRC uses UTF-8 bytes. | Implementation choice: count Unicode code points; CRC over UTF-8. |
| S11 | Spec example §6.1.1: printed string has `0112` + 13-char account, CRC `F4E5`. Table on the same page says `0113`. | Test uses the well-formed `0113` payload (CRC `9E6F`, independently verified). | **Spec erratum**. Fixture uses the well-formed payload. |
| S12 | Spec example §6.1.4 headline string is the static-card payload with CRC `A203`; the step table below gives the dynamic payload, which is what `A203` belongs to. | Test uses the dynamic payload. | Spec erratum, documented. |
| S13 | Table 7 lists `RC`, `RI`, `RP` for China/Indonesia/Philippines — these are not ISO 3166-1 codes (`CN`, `ID`, `PH`). | n/a | Country validated as `[A-Z]{2}` only; not restricted to Table 7. |
| S14 | Duplicate ids within one template: not explicitly addressed by the VietQR document. | Builder overwrites (Map). | Implementation choice: generic TLV keeps duplicates; VietQR validation rejects them. |
| S15 | Table 1: 38 (M), 53 (M), 58 (M). | Category-only payload without 38 is produced (tested). | Legacy keeps that permissive behaviour; the new strict entry points require 38. |

Spec items intentionally not given dedicated helpers (still parsed, validated and composable through generic TLV
nodes): ID 64 merchant-information language template, IDs 65–99, Additional Data 10–99.

## 5. Compatibility risks

1. **Package rename** (`@pahm/pay-code-gen` → `napas-format`): every import path changes. Consumers of the old
   name are unaffected until they migrate; the new name is a fresh package.
2. **Errors instead of corrupt output** (S1, S4–S8): inputs that previously produced invalid QR strings now throw.
3. **Fee fix** (S3): `fixedFee`/`percentFee` now emit `55` and keep `54`; output differs for anyone using them.
   They now return `this` (previously `undefined`, which made chaining throw).
4. **CRC padding** (S2): output differs only where the old output was invalid.
5. **`đ` → `d`** in `additional`/`content` (S5).
6. `publishConfig.directory` publishing replaced by standard root publishing with `files: ["dist"]`.

## 6. Proposed architecture

```
src/
├── core/
│   ├── errors.ts          TLVError (code + path)
│   ├── tlv/               types, field(), template(), encodeTLV(), decodeTLV(), length helpers
│   └── crc/               crc16(), calculateCRC16(), verifyCRC()
├── vietqr/
│   ├── rules.ts           single source of field rules (format, length, presence) + value checks
│   ├── fields.ts          field factories (pure, return TLV nodes)
│   ├── encode.ts          encodeVietQR(): flatten → order → validate → append CRC
│   ├── generate.ts        generateVietQR(): focused transfer use case
│   ├── parse.ts           parseVietQR(): syntax + CRC → structured result
│   ├── validate.ts        validateVietQR(): semantic validation → issues
│   ├── text.ts            removeAccents()/toAscii helpers
│   └── errors.ts          VietQRError (issues[])
└── legacy/pay-code-gen.ts PayCodeGen adapter delegating to the above
```

Entry points: `napas-format` (everything + default `PayCodeGen`), `napas-format/tlv`, `napas-format/crc`,
`napas-format/vietqr`, `napas-format/vietqr/fields`. Build with `tsdown` to ESM + CJS + declarations.

## 7. Prioritised tasks

1. Core TLV + CRC with tests against independent vectors.
2. VietQR rules table, field factories, encoder (fixes S1–S8).
3. Parser + validator sharing the rules table.
4. Legacy adapter; old-vs-new equivalence tests.
5. tsdown + exports; `.gitignore`; `@types/node`.
6. Package verification: pack, install tarball, ESM/CJS/types, tree-shaking with esbuild and Rollup.
7. README + migration guide.

## 8. Outcome (after refactor)

Implemented as proposed, with two simplifications: VietQR field factories live in one file
(`src/vietqr/fields.ts`) and payload-level checks in `src/vietqr/validate-nodes.ts`, shared by `encodeVietQR`,
`validateVietQR` and the legacy builder. All findings S1–S8 are fixed and covered by regression tests.
S11/S12 are recorded in `src/vietqr/__fixtures__/payloads.ts`.

| Check | Result |
| --- | --- |
| `pnpm typecheck` (strict + `noUncheckedIndexedAccess`) | pass |
| `pnpm test` | 108 tests, 6 files, all pass (the original 6 builder tests unchanged) |
| `pnpm coverage` | ~96% statements / ~92% branches |
| `pnpm build` (tsdown 0.21) | ESM + CJS + `.d.ts`/`.d.cts` + source maps for 5 entry points |
| `pnpm lint:package` | publint: no issues; attw: no problems (node10, node16 CJS/ESM, bundler) |
| `pnpm verify:package` | tarball contents, ESM/CJS smoke tests, type resolution, README examples, tree-shaking (esbuild + Rollup): all pass |
