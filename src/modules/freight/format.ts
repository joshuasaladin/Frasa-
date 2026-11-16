/** Formats a decimal string ("12345.5000") with thousands separators, without float maths. */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const negative = value.startsWith("-");
  const [whole, frac] = (negative ? value.slice(1) : value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

export function formatMoney(currency: string, value: string | null | undefined): string {
  return value === null || value === undefined ? "—" : `${currency} ${formatAmount(value)}`;
}
