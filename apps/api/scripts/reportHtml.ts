// What EVAL.html and the model comparison page share: escaping, the page shell and its styles, status chips and count
// cells. Plain strings, no template engine. Every page is self-contained (no scripts, no external files), so it opens
// from disk in any browser and is committed next to the JSON it was made from.
import { ROUTE_LABEL, STATUS_LABEL, type CriterionStatus, type Route } from '@pa/shared';

export type Share = { count: number; of: number };

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Green when every case passed, amber when some did, red when none did.
export function shareTone(share: Share): 'ok' | 'warn' | 'bad' {
  return share.count === share.of ? 'ok' : share.count === 0 ? 'bad' : 'warn';
}

// A count of cases that passed a check. "none" when there was nothing to check.
export function shareCell(share: Share): string {
  if (share.of === 0) return '<td class="none">none</td>';
  return `<td class="${shareTone(share)}">${share.count} / ${share.of}</td>`;
}

// Something that went wrong (a fallback, an error, a time limit): red when it happened at all.
export function problemCell(count: number, of?: number): string {
  return `<td class="${count > 0 ? 'bad' : 'ok'}">${of === undefined ? count : `${count} / ${of}`}</td>`;
}

const STATUS_ICON: Record<CriterionStatus, string> = { met: '✓', not_met: '✕', missing: '?', conflicting: '⚠' };

// An icon and a label, never colour alone (the same rule as the UI's badges).
export function statusChip(status: CriterionStatus): string {
  return `<span class="chip ${status}"><span aria-hidden="true">${STATUS_ICON[status]}</span> ${STATUS_LABEL[status]}</span>`;
}

export function routeChip(route: Route): string {
  return `<span class="chip ${route}">${ROUTE_LABEL[route]}</span>`;
}

export function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

// Light and dark palettes; status chips keep dark text on a light tint (and the reverse in dark mode) for contrast.
const STYLES = `
  :root { --bg: #f7f8fa; --panel: #ffffff; --fg: #1d2330; --muted: #5d6677; --line: #dde1e8;
          --ok: #1f7a4d; --ok-bg: #e5f4ec; --warn: #8a5a00; --warn-bg: #fdf1d8; --bad: #b42318; --bad-bg: #fdecea;
          --met-bg: #dcf2e3; --met-fg: #14532d; --not-met-bg: #fde2df; --not-met-fg: #7f1d1d;
          --missing-bg: #dde9fb; --missing-fg: #1e3a8a; --conflicting-bg: #fbedc2; --conflicting-fg: #6b3a0b;
          --complete-bg: #e4e6fb; --complete-fg: #312e81; --review-bg: #e9ecf1; --review-fg: #1f2937; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14171c; --panel: #1c2027; --fg: #e6e9ef; --muted: #9aa3b2; --line: #2e343e;
            --ok: #6fd3a0; --ok-bg: #173527; --warn: #f0c46b; --warn-bg: #3a2f14; --bad: #f2867c; --bad-bg: #3d1d1b;
            --met-bg: #1b3b28; --met-fg: #b7ecc9; --not-met-bg: #4a1f1c; --not-met-fg: #ffc9c2;
            --missing-bg: #1d2f4f; --missing-fg: #c3d8fb; --conflicting-bg: #4a3812; --conflicting-fg: #fbe2a6;
            --complete-bg: #272a52; --complete-fg: #d0d3fb; --review-bg: #2a2f38; --review-fg: #e3e7ee; }
  }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1400px; margin: 0 auto; padding: 32px 16px 48px; display: grid; gap: 16px; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; }
  h2 { margin: 24px 0 0; font-size: 18px; font-weight: 600; }
  h3 { margin: 12px 0 0; font-size: 15px; font-weight: 600; }
  p { margin: 0; max-width: 90ch; }
  ul { margin: 0; padding-left: 20px; max-width: 110ch; }
  .muted { color: var(--muted); }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; color: var(--muted); font-size: 13px; margin: 0; }
  .facts dt { font-weight: 600; } .facts dd { margin: 0; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
  .tile { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; display: grid; gap: 2px; }
  .tile .label { font-size: 12px; color: var(--muted); }
  .tile .value { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tile.ok .value { color: var(--ok); } .tile.warn .value { color: var(--warn); } .tile.bad .value { color: var(--bad); }
  .scroll { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  .scroll.fit { width: fit-content; max-width: 100%; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
  tr:last-child th, tr:last-child td { border-bottom: none; }
  th[scope="row"], thead th:first-child { text-align: left; font-weight: 600; }
  thead th { color: var(--muted); font-weight: 600; font-size: 12px; vertical-align: bottom; white-space: normal; min-width: 4.5em; }
  .group th { border-bottom: none; padding-bottom: 0; text-align: center; color: var(--fg); }
  .fit td { min-width: 4em; }
  table.grid td, table.grid th { text-align: center; }
  table.grid th[scope="row"], table.grid thead th:first-child { text-align: left; }
  table.text td { text-align: left; white-space: normal; }
  td.ok { color: var(--ok); background: var(--ok-bg); }
  td.warn { color: var(--warn); background: var(--warn-bg); }
  td.bad { color: var(--bad); background: var(--bad-bg); font-weight: 600; }
  td.none { color: var(--muted); }
  .chip { display: inline-flex; gap: 4px; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .chip.met { background: var(--met-bg); color: var(--met-fg); }
  .chip.not_met { background: var(--not-met-bg); color: var(--not-met-fg); }
  .chip.missing { background: var(--missing-bg); color: var(--missing-fg); }
  .chip.conflicting { background: var(--conflicting-bg); color: var(--conflicting-fg); }
  .chip.evidence_complete { background: var(--complete-bg); color: var(--complete-fg); }
  .chip.clinician_review { background: var(--review-bg); color: var(--review-fg); }
  td.mismatch .chip { outline: 2px solid var(--fg); outline-offset: 1px; }
  .key { font-size: 11px; color: var(--muted); margin-top: 2px; }
  dl.legend { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; font-size: 13px; margin: 0; }
  dl.legend dt { font-weight: 600; } dl.legend dd { margin: 0; color: var(--muted); }
`;
