/**
 * Paid plans are built but not launched. While this is false, every family has every feature
 * (no hero or adult limits, weekly summaries save freely), Settings shows "coming soon" instead
 * of the upgrade buttons, and the checkout, portal and webhook endpoints are closed.
 *
 * To launch: finish docs/setup/stripe.md, then flip this to true.
 */
export const BILLING_ENABLED = false;
