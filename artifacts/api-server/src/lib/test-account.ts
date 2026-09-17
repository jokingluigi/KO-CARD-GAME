export const TEST_USER_EMAIL = "ko-test-user@localhost.test";
export const TEST_ADMIN_EMAIL = "ko-test-admin@localhost.test";
// Currency balances and ledger snapshots use PostgreSQL's 32-bit integer type.
// This remains effectively unlimited for development tests without overflowing
// the persisted ledger when a TEST USER purchases a shop listing.
export const TEST_ACCOUNT_UNLIMITED_BALANCE = 2_000_000_000;
export const TEST_ACCOUNT_UNLIMITED_QUANTITY = 1_000_000_000;
const TEST_ACCOUNT_EMAILS = new Set([TEST_USER_EMAIL, TEST_ADMIN_EMAIL]);

export type TestAccountIdentity = {
  email: string;
};

export function isTestAccountUser(user: TestAccountIdentity | null | undefined): boolean {
  return Boolean(
    user &&
    process.env["NODE_ENV"] !== "production" &&
    process.env["ENABLE_TEST_AUTH"] === "true" &&
    TEST_ACCOUNT_EMAILS.has(user.email.trim().toLowerCase()),
  );
}

export function isEligibleTestCard(card: {
  status: string;
  isToken: boolean;
  isChampionToken: boolean;
}): boolean {
  return card.status === "PUBLISHED" && !card.isToken && !card.isChampionToken;
}