# PDF Generation Refactor Plan (`generate-datasheet`)

Goal: Modify the `supabase/functions/generate-datasheet/index.ts` Edge Function to generate PDFs matching the provided design template.

**Reference:**

- Design Template Image: (Provided in conversation)
- Design Guidelines Text: `supabase/functions/_shared/assets/applied-prodcut-datasheet-uidelines-300-dpi.txt`

**Key Changes from Current Implementation:**

- Abandon current simple two-column layout.
- Implement new sequential layout with specific section arrangements (full-width, side-by-side).
- Add new static elements (checkmarks, specific divider lines, table backgrounds).
- Update styling (fonts, sizes, colors, weights) for all elements to match design.
- Implement text mapping for Warranty.
- Use raw data for Shipping Info.
- Adjust positioning and scaling of images and logos.
- Update footer text layout.

**Implementation Steps:**

1.  **Setup & Constants:**

    - [ ] Define constants for all colors (Green `#2c5234`, Charcoal `#2A2A2A`, Grey `#808080`, White `#FFFFFF`, Table BG `#EFF2EF`).
    - [ ] Define constants for all font sizes (Title=16pt+, Subtitle=8pt, Headings=12pt, Body=9pt, SpecsLabel=9pt, SpecsValue=9pt, Footer=9.6pt).
    - [ ] Define constants for margins (Left=22mm, Right=11mm, Top=15mm, Bottom=15mm?) - Convert to points.
    - [ ] Define constants for standard spacing (e.g., `SPACE_BELOW_TITLE`, `SPACE_BETWEEN_SECTIONS`).
    - [ ] Load and embed necessary fonts: `Poppins-Bold`, `Inter-Regular`.

2.  **Refactor Layout Flow:**

    - [ ] Remove existing column drawing logic.
    - [ ] Initialize `currentY` based on top margin.

3.  **Header Section (Full Width):**

    - [ ] Draw Applied Logo (Top Right) - Reuse existing logic.
    - [ ] Draw Product Title (Poppins Bold, Green, 16pt+) - Adjust position (Top Left).
    - [ ] Draw Subtitle (`Product Code [Value] | Weight [Value]`) (Inter Regular, Grey, 8pt) below Title.
    - [ ] Draw horizontal divider line below Subtitle.
    - [ ] Update `currentY` correctly after this section.

4.  **Description Section (Full Width):**

    - [ ] Draw Description text (Inter Regular, Charcoal, 9pt) with `maxWidth` for wrapping.
    - [ ] Update `currentY`.

5.  **Key Features & Image Section (Side-by-Side):**

    - [ ] Define column widths (e.g., Features 60%, Image 40%).
    - [ ] **Left Column (Features):**
      - [ ] Draw "Key Features" heading (Poppins Bold, Green, 12pt).
      - [ ] Loop through features:
        - [ ] Draw Checkmark Icon (✓) - (**Placeholder/SVG Path Needed**).
        - [ ] Draw feature text (Inter Regular, Charcoal, 9pt), indented, with wrapping.
        - [ ] Decrement `currentY_features`.
    - [ ] **Right Column (Image):**
      - [ ] Draw Product Image, scaled based on `imageOrientation`, respecting column width.
    - [ ] Calculate lowest Y (`Math.min(currentY_features_end, currentY_image_end)`).
    - [ ] Update main `currentY` below the lowest point + spacing.

6.  **Specifications Section (Full Width):**

    - [ ] Draw Green Header Background Bar.
    - [ ] Draw "Specifications" heading (Poppins Bold, White, 12pt), centered on bar.
    - [ ] Draw Table Background Rectangle (#EFF2EF).
    - [ ] Loop through spec pairs (`Label: Value`):
      - [ ] Draw Label (Inter Regular, Charcoal, 9pt).
      - [ ] Draw Value (Inter Regular, Charcoal, 9pt), aligned.
      - [ ] Draw thin grey horizontal separator line.
      - [ ] Decrement `currentY`.
    - [ ] Update `currentY` below the table + spacing.

7.  **Warranty Section (Full Width):**

    - [ ] Create `getWarrantyText(code)` mapping function (e.g., '1y' -> 'This product is covered by a 12-month warranty...', '2y' -> Placeholder, 'lifetime' -> Placeholder, 'none' -> Placeholder).
    - [ ] Draw mapped Warranty text (Inter Regular, Charcoal, 9pt), with wrapping.
    - [ ] Update `currentY`.

8.  **Shipping Info & Logos Section (Side-by-Side):**

    - [ ] Define column widths.
    - [ ] **Left Column (Shipping):**
      - [ ] Draw "Shipping Information" heading (Poppins Bold, Green, 12pt).
      - [ ] Draw Shipping text directly from `shipping_info` field (Inter Regular, Charcoal, 9pt), with wrapping.
      - [ ] Decrement `currentY_shipping`.
    - [ ] **Right Column (Logos):**
      - [ ] Draw Ireland Logo conditionally - Reuse existing logic, adjust position.
      - [ ] Draw CE Logo conditionally (**Placeholder asset/logic needed**).
      - [ ] Draw PED Logo conditionally (**Placeholder asset/logic needed**).
      - [ ] Arrange logos correctly relative to each other.
    - [ ] Calculate lowest Y.
    - [ ] Update main `currentY`.

9.  **Footer Section (Full Width):**

    - [ ] Draw Green Footer Bar - Reuse existing logic.
    - [ ] Calculate X positions for left-aligned (`www.appliedpi.com`) and right-aligned (`www.ptocompressors.com`) text within content margins.
    - [ ] Draw left and right footer text (Inter Regular, White, 9.6pt), centered vertically.

10. **Testing & Refinement:**
    - [ ] Test frequently using the Preview function after each major section.
    - [ ] Refine coordinates, sizes, and spacing based on preview output.
    - [ ] Implement robust page break logic.

**Assets Needed:**

- [ ] Checkmark Icon (✓) (SVG path or small PNG)
- [ ] CE Logo (PNG/JPG)
- [ ] PED Logo (PNG/JPG)

**Decisions Made/Assumed:**

- Specs Values use Inter-Regular (pending confirmation if Bold needed).
- Subtitle: Inter Regular, 8pt, Grey #808080.
- Headings (Features/Shipping): Poppins Bold, 12pt, Green #2c5234.
- Specs Heading (Bar): Poppins Bold, 12pt, White #FFFFFF.
- Specs Labels/Values: Inter Regular, 9pt, Charcoal #2A2A2A.
- Warranty: Use provided text for '1y', placeholders for others.
- Shipping Info: Use raw data from `shipping_info` field.
- Footer Text: No `|` separator, spaced alignment.
 