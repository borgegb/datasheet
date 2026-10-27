# October Declaration Update

Scope: Rafael's six approved PDF references attached to the 21 October 2026 email,
plus the download-filename correction. The EUR 125 local-folder feature is excluded.

## Implemented

- Fixed receiver, Cat. II blast-pot and Cat. III blast-pot Owner's Manual copies.
- Matching serialised variants with per-unit date, year and serial number.
- Receiver-specific PED-only wording, 32L/12 bar specifications and 20 bar PT.
- Separate required compressor serial field on the serialised receiver declaration.
- Approved HPi certificate references, Irish Notified Body address and valve details.
- Reference-specific page breaks, CE placement and boxed date/signature section.
- Existing private signature controls; only the previously approved BP40L Hydrostatic
  document continues to render blue ink.
- Download names based on the document number and revision. Internal storage paths
  remain unique; old PDFs and certificate records are not rewritten.

## Working Assumptions

- The three manuals retain the supplied declaration number, date and revision:
  OM01 / 02 / 19 October 2026; OM02 and OM03 / 01 / 20 October 2026.
  Rafael has not yet answered the question about making manual dates/revisions
  editable. These values are centralised in `lib/certifications/reference.ts`.
- The yellow compressor serial field is independent of the receiver's AP-YY-#####
  serial. It accepts letters, numbers and common serial separators, up to 80 characters.
- No separate Module C2 certificate/report field is added, as confirmed by Rafael.
- The receiver generator replaces the previous whole-compressor DoC selection.
  The 20L, SEP and Hydrostatic layouts remain unchanged.

## Release

1. Review the six synthetic mock PDFs under `output/pdf/october-update/`.
2. Apply `supabase/migrations/20261027193149_approved_october_declarations.sql`
   through the normal migration workflow. It updates only Applied's three Cat. III
   blast products and VM-A-0003 receiver; the receiver Hydrostatic profile uses 20 bar.
3. Verify all four target mappings exist and now carry the approved references.
4. Deploy the branch. Until migration, signed generation with stale references is
   blocked rather than silently printing different certificate numbers.
5. Verify one receiver and each blast category, both manual and serialised, on the
   deployed version. Any production test records require separate deletion approval.

No migration, production document creation or deployment is performed by the tests.

Production migration `20261027193149` was applied on 27 October 2026 with the
owner's explicit approval. All four mappings were verified; the 110 existing
certificate records and all unaffected products retained their pre-migration
fingerprints. The receiver signature remains in private storage. Rafael retains
Member access. BP200LX Hydrostatic signing remains on its previous hold.

## Verification Results

- 444 focused checks pass across the declaration, signature, product matrix,
  revision and receiver-release suites.
- The isolated PostgreSQL migration test passes, including repeat application,
  organization scoping and preservation of existing certificates.
- All twelve mock PDF pages were rendered and visually reviewed. Text comparisons
  against all six references found no missing or added wording after normalising
  punctuation and the intentionally different per-unit example values.
- Browser checks pass at 1440, 768, 390 and 320 pixels, including required compressor
  serial validation, fixed manual metadata and resetting unit fields on product change.
- Production build passes; required logos and fonts are included in the route trace.
- Project-wide `tsc --noEmit` still reports pre-existing errors in unrelated routes,
  image cropping and legacy PDF code. None are in the changed implementation files.

## Verification Commands

```sh
npm run test:october-declarations
npm run test:eu-doc-signature
npm run test:product-matrix
npm run test:document-revisions
node scripts/test-pto-release.cjs
PGLITE_TEST_MODULE=/path/to/@electric-sql/pglite node scripts/test-october-declarations-migration.cjs
```
