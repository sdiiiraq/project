export type ReportType = "collection" | "outstanding" | "expense" | "fuel" | "maintenance" | "profit" | "customer";

export const REPORT_LABELS: Record<ReportType, string> = {
  collection: "التحصيل",
  outstanding: "الديون غير المحصلة",
  expense: "المصاريف",
  fuel: "الوقود",
  maintenance: "الصيانة",
  profit: "الأرباح",
  customer: "المشتركين",
};

export type ReportRow = Record<string, string | number>;
