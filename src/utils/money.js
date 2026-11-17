// Dollar amounts as the table shows them: whole dollars plain, cents (6:5 pays 2.2x) with two places. //
export const money = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const signed = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + money(n);
