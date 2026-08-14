export type ReportType = "collection" | "outstanding" | "expense" | "fuel" | "maintenance" | "profit" | "collector" | "customer";

export const REPORT_LABELS: Record<ReportType, string> = {
  collection: "التحصيل",
  outstanding: "الديون غير المحصلة",
  expense: "المصاريف",
  fuel: "الوقود",
  maintenance: "الصيانة",
  profit: "الأرباح",
  collector: "الجباة",
  customer: "المشتركين",
};

export type ReportRow = Record<string, string | number>;
