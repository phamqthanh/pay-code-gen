/**
 * Invoice/receipt number issued by Merchant or automatically entered by the Customer Application
 */
export const BILL_NUMBER = 1;
/**
 * The mobile phone number can be provided by the merchant or entered by the customer.
 */
export const MOBILE_NUMBER = 2;
/**
 * A special value associated with a store.
 * This value can be provided by the merchant or entered by the customer.
 */
export const STORE_LABEL = 3;
/**
 * Usually the loyalty card number.
 * This number may be provided by the merchant or the customer may have to enter their Loyalty Card Number.
 */
export const LOYALTY_NUMBER = 4;
export const REFERENCE_LABEL = 5;
/**
 * Can be customer code, customer phone number, invoice number
 */
export const CUSTOMER_LABEL = 6;
/**
 * A unique code associated with the store's terminal.
 */
export const TERMINAL_LABEL = 7;
/**
 * Value to determine the purpose of the transaction, eg: phone top-up, purchase of goods...
 */
export const PURPOSE_OF_TRANSACTION = 8;
/**
 * One or more of the following characters may appear, indicating the corresponding data that needs to be provided during transaction initiation:
 * • "A" = Customer address
 * • "M" = Customer phone number
 * • "E" = Customer email address
 */
export const ADDITIONAL_CONSUMER_DATA_REQUEST = 9;

// RFU_for_EMVCo = [10,49]
// Payment System specific templates [50,99]
