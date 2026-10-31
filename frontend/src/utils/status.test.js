import { describe, expect, it } from "vitest";
import { formatEtaDate, getStatusLabel } from "./status";

describe("shared status labels and ETA dates", () => {
  it("uses the same human-readable mapping for pending status values", () => {
    expect(getStatusLabel("ORDER_CREATED")).toBe("Pending");
    expect(getStatusLabel("Pending")).toBe("Pending");
    expect(getStatusLabel("IN_TRANSIT")).toBe("In transit");
    expect(getStatusLabel("DELIVERED")).toBe("Delivered");
  });

  it("formats ETA as a date only in en-IN format", () => {
    expect(formatEtaDate("2026-11-02T12:30:45.000Z")).toMatch(/^Mon, 2 Nov 2026$/);
    expect(formatEtaDate(null)).toBe("—");
  });
});
