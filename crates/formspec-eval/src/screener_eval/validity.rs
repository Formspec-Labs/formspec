//! Result validity (`resultValidity`) and ISO 8601 duration parsing.

use chrono::{DateTime, Days, FixedOffset, Months, TimeDelta};
use serde_json::Value;

use crate::types::determination::ValidityBlock;

/// Build validity block from screener `resultValidity` (screener-spec §9.2, SC-21).
///
/// Computes `validUntil = now + resultValidity` as RFC 3339. Returns `None`
/// when the screener declares no `resultValidity`, when `now` is not RFC 3339,
/// or when the duration string is not a parseable ISO 8601 duration —
/// surfacing a SC-21 conformance defect by absence rather than emitting a
/// schema-invalid empty `validUntil` (schema requires `format: date-time`).
pub(crate) fn build_validity(screener: &Value, now_str: &str) -> Option<ValidityBlock> {
    let duration_str = screener.get("resultValidity").and_then(Value::as_str)?;
    let now = DateTime::parse_from_rfc3339(now_str).ok()?;
    let duration = parse_iso8601_duration(duration_str)?;
    let valid_until = duration.add_to(now)?;
    Some(ValidityBlock {
        valid_until: valid_until.to_rfc3339(),
        result_validity: duration_str.to_string(),
    })
}

/// ISO 8601 duration components — the closed subset Screener uses.
///
/// Grammar (per ISO 8601 §4.4.4.2, restricted): `P[nY][nM][nW][nD][T[nH][nM][nS]]`.
/// At least one component must be present. Components are non-negative integers
/// (seconds may carry a single decimal fraction). Weeks combine with other
/// components (we don't enforce the "weeks-only" pure form of §4.4.4.3).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Iso8601Duration {
    /// `nY` — calendar years.
    years: u32,
    /// `nM` (date section) — calendar months.
    months: u32,
    /// `nW` — weeks (7-day blocks).
    weeks: u32,
    /// `nD` — calendar days.
    days: u32,
    /// `nH` (time section) — hours.
    hours: u64,
    /// `nM` (time section) — minutes.
    minutes: u64,
    /// `nS` — seconds (integer; fractional seconds not supported).
    seconds: u64,
}

impl Iso8601Duration {
    /// Add this duration to an RFC 3339 timestamp.
    ///
    /// Calendar units (years, months) use `chrono::Months` (end-of-month clamp:
    /// 2024-02-29 + P1Y → 2025-02-28). Week/day units use `chrono::Days`
    /// (preserves offset). Time units use fixed `TimeDelta` seconds.
    /// Returns `None` on arithmetic overflow.
    fn add_to(self, dt: DateTime<FixedOffset>) -> Option<DateTime<FixedOffset>> {
        let total_months =
            u32::try_from(u64::from(self.years) * 12 + u64::from(self.months)).ok()?;
        let total_days = u64::from(self.weeks) * 7 + u64::from(self.days);
        let total_seconds = self
            .hours
            .checked_mul(3600)?
            .checked_add(self.minutes.checked_mul(60)?)?
            .checked_add(self.seconds)?;

        let mut out = dt;
        if total_months > 0 {
            out = out.checked_add_months(Months::new(total_months))?;
        }
        if total_days > 0 {
            out = out.checked_add_days(Days::new(total_days))?;
        }
        if total_seconds > 0 {
            let delta = TimeDelta::try_seconds(i64::try_from(total_seconds).ok()?)?;
            out = out.checked_add_signed(delta)?;
        }
        Some(out)
    }
}

/// Parse an ISO 8601 duration string into [`Iso8601Duration`].
///
/// Accepts the closed subset `P[nY][nM][nW][nD][T[nH][nM][nS]]` with
/// non-negative integer components. Returns `None` for any malformed input
/// (missing leading `P`, no components, unknown unit letter, lowercase units,
/// negative values, decimal points, stray characters, empty `T` section).
fn parse_iso8601_duration(s: &str) -> Option<Iso8601Duration> {
    let rest = s.strip_prefix('P')?;
    if rest.is_empty() {
        return None;
    }

    let (date_part, time_part) = match rest.split_once('T') {
        Some((d, t)) => {
            if t.is_empty() {
                return None;
            }
            (d, Some(t))
        }
        None => (rest, None),
    };

    let mut dur = Iso8601Duration::default();
    let mut any = false;

    if !date_part.is_empty() {
        let mut iter = date_part.chars().peekable();
        let mut last_unit_rank = 0u8;
        while iter.peek().is_some() {
            let (n, unit) = read_component(&mut iter)?;
            let rank = match unit {
                'Y' => 1,
                'M' => 2,
                'W' => 3,
                'D' => 4,
                _ => return None,
            };
            if rank <= last_unit_rank {
                return None;
            }
            last_unit_rank = rank;
            let n32 = u32::try_from(n).ok()?;
            match unit {
                'Y' => dur.years = n32,
                'M' => dur.months = n32,
                'W' => dur.weeks = n32,
                'D' => dur.days = n32,
                _ => unreachable!(),
            }
            any = true;
        }
    }

    if let Some(time) = time_part {
        let mut iter = time.chars().peekable();
        let mut last_unit_rank = 0u8;
        while iter.peek().is_some() {
            let (n, unit) = read_component(&mut iter)?;
            let rank = match unit {
                'H' => 1,
                'M' => 2,
                'S' => 3,
                _ => return None,
            };
            if rank <= last_unit_rank {
                return None;
            }
            last_unit_rank = rank;
            match unit {
                'H' => dur.hours = n,
                'M' => dur.minutes = n,
                'S' => dur.seconds = n,
                _ => unreachable!(),
            }
            any = true;
        }
    }

    if !any {
        return None;
    }
    Some(dur)
}

/// Read one `[digits][unit-letter]` component. Digits are non-negative integer
/// (no sign, no decimal). Unit is a single ASCII uppercase letter.
fn read_component(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) -> Option<(u64, char)> {
    let mut digits = String::new();
    while let Some(&c) = iter.peek() {
        if c.is_ascii_digit() {
            digits.push(c);
            iter.next();
        } else {
            break;
        }
    }
    if digits.is_empty() {
        return None;
    }
    let n: u64 = digits.parse().ok()?;
    let unit = iter.next()?;
    if !unit.is_ascii_uppercase() {
        return None;
    }
    Some((n, unit))
}
