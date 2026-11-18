// Invito a installare l'app (PWA). Chrome/Edge/Android: evento beforeinstallprompt.
// iOS Safari: nessun evento, mostra il suggerimento "Condividi › Aggiungi a Home".
// Non compare in embed (un iframe non può installare), se già installata o se l'utente ha detto "Non ora".
(() => {
  if (document.documentElement.classList.contains('embed')) return;
  if (matchMedia('(display-mode:standalone)').matches || navigator.standalone) return;
  const CH = 'ps-install-rinviato', GIORNI = 14, ATTESA = 4000;
  try { const t = +localStorage.getItem(CH); if (t && Date.now() - t < GIORNI * 864e5) return; } catch (e) {}

  let evento = null, box = null, timer = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  const chiudi = rinvia => {
    clearTimeout(timer);
    if (rinvia) try { localStorage.setItem(CH, String(Date.now())); } catch (e) {}
    if (box) { box.remove(); box = null; }
  };

  const mostra = () => {
    if (box || (!evento && !ios)) return;
    box = document.createElement('div');
    box.className = 'ps-install'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Installa l\'app');
    const p = document.createElement('p');
    p.textContent = ios
      ? 'Installa Palermo Digital Twin come app: tocca Condividi e poi «Aggiungi alla schermata Home».'
      : 'Installa Palermo Digital Twin come app: si apre senza le barre del browser e la mappa occupa tutto lo schermo.';
    const az = document.createElement('div');
    if (!ios) {
      const si = document.createElement('button');
      si.type = 'button'; si.className = 'si'; si.textContent = 'Installa';
      si.addEventListener('click', async () => {
        const e = evento; evento = null;
        chiudi(false);
        if (!e) return;
        e.prompt();
        try { const r = await e.userChoice; if (r.outcome !== 'accepted') chiudi(true); } catch (x) {}
      });
      az.append(si);
    }
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'no'; no.textContent = ios ? 'Ho capito' : 'Non ora';
    no.addEventListener('click', () => chiudi(true));
    az.append(no);
    box.append(p, az);
    document.body.append(box);
  };

  const programma = () => { clearTimeout(timer); timer = setTimeout(mostra, ATTESA); };

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); evento = e; programma(); });
  addEventListener('appinstalled', () => { evento = null; chiudi(false); });
  if (ios) programma();
})();
