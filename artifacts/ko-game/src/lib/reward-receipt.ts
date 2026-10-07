// A lost HTTP response is not proof that an idempotent credit grant failed.
export async function submitWithReceipt<T>(submit: () => Promise<T>, receipt: () => Promise<T | null>): Promise<T> {
  try { return await submit(); } catch (error) {
    try { const confirmed = await receipt(); if (confirmed !== null) return confirmed; } catch { /* Preserve the original submission error. */ }
    throw error;
  }
}
