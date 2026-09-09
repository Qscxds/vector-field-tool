/**
 * Help: notation, controls, how to read the results, known limits, embedding, and the optional
 * Claude connection. A thin server component; the body is components/HelpContent.
 */
import type { Metadata } from "next";
import { HelpContent } from "@/components/HelpContent";
import { bilingual } from "@/lib/site-text";
import { localeFromSearchParam, type SearchParams } from "../site-locale";

export const metadata: Metadata = {
  title: bilingual("helpTitle"),
  description: bilingual("helpDescription"),
  alternates: { canonical: "/help" },
};

export default async function HelpPage({ searchParams }: { searchParams: SearchParams }) {
  return <HelpContent initialLocale={localeFromSearchParam(await searchParams)} />;
}
