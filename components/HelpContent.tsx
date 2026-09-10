"use client";
/**
 * Help page body: Controls / Notation / Reading the results, then the limits, embedding and the
 * Claude connection. Every explanation trimmed from the application lives here (M.3 / M.4).
 * The function list comes from the parser whitelist
 * (lib/core/parse ALLOWED_FUNCTIONS through lib/site-text), never retyped; the marker
 * conventions describe what components/VectorFieldCanvas.tsx draws.
 */
import Link from "next/link";
import type { Locale } from "@/lib/labels";
import { embedSnippet, helpFunctionNames, MCP_ENDPOINT, siteText, withLocale } from "@/lib/site-text";
import { CopySnippet, SitePage, useSiteLocale } from "./SitePage";
import { useDocumentLang } from "./useDocumentLang";

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol>
      {items.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ol>
  );
}

export function HelpContent({ initialLocale }: { initialLocale: Locale | null }) {
  const [locale, setLocale] = useSiteLocale(initialLocale);
  useDocumentLang(locale);
  const T = siteText(locale);
  const H = T.help;
  const functions = helpFunctionNames();
  return (
    <SitePage locale={locale} onLocale={setLocale}>
      <h1>{H.title}</h1>
      <p className="site-note">{H.intro}</p>

      <h2 id="controls">{H.controls.heading}</h2>
      <h3>{H.controls.formHeading}</h3>
      <List items={H.controls.form} />
      <h3>{H.controls.mouseHeading}</h3>
      <List items={H.controls.mouse} />
      <h3>{H.controls.touchHeading}</h3>
      <List items={H.controls.touch} />

      <h2 id="notation">{H.notation.heading}</h2>
      <List items={H.notation.items} />
      <p>{H.notation.firstOrderLine}</p>
      <p>{H.notation.secondOrderLine}</p>
      <p>
        {H.notation.functionsLead}{" "}
        <span data-help-functions>
          {functions.map((name, i) => (
            <span key={name}>
              <code>{name}</code>
              {i < functions.length - 1 ? ", " : ""}
            </span>
          ))}
        </span>
      </p>
      <p>{H.notation.constantsLine}</p>
      <p>{H.notation.piecewiseLine}</p>
      <p>{H.notation.negativePowerLine}</p>

      <h2 id="reading">{H.reading.heading}</h2>
      <p>{H.reading.rangeLine}</p>
      <p>{H.reading.detailsLine}</p>
      <p>{H.reading.markersLead}</p>
      <List items={H.reading.markers} />
      <p>{H.reading.equilibriumLine}</p>
      <p>{H.reading.centerNote}</p>
      <p>{H.reading.formsLead}</p>
      <List items={H.reading.forms} />
      <p>{H.reading.notProof}</p>
      <p>{H.reading.uniqueness}</p>
      <p>{H.reading.snapshot}</p>
      <p>{H.reading.domainEdge}</p>
      <p>{H.reading.truncated}</p>
      <p>{H.reading.scan}</p>

      <h2 id="limits">{H.limits.heading}</h2>
      <List items={H.limits.items} />

      <h2 id="embed">{H.embed.heading}</h2>
      <p>{H.embed.lead}</p>
      <p>{H.embed.withControls}</p>
      <CopySnippet text={embedSnippet(locale, true)} locale={locale} label={H.embed.withControls} />
      <p>{H.embed.withoutControls}</p>
      <CopySnippet text={embedSnippet(locale, false)} locale={locale} label={H.embed.withoutControls} />
      <h3>{H.embed.sitesHeading}</h3>
      <Steps items={H.embed.sites} />
      <p>{H.embed.heights}</p>
      <p>{H.embed.publicNote}</p>

      <h2 id="claude">{H.claude.heading}</h2>
      <p className="site-note">{H.claude.optional}</p>
      <p>{H.claude.endpointLead}</p>
      <CopySnippet text={MCP_ENDPOINT} locale={locale} label={H.claude.endpointLead} />
      <Steps items={H.claude.steps} />
      <p>{H.claude.widgetNote}</p>

      <p>
        <Link href={withLocale("/vector-field", locale)} className="site-cta">
          {T.home.open}
        </Link>
      </p>
    </SitePage>
  );
}
