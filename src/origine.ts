/** Endpoint pubblici letti dal sito stesso: li serviamo solo a richieste che arrivano dal sito (stessa origine). */
export const API_SOLO_SITO = new Set(['/api/palermo', '/api/storico', '/api/salute', '/api/dl']);

/** Altri siti autorizzati a leggere le API dal browser (solo origine: schema + host, senza slash finale). */
export const ORIGINI_AMMESSE = new Set(['https://palermohub.opendatasicilia.it', 'https://siciliahub.github.io']);

/** User-Agent di client da riga di comando e librerie HTTP più comuni: ferma gli script pigri (il User-Agent si cambia in un attimo). */
const UA_BLOCCATI = /^(curl|wget|httpie|python-requests|python-urllib|aiohttp|go-http-client|libwww-perl|java\/|okhttp|node-fetch|axios|undici|postmanruntime|insomnia)|\b(httpx|scrapy)\b/i;

/**
 * True se la richiesta sembra venire dalla nostra pagina (o da una navigazione diretta nel browser).
 * Si basa su intestazioni che un browser non lascia falsificare alle pagine altrui (Sec-Fetch-Site, Origin):
 * ferma incorporamenti in altri siti e script da browser, NON chi usa curl e simili (le intestazioni li si inventa).
 */
export function dalSito(req: Request): boolean {
  if (UA_BLOCCATI.test(req.headers.get('User-Agent') ?? '')) return false;
  const mio = new URL(req.url).origin;
  const origin0 = req.headers.get('Origin');
  if (origin0 && ORIGINI_AMMESSE.has(origin0)) return true;
  const sfs = req.headers.get('Sec-Fetch-Site');
  if (sfs) return sfs === 'same-origin' || sfs === 'none';
  const origin = req.headers.get('Origin');
  if (origin) return origin === mio;
  const referer = req.headers.get('Referer');
  if (referer) {
    try { return new URL(referer).origin === mio; } catch { return false; }
  }
  return false;
}

/** Intestazioni CORS per le origini ammesse (le altre non ne ricevono: il browser blocca la lettura). */
export function corsPer(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  return origin && ORIGINI_AMMESSE.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}
