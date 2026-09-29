// Extra work the daily/weekly jobs run. Store phases register their tasks here (order expiry,
// sales reports) so the cron handler never has to change.
export const jobHooks = { daily: {}, weekly: {} };
export function onDaily(name, fn){ jobHooks.daily[name] = fn; }
export function onWeekly(name, fn){ jobHooks.weekly[name] = fn; }
