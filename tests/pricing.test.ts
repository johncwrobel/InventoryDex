import { describe, it, expect } from "vitest";
import { recentChange, classifyListPrice } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function snap(market: number | null, daysBack: number) {
  return { market, capturedAt: daysAgo(daysBack) };
}

// ---------------------------------------------------------------------------
// recentChange
// ---------------------------------------------------------------------------

describe("recentChange", () => {
  it("returns null when history is empty", () => {
    expect(recentChange([], 7)).toBeNull();
  });

  it("returns null when there is only one snapshot", () => {
    expect(recentChange([snap(100, 0)], 7)).toBeNull();
  });

  it("returns null when the oldest snapshot is less than half the window away", () => {
    // Only 3 days of history for a 7-day window — not enough
    const history = [snap(110, 0), snap(100, 3)];
    expect(recentChange(history, 7)).toBeNull();
  });

  it("returns null when the latest market price is null", () => {
    const history = [snap(null, 0), snap(100, 7)];
    expect(recentChange(history, 7)).toBeNull();
  });

  it("returns null when the historical market price is null", () => {
    const history = [snap(110, 0), snap(null, 7)];
    expect(recentChange(history, 7)).toBeNull();
  });

  it("computes a positive change correctly", () => {
    // 100 → 110 over 7 days = +10%
    const history = [snap(110, 0), snap(100, 7)];
    const result = recentChange(history, 7);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(10, 1);
  });

  it("computes a negative change correctly", () => {
    // 100 → 90 over 7 days = -10%
    const history = [snap(90, 0), snap(100, 7)];
    const result = recentChange(history, 7);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(-10, 1);
  });

  it("picks the snapshot closest to the cutoff date", () => {
    // 3 snapshots; the one at 6 days is closer to the 7-day cutoff than the one at 4 days
    const history = [snap(120, 0), snap(90, 4), snap(100, 6)];
    const result = recentChange(history, 7);
    // Should compare 120 vs 100 (the 6-day snapshot)
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(20, 1);
  });

  it("handles 30-day windows", () => {
    const history = [snap(150, 0), snap(100, 30)];
    const result = recentChange(history, 30);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(50, 1);
  });
});

// ---------------------------------------------------------------------------
// classifyListPrice
// ---------------------------------------------------------------------------

describe("classifyListPrice", () => {
  it("returns null when listPrice is null", () => {
    expect(classifyListPrice(null, 100, 15)).toBeNull();
  });

  it("returns null when marketPrice is null", () => {
    expect(classifyListPrice(100, null, 15)).toBeNull();
  });

  it("returns null when prices are within the threshold", () => {
    // 100 list vs 100 market = 0% gap
    expect(classifyListPrice(100, 100, 15)).toBeNull();
    // 110 list vs 100 market = 10% gap (under 15% threshold)
    expect(classifyListPrice(110, 100, 15)).toBeNull();
  });

  it("flags as underpriced when list is significantly below market", () => {
    // 80 list vs 100 market = -20% gap (below -15% threshold)
    expect(classifyListPrice(80, 100, 15)).toBe("underpriced");
  });

  it("flags as overpriced when list is significantly above market", () => {
    // 120 list vs 100 market = +20% gap (above +15% threshold)
    expect(classifyListPrice(120, 100, 15)).toBe("overpriced");
  });

  it("works with string inputs", () => {
    expect(classifyListPrice("80", "100", 15)).toBe("underpriced");
    expect(classifyListPrice("120", "100", 15)).toBe("overpriced");
  });

  it("returns null for boundary values exactly at the threshold", () => {
    // The check is strict (< and >), so exactly ±15% does NOT trigger a flag.
    expect(classifyListPrice(85, 100, 15)).toBeNull();  // exactly -15%
    expect(classifyListPrice(115, 100, 15)).toBeNull(); // exactly +15%
  });

  it("respects a custom threshold", () => {
    // With a 5% threshold, 106 list vs 100 market is overpriced
    expect(classifyListPrice(106, 100, 5)).toBe("overpriced");
    // With a 15% threshold, the same gap is within range
    expect(classifyListPrice(106, 100, 15)).toBeNull();
  });
});
