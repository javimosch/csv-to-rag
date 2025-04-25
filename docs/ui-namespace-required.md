# UI Change: Namespace Field Required for File Upload

## Summary
The upload UI for embedding files now requires the "namespace" field to be filled. This is visually indicated with a red asterisk and helper text. If the field is left empty, the upload is prevented and an error message is shown.

## Implementation Details
- The namespace input now has a required attribute and a red asterisk in the label.
- Helper text and an error message placeholder are present.
- Validation is performed in JavaScript before submitting the upload. If empty, an error is shown and upload is blocked.
- Logging is added before upload and in the catch block for debugging (see user rules).

## Accessibility
- The required field is visually and programmatically marked (`aria-required`).

## Related Files
- `scripts/deno-ui/ui/upload.js`
- `scripts/deno-ui/app/files.js`

---

_Last updated: 2025-04-25_
