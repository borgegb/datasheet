import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ArrowLeft, Upload, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

export default function BatchKanbanPage() {
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/kanban">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Cards
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Batch Upload Kanban Cards</h1>
          <p className="text-muted-foreground">
            Upload multiple kanban cards from a CSV or Excel file
          </p>
        </div>
      </div>

      {/* Coming Soon Notice */}
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Batch Upload - Coming Soon</CardTitle>
          <CardDescription>
            The batch upload feature for kanban cards is currently under
            development. This will allow you to upload multiple cards from CSV
            or Excel files.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">Planned features:</p>
            <ul className="list-disc list-inside space-y-1 text-left max-w-md mx-auto">
              <li>CSV/Excel file upload</li>
              <li>Image matching by filename</li>
              <li>Bulk card generation</li>
              <li>Progress tracking</li>
              <li>Error handling and validation</li>
            </ul>
          </div>

          <div className="pt-4">
            <Button variant="outline" asChild>
              <Link href="/dashboard/kanban/new">
                Create Single Card Instead
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
