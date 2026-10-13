import { Button } from "@/components/ui/button";

export default function StorageLoadingStatus({ loading, error, onRetry }: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{error} Images already loaded are still available.</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading more images from storage…</p>;
  return null;
}
