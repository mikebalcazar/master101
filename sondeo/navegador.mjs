/* La hoja de íconos manejada con un navegador. BASE=<url> node sondeo/navegador.mjs
 * Usa el sondeo `iconos-suite` en el sondeo101 de BASE: sólo staging o local. */
import { chromium } from 'playwright';
const BASE = process.env.BASE;
if (!BASE || /sondeo\.taller101\.com/.test(BASE)) { console.error('sólo staging o local'); process.exit(2); }
let n = 0, fallas = 0;
const ok = (c, m) => { n++; if (!c) fallas++; console.log(`${c ? 'ok   ' : 'FALLA'} ${m}`); };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [ancho, alto] of [[1280, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: ancho, height: alto } });
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.goto(BASE + '/iconos/'); await p.waitForSelector('#guardado:has-text("Listo")', { timeout: 15000 });
  ok(await p.locator('article.card').count() === 77, `${ancho}: 77 tarjetas`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= ancho, `${ancho}: sin desborde a lo ancho`);
  if (ancho === 1280) {
    const t1 = p.locator('article[data-id="dash101-2"]');
    await t1.locator('button[data-v="queda"]').click();
    await t1.locator('textarea').fill('más grueso el arco');
    await t1.locator('textarea').blur();
    await p.locator('article[data-id="dash101-3"] input[type=checkbox]').check();
    await p.locator('article[data-id="dash101-5"] button[data-v="desechar"]').click();
    await p.waitForSelector('#guardado:has-text("Guardado")');
    await p.locator('#comentario-final').fill('prueba del navegador');
    await p.locator('.btn-enviar').click();
    await p.waitForSelector('.confirmado:not([hidden])', { timeout: 10000 });
    ok(true, '«Enviar mis marcas» confirma');
    const r = await (await fetch(BASE + '/api/iconos-suite')).json();
    ok(r.respuestas['dash101-2']?.estado === 'queda' && r.respuestas['dash101-2']?.nota === 'más grueso el arco', 'la nota y «Se queda» quedaron guardadas');
    ok(r.respuestas['dash101-3']?.elegida === true, 'ELEGIDA quedó guardada');
    ok(r.respuestas['dash101-5']?.estado === 'desechar', 'Desechar quedó guardado');
    ok(r.envios[0]?.comentario === 'prueba del navegador', 'el envío quedó con su comentario');
    await p.reload(); await p.waitForSelector('#guardado:has-text("Listo")');
    ok(await p.locator('article[data-id="dash101-3"]').evaluate(e => e.classList.contains('elegida')), 'al recargar, la ELEGIDA sigue marcada');
    await p.locator('article[data-id="dash101-2"] input[type=checkbox]').check();
    await p.waitForSelector('#guardado:has-text("Guardado")');
    ok(!(await p.locator('article[data-id="dash101-3"] input[type=checkbox]').isChecked()), 'sólo una ELEGIDA por app');
    await p.screenshot({ path: process.env.FOTO || '/tmp/sondeo-iconos.png' });
  }
  ok(errores.length === 0, `${ancho}: sin errores de JavaScript ${errores.join(' | ')}`);
  await p.close();
}
await b.close();
console.log(`\n${n} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
