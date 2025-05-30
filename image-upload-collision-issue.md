# Image Upload Collision Issue Documentation

## 🎯 **Problem Summary**

Users cannot replace existing images in our Supabase storage bucket. When attempting to upload a file with the same name, they should see a collision UI with "Use existing" / "Replace" options, but the "Replace" functionality fails with RLS policy violations.

## 🏗 **Current Architecture**

### **Storage Structure**

- **Bucket**: `datasheet-assets`
- **Path Format**: `{user_id}/images/{filename.ext}`
- **Example**: `a019fd93-58a4-415d-bb11-a94289ba7c2e/images/ellen.png`

### **User Context**

```sql
-- Example user from profiles table
{
  "id": "a019fd93-58a4-415d-bb11-a94289ba7c2e",
  "organization_id": "3fd02660-43a7-4d7a-aa78-ae7168e86a75",
  "role": "owner"
}
```

## 🔐 **Current RLS Policies on storage.objects**

```sql
-- 1. User-based INSERT policy (✅ Works)
CREATE POLICY "Allow user uploads to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 2. User-based UPDATE policy (❌ Not working for upsert)
CREATE POLICY "Allow user updates to own folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 3. User-based DELETE policy (✅ Works - delete succeeds)
CREATE POLICY "Allow user deletes from own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 4. Organization-based policies (may be interfering?)
CREATE POLICY "Allow org members to insert files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (
    SELECT profiles.organization_id::text
    FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Allow org members to update files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (
    SELECT profiles.organization_id::text
    FROM profiles
    WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'datasheet-assets'
  AND (storage.foldername(name))[1] = (
    SELECT profiles.organization_id::text
    FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
```

## 💻 **Current Upload Hook Code**

```typescript
// hooks/use-supabase-upload.ts

const proceedWithUpload = useCallback(
  async (fileName: string, replace: boolean) => {
    const file = files.find((f) => f.name === fileName);
    if (!file) return;

    console.log(
      `[proceedWithUpload] start (${replace ? "replace" : "use-existing"})`,
      file.name
    );
    setLoading(true);

    try {
      if (!replace) {
        // "Use existing" - just mark as success
        setSuccesses((prev) => [...prev, file.name]);
        setErrors((prev) => prev.filter((e) => e.name !== file.name));
        return;
      }

      const key = path ? `${path}/${file.name}` : file.name;
      console.log("[proceedWithUpload] using delete-then-insert strategy");

      // Strategy: Always delete then insert for replacements
      console.log("[proceedWithUpload] step 1: deleting existing file");
      const { error: deleteError } = await supabase.storage
        .from(bucketName)
        .remove([key]);

      if (deleteError) {
        console.error("[proceedWithUpload] delete failed", deleteError);
        throw new Error(
          `Failed to delete existing file: ${deleteError.message}`
        );
      }

      console.log(
        "[proceedWithUpload] step 2: waiting for delete to propagate"
      );
      // Wait for Supabase storage eventual consistency
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log("[proceedWithUpload] step 3: uploading new file");
      const { error: insertError } = await supabase.storage
        .from(bucketName)
        .upload(key, file, {
          cacheControl: cacheControl.toString(),
          upsert: false, // Plain INSERT
        });

      let finalError = insertError;

      // Handle 409 - treat as success (eventual consistency)
      if (insertError && (insertError as any)?.statusCode === 409) {
        console.log(
          "[proceedWithUpload] 409 encountered - treating as success"
        );
        finalError = null;
      }

      if (finalError) {
        setErrors((prev) => [
          ...prev.filter((e) => e.name !== file.name),
          { name: file.name, message: finalError.message },
        ]);
      } else {
        setSuccesses((prev) => [...prev, file.name]);
        setErrors((prev) => prev.filter((e) => e.name !== file.name));
      }
    } catch (err) {
      setErrors((prev) => [
        ...prev.filter((e) => e.name !== file.name),
        { name: file.name, message: (err as any)?.message || "Unknown error" },
      ]);
    } finally {
      setLoading(false);
    }
  },
  [bucketName, cacheControl, files, path]
);
```

## 🚨 **Current Error Pattern**

### **Console Output:**

```
[proceedWithUpload] start (replace) ellen.png
[proceedWithUpload] using delete-then-insert strategy
[proceedWithUpload] step 1: deleting existing file
[proceedWithUpload] step 2: waiting for delete to propagate
[proceedWithUpload] step 3: uploading new file
[proceedWithUpload] final error {statusCode: '409', error: 'Duplicate', message: 'The resource already exists'}
```

### **Network Requests:**

1. ✅ `DELETE` succeeds (no error logged)
2. ❌ `POST` (upload) returns `400 Bad Request` → becomes `409 Duplicate`

## 🔍 **Policy Verification**

The policy logic is mathematically correct:

```sql
-- Test shows policy conditions should pass
SELECT
  'a019fd93-58a4-415d-bb11-a94289ba7c2e/images/ellen.png' as test_path,
  (storage.foldername('a019fd93-58a4-415d-bb11-a94289ba7c2e/images/ellen.png'))[1] as first_folder,
  -- Result: first_folder = 'a019fd93-58a4-415d-bb11-a94289ba7c2e'
  (storage.foldername('a019fd93-58a4-415d-bb11-a94289ba7c2e/images/ellen.png'))[1] = 'a019fd93-58a4-415d-bb11-a94289ba7c2e' as user_policy_match;
  -- Result: user_policy_match = true
```

## 🤔 **Attempted Solutions**

### **1. Upsert with UPDATE policies** ❌

- Added user-based UPDATE policy with USING + WITH CHECK
- Fixed org UPDATE policy to have WITH CHECK clause
- Still gets 403 RLS violation on upsert

### **2. Delete-then-insert strategy** ❌

- DELETE succeeds (confirmed in logs)
- 1.5 second delay for propagation
- INSERT still gets 409 "Duplicate"

### **3. Treating 409 as success** ❌

- Even when treating 409 as success, the actual file replacement doesn't occur

## 📊 **Supabase Project Info**

- **Project ID**: `vzeiedjigapbhbgoiesp`
- **Region**: `eu-north-1`
- **Postgres Version**: `15.8.1.070`
- **Bucket**: `datasheet-assets` (RLS enabled)

## 🎯 **Expected Behavior**

1. User uploads file `ellen.png` ✅
2. User uploads different `ellen.png` (collision detected) ✅
3. User sees collision UI with "Use existing" / "Replace" ✅
4. User clicks "Replace" ✅
5. Old file deleted ✅
6. New file uploaded ❌ **FAILS HERE**
7. UI shows success ❌

## 🔬 **Investigation Questions**

1. **Policy Conflicts**: Are user-based and org-based policies conflicting?
2. **Eventual Consistency**: Is 1.5s delay insufficient for Supabase storage?
3. **Metadata Issues**: Does Supabase storage cache file metadata separately?
4. **RLS vs Storage**: Are there storage-level restrictions beyond RLS?
5. **UPSERT Implementation**: How does Supabase implement upsert internally?

## 📁 **Relevant Files**

- **Upload Hook**: `hooks/use-supabase-upload.ts`
- **UI Component**: `components/dropzone.tsx`
- **Form**: `app/dashboard/generator/DatasheetGeneratorForm.tsx`

## 🌐 **Testing Environment**

- **Branch**: `fix-image-upload-collision`
- **Live URL**: `[Vercel preview URL]`
- **Test File**: `ellen.png` in user folder `a019fd93-58a4-415d-bb11-a94289ba7c2e/images/`

---

**Goal**: Make the "Replace" button successfully overwrite existing files while maintaining proper security through RLS policies.
