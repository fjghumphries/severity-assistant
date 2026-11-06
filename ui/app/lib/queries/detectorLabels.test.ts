import {
  decodeSettingsObjectId,
  fallbackDetectorLabel,
} from "./detectorLabels";

const ID =
  "vu9U3hXa3q0AAAABAB5idWlsdGluOm9zLXNlcnZpY2VzLW1vbml0b3JpbmcABEhPU1QAEDA0N0VCRTFENUYzREQyQUMAJGIxMjZhY2QxLTdmZWQtM2E0YS04NTIzLWEyYzNkNmIzYjBkNr7vVN4V2t6t";

it("extracts schema and scope from a settings object id", () => {
  expect(decodeSettingsObjectId(ID)).toMatchObject({
    schemaId: "builtin:os-services-monitoring",
    scopeType: "HOST",
    scopeId: "047EBE1D5F3DD2AC",
  });
  expect(fallbackDetectorLabel(ID)).toBe(
    "os-services-monitoring (HOST 047EBE1D5F3DD2AC)",
  );
});

it("falls back to the raw id when it cannot be decoded", () => {
  expect(fallbackDetectorLabel("not base64 !!")).toBe("not base64 !!");
});
