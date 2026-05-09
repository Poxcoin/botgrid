// Meta Pixel — loaded only when VITE_META_PIXEL_ID is set at build time
// AND the user has accepted cookie consent (kado_cookie_consent === 'accepted').
// To enable: create frontend/.env.production with `VITE_META_PIXEL_ID=1234567890`
// then rebuild. Without the var, no script is injected and no events fire.

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;
const CONSENT_KEY = 'kado_cookie_consent';

let initialized = false;
let initialPageViewSent = false;

function hasConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
  catch { return false; }
}

function loadFbq() {
  if (typeof window === 'undefined' || window.fbq) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
}

export function initPixel() {
  if (!PIXEL_ID || initialized) return;
  if (!hasConsent()) return;
  loadFbq();
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
  initialized = true;
  initialPageViewSent = true;
}

export function trackPageView() {
  if (!PIXEL_ID || !window.fbq) return;
  // Skip the very first call after init() — fbq('init') already sent one.
  if (initialPageViewSent) {
    initialPageViewSent = false;
    return;
  }
  window.fbq('track', 'PageView');
}

export function trackEvent(name, params) {
  if (!PIXEL_ID || !window.fbq) return;
  if (params) window.fbq('track', name, params);
  else window.fbq('track', name);
}

export function trackCompleteRegistration() {
  trackEvent('CompleteRegistration');
}
