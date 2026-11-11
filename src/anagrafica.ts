import type { Ps } from './types';

// Dati anagrafici ripresi dal config di prontosoccorso_api (da ricontrollare prima della pubblicazione).
export const PS: Ps[] = [
  { id: 'villa-sofia-adulti', nome: 'Villa Sofia', struttura: 'Ospedali Riuniti Villa Sofia-Cervello', tipo: 'adulti',
    indirizzo: 'Piazza Salerno 1, 90146 Palermo', coords: { lat: 38.155978, lng: 13.337607 },
    fonteUrl: 'https://www.ospedaliriunitipalermo.it/amministrazione-trasparente/servizi-erogati/liste-di-attesa/pazienti-in-attesa-al-pronto-soccorso/' },
  { id: 'cervello-adulti', nome: 'Cervello', struttura: 'Ospedali Riuniti Villa Sofia-Cervello', tipo: 'adulti',
    indirizzo: 'Via Trabucco 180, 90146 Palermo', coords: { lat: 38.1545298, lng: 13.3138741 },
    fonteUrl: 'https://www.ospedaliriunitipalermo.it/amministrazione-trasparente/servizi-erogati/liste-di-attesa/pazienti-in-attesa-al-pronto-soccorso/' },
  { id: 'cervello-pediatrico', nome: 'Cervello Pediatrico', struttura: 'Ospedali Riuniti Villa Sofia-Cervello', tipo: 'pediatrico',
    indirizzo: 'Via Trabucco 180, 90146 Palermo', coords: { lat: 38.1545298, lng: 13.3138741 },
    fonteUrl: 'https://www.ospedaliriunitipalermo.it/amministrazione-trasparente/servizi-erogati/liste-di-attesa/pazienti-in-attesa-al-pronto-soccorso/' },
  { id: 'civico-adulti', nome: 'Civico', struttura: 'ARNAS Civico', tipo: 'adulti',
    indirizzo: 'Via Carmelo Lazzaro 4, 90127 Palermo', coords: { lat: 38.1042334, lng: 13.3560857 },
    fonteUrl: 'https://www.arnascivico.it/index.php?option=com_content&view=article&id=3415&catid=24&Itemid=139' },
  { id: 'di-cristina-pediatrico', nome: 'Di Cristina', struttura: 'ARNAS Civico', tipo: 'pediatrico',
    indirizzo: 'Via Carmelo Lazzaro 4, 90127 Palermo', coords: { lat: 38.1099461, lng: 13.3548131 },
    fonteUrl: 'https://www.arnascivico.it/index.php?option=com_content&view=article&id=3415&catid=24&Itemid=139' },
  { id: 'policlinico-adulti', nome: 'Policlinico', struttura: 'AOUP Policlinico "P. Giaccone"', tipo: 'adulti',
    indirizzo: 'Via del Vespro 129, 90127 Palermo', coords: { lat: 38.1044938, lng: 13.3625445 },
    fonteUrl: 'https://www.policlinico.pa.it/web/guest' },
  { id: 'ingrassia-adulti', nome: 'Ingrassia', struttura: 'ASP Palermo', tipo: 'adulti',
    indirizzo: 'Corso Calatafimi 1002, 90131 Palermo', coords: { lat: 38.0932568, lng: 13.3099573 },
    fonteUrl: 'https://www.asppalermo.org/attese_ps/index_mod2.php' },
  { id: 'buccheri-adulti', nome: 'Buccheri La Ferla', struttura: 'Fatebenefratelli', tipo: 'adulti',
    indirizzo: 'Via Messina Marine 197, 90123 Palermo', coords: { lat: 38.1058898, lng: 13.3859316 },
    fonteUrl: 'https://servizionline.provinciaromanafbf.it/palermo/monitorps/portal-view/01/G' },
];
