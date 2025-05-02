# Project Plan: Applied Studio - Phase 1 (Product Datasheet Generator)

## 1. Goal

Deliver a functional and user-friendly Product Datasheet Generator module as Phase 1 of the "Applied Studio" platform. This module will allow authenticated users within the organization to create, manage (via catalogs), and generate professional, consistently branded PDF datasheets based on a final graphic design template.

## 2. Core Technologies

- **Frontend:** Next.js (App Router, React)
- **UI:** Shadcn/ui + Tailwind CSS
- **Backend:** Supabase
  - Authentication: Supabase Auth
  - Database: Supabase Postgres
  - Storage: Supabase Storage
  - Backend Logic: Supabase Edge Functions
- **PDF Generation:** pdf-lib (or potentially another robust library if needed for final template complexity)
- **Deployment:** Vercel (Frontend), Supabase (Backend)

## 3. Completed Demo MVP Foundation

The following core components and flows are already established:

- ✅ Basic User Authentication (Signup, Login, Logout - Email verification configured)
- ✅ Basic Dashboard Layout Structure (/dashboard)
- ✅ Basic Generator Form UI (/dashboard/generator)
- ✅ Image Upload to Supabase Storage (linked to user)
- ✅ Basic PDF Generation Backend (Edge Function using `pdf-lib`, text-only or with basic image)
- ✅ Frontend Function Invocation & PDF Download Mechanism
- ✅ Basic Landing Page
- ✅ Initial Deployment Setup (Vercel, Supabase Function)
- ✅ Initial Git Repository Setup

## 4. Phase 1 Scope & Timeline (3 Weeks)

---

### **Week 1: Foundation & Core UI**

- **[ ] Supabase Setup Refinement:**
  - **[ ] Database Schema:** Define and implement final Postgres schemas for `catalogs`, `products`, and any necessary join tables (linking products to catalogs, users to organizations if needed - confirm org structure). Ensure relationships (`user_id`, `catalog_id`) and constraints are set up.
  - **[ ] RLS Policies:** Review and finalize Row Level Security policies for `products`, `catalogs`, and `storage.objects` to ensure users within the organization can access shared data as intended.
  - **[ ] Storage:** Confirm `datasheet-assets` bucket exists and policies are correct. Consider structure for storing generated PDFs (e.g., `user_id/generated_pdfs/`).
- **[ ] Authentication Enhancement:** Integrate password reset flow UI if not already fully polished.
- **[ ] Dashboard Layout:** Finalize dashboard navigation (Sidebar/Header) to include links for Overview, Generator, Saved Datasheets/Catalogs.
- **[ ] Generator Form (/dashboard/generator):**
  - **[ ] Finalize UI:** Implement all required fields based on PRD:
    - Product Name (Text Input)
    - Product Code (Text Input)
    - Weight (Text/Number Input)
    - Description (Textarea)
    - Key Features (Textarea - needs processing for bullets in PDF)
    - Specifications (Textarea - needs processing for table in PDF)
    - Warranty (Dropdown - define options)
    - Shipping Info (Dropdown - define options)
    - Image Orientation Choice (Radio/Select: Portrait/Landscape) - _This impacts template selection._
    - Optional Logos/Cert Toggles (Checkboxes/Switches)
    - Assign to Catalog (Dropdown populated from DB)
    - Assign to Catalog Section/Category (Input or Select - Requires Catalog Structure)
  - **[ ] Image Upload:** Ensure single image upload is robust. Store the final `imagePath` reliably.
  - **[ ] Catalog Category Creation:** Implement UI element (e.g., button + modal/dialog) to allow users to create a new catalog _directly from the generator form_ if needed.
- **[ ] Database Interaction:**
  - **[ ] Save Datasheet:** Implement logic in the Generator form (`DatasheetGeneratorForm.tsx`) to save all collected form data (including `imagePath`, selected orientation, toggles, catalog assignment) to the `products` table in Supabase upon clicking a "Save" button (distinct from "Generate").
  - **[ ] Load Datasheet (for Edit):** Implement logic to fetch data for a specific product ID from the database.
- **[ ] Basic Saved Datasheets Page (/dashboard/products):**
  - **[ ] List View:** Fetch and display a basic list/table of saved datasheets from the `products` table (associated with the user/org). Include key info like Product Name, Code, Catalog.
  - **[ ] Link to Edit:** Add a button/link on each row to navigate to the Generator page with the corresponding product ID for editing.

---

### **Week 2: Generation & Core Logic**

- **[ ] Receive Final Template:** Obtain the final graphic design template (Portrait & Landscape).
- **[ ] PDF Template Implementation (`generate-datasheet` Edge Function):**
  - **[ ] Analyze Template:** Break down the structure, fonts, spacing, and logic of the final PDF template.
  - **[ ] Implement Base Layout:** Replicate the static layout, headers, footers, and branding elements using `pdf-lib`.
  - **[ ] Dynamic Data Population:** Implement logic to accurately place all data fields (Title, Code, Price, etc.) from the input into the correct locations on the template.
  - **[ ] Handle Key Features:** Process the "Key Features" text to generate bullet points in the PDF.
  - **[ ] Handle Specifications:** Implement logic to parse the "Specifications" input (assuming a user-defined structure like `Label: Value` per line) and generate a formatted table in the PDF. _Complexity Note: This might require careful parsing logic._
  - **[ ] Image Embedding:** Re-implement robust image fetching (from Storage path) and embedding, potentially resizing based on the chosen orientation and template placeholder size.
  - **[ ] Conditional Logos:** Implement logic to include/exclude logos/certifications based on the toggle values passed from the form.
  - **[ ] Orientation Logic:** Select and use the correct template variation (Portrait/Landscape) based on the user's choice passed from the form.
  - **[ ] Save Generated PDF:** Modify the function to save the generated PDF (`pdfBytes`) to Supabase Storage using the `[Product Name] – [Product Code].pdf` naming convention. Update the corresponding `products` table row with the path to the saved PDF. _(Instead of returning Base64)._
- **[ ] Update Frontend Trigger (`DatasheetGeneratorForm.tsx`):**
  - Modify `handleGenerate` to call the Edge Function (likely passing the `productId` now).
  - Handle the response: The function might now just return success/failure or the path to the saved PDF. Update the UI to show a success message and provide the download link based on the saved PDF path (using `supabase.storage.from(...).download()` or a signed URL on the frontend).
- **[ ] Client-Side Preview Button (`DatasheetGeneratorForm.tsx`):**
  - Add a "Preview PDF" button.
  - On click, gather current form data (without saving to DB).
  - Call a _modified_ or _separate_ Edge Function endpoint (or pass a flag to the main one) that generates the PDF but returns the Base64 data directly (similar to our previous test setup).
  - Use the `createDataUrlLink` helper to generate a preview URL and open it in a new tab (`window.open(dataUrl)`). _Note: Preview generation might need to be slightly simplified (e.g., no image) if performance is an issue._
- **[ ] Saved Datasheets Page Enhancements (/dashboard/products):**
  - **[ ] Search/Filter:** Implement filtering by Catalog dropdown. Implement basic text search (Product Name/Code).
  - **[ ] Download/Print/Share:** Add buttons/actions on each row to:
    - Download the saved PDF (fetch from storage path).
    - Trigger browser print dialog for the PDF (`window.print()` on a PDF view or via data URL).
    - (Implement Share via Email in a later step/phase as per PRD discussion).
- **[ ] Edit Functionality:** Ensure clicking "Edit" on the Saved Datasheets page correctly loads the data into the Generator form. Modify the form's "Save" button logic to handle _updating_ an existing product record instead of creating a new one.

---

### **Week 3: Polish & Handover**

- **[ ] Catalog Management:**
  - Implement UI for viewing/managing catalogs (creating new ones, potentially renaming/deleting if required).
  - Ensure datasheets can be correctly assigned/reassigned to catalogs.
- **[ ] Comprehensive Testing:**
  - Test all user flows (signup, login, form input variations, image uploads, generation, preview, save, edit, download, print, filtering, catalog management).
  - Test edge cases (missing data, invalid inputs, large text blocks, different image types).
  - Cross-browser testing (Chrome, Firefox, Safari, Edge).
  - Basic responsiveness testing.
- **[ ] UI Refinement & Polish:**
  - Ensure consistent styling across all pages and components.
  - Improve loading states, error messages, and user feedback (using toasts effectively).
  - Address any visual glitches or awkward layouts.
- **[ ] Bug Fixing:** Address any bugs identified during testing.
- **[ ] Final Deployment:**
  - Deploy the final frontend code to Vercel.
  - Deploy the final Edge Function code to Supabase (ensure live environment variables and timeout are set).
- **[ ] Documentation & Handover:**
  - Provide basic documentation on setup, deployment, and usage.
  - Handover codebase and access credentials (if applicable).

---
