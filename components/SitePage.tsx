"use client";
/**
 * Shared shell of the site pages (home, help): the language choice, the header with the toggle,
 * the footer and the copy button. The language comes from the link (`?loc=`) or, when the link
 * says nothing, from navigator.language; the choice lives in component state only (no cookie,
 * no localStorage: the site does no tracking and stores nothing).
 */
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { localeFromLanguageTag, type Locale } from "@/lib/labels";
import { GITHUB_URL, siteText, withLocale } from "@/lib/site-text";

export function useSiteLocale(initial: Locale | null): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>(initial ?? "en");
  useEffect(() => {
    if (initial === null) setLocale(localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : undefined));
  }, [initial]);
  return [locale, setLocale];
}

const SITE_STYLE = `
.site { max-width: 720px; margin: 0 auto; padding: 20px 20px 40px; line-height: 1.65; font-size: 16px; color: #1f2933; }
.site a { color: #1d4ed8; }
.site h1 { font-size: 26px; margin: 12px 0 6px; }
.site h2 { font-size: 20px; margin: 32px 0 8px; }
.site h3 { font-size: 16px; margin: 18px 0 6px; }
.site p, .site li { margin: 6px 0; }
.site ul { padding-left: 22px; }
.site code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.94em; }
.site-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 14px; }
.site-nav a { min-height: 44px; display: inline-flex; align-items: center; }
.site-lang { margin-left: auto; display: inline-flex; gap: 4px; }
.site-lang button { min-width: 44px; min-height: 44px; padding: 0 12px; border: 1px solid #cbd2d9; border-radius: 6px; background: #fff; color: #1f2933; cursor: pointer; font-size: 14px; }
.site-lang button[aria-pressed="true"] { background: #1f2933; color: #fff; border-color: #1f2933; }
.site-cta { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; margin: 10px 0; border-radius: 8px; background: #1d4ed8; color: #fff !important; font-weight: 600; font-size: 17px; text-decoration: none; }
.site-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 8px 0; }
.site-card { display: block; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 8px; text-decoration: none; color: inherit; min-height: 44px; }
.site-card:hover { border-color: #1d4ed8; }
.site-card strong { color: #1d4ed8; }
.site-card span { display: block; color: #52606d; font-size: 14px; margin-top: 4px; }
.site-note { color: #52606d; }
.site-snippet { position: relative; margin: 8px 0; }
.site-snippet pre { margin: 0; padding: 12px 14px; background: #f3f4f6; border-radius: 8px; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
.site-snippet textarea { width: 100%; box-sizing: border-box; font-size: 13px; margin-top: 6px; }
.site-copy { min-height: 44px; min-width: 44px; padding: 0 14px; margin-top: 6px; border: 1px solid #cbd2d9; border-radius: 6px; background: #fff; cursor: pointer; font-size: 14px; }
.site-copy-status { margin-left: 10px; font-size: 14px; color: #52606d; }
.site-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #52606d; }
.site-footer p { margin: 4px 0; }
`;

export function SitePage({ locale, onLocale, children }: { locale: Locale; onLocale: (l: Locale) => void; children: ReactNode }) {
  const T = siteText(locale);
  return (
    <main className="site" lang={locale === "zh" ? "zh-CN" : "en"}>
      <style>{SITE_STYLE}</style>
      <nav className="site-nav" aria-label={T.site.name}>
        <Link href={withLocale("/", locale)}>{T.site.home}</Link>
        <Link href={withLocale("/vector-field", locale)}>{T.site.openApp}</Link>
        <Link href={withLocale("/help", locale)}>{T.site.help}</Link>
        <span className="site-lang" role="group" aria-label={T.site.languageLabel}>
          <button type="button" aria-pressed={locale === "zh"} onClick={() => onLocale("zh")}>{T.site.langZh}</button>
          <button type="button" aria-pressed={locale === "en"} onClick={() => onLocale("en")}>{T.site.langEn}</button>
        </span>
      </nav>
      {children}
      <footer className="site-footer">
        <p>
          <a href={GITHUB_URL}>{T.site.github}</a> · <Link href={withLocale("/help", locale)}>{T.site.help}</Link>
        </p>
        <p>{T.site.noTracking}</p>
      </footer>
    </main>
  );
}

/** A snippet with a copy button: navigator.clipboard, else a selected read-only textarea. */
export function CopySnippet({ text, locale, label }: { text: string; locale: Locale; label: string }) {
  const T = siteText(locale);
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (status === "fallback") {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }, [status]);
  const copy = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("fallback");
    }
  };
  return (
    <div className="site-snippet">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className="site-copy" onClick={copy} aria-label={`${T.site.copy}: ${label}`}>
        {T.site.copy}
      </button>
      {status === "copied" ? <span className="site-copy-status" role="status">{T.site.copied}</span> : null}
      {status === "fallback" ? (
        <>
          <span className="site-copy-status" role="status">{T.site.copyFallback}</span>
          <textarea ref={fallbackRef} readOnly value={text} rows={3} aria-label={label} />
        </>
      ) : null}
    </div>
  );
}
