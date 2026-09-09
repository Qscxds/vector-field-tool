/**
 * Embeddable route for the teacher's course site (Google Sites iframes): the same application as
 * /vector-field with the same link parameters, without the page chrome. `controls=0` hides the
 * form (the equation text and the results stay). The frame-ancestors header that allows any site
 * to embed this route lives in next.config.ts and applies to /embed ONLY.
 */
import type { Metadata } from "next";
import { VectorFieldApp } from "@/components/VectorFieldApp";
import { decodeState, DEFAULT_STATE, encodeState, queryFromSearchParams } from "@/lib/url-state";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { state, problems } = decodeState(queryFromSearchParams(params), DEFAULT_STATE);
  const controls = (Array.isArray(params.controls) ? params.controls[0] : params.controls) !== "0";
  return <VectorFieldApp key={encodeState(state)} initial={state} embed controls={controls} urlProblems={problems} />;
}
