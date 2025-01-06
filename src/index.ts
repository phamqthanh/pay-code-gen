import { crc16_ccitt } from "./helpers/crc16-ccitt";
import { removeAccents } from "./helpers/remove-accents";
import { PayCodeContent } from "./pay-code-content";
export * from "./constants/additional";

export default class PayCodeGen extends PayCodeContent {
  public guid = "A000000727";
  constructor() {
    super();
    // Initialize the QR content with some fixed values
    this.set(0, "01") // Version, fixed value
      .static() // Call method for multiple options
      .currency() // Call method for currency
      .country(); // Call method for country
  }
  toString() {
    const input = this.value() + "6304";
    const data = new TextEncoder().encode(input); // fixed id and length
    return input + crc16_ccitt(data).toString(16).toUpperCase();
  }
  /** Code using multiple time, as type static */
  static() {
    return this.set(1, "11");
  }
  /** Code using once time, as type dynamic */
  dynamic() {
    return this.set(1, "12");
  }
  acquirer(id: string) {
    this.set([38, 0], this.guid);
    this.set([38, 1, 0], id);
    return this;
  }
  cosumer(data: string) {
    this.set([38, 0], this.guid);
    this.set([38, 1, 1], data);
    return this;
  }
  cosumerType(type: "C" | "A" = "A") {
    this.set([38, 0], this.guid);
    this.set([38, 2], "QRIBFTT" + type);
    return this;
  }

  category(catId: number | string) {
    return this.set(52, catId.toString());
  }
  /**
   * @param currency follow rule ISO 4217
   */
  currency(currency: CurrencySupport = 704) {
    return this.set(53, currency.toString());
  }
  amount(value: number | string) {
    return this.set(54, value.toString());
  }
  tip() {
    return this.set(55, "01").remove(56, 57);
  }
  fixedFee(value: number) {
    return this.set(56, value.toString()).remove(54, 57);
  }
  percentFee(value: number) {
    return this.set(57, value.toString()).remove(54, 56);
  }
  country(countryCode: string = "VN") {
    return this.set(58, countryCode);
  }
  bankName(name: string) {
    return this.set(59, name);
  }
  city(name: string) {
    return this.set(60, name);
  }
  portal(code: string) {
    return this.set(61, code);
  }
  //2.14
  additional(id: number, content: string) {
    return this.set([62, id], removeAccents(content));
  }
  content(content: string) {
    return this.set([62, 8], removeAccents(content));
  }
  protected validate() {}
}
export type CurrencySupport = number;
