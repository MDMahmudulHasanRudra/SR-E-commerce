export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function downloadCsvRows(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export const PRODUCT_CSV_HEADERS = [
  "SKU",
  "Name",
  "Category",
  "Brand",
  "SellingPrice",
  "CostPrice",
  "Stock",
  "Status",
  "Description",
];

export const PRODUCT_CSV_SAMPLE_ROWS = [
  ["LAMP-AUR-01", "Aurora Desk Lamp", "Lighting", "Northwind", "59.00", "24.50", "25", "Active", "Warm dimmable desk lamp"],
  ["CHAIR-ERG-02", "Ergonomic Studio Chair", "Furniture", "Northwind", "249.00", "130.00", "12", "Draft", "Breathable mesh task chair"],
];
