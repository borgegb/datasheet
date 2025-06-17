"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Package } from "lucide-react";
import productsData from "@/products.json";

// Define the product interface based on the JSON structure
interface Product {
  url: string;
  title: string;
  item_number: string;
  description: string;
  key_features: string[];
  specifications: string[];
  accessories: string[];
}

interface ProductSelectorProps {
  onProductSelect: (product: Product) => void;
  className?: string;
}

export default function ProductSelector({
  onProductSelect,
  className = "",
}: ProductSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return productsData as Product[];

    const searchLower = searchTerm.toLowerCase();
    return (productsData as Product[]).filter(
      (product) =>
        product.title.toLowerCase().includes(searchLower) ||
        product.item_number.toLowerCase().includes(searchLower) ||
        product.description.toLowerCase().includes(searchLower)
    );
  }, [searchTerm]);

  const handleProductClick = (product: Product) => {
    onProductSelect(product);
  };

  return (
    <Card className={`h-full ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Product Library
        </CardTitle>
        <CardDescription>
          Select a product to auto-populate the form
        </CardDescription>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-2 p-4 pt-0">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No products found</p>
                {searchTerm && (
                  <p className="text-sm">Try a different search term</p>
                )}
              </div>
            ) : (
              filteredProducts.map((product, index) => (
                <Card
                  key={index}
                  className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-transparent hover:border-l-primary"
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div>
                        <h4 className="font-medium text-sm leading-tight line-clamp-2">
                          {product.title}
                        </h4>
                        {product.item_number !== "N/A" && (
                          <Badge variant="secondary" className="text-xs mt-1">
                            {product.item_number}
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {product.description}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {product.key_features.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {product.key_features.length} features
                          </Badge>
                        )}
                        {product.specifications.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {product.specifications.length} specs
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="sm"
                        className="w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProductClick(product);
                        }}
                      >
                        Use This Product
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
