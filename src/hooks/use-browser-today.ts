"use client";

import { useEffect, useState } from "react";
import { currentTimeOfDay } from "@/lib/utils/schedule-days";
import { todayInZone } from "@/lib/utils/dates";

/**
 * Corrects a server-rendered date/time against the current clock, re-checked
 * on an interval so "current vs upcoming" status advances and a midnight
 * rollover is noticed without a page refresh. First render returns the
 * server values verbatim (nothing clock-dependent is read during render, so
 * there's no hydration mismatch); a post-mount effect then re-derives both
 * values and corrects them. `dateChanged` flags the rare boundary case where
 * the recomputed calendar date no longer matches what the server rendered.
 *
 * The date is derived via `todayInZone(timeZone)` — the family's configured
 * Realm Timezone, not the browser's local clock — so a parent travelling
 * does not see a different default than the child. `timeZone` must be
 * threaded down as a prop from a server component that resolved it via
 * `getFamilyTimezone()`; this hook must never read one itself.
 */
export function useBrowserToday(serverDate: string, serverTime: string, timeZone: string) {
  const [state, setState] = useState({ date: serverDate, time: serverTime, dateChanged: false });

  useEffect(() => {
    function sync() {
      const date = todayInZone(timeZone);
      setState({ date, time: currentTimeOfDay(), dateChanged: date !== serverDate });
    }
    sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, [serverDate, timeZone]);

  return state;
}
