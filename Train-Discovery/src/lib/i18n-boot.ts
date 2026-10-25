import { DEFAULT_LOCALE, LOCALES } from "@/locales";

export const LOCALE_STORAGE_KEY = "gaze:locale";

const codes = LOCALES.map((locale) => ({ code: locale.code, dir: locale.dir }));

/**
 * Runs before first paint. Sets <html lang/dir> from the saved language (or
 * the browser language) and hides the page until the client has rendered in
 * that language, so a Spanish or Chinese rider never sees English flash. The
 * CSS fallback reveals the page after three seconds even if scripts fail.
 */
export const LOCALE_BOOT_SCRIPT = `(function(){try{var c=${JSON.stringify(codes)},d=${JSON.stringify(DEFAULT_LOCALE)},s=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)}),n=(navigator.language||"").toLowerCase(),m=null,i;for(i=0;i<c.length;i++){if(s&&c[i].code===s)m=c[i];}if(!m){for(i=0;i<c.length;i++){if(c[i].code.toLowerCase()===n)m=c[i];}}if(!m){for(i=0;i<c.length;i++){if(c[i].code.toLowerCase().split("-")[0]===n.split("-")[0])m=c[i];}}if(m&&m.code!==d){var h=document.documentElement;h.lang=m.code;h.dir=m.dir;h.setAttribute("data-locale-pending","");}}catch(e){}})();`;
