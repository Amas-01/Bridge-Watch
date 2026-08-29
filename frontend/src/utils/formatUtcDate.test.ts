import { formatUtcDate } from "./formatUtcDate";

describe("formatUtcDate", () => {
  it("formats a date-only string using its UTC calendar day, not the local one", () => {
    expect(formatUtcDate("2024-01-15")).toBe("Jan 15");
  });

  it("does not shift to the previous day for a UTC midnight timestamp", () => {
    expect(formatUtcDate("2024-03-01T00:00:00.000Z")).toBe("Mar 1");
  });

  it("keeps the UTC calendar day for a late-night UTC timestamp", () => {
    expect(formatUtcDate("2024-06-30T23:45:00.000Z")).toBe("Jun 30");
  });
});
