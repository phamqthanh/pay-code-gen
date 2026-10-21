# Migrating from `@pahm/pay-code-gen` to `napas-format`

`napas-format@0.1.0` is the renamed and refactored `@pahm/pay-code-gen@0.0.1`. The `PayCodeGen` builder is
still shipped and now delegates to the functional core, so most code keeps working after changing the import.
`PayCodeGen` is deprecated and will be removed in the next major version.

## 1. Change the package

```bash
pnpm remove @pahm/pay-code-gen
pnpm add napas-format
```

```ts
// before: import PayCodeGen, { BILL_NUMBER } from "@pahm/pay-code-gen";
import PayCodeGen, { BILL_NUMBER } from "napas-format";

const code = new PayCodeGen()
  .acquirer("970403")
  .cosumer("0011012345678")
  .cosumerType("A")
  .additional(BILL_NUMBER, "NPS6869")
  .toString();
```

## 2. Behaviour changes in `PayCodeGen`

Every change below fixes output that was invalid under the VietQR specification. Code that produced valid
payloads before produces byte-identical payloads now. The four NAPAS examples and the category example from
the old test suite are unchanged.

| Before | Now | Why |
| --- | --- | --- |
| CRC printed without zero padding (e.g. `155`) | Always 4 hex digits (`0155`) | §5.2.15: CRC length is `04` |
| `fixedFee(v)` wrote `56` only and **deleted the amount (54)** | Writes `55=02` and `56=v`, removes `57`, keeps `54` | §5.2.7–5.2.8: `56` requires `55=02`; nothing excludes an amount |
| `percentFee(v)` wrote `57` only and deleted `54` | Writes `55=03` and `57=v`, removes `56`, keeps `54` | §5.2.9 |
| `tip()`, `fixedFee()`, `percentFee()` returned `undefined` (chaining threw a `TypeError`) | Return `this` | Bug |
| Values over 99 characters produced a 3-digit length | Throws `VietQRError`/`TLVError` | §5.1 |
| No field validation | Field rules from the spec are enforced (see the README table); invalid input throws `VietQRError` | §5.2 |
| `content()`/`additional()` left `đ`/`Đ` untouched | Mapped to `d`/`D` | ANS character set |
| `bankName()`/`city()`/`portal()` accepted any text | ANS only: call `removeAccents()` first | §5.2.11–5.2.13 |
| `currency(36)` emitted `36` | Emits `036` | ISO 4217 numeric codes are 3 digits |
| `additional(50…99, text)` emitted a plain value | Rejected: IDs 62.50–99 must be templates with a GUID | §5.2.14 |
| Protected `build()` from `PayCodeContent` | Removed. `PayCodeContent` is gone; `set`, `remove`, `value` and `validate` remain as protected members | Internal |

Unchanged: the method names (including the `cosumer`/`cosumerType` spelling), the defaults set by the
constructor (`00=01`, `01=11`, `53=704`, `58=VN`), the public `guid` and `payload` fields, ascending id order,
skipping empty values, and the ability to build a payload without merchant account information.

## 3. Moving to the functional API

| `PayCodeGen` | Functional equivalent |
| --- | --- |
| `new PayCodeGen()` | `encodeVietQR([...])` or `generateVietQR({...})` |
| `.static()` / `.dynamic()` | `pointOfInitiation("static" \| "dynamic")` / `initiation:` |
| `.acquirer(bin).cosumer(id).cosumerType("A" \| "C")` | `merchantAccount({ acquirerId, consumerId, service: "account" \| "card" })` |
| `.category(mcc)` | `merchantCategoryCode(mcc)` |
| `.currency(code)` | `transactionCurrency(code)` / `currency:` |
| `.amount(v)` | `transactionAmount(v)` / `amount:` |
| `.tip()` | `tipOrConvenienceFee({ type: "tip" })` |
| `.fixedFee(v)` | `tipOrConvenienceFee({ type: "fixed", value: v })` |
| `.percentFee(v)` | `tipOrConvenienceFee({ type: "percentage", value: v })` |
| `.country(cc)` | `countryCode(cc)` / `country:` |
| `.bankName(n)` / `.city(c)` / `.portal(p)` | `merchantName(n)` / `merchantCity(c)` / `postalCode(p)` |
| `.additional(BILL_NUMBER, v)` | `additionalData({ billNumber: v })` |
| `.content(text)` | `additionalData({ purposeOfTransaction: removeAccents(text) })` / `purpose:` |
| `.toString()` | the return value of `encodeVietQR`/`generateVietQR` |

```ts
import { additionalData, encodeVietQR, generateVietQR, removeAccents } from "napas-format/vietqr";
import {
  countryCode,
  merchantAccount,
  pointOfInitiation,
  transactionAmount,
  transactionCurrency,
} from "napas-format/vietqr/fields";

// High level
const a = generateVietQR({
  acquirerId: "970403",
  consumerId: "9704031101234567",
  service: "card",
  initiation: "dynamic",
  amount: 180000,
  purpose: removeAccents("thanh toán đơn hàng"),
  additionalData: { billNumber: "NPS6869" },
});

// Composed
const b = encodeVietQR([
  pointOfInitiation("dynamic"),
  merchantAccount({ acquirerId: "970403", consumerId: "9704031101234567", service: "card" }),
  transactionCurrency(704),
  transactionAmount(180000),
  countryCode("VN"),
  additionalData({ billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" }),
]);
// a === b
```

Differences to keep in mind when moving off the builder:

- The functional API **does not transliterate** text. Call `removeAccents()` explicitly.
- `encodeVietQR` and `generateVietQR` require merchant account information (ID 38), as the spec does.
- Supplying the same id twice is an error (`DUPLICATE_FIELD`), not "last write wins".
- An empty string is an error; leave the property `undefined` to omit a field.
- `generateVietQR` adds the service code (`QRIBFTTA`) by default. The builder only adds it when
  `cosumerType()` is called.

## 4. Packaging

- ESM (`dist/*.js`) and CommonJS (`dist/*.cjs`) with declarations for both.
  `require("napas-format").default` is still the builder.
- The package now publishes from the repository root with `files: ["dist", …]` instead of
  `publishConfig.directory`.
- Versioning: `0.1.0`. While the package is `0.x`, minor versions may contain breaking changes. Removing
  `PayCodeGen` will be called out in the changelog.
