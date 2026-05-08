import { useEffect } from 'react';

const SUFFIX = ' — Kado';
const DEFAULT = 'Kado — AI Signal Intelligence';

/**
 * Sets document.title to `${title}${SUFFIX}` for the lifetime of the component.
 * On unmount, restores the default site title so navigating to a route that
 * forgot to set its own doesn't keep the previous tab's name.
 */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title}${SUFFIX}` : DEFAULT;
    return () => {
      document.title = DEFAULT;
    };
  }, [title]);
}
