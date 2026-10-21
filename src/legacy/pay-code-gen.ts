import { field } from "../core/tlv/field";
import type { TLVNode } from "../core/tlv/types";
import { assembleVietQR } from "../vietqr/encode";
import {
  countryCode,
  merchantCategoryCode,
  merchantCity,
  merchantName,
  postalCode,
  tipOrConvenienceFee,
  transactionAmount,
  transactionCurrency,
} from "../vietqr/fields";
import { NAPAS_GUID } from "../vietqr/rules";
import { removeAccents } from "../vietqr/text";

export type BuildContentMap = Map<number, string | number | BuildContentMap>;

/** ISO 4217 numeric currency code. */
export type CurrencySupport = number;

const byId = <T>([a]: [number, T], [b]: [number, T]) => a - b;

/** Converts the builder state to TLV nodes: ascending ids, empty values and templates skipped. */
function toNodes(map: BuildContentMap): TLVNode[] {
  const nodes: TLVNode[] = [];
  for (const [id, value] of [...map].sort(byId)) {
    if (value instanceof Map) {
      const fields = toNodes(value);
      if (fields.length) nodes.push({ id: String(id).padStart(2, "0"), fields });
    } else if (String(value) !== "") {
      nodes.push(field(id, String(value)));
    }
  }
  return nodes;
}

/**
 * Fluent VietQR builder kept for compatibility with `@pahm/pay-code-gen`.
 * Every method validates through the functional field factories and `toString()`
 * encodes through the same pipeline as `encodeVietQR`.
 *
 * @deprecated Use `generateVietQR()` or compose field factories with `encodeVietQR()`.
 * See docs/migration.md. Will be removed in the next major version.
 */
export class PayCodeGen {
  /** GUID written to 38.00 by `acquirer()`, `cosumer()` and `cosumerType()`. */
  public guid = NAPAS_GUID;
  /** Mutable builder state, keyed by numeric id. */
  public payload: BuildContentMap = new Map();

  constructor() {
    this.set(0, "01").static().currency().country();
  }

  /**
   * Payload with CRC. Unlike `encodeVietQR`, does not require Merchant Account Information.
   * @throws {VietQRError} when a field or cross-field rule is violated.
   */
  toString(): string {
    this.validate();
    return assembleVietQR(toNodes(this.payload), false);
  }

  /** Point of initiation `11`: reusable code. */
  static(): this {
    return this.set(1, "11");
  }

  /** Point of initiation `12`: single-use code. */
  dynamic(): this {
    return this.set(1, "12");
  }

  /** 38.01.00: beneficiary bank BIN. */
  acquirer(id: string): this {
    return this.set([38, 0], this.guid).set([38, 1, 0], id);
  }

  /** 38.01.01: account or card number. (Spelling kept for compatibility.) */
  cosumer(data: string): this {
    return this.set([38, 0], this.guid).set([38, 1, 1], data);
  }

  /** 38.02: `"A"` → `QRIBFTTA` (account), `"C"` → `QRIBFTTC` (card). */
  cosumerType(type: "C" | "A" = "A"): this {
    return this.set([38, 0], this.guid).set([38, 2], "QRIBFTT" + type);
  }

  /** 52: merchant category code. */
  category(catId: number | string): this {
    return this.set(52, merchantCategoryCode(catId).value);
  }

  /** 53: ISO 4217 numeric code; numbers are zero-padded to 3 digits. */
  currency(currency: CurrencySupport | string = 704): this {
    return this.set(53, transactionCurrency(currency).value);
  }

  /** 54: transaction amount. */
  amount(value: number | string): this {
    return this.set(54, transactionAmount(value).value);
  }

  /** 55 = `01`: payer enters a tip. Removes 56/57. */
  tip(): this {
    tipOrConvenienceFee({ type: "tip" });
    return this.set(55, "01").remove(56, 57);
  }

  /** 55 = `02`, 56 = value: fixed convenience fee. Removes 57. */
  fixedFee(value: number | string): this {
    const [, fee] = tipOrConvenienceFee({ type: "fixed", value });
    return this.set(55, "02").set(56, fee!.value).remove(57);
  }

  /** 55 = `03`, 57 = value: percentage convenience fee (0.01–99.99). Removes 56. */
  percentFee(value: number | string): this {
    const [, fee] = tipOrConvenienceFee({ type: "percentage", value });
    return this.set(55, "03").set(57, fee!.value).remove(56);
  }

  /** 58: ISO 3166-1 alpha-2 country code. */
  country(countryCode_: string = "VN"): this {
    return this.set(58, countryCode(countryCode_).value);
  }

  /** 59: merchant name (ANS, ≤ 25). */
  bankName(name: string): this {
    return this.set(59, name === "" ? name : merchantName(name).value);
  }

  /** 60: merchant city (ANS, ≤ 15). */
  city(name: string): this {
    return this.set(60, name === "" ? name : merchantCity(name).value);
  }

  /** 61: postal code (ANS, ≤ 10). */
  portal(code: string): this {
    return this.set(61, code === "" ? code : postalCode(code).value);
  }

  /** 62.`id`: Additional Data sub-object. Vietnamese diacritics are removed; empty values are skipped. */
  additional(id: number, content: string): this {
    return this.set([62, id], removeAccents(content));
  }

  /** 62.08: purpose of transaction. Diacritics are removed; an empty value is skipped. */
  content(content: string): this {
    return this.set([62, 8], removeAccents(content));
  }

  /** Hook run by `toString()` before encoding; subclasses may throw to reject the state. */
  protected validate(): void {}

  /** Payload without CRC. */
  protected value(): string {
    return this.toString().slice(0, -8);
  }

  protected set(keys: number | number[], value: string | number): this {
    const path = Array.isArray(keys) ? keys : [keys];
    let current = this.payload;
    for (const key of path.slice(0, -1)) {
      let next = current.get(key);
      if (!(next instanceof Map)) current.set(key, (next = new Map()));
      current = next;
    }
    current.set(path[path.length - 1]!, value);
    return this;
  }

  protected remove(...ids: number[]): this {
    for (const id of ids) this.payload.delete(id);
    return this;
  }
}
