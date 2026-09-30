/* ¿Hay una versión nueva? (30-sep-2026)
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * La app es una sola página y no se recarga sola: quien la dejó abierta
 * desde antes de una publicación sigue con la versión anterior. Al publicar,
 * el flujo deja `/huella.txt` (público y sin datos: el commit). Aquí se
 * compara con la huella que había al abrir; si cambió, se avisa y la persona
 * decide cuándo recargar. Se revisa cada 2 minutos y cuando la pestaña vuelve
 * a verse. NO con el `focus` de la ventana (en quote101 ese escucha perdía
 * clics en las pruebas). */
(function vigilarVersion() {
  const APP = 'master101';
  let base = null;
  function avisar() {
    if (document.getElementById('aviso-version')) return;
    const d = document.createElement('div');
    d.id = 'aviso-version';
    d.setAttribute('data-version-nueva', '');
    d.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = `Hay una versión nueva de ${APP}. Termina lo que estés haciendo, guarda, y recarga.`;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Recargar';
    b.onclick = () => location.reload();
    d.appendChild(t); d.appendChild(b);
    document.body.appendChild(d);
  }
  async function revisar() {
    try {
      const r = await fetch('/huella.txt', { cache: 'no-store' });
      if (!r.ok) return;
      const h = (await r.text()).trim();
      if (!h || h.length > 80 || /[<>\s]/.test(h)) return;
      if (base === null) base = h;
      else if (h !== base) avisar();
    } catch { /* sin red: se vuelve a intentar */ }
  }
  revisar();
  setInterval(revisar, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
})();
