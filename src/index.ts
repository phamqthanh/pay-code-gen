import { PayCodeGen } from "./legacy/pay-code-gen";

export * from "./core/tlv/index";
export * from "./core/crc/index";
export * from "./vietqr/index";
export * from "./legacy/constants";
export { PayCodeGen, type CurrencySupport } from "./legacy/pay-code-gen";

/** @deprecated Use `generateVietQR()` or `encodeVietQR()`. */
export default PayCodeGen;
