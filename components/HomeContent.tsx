"use client";
/**
 * Home page body. Server page.tsx passes the language from the link (`?loc=`) or null; the
 * copy comes from lib/site-text.ts; the example cards link to presets through presetUrl().
 */
import Link from "next/link";
import { PRESETS, presetUrl } from "@/app/vector-field/presets";
import type { Locale } from "@/lib/labels";
import { HOME_EXAMPLE_PRESET_IDS, siteText, withLocale } from "@/lib/site-text";
import { SitePage, useSiteLocale } from "./SitePage";
import { useDocumentLang } from "./useDocumentLang";

export function HomeContent({ initialLocale }: { initialLocale: Locale | null }) {
  const [locale, setLocale] = useSiteLocale(initialLocale);
  useDocumentLang(locale);
  const T = siteText(locale);
  const cards = (Object.keys(HOME_EXAMPLE_PRESET_IDS) as Array<keyof typeof HOME_EXAMPLE_PRESET_IDS>).flatMap((key) => {
    const preset = PRESETS.find((p) => p.id === HOME_EXAMPLE_PRESET_IDS[key]);
    return preset ? [{ key, href: withLocale(presetUrl(preset), locale), text: T.home.examples[key] }] : [];
  });
  return (
    <SitePage locale={locale} onLocale={setLocale}>
      <h1>{T.site.name}</h1>
      <p className="site-note">{T.site.tagline}</p>
      <p>{T.home.lead}</p>
      <p>
        <Link href={withLocale("/vector-field", locale)} className="site-cta">
          {T.home.open}
        </Link>
      </p>

      <h2>{T.home.examplesHeading}</h2>
      <div className="site-cards">
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="site-card" data-example={c.key}>
            <strong>{c.text.title}</strong>
            <span>{c.text.note}</span>
          </Link>
        ))}
      </div>

      <h2>{T.home.canHeading}</h2>
      <ul>
        {T.home.can.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <h2>{T.home.limitsHeading}</h2>
      <ul>
        {T.home.limits.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <p className="site-note">
        {T.home.claudeLine} <Link href={`${withLocale("/help", locale)}#claude`}>{T.home.claudeLink}</Link>.
      </p>
    </SitePage>
  );
}
