# Product Guide: Datasheet Generator MVP & Beyond

This guide outlines the development plan for the Product Datasheet Generator application, starting with a rapid Demo MVP to showcase core functionality for your proposal, followed by the full MVP build, and potential future enhancements.

## Core Technologies (Proposed)

- **Frontend:** Next.js (App Router)
- **UI:** Shadcn/ui + Supabase UI Blocks + Shadcn Dashboard Block
- **Backend:** Supabase (Auth, Postgres DB, Storage, Edge Functions)
- **Document Generation:** `pdfmake`, `docx-templates` (or similar) integrated via Edge Functions

---

## Part 1: Demo MVP Build Plan (For Proposal)

**Goal:** Quickly build a functional, visually appealing demo showcasing the core flow: Login -> Access Dashboard -> Fill Basic Form -> Upload Image -> Generate Basic PDF/Word -> Download. Leverage accelerator blocks for speed.

**(Estimated Time: 1-2 days)**

### Steps:

#### 1. Project Setup & Foundational Blocks

- Initialize Next.js project (App Router, TS, Tailwind).
- Initialize Shadcn/ui (`npx shadcn-ui@latest init`).
- Configure `.env.local` with Supabase URL/Anon Key.
- Install Supabase Client Block (`npx shadcn@latest add https://supabase.com/ui/r/supabase-client-nextjs.json`).
- Install Supabase Auth Block (`npx shadcn@latest add https://supabase.com/ui/r/password-based-auth-nextjs.json`).
- Install Shadcn Dashboard Block (`npx shadcn@latest add https://ui.shadcn.com/r/styles/default/dashboard-01.json`).
- Install Supabase Dropzone Block (`npx shadcn@latest add https://supabase.com/ui/r/dropzone-nextjs.json`).
- Install dependencies (`npm install`).

#### 2. Supabase Project Configuration

- **Auth:** Enable Email provider, configure Email Templates (using `token_hash`, `type` format), set Site URL & Redirect URLs in Auth settings.
- **Storage:** Create a bucket (e.g., `datasheet-assets`). Set up RLS policies for `INSERT` and `SELECT` allowing authenticated users access only to paths prefixed with their `user_id` (e.g., `userId/images/`).
- **Edge Functions:** Initialize Supabase functions (`supabase init`).

#### 3. Dashboard Layout & Routing

- Modify `middleware.ts` to protect `/dashboard/**` routes, leaving `/` and `/auth/**` public. Redirect unauthenticated dashboard access to `/auth/login`.
- Configure `login-form.tsx` and `sign-up-form.tsx` to redirect to `/dashboard` upon success.
- Ensure the dashboard block created `app/dashboard/layout.tsx` and `app/dashboard/page.tsx`.
- Add the `<LogoutButton />` from the auth components into `app/dashboard/layout.tsx` (e.g., in the header/sidebar).
- Create a simple overview page in `app/dashboard/page.tsx` (e.g., "Welcome to your Dashboard!" with a link/button to `/dashboard/generator`).
- Add navigation links in `app/dashboard/layout.tsx` (e.g., in `components/dashboard/layout/NavLinks.tsx` if using that structure) pointing to `/dashboard` and `/dashboard/generator`.
- **Test:** Verify login redirects to `/dashboard`, logout works, protected routes are enforced.

#### 4. Generator Feature Page & Form

- Create the generator page route: `app/dashboard/generator/page.tsx`.
- Make it a Client Component (`'use client'`).
- Build the input form using Shadcn/ui components (`Input`, `Textarea`, `Label`, `Button`, `Card`). Include essential fields for the demo:
  - Product Title
  - Product Code
  - Description (`Textarea`)
  - Technical Specifications (Simple `Textarea`)
  - Price

#### 5. Image Upload Integration

- Integrate the `<Dropzone />` component within the `generator/page.tsx` form.
- Use the `useSupabaseUpload` hook:
  - Configure `bucketName`: `'datasheet-assets'`.
  - Set `path`: `user ? \`${user.id}/images/\` : undefined`(requires getting`user.id`).
  - Configure `allowedMimeTypes`: `['image/*']`, `maxFiles`: 1.
- Add state to the form component to store the successfully uploaded image's path or URL.

#### 6. Basic Backend Generation (Edge Function)

- Create Edge Function: `supabase functions new generate-datasheet`.
- Inside `supabase/functions/generate-datasheet/`:
  - Handle CORS.
  - Install/import `pdfmake` and `docx-templates` (using Deno-compatible methods like URL imports).
  - Include a very simple `template.docx` with text placeholders (`{TITLE}`, `{DESC}`, etc.).
  - Write `index.ts` logic:
    - Accept `POST` request with form data JSON.
    - Generate basic PDF buffer using `pdfmake` with text data.
    - Generate basic Word buffer using `docx-templates`, `template.docx`, and text data.
    - Return `{ pdfData: base64String, wordData: base64String }`.

#### 7. Frontend Trigger & Download

- Add "Generate Datasheet" button to `generator/page.tsx`.
- On click: Set loading state, gather form data (including image path/URL if needed by function), invoke `generate-datasheet` function.
- On success: Clear loading state, decode base64 response, create Blobs, create object URLs, display "Download PDF" and "Download Word" links/buttons.
- Add basic error handling for the function call.

#### 8. Landing Page

- Modify `app/page.tsx` into a simple public landing page with Login/Sign Up links.

#### 9. Polish & Test

- Ensure basic responsiveness.
- Clean up UI styling.
- Test the entire flow: Sign Up -> Confirm -> Login -> Navigate to Generator -> Fill Form -> Upload Image -> Generate -> Download PDF -> Download Word -> Logout.

---

## Part 2: Full MVP Build Plan (Post-Hire)

**Goal:** Deliver all key features requested by the client, building upon the Demo MVP foundation. Negotiate final tech stack details if necessary (strongly advocate for Supabase's benefits).

### Steps:

#### 1. Refine Backend Function (`generate-datasheet`)

- **Robust Generation:** Enhance PDF generation (`pdfmake`) to handle better formatting (bullets, multi-line specs), potentially embedding the uploaded image (requires passing image data/URL and library support).
- **Word Template:** Enhance `template.docx` with proper branding, layout, and potentially image placeholders. Ensure `docx-templates` handles image replacement if needed (may require specific template syntax or library features).
- **Error Handling:** Add robust error handling for generation failures.
- **Optimization:** Consider optimizing generation time if needed.

#### 2. Enhance Web Form

- Add all required fields (Availability, Applications, etc.).
- Implement proper input validation (client-side and server-side).
- Implement bullet-point or multi-line input for Technical Specifications more effectively (e.g., using a rich text editor component or dynamic list input).
- **(Optional)** Implement Language Selector - requires template variations and potentially translation logic. Discuss priority with client.

#### 3. Database Integration (Product Data)

- Design Supabase Postgres schema: Create a `products` table (or `datasheets`) linked to `users` to store all the submitted form data (title, desc, specs, price, `image_path`, etc.).
- Modify the form submission: Instead of just triggering generation, save the form data to the new `products` table first.
- Modify the generation function: Accept a `productId` instead of raw data, fetch data from the DB within the function.

#### 4. Implement "Saved Datasheets" Feature (If Implicitly Needed)

- Create a new route `app/dashboard/products/page.tsx`.
- Fetch and display a list/table of the user's saved product entries from the `products` table.
- Allow users to view/edit existing entries (re-populating the generator form).
- Allow users to re-generate datasheets for saved entries.
- Implement delete functionality for saved entries.

#### 5. Implement Emailing

- Add an "Email Datasheet" button/option after generation.
- Create a new Supabase Edge Function (`send-datasheet-email`).
- Integrate an email provider (e.g., Resend, SendGrid).
- Function logic: Accept recipient email and generated document data (or path/ID). Attach the document(s) and send the email.

#### 6. Refine UI/UX

- Improve visual feedback during generation/emailing.
- Ensure consistent branding and clean design across all components.
- Conduct usability testing and iterate based on feedback.

#### 7. Testing

- Comprehensive testing of all features, including edge cases, validation, error handling, and different data inputs.
- Cross-browser and cross-device testing.

---

## Part 3: Potential Future Steps (Beyond MVP)

- **Template Management:** Allow users (or admins) to upload/manage multiple `.docx` templates. Let users choose a template during generation.
- **Advanced Formatting:** Support more complex formatting options in the input form (rich text editor) and ensure they translate correctly to PDF/Word outputs.
- **User Roles & Permissions:** Introduce different user roles (e.g., Admin, Editor, Viewer) with varying levels of access.
- **Team/Collaboration Features:** Allow sharing datasheet entries or templates within a team.
- **Analytics:** Track datasheet generation usage, popular templates, etc.
- **Subscription/Billing:** Integrate Stripe (or similar) for paid plans based on usage, features, or number of users/templates.
- **Advanced AI:** Implement more sophisticated AI features beyond the initial ones (e.g., AI-powered content suggestions for descriptions/specs, improved auto-tagging).

---

_This guide provides a clear roadmap from a quick demo to a fully functional MVP and beyond. Remember to communicate clearly with the client, especially regarding any tech stack justifications and feature prioritization post-hire._
