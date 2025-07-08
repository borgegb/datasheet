import React from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { fetchKanbanCardById } from "../actions";

interface KanbanCardViewPageProps {
  params: {
    id: string;
  };
}

export default async function KanbanCardViewPage({
  params,
}: KanbanCardViewPageProps) {
  const { id } = params;

  if (!id) {
    notFound();
  }

  const { data: card, error } = await fetchKanbanCardById(id);

  if (error || !card) {
    console.error("Error fetching kanban card:", error);
    notFound();
  }

  const getHeaderColorBadge = (color: string) => {
    const colorMap = {
      red: "bg-red-500 text-white",
      orange: "bg-orange-500 text-white",
      green: "bg-green-500 text-white",
    };

    return (
      <Badge
        className={
          colorMap[color as keyof typeof colorMap] || "bg-gray-500 text-white"
        }
      >
        {color.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/kanban">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cards
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{card.part_no}</h1>
            <p className="text-muted-foreground">Kanban Card Details</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {card.pdf_storage_path && (
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          )}
          <Button asChild>
            <Link href={`/dashboard/kanban/${card.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Card
            </Link>
          </Button>
        </div>
      </div>

      {/* Card Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Part Number
                  </label>
                  <p className="text-lg font-semibold">{card.part_no}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Location
                  </label>
                  <p className="text-lg font-semibold">{card.location}</p>
                </div>
              </div>

              {card.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Description
                  </label>
                  <p className="mt-1">{card.description}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Header Color
                </label>
                <div className="mt-1">
                  {getHeaderColorBadge(card.header_color)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Order Quantity
                  </label>
                  <p className="text-lg font-semibold">
                    {card.order_quantity || (
                      <span className="text-muted-foreground">
                        Not specified
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Preferred Supplier
                  </label>
                  <p className="text-lg font-semibold">
                    {card.preferred_supplier || (
                      <span className="text-muted-foreground">
                        Not specified
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Lead Time
                  </label>
                  <p className="text-lg font-semibold">
                    {card.lead_time || (
                      <span className="text-muted-foreground">
                        Not specified
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Image and PDF Status */}
        <div className="space-y-6">
          {card.image_path && (
            <Card>
              <CardHeader>
                <CardTitle>Product Image</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-square relative bg-muted rounded-lg overflow-hidden">
                  <Image
                    src={`/api/storage/${card.image_path}`} // You'll need to create this endpoint
                    alt={card.part_no}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>PDF Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">PDF Generated</span>
                  {card.pdf_storage_path ? (
                    <Badge variant="secondary">Available</Badge>
                  ) : (
                    <Badge variant="outline">Not Generated</Badge>
                  )}
                </div>

                {!card.pdf_storage_path && (
                  <Button variant="outline" size="sm" className="w-full">
                    Generate PDF
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Created
                </label>
                <p className="text-sm">
                  {new Date(card.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </label>
                <p className="text-sm">
                  {new Date(card.updated_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
