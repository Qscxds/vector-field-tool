/**
 * "Report a problem" (round R): a link to a new GitHub issue prefilled with the page's own link,
 * the browser's name and three prompt lines in the student's language. Pure: the shell passes
 * `window.location.href` and `navigator.userAgent` at click time. Nothing is sent anywhere by this
 * tool: the student sees the prefilled form on GitHub and decides.
 */
import { fill, labels, type Locale } from "./labels";

export const ISSUES_NEW_URL = "https://github.com/Qscxds/vector-field-tool/issues/new";

export type ReportIssueInput = { pageUrl: string; userAgent: string; locale: Locale };

export function reportIssueUrl({ pageUrl, userAgent, locale }: ReportIssueInput): string {
  const L = labels(locale);
  const body = [fill(L.ui.reportPage, { url: pageUrl }), fill(L.ui.reportBrowser, { ua: userAgent }), "", L.ui.reportDid, "", L.ui.reportExpected, "", L.ui.reportSaw, ""].join("\n");
  const q = new URLSearchParams({ title: L.ui.reportTitle, body });
  return `${ISSUES_NEW_URL}?${q.toString()}`;
}
