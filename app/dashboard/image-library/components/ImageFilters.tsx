"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageFilters as FilterType } from "../types";

interface ImageFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: FilterType) => void;
  totalImages: number;
  filteredCount: number;
}

export default function ImageFilters({ 
  filters, 
  onFilterChange, 
  totalImages, 
  filteredCount 
}: ImageFiltersProps) {
  const handleSourceChange = (value: string) => {
    onFilterChange({ ...filters, source: value as FilterType['source'] });
  };
  
  const handleSearchChange = (value: string) => {
    onFilterChange({ ...filters, searchQuery: value });
  };
  
  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-') as [FilterType['sortBy'], FilterType['sortOrder']];
    onFilterChange({ ...filters, sortBy, sortOrder });
  };
  
  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Source Filter */}
        <Select value={filters.source || 'all'} onValueChange={handleSourceChange}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="products">Products</SelectItem>
            <SelectItem value="kanban_cards">Kanban Cards</SelectItem>
            <SelectItem value="catalogs">Catalogs</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or filename..."
            value={filters.searchQuery || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* Sort */}
        <Select 
          value={`${filters.sortBy}-${filters.sortOrder}`} 
          onValueChange={handleSortChange}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="name-asc">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Results count */}
      <div className="mt-4 flex items-center gap-2">
        <Badge variant="secondary">
          {filteredCount === totalImages 
            ? `${totalImages} images` 
            : `${filteredCount} of ${totalImages} images`}
        </Badge>
        {filters.searchQuery && (
          <Badge variant="outline">
            Search: "{filters.searchQuery}"
          </Badge>
        )}
      </div>
    </Card>
  );
}
