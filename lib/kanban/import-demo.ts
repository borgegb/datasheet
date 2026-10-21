import type { ImportReference, ImportRow } from "./import-model";

// Synthetic fixtures only. Customer data stays out of the bundle.
export function demoRows(): ImportRow[] {
  const names = [
    "Brass reducing bush, 1/2 inch",
    "Quick-release coupling",
    "Pressure regulator assembly",
    "Stainless steel hose clip",
    "Replacement filter element",
    "Rubber sealing ring",
    "Air hose connector",
    "Mini blasting nozzle",
  ];
  return Array.from({ length: 600 }, (_, i) => ({
    id: `demo-${i}`,
    sourceRow: i + 2,
    part_no: `DEMO-${String(i + 1).padStart(4, "0")}`,
    description: names[i % names.length],
    location: `UA${String(Math.floor(i / 50) + 1).padStart(2, "0")}/R${String(Math.floor((i % 50) / 10) + 1).padStart(2, "0")}-C${String((i % 10) + 1).padStart(2, "0")}`,
    preferred_supplier:
      i % 7
        ? ["Northfield Components", "Harbour Industrial", "Westbridge Supply"][
            i % 3
          ]
        : "",
    order_quantity: i % 4 ? String(((i % 5) + 1) * 10) : "",
    lead_time: i % 3 ? "2 weeks" : "",
    header_color: "orange",
    decision: "create",
  }));
}
export function demoReference(): ImportReference {
  const rows = demoRows();
  return {
    cards: rows
      .slice(0, 18)
      .map((r, i) => ({
        id: `demo-card-${i}`,
        part_no: r.part_no,
        location: r.location,
        header_color: r.header_color,
        description: r.description,
        preferred_supplier: r.preferred_supplier,
        order_quantity: 20,
        lead_time: "3 weeks",
      })),
    products: rows
      .slice(18, 34)
      .map((r, i) => ({
        id: `demo-product-${i}`,
        product_code: r.part_no,
        product_title: r.description,
      })),
  };
}
