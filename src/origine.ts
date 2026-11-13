/** Endpoint pubblici letti dal sito stesso: li serviamo solo a richieste che arrivano dal sito (stessa origine). */
export const API_SOLO_SITO = new Set(['/api/palermo', '/api/storico', '/api/salute']);

/**
 * True se la richiesta sembra venire dalla nostra pagina (o da una navigazione diretta nel browser).
 * Si basa su intestazioni che un browser non lascia falsificare alle pagine altrui (Sec-Fetch-Site, Origin):
 * ferma incorporamenti in altri siti e script da browser, NON chi usa curl e simili (le intestazioni li si inventa).
 */
export function dalSito(req: Request): boolean {
  const mio = new URL(req.url).origin;
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
