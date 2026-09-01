/**
 * date.ts
 * Timezone-Safe Local Date Formatting, Range Utilities, and Industry-Standard Schedule Matching for LPU Events
 */

/**
 * Returns 'YYYY-MM-DD' representing the local calendar date of the input.
 * Avoids the -1 day shift caused by UTC .toISOString().split('T')[0] in positive UTC timezones.
 */
export function toLocalDateString(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns 'DD/MM/YYYY' representing the local calendar date of the input.
 */
export function toDisplayDateString(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Converts 'YYYY-MM-DD' to 'DD/MM/YYYY'
 */
export function isoToDisplayDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return iso;
}

/**
 * Converts 'DD/MM/YYYY' (or 'DD-MM-YYYY') to 'YYYY-MM-DD'
 */
export function displayToIsoDate(disp: string): string | null {
  if (!disp) return null;
  const cleaned = disp.trim().replace(/[-.]/g, '/');
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = `20${year}`;
    if (year.length === 4) {
      const dNum = parseInt(day, 10);
      const mNum = parseInt(month, 10);
      const yNum = parseInt(year, 10);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31 && yNum >= 2000) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  return null;
}

/**
 * Formats start date and end date into DD/MM/YYYY or DD/MM/YYYY – DD/MM/YYYY if spanning multiple days.
 */
export function formatEventDateRange(startInput: string | Date | number, endInput?: string | Date | number | null): string {
  if (!startInput) return '';
  const start = typeof startInput === 'string' || typeof startInput === 'number' ? new Date(startInput) : startInput;
  if (isNaN(start.getTime())) return '';

  const startDateFormatted = toDisplayDateString(start);
  if (!endInput) return startDateFormatted;

  const end = typeof endInput === 'string' || typeof endInput === 'number' ? new Date(endInput) : endInput;
  if (isNaN(end.getTime())) return startDateFormatted;

  const isMultiDay =
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate();

  if (isMultiDay) {
    const endDateFormatted = toDisplayDateString(end);
    return `${startDateFormatted} – ${endDateFormatted}`;
  }

  return startDateFormatted;
}

/**
 * Evaluates whether an event is active/occurring on a specific local calendar date (YYYY-MM-DD).
 */
export function isEventOnDate(
  startInput?: string | Date | number | null,
  endInput?: string | Date | number | null,
  targetDateStr?: string | null
): boolean {
  if (!startInput || !targetDateStr) return false;
  const startStr = toLocalDateString(startInput);
  if (!startStr) return false;
  const endStr = endInput ? toLocalDateString(endInput) : startStr;

  return startStr === targetDateStr || (targetDateStr >= startStr && targetDateStr <= endStr);
}

/**
 * Determines if an event occurs Today in the user's local timezone.
 */
export function isEventToday(
  startInput?: string | Date | number | null,
  endInput?: string | Date | number | null,
  now: Date = new Date()
): boolean {
  const todayStr = toLocalDateString(now);
  return isEventOnDate(startInput, endInput, todayStr);
}

/**
 * Determines if an event occurs Tomorrow in the user's local timezone.
 */
export function isEventTomorrow(
  startInput?: string | Date | number | null,
  endInput?: string | Date | number | null,
  now: Date = new Date()
): boolean {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = toLocalDateString(tomorrow);
  return isEventOnDate(startInput, endInput, tomorrowStr);
}

/**
 * Determines if an event occurs within the current week (from today through end of current week or next 7 days).
 */
export function isEventThisWeek(
  startInput?: string | Date | number | null,
  endInput?: string | Date | number | null,
  now: Date = new Date()
): boolean {
  if (!startInput) return false;
  const start = new Date(startInput);
  if (isNaN(start.getTime())) return false;
  const end = endInput ? new Date(endInput) : start;

  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const day = now.getDay();
  // Sunday is 0, Monday is 1 -> calculate upcoming Sunday
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59, 999);

  return start <= endOfWeek && end >= startOfWeek;
}

/**
 * Determines if an event occurs during the upcoming weekend (Saturday or Sunday).
 */
export function isEventThisWeekend(
  startInput?: string | Date | number | null,
  endInput?: string | Date | number | null,
  now: Date = new Date()
): boolean {
  if (!startInput) return false;
  const start = new Date(startInput);
  if (isNaN(start.getTime())) return false;
  const end = endInput ? new Date(endInput) : start;

  const day = now.getDay();
  const daysUntilSat = day === 6 ? 0 : day === 0 ? -1 : 6 - day;
  const startOfSat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat, 0, 0, 0, 0);
  const endOfSun = new Date(startOfSat.getFullYear(), startOfSat.getMonth(), startOfSat.getDate() + 1, 23, 59, 59, 999);

  return start <= endOfSun && end >= startOfSat;
}

/**
 * Determines if an event STARTS today (strictly starting on today's local calendar date).
 * Excludes events that started earlier and are only continuing.
 */
export function isEventStartingToday(
  startInput: string | Date | number,
  endInput?: string | Date | number | null,
  now: Date = new Date()
): boolean {
  if (!startInput) return false;
  const start = typeof startInput === 'string' || typeof startInput === 'number' ? new Date(startInput) : startInput;
  if (isNaN(start.getTime())) return false;

  const todayStr = toLocalDateString(now);
  const eventStartDayStr = toLocalDateString(start);

  if (eventStartDayStr !== todayStr) {
    return false;
  }

  if (endInput) {
    const end = typeof endInput === 'string' || typeof endInput === 'number' ? new Date(endInput) : endInput;
    if (!isNaN(end.getTime()) && end.getTime() < now.getTime()) {
      return false; // Event already concluded
    }
  }

  return true;
}

/**
 * Industry-standard schedule matcher matching filters like 'today', 'tomorrow', 'this_week', 'weekend', 'upcoming', or custom target date.
 */
export function matchesScheduleFilter(
  event: { start_at: string; end_at?: string | null },
  filterType: string = 'all',
  customTargetDate?: string | null,
  now: Date = new Date()
): boolean {
  if (!event || !event.start_at) return false;

  if (customTargetDate) {
    return isEventOnDate(event.start_at, event.end_at, customTargetDate);
  }

  switch (filterType.toLowerCase()) {
    case 'all':
      return true;
    case 'today':
      return isEventToday(event.start_at, event.end_at, now);
    case 'tomorrow':
      return isEventTomorrow(event.start_at, event.end_at, now);
    case 'this_week':
      return isEventThisWeek(event.start_at, event.end_at, now);
    case 'weekend':
      return isEventThisWeekend(event.start_at, event.end_at, now);
    case 'upcoming': {
      const end = event.end_at ? new Date(event.end_at) : new Date(event.start_at);
      return !isNaN(end.getTime()) && end.getTime() >= now.getTime();
    }
    default:
      return true;
  }
}
