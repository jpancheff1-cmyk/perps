/**
 * How often the server reads the Kraken Futures account.
 * accounts + openpositions + openorders cost 6. The private /derivatives budget is 500 per 10 seconds.
 */
export const ACCOUNT_POLL_MS = 10_000;

/** Public liquidation prints. Not tied to the account poll. */
export const LIQUIDATION_POLL_MS = 30_000;

/** How often the browser asks this server for the desk. */
export const CLIENT_POLL_MS = 5_000;
