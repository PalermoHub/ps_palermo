// Pulsante "Torna in cima": sta nel footer, sul bordo in alto a destra.
(() => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cima'; b.title = 'Torna in cima'; b.setAttribute('aria-label', 'Torna in cima');
  b.innerHTML = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }));
  const ft = document.querySelector('footer');
  (ft || document.body).append(b);
})();
