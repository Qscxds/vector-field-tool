/**
 * Web shell route: a thin SERVER component. The query string is decoded here (lib/url-state) so
 * the first render already shows the linked state (no flash of a default), then the whole body,
 * shared with /embed, lives in components/VectorFieldApp. /mcp and /widget are untouched.
 */
import type { Metadata } from "next";
import { VectorFieldApp } from "@/components/VectorFieldApp";
import { bilingual } from "@/lib/site-text";
import { decodeState, DEFAULT_STATE, encodeState, queryFromSearchParams } from "@/lib/url-state";

export const metadata: Metadata = {
  title: bilingual("appTitle"),
  description: bilingual("appDescription"),
  alternates: { canonical: "/vector-field" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VectorFieldPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { state, problems } = decodeState(queryFromSearchParams(params), DEFAULT_STATE);
  // Keyed on the decoded state: a client-side navigation to another link remounts with that link's state.
  return <VectorFieldApp key={encodeState(state)} initial={state} urlProblems={problems} />;
}
