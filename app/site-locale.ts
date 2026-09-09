/** The `?loc=` parameter of the site pages: zh or en, else null (follow the browser). */
import type { Locale } from "@/lib/labels";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function localeFromSearchParam(params: Record<string, string | string[] | undefined>): Locale | null {
  const raw = Array.isArray(params.loc) ? params.loc[0] : params.loc;
  return raw === "zh" || raw === "en" ? raw : null;
}
