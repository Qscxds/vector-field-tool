/**
 * Home: a thin server component that reads the language from the link (`?loc=`) so the first
 * render is already in that language; everything else is components/HomeContent.
 */
import type { Metadata } from "next";
import { HomeContent } from "@/components/HomeContent";
import { bilingual, SITE_NAME_BILINGUAL } from "@/lib/site-text";
import { localeFromSearchParam, type SearchParams } from "./site-locale";

export const metadata: Metadata = {
  title: { absolute: SITE_NAME_BILINGUAL },
  description: bilingual("homeDescription"),
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return <HomeContent initialLocale={localeFromSearchParam(await searchParams)} />;
}
