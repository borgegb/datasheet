"use client";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductionKanbanBackRow } from "@/lib/production-kanban/back-rows";

interface ProductionKanbanGridEditorProps {
  rows: ProductionKanbanBackRow[];
  footerCode: string;
  onRowChange: (
    rowIndex: number,
    field: keyof ProductionKanbanBackRow,
    value: string
  ) => void;
  onFooterCodeChange: (value: string) => void;
}

export default function ProductionKanbanGridEditor({
  rows,
  footerCode,
  onRowChange,
  onFooterCodeChange,
}: ProductionKanbanGridEditorProps) {
  return (
    <div className="rounded-md border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36%] text-center">Location</TableHead>
            <TableHead className="w-[14%] text-center">Qty</TableHead>
            <TableHead className="w-[36%] text-center">Location</TableHead>
            <TableHead className="w-[14%] text-center">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`production-kanban-row-${index + 1}`}>
              <TableCell className="p-1">
                <Input
                  aria-label={`Back row ${index + 1} left location`}
                  className="h-8"
                  value={row.leftLocation}
                  onChange={(event) =>
                    onRowChange(index, "leftLocation", event.target.value)
                  }
                />
              </TableCell>
              <TableCell className="p-1">
                <Input
                  aria-label={`Back row ${index + 1} left quantity`}
                  className="h-8 text-center"
                  value={row.leftQty}
                  onChange={(event) =>
                    onRowChange(index, "leftQty", event.target.value)
                  }
                />
              </TableCell>
              <TableCell className="p-1">
                <Input
                  aria-label={`Back row ${index + 1} right location`}
                  className="h-8"
                  value={row.rightLocation}
                  onChange={(event) =>
                    onRowChange(index, "rightLocation", event.target.value)
                  }
                />
              </TableCell>
              <TableCell className="p-1">
                <Input
                  aria-label={`Back row ${index + 1} right quantity`}
                  className="h-8 text-center"
                  value={row.rightQty}
                  onChange={(event) =>
                    onRowChange(index, "rightQty", event.target.value)
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="p-1">
              <Input
                aria-label="Footer code"
                className="h-8 text-center"
                name="footerCode"
                placeholder="Footer code"
                value={footerCode}
                onChange={(event) => onFooterCodeChange(event.target.value)}
              />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
