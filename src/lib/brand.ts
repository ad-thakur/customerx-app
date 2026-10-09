/**
 * The product's name and contact details, in one place. Page copy, the legal
 * notice and the brand dashboard read from here, so a rename is one edit.
 * See docs/REBRAND.md for what else changes on a rename (domain, email
 * senders, payment merchant name).
 */

/** As users read it, everywhere. */
export const BRAND_NAME = 'All Square'

/**
 * The domain the site's addresses live on. Still the old domain until the new
 * one is bought and its mail (MX) and sending (Resend SPF/DKIM) are set up —
 * switching early would publish addresses that bounce.
 */
export const BRAND_DOMAIN = 'consumerx.co.in'

/** Grievance officer address shown in the footer (Consumer Protection (E-Commerce) Rules). */
export const GRIEVANCE_EMAIL = `grievance@${BRAND_DOMAIN}`
