import { useEffect } from 'react';

const SUFFIX = ' — Kado';
const DEFAULT_TITLE = 'Kado — AI Signal Intelligence';
const DEFAULT_DESC = 'KADO automates crypto trading on Bybit using AI signals. Performance plan: 25% of net new profits, no upfront cost. You keep custody — we never touch your funds.';

function setMeta(name, value, attr = 'name') {
  if (!value) return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/**
 * Sets document.title to `${title}${SUFFIX}` for the lifetime of the component.
 * Optionally also updates meta description, og:title, og:description.
 * On unmount, restores defaults.
 */
export function usePageTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title}${SUFFIX}` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESC;
    setMeta('description', desc);
    setMeta('og:title', title ? `${title}${SUFFIX}` : DEFAULT_TITLE, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('twitter:title', title ? `${title}${SUFFIX}` : DEFAULT_TITLE);
    setMeta('twitter:description', desc);
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('description', DEFAULT_DESC);
      setMeta('og:title', DEFAULT_TITLE, 'property');
      setMeta('og:description', DEFAULT_DESC, 'property');
      setMeta('twitter:title', DEFAULT_TITLE);
      setMeta('twitter:description', DEFAULT_DESC);
    };
  }, [title, description]);
}
