const URL_WITH_SCHEME_RE = /^(https?:\/\/|mailto:|tel:)/i;
const DOMAIN_LIKE_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/:?#].*)?$/i;

export function normalizeElementLinkUrl(url: string | undefined | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (URL_WITH_SCHEME_RE.test(trimmed)) return trimmed;
  if (DOMAIN_LIKE_RE.test(trimmed)) return `https://${trimmed}`;
  return null;
}
