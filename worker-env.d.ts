declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PLAID_CLIENT_ID?: string;
    PLAID_SECRET?: string;
    PLAID_ENV?: string;
    PLAID_REDIRECT_URI?: string;
    BANK_TOKEN_ENCRYPTION_KEY?: string;
    /** Comma-separated emails allowed to claim an unclaimed Homebase. */
    HOMEBASE_OWNER_EMAILS?: string;
  }
}
