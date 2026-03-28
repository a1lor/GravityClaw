// ═══════════════════════════════════════════════════════
// Apple Calendar via CalDAV (iCloud)
// ═══════════════════════════════════════════════════════
//
// Apple Calendar exposes events via CalDAV at:
//   https://caldav.icloud.com
//
// We use the REPORT method with a calendar-query to
// fetch events in a time range, then parse the iCalendar
// (ICS) response into structured events.
//
// Requires: APPLE_CALENDAR_URL env var (the CalDAV
// calendar URL) and APPLE_ID / APPLE_APP_PASSWORD for
// authentication.

interface CalendarEvent {
    summary: string;
    start: Date;
    end: Date;
    location: string;
    description: string;
    allDay: boolean;
}

// ── ICS Parser (lightweight, no dependencies) ────────
function parseIcsEvents(icsData: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const vevents = icsData.split("BEGIN:VEVENT");

    for (let i = 1; i < vevents.length; i++) {
        const block = vevents[i].split("END:VEVENT")[0];

        const get = (key: string): string => {
            const regex = new RegExp(`^${key}[;:](.*)$`, "m");
            const match = block.match(regex);
            return match ? match[1].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim() : "";
        };

        const summary = get("SUMMARY");
        const location = get("LOCATION");
        const description = get("DESCRIPTION");
        const dtstart = get("DTSTART");
        const dtend = get("DTEND");

        const allDay = !dtstart.includes("T");
        const start = parseIcsDate(dtstart);
        const end = dtend ? parseIcsDate(dtend) : start;

        if (start) {
            events.push({ summary, start, end: end || start, location, description, allDay });
        }
    }

    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function parseIcsDate(raw: string): Date | null {
    // Handle TZID format: TZID=Europe/Paris:20260312T090000
    const tzidMatch = raw.match(/TZID=[^:]+:(\d{8}T\d{6})/);
    if (tzidMatch) {
        return parseDateString(tzidMatch[1]);
    }
    // Handle UTC format: 20260312T090000Z
    const utcMatch = raw.match(/(\d{8}T\d{6})Z?/);
    if (utcMatch) {
        return parseDateString(utcMatch[1]);
    }
    // Handle date-only: 20260312
    const dateMatch = raw.match(/(\d{8})/);
    if (dateMatch) {
        const s = dateMatch[1];
        return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    }
    return null;
}

function parseDateString(s: string): Date {
    // 20260312T090000
    return new Date(
        +s.slice(0, 4),
        +s.slice(4, 6) - 1,
        +s.slice(6, 8),
        +s.slice(9, 11),
        +s.slice(11, 13),
        +s.slice(13, 15),
    );
}

// ── ICS Fetch ────────────────────────────────────────
export async function fetchIcsEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    const icsUrl = process.env.APPLE_CALENDAR_ICS_URL;

    if (!icsUrl) {
        throw new Error(
            "Apple Calendar not configured. Set APPLE_CALENDAR_ICS_URL environment variable."
        );
    }

    const res = await fetch(icsUrl);
    if (!res.ok) {
        throw new Error(`Calendar fetch failed: ${res.status} ${res.statusText}`);
    }

    const icsData = await res.text();
    const allEvents = parseIcsEvents(icsData);

    // Filter events to the requested time range
    return allEvents.filter(e => {
        // Event starts before the window ends AND ends after the window starts
        return e.start.getTime() < endDate.getTime() && e.end.getTime() >= startDate.getTime();
    });
}

// ── Format ───────────────────────────────────────────
function formatEvent(event: CalendarEvent): string {
    const fmtTime = (d: Date) =>
        d.toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
            hour12: false,
            timeZone: "Europe/Paris",
        });

    // Parse summary: "Course Name | Cours | Prof Name" → extract just "Course Name"
    let displayName = event.summary || "(No title)";
    if (event.summary.includes(" | Cours | ")) {
        displayName = event.summary.split(" | Cours | ")[0].trim();
    } else if (event.summary.includes(" | ")) {
        // Fallback for other separators
        displayName = event.summary.split(" | ")[0].trim();
    }

    const loc = event.location ? ` — ${event.location}` : "";

    if (event.allDay) {
        const dateStr = event.start.toLocaleDateString("fr-FR", { dateStyle: "short", timeZone: "Europe/Paris" });
        return `• ${dateStr} (all day): ${displayName}${loc}`;
    }

    return `• ${fmtTime(event.start)} → ${fmtTime(event.end)}: ${displayName}${loc}`;
}

// ── Public API ───────────────────────────────────────

export async function getUpcomingEvents(days: number = 7): Promise<string> {
    try {
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const events = await fetchIcsEvents(now, future);

        if (events.length === 0) return `No events in the next ${days} day(s).`;
        return `📅 ${events.length} event(s) in the next ${days} day(s):\n\n${events.map(formatEvent).join("\n")}`;
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}

export async function getTodayEvents(): Promise<string> {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const events = await fetchIcsEvents(startOfDay, endOfDay);

        if (events.length === 0) return "No events today.";
        return `📅 Today's schedule (${events.length} event(s)):\n\n${events.map(formatEvent).join("\n")}`;
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}

export async function searchEvents(query: string, days: number = 30): Promise<string> {
    try {
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const events = await fetchIcsEvents(now, future);
        const q = query.toLowerCase();
        const filtered = events.filter(
            (e) =>
                e.summary.toLowerCase().includes(q) ||
                e.location.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q),
        );

        if (filtered.length === 0) return `No events matching "${query}" in the next ${days} days.`;
        return `📅 ${filtered.length} event(s) matching "${query}":\n\n${filtered.map(formatEvent).join("\n")}`;
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}
