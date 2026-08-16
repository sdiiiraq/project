const IQD_FORMATTER = new Intl.NumberFormat("ar-IQ", {
  maximumFractionDigits: 0,
});

// يعرض المبلغ بصيغة عراقية مألوفة: "150,000 د.ع"
export function formatMoney(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `${IQD_FORMATTER.format(value)} د.ع`;
}
