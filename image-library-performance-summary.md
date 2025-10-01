# Image Library Performance Issues - Technical Summary

## Overview

The image library feature in a Next.js/React application was experiencing severe performance issues when loading and displaying images from Supabase Storage.

## Architecture

- **Frontend**: Next.js 14 with React (Client/Server Components)
- **Storage**: Supabase Storage (S3-compatible)
- **Image Sources**: Products, Kanban cards, and Catalogs
- **Authentication**: Supabase Auth with organization-based access

## Symptoms

1. **10-20 second delays** when scrolling to load more images
2. **UI blinking/flashing** - images would load, then disappear and reload
3. **Excessive console logs** - over 2000 messages for just 52 images
4. **Poor scroll performance** - laggy and unresponsive

## Root Causes Identified

### 1. State Management Anti-Pattern (Critical)

**Problem**: Every time a signed URL was generated for an image, the entire `images` array state was updated:

```javascript
// BAD: This was causing re-renders and useEffect triggers
setImages((prev) =>
  prev.map((img) => (img.id === image.id ? { ...img, url } : img))
);
```

**Impact**:

- The `useEffect` watching `images` would trigger on every URL update
- This reset the entire grid back to showing only the first batch
- Created an infinite loop of loading → resetting → loading

### 2. Unthrottled Scroll Events

**Problem**: Scroll event handler was firing on every pixel of movement

```javascript
// BAD: No throttling
window.addEventListener("scroll", handleScroll);
```

**Impact**: Hundreds of scroll events per second, causing:

- Excessive function calls
- Multiple concurrent load requests
- Browser performance degradation

### 3. Concurrent Request Overload

**Problem**: Loading 20 images simultaneously

```javascript
// BAD: All requests fired at once
await Promise.all(newImages.map((img) => onLoadImage(img)));
```

**Impact**:

- Server overload with 20 concurrent signed URL generations
- Each request taking 1-3 seconds
- Network congestion

### 4. Inefficient URL Caching

**Problem**: URLs were stored in the component state array, causing full re-renders
**Impact**: Every URL update triggered React reconciliation for the entire image list

## Implemented Solutions

### 1. Separate URL Cache

```javascript
// GOOD: Separate Map for URLs, doesn't trigger re-renders
const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
```

### 2. Fixed useEffect Dependency

```javascript
// GOOD: Only reset on length changes (filtering), not URL updates
useEffect(() => {
  setVisibleImages(images.slice(0, imagesPerPage));
  setPage(1);
}, [images.length]); // Changed from [images]
```

### 3. Scroll Throttling

```javascript
// GOOD: Throttle scroll events to every 200ms
const lastScrollTime = useRef(0);
if (now - lastScrollTime.current < 200) return;
```

### 4. Staggered Loading

```javascript
// GOOD: 100ms delay between each request
newImages.map((img, idx) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const url = await onLoadImage(img);
      resolve(url);
    }, idx * 100);
  });
});
```

### 5. Reduced Batch Size

- Changed from 20 to 10 images per batch
- Reduced initial load and scroll trigger distance

## Results

- Load times reduced from 10-20 seconds to ~1-2 seconds per batch
- Eliminated UI blinking/reloading
- Smooth scroll performance
- Reduced console noise by ~95%

## Remaining Considerations

### 1. Server-Side Optimization

- Consider implementing a batch signed URL endpoint to reduce round trips
- Cache signed URLs on the server (Redis/memory cache)
- Pre-generate URLs during initial data fetch

### 2. Image Optimization

- Implement progressive loading (blur placeholders)
- Use Next.js Image component optimization features
- Consider generating thumbnails for grid view

### 3. Architecture Improvements

- Move signed URL generation to server components where possible
- Implement virtual scrolling for very large image sets
- Consider pagination instead of infinite scroll for better performance

### 4. Monitoring

- Add performance metrics (Core Web Vitals)
- Monitor server load during peak usage
- Track signed URL generation times

## Code References

- Main component: `/app/dashboard/image-library/ImageLibraryClient.tsx`
- Grid component: `/app/dashboard/image-library/components/ImageGrid.tsx`
- Server action: `/app/dashboard/image-library/actions.ts`

## Testing Recommendations

1. Test with large datasets (500+ images)
2. Test on slower connections (3G simulation)
3. Monitor memory usage during extended sessions
4. Test concurrent users to identify server bottlenecks
