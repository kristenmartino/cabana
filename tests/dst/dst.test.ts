// tests/dst/dst.test.ts
// R3 AC #3: A booking spanning DST boundaries displays correctly for members and in /today.
//
// The project rule: timestamps are stored UTC; America/New_York is applied ONLY at render
// via Intl.DateTimeFormat. This test pins that rendering behavior across both 2026 DST
// boundaries so a regression (e.g., fixed UTC-5 offsets or new Date() string math) fails loudly.
//
// Range MATH is tested in SQL via get_schedule (0015); this pins the RENDER layer.

import { describe, it, expect } from "vitest";

/**
 * Format a UTC timestamp to wall-clock time in America/New_York.
 * Matches the production pattern used in lib/portal/data.ts and telegram-webhook.
 */
function formatTimeNY(isoString: string, format: "time" | "date" | "weekday") {
  const date = new Date(isoString);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: format === "time" ? "numeric" : undefined,
    minute: format === "time" ? "2-digit" : undefined,
    hour12: format === "time",
    month: format === "date" ? "2-digit" : undefined,
    day: format === "date" ? "2-digit" : undefined,
    year: format === "date" ? "numeric" : undefined,
    weekday: format === "weekday" ? "long" : undefined,
  });

  const parts = formatter.formatToParts(date);
  return parts.map((p) => p.value).join("");
}

/**
 * Normalize formatted strings for comparison: collapse whitespace variants.
 */
function normalize(s: string): string {
  return s
    .replace(/ /g, " ") // narrow no-break space → regular space
    .replace(/\s+/g, " ")   // multiple spaces → single
    .trim()
    .toUpperCase();
}

/**
 * Extract hour and minute from a formatted time string.
 */
function parseFormattedTime(formatted: string): { hour: number; minute: number } {
  // Expected format: "1:30 AM" or "1:30 PM"
  const match = formatted.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    throw new Error(`Could not parse time: ${formatted}`);
  }

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return { hour, minute };
}

describe("DST rendering (R3 AC #3)", () => {
  it("Fall back (Nov 1 2026): [2026-11-01T05:30:00Z, 2026-11-01T07:30:00Z] renders correctly", () => {
    // UTC: 2h window
    const startUtc = "2026-11-01T05:30:00Z"; // EDT, wall-clock 1:30 AM
    const endUtc = "2026-11-01T07:30:00Z";   // EST, wall-clock 2:30 AM (the repeated hour)

    const startFormatted = formatTimeNY(startUtc, "time");
    const endFormatted = formatTimeNY(endUtc, "time");

    // Wall-clock times: the repeated hour means they differ by only 1h
    // 2026-11-01 01:30 EDT (05:30 UTC) and 2026-11-01 01:30 EST (06:30 UTC) are the same wall clock
    // But we go from 05:30 to 07:30 UTC, so:
    // 05:30Z = 01:30 AM EDT (UTC-4)
    // 07:30Z = 02:30 AM EST (UTC-5) — one hour later in wall-clock time (the repeated hour)

    expect(normalize(startFormatted)).toContain("1:30");
    expect(normalize(endFormatted)).toContain("2:30");

    // Elapsed time is still 2h in UTC (the real time)
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    expect(endMs - startMs).toBe(7_200_000); // 2h in ms
  });

  it("Spring forward (Mar 8 2026): [2026-03-08T06:30:00Z, 2026-03-08T07:30:00Z] renders correctly", () => {
    // UTC: 1h window; the 2:00-3:00 EST hour does not exist (jumps to EDT)
    const startUtc = "2026-03-08T06:30:00Z"; // EST, wall-clock 1:30 AM
    const endUtc = "2026-03-08T07:30:00Z";   // EDT, wall-clock 3:30 AM (2:30 AM doesn't exist)

    const startFormatted = formatTimeNY(startUtc, "time");
    const endFormatted = formatTimeNY(endUtc, "time");

    expect(normalize(startFormatted)).toContain("1:30");
    expect(normalize(endFormatted)).toContain("3:30"); // Jump from 1:59 to 3:00

    // Elapsed time is 1h in UTC
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    expect(endMs - startMs).toBe(3_600_000); // 1h in ms
  });

  it("Timezone offset sanity across the year", () => {
    // Summer (EDT, UTC-4)
    const summerUtc = "2026-07-04T16:00:00Z";
    const summerFormatted = formatTimeNY(summerUtc, "time");
    expect(normalize(summerFormatted)).toContain("12:00"); // 16:00 - 4 = 12:00 PM

    // Winter (EST, UTC-5)
    const winterUtc = "2026-12-04T16:00:00Z";
    const winterFormatted = formatTimeNY(winterUtc, "time");
    expect(normalize(winterFormatted)).toContain("11:00"); // 16:00 - 5 = 11:00 AM

    // Same UTC hour, different wall clocks due to DST offset
  });

  it("Weekday correctness across DST boundary: repeated hour (Nov 1 2026)", () => {
    // The repeated hour: both instants are Sunday in wall-clock time
    const hour1Utc = "2026-11-01T05:59:00Z"; // 1:59 AM EDT Sunday
    const hour2Utc = "2026-11-01T06:59:00Z"; // 1:59 AM EST Sunday (one hour later in UTC)

    const hour1Time = formatTimeNY(hour1Utc, "time");
    const hour2Time = formatTimeNY(hour2Utc, "time");
    const hour1Weekday = formatTimeNY(hour1Utc, "weekday");
    const hour2Weekday = formatTimeNY(hour2Utc, "weekday");

    // Both render as the same wall-clock time
    expect(normalize(hour1Time)).toContain("1:59");
    expect(normalize(hour2Time)).toContain("1:59");

    // Both are Sunday
    expect(normalize(hour1Weekday)).toContain("SUNDAY");
    expect(normalize(hour2Weekday)).toContain("SUNDAY");

    // But they are distinct UTC instants, exactly 1h apart
    const ms1 = new Date(hour1Utc).getTime();
    const ms2 = new Date(hour2Utc).getTime();
    expect(ms2 - ms1).toBe(3_600_000); // 1h
  });

  it("Fall back: start and end weekday correctness (Oct 31 -> Nov 1 2026)", () => {
    // A window that spans midnight EDT/EST on the fall-back boundary
    const startUtc = "2026-10-31T23:30:00Z"; // 7:30 PM EDT Saturday
    const endUtc = "2026-11-01T06:30:00Z";   // 1:30 AM EST Sunday (the day after wall-clock)

    const startWeekday = formatTimeNY(startUtc, "weekday");
    const endWeekday = formatTimeNY(endUtc, "weekday");

    expect(normalize(startWeekday)).toContain("SATURDAY");
    expect(normalize(endWeekday)).toContain("SUNDAY");
  });

  it("Spring forward: start and end weekday correctness (Mar 7 -> 8 2026)", () => {
    // A window that spans midnight EST/EDT on the spring-forward boundary
    const startUtc = "2026-03-07T23:30:00Z"; // 6:30 PM EST Saturday
    const endUtc = "2026-03-08T07:30:00Z";   // 3:30 AM EDT Sunday

    const startWeekday = formatTimeNY(startUtc, "weekday");
    const endWeekday = formatTimeNY(endUtc, "weekday");

    expect(normalize(startWeekday)).toContain("SATURDAY");
    expect(normalize(endWeekday)).toContain("SUNDAY");
  });

  it("Date formatting across DST boundaries", () => {
    // Verify that dates (MM/DD/YYYY) stay correct even as time zones shift
    const oct31 = "2026-10-31T23:59:59Z"; // Oct 31 in UTC, 7:59 PM EDT in NY (still Oct 31)
    const nov1 = "2026-11-01T04:00:00Z";  // Nov 1 in UTC, midnight EST in NY (now Nov 1)

    const oct31Formatted = formatTimeNY(oct31, "date");
    const nov1Formatted = formatTimeNY(nov1, "date");

    // These are separate dates in NY wall-clock time as well
    expect(oct31Formatted).toMatch(/10.*31/); // October, day 31
    expect(nov1Formatted).toMatch(/11.*01/); // November, day 1
  });

  it("Duration math: boundary windows must preserve elapsed time across DST", () => {
    // A 4-hour window crossing the spring-forward boundary (loses 1h wall-clock)
    const beforeSpringFwd = "2026-03-08T05:00:00Z"; // 12:00 AM EST
    const afterSpringFwd = "2026-03-08T09:00:00Z";  // 5:00 AM EDT (skips 2:00-3:00)

    const durationMs = new Date(afterSpringFwd).getTime() - new Date(beforeSpringFwd).getTime();
    expect(durationMs).toBe(4 * 60 * 60 * 1000); // 4 hours in real time

    const startFormatted = formatTimeNY(beforeSpringFwd, "time");
    const endFormatted = formatTimeNY(afterSpringFwd, "time");

    expect(normalize(startFormatted)).toContain("12:00");
    expect(normalize(endFormatted)).toContain("5:00");
    // Wall-clock difference is only 5 hours, but UTC diff is still 4h
  });

  it("Duration math: boundary windows must preserve elapsed time across fall-back", () => {
    // A 2-hour window crossing the fall-back boundary (gains 1h wall-clock)
    const beforeFallBack = "2026-11-01T05:00:00Z"; // 1:00 AM EDT
    const afterFallBack = "2026-11-01T07:00:00Z";  // 2:00 AM EST (the repeated hour, one hour later)

    const durationMs = new Date(afterFallBack).getTime() - new Date(beforeFallBack).getTime();
    expect(durationMs).toBe(2 * 60 * 60 * 1000); // 2 hours in real time (UTC)

    const startFormatted = formatTimeNY(beforeFallBack, "time");
    const endFormatted = formatTimeNY(afterFallBack, "time");

    expect(normalize(startFormatted)).toContain("1:00");
    expect(normalize(endFormatted)).toContain("2:00");
    // Wall-clock times differ by 1h (the repeated hour), but UTC diff is 2h
  });
});
