export type Codice = 'rosso' | 'arancione' | 'azzurro' | 'verde' | 'bianco';
export const CODICI: readonly Codice[] = ['rosso', 'arancione', 'azzurro', 'verde', 'bianco'];

/** Conteggi per codice. `null` = la fonte non pubblica quel dato (mai 0 inventato). */
export interface ConteggiCodice {
  attesa: number | null;
  trattamento: number | null;
  osservazione: number | null;
  totale: number | null;
}

export interface Lettura {
  psId: string;
  /** Ora di rilevazione dichiarata dall'ospedale (ISO con offset), se la fonte la pubblica. */
  rilevataAlle: string | null;
  codici: Partial<Record<Codice, ConteggiCodice>>;
  pazientiTotali: number | null;
  inAttesa: number | null;
  sovraffollamentoPct: number | null;
  /** true se l'indice lo calcoliamo noi (la fonte non lo pubblica): non è un dato dell'ospedale. */
  sovraffollamentoCalcolato?: boolean;
  postiTecnici: number | null;
  permanenza: { meno24h: number | null; da24a48h: number | null; oltre48h: number | null } | null;
  /** Minuti di attesa media per codice (solo Policlinico). */
  tempiMediAttesaMin: Partial<Record<Codice, number>> | null;
}

export interface Ps {
  id: string;
  nome: string;
  struttura: string;
  tipo: 'adulti' | 'pediatrico';
  indirizzo: string;
  coords: { lat: number; lng: number };
  fonteUrl: string;
  /** Sito ufficiale della struttura. */
  sito?: string;
  /** Solo numeri verificati: se manca, la scheda non mostra «Chiama». */
  telefono?: string;
}

/** Una richiesta HTTP verso la fonte. */
export interface RichiestaFonte {
  chiave: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
}

export interface Fonte {
  id: string;
  richieste: RichiestaFonte[];
  /** Pura: riceve i corpi delle risposte (stesso ordine di `richieste`) e restituisce le letture. */
  parse(corpi: string[]): Lettura[];
}
