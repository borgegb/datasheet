"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Trash2, MoreHorizontal } from "lucide-react";
import type { CertificationRow } from "../actions";
import { deleteCertification } from "../actions";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  initialData: CertificationRow[];
}

export default function CertificationsTable({ initialData }: Props) {
  const [rows, setRows] = React.useState(initialData);
  const [userRole, setUserRole] = React.useState<string>("viewer");

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setUserRole(profile?.role || "viewer");
    });
  }, []);

  const openPdf = async (path?: string | null) => {
    if (!path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Failed to open PDF");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (id: string) => {
    const t = toast.loading("Deleting certificate...");
    const { error } = await deleteCertification(id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`, { id: t });
    } else {
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Certificate deleted", { id: t });
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center h-24">
                No certificates yet
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const model = r.data?.model || "";
              const serial = r.data?.serialNumber || "";
              return (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[260px] truncate">
                    {r.title || `${model}${serial ? ` – ${serial}` : ""}`}
                  </TableCell>
                  <TableCell className="capitalize">
                    {r.type.replaceAll("-", " ")}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {model}
                  </TableCell>
                  <TableCell>
                    {serial || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openPdf(r.pdf_storage_path)}
                        >
                          <Download className="mr-2 h-4 w-4" /> Open PDF
                        </DropdownMenuItem>
                        {userRole === "owner" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(r.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
