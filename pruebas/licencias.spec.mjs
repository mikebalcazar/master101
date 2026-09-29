/* La pantalla de una licencia, contra el banco de pruebas.
 *
 * Mike (28-sep-2026) subía el número de máquinas, picaba Guardar, le
 * contestaba «Guardado.» —y el campo nunca viajó. Había dos botones para una
 * sola forma: «Guardar tipo y vigencia» mandaba sólo tipo y perpetua, y
 * «Cambiar máquinas» era el único que mandaba `lugares`. Peor que un error:
 * un acuse en falso. En la base se vio exacto —la fila tocada, ningún campo
 * cambiado, ni un renglón de `lugares` en la bitácora—.
 *
 * Por qué contra el banco y no contra staging: hasta hoy las rutas de
 * licencias no estaban en el banco, y por eso esta pantalla no la medía
 * nadie. Aquí se mide lo que importa: que UN botón mande las tres cosas, que
 * el acuse diga de cuánto a cuánto con el número que devolvió el servidor, y
 * que las máquinas dormidas (30 días sin latir) salgan marcadas sin que nadie
 * las libere sola.
 *
 *     node pruebas/servidor.mjs --falso 8793 &
 *     BASE=http://127.0.0.1:8793 node pruebas/licencias.spec.mjs
 */
import { chromium } from 'playwright';

const BASE = (process.env.BASE || 'http://127.0.0.1:8793').replace(/\/$/, '');
// Contra el banco falso la superadmin es siempre la dueña que el banco tiene
// sembrada; CORREO_SUPERADMIN es para staging. El 29-sep el flujo de
// publicación traía mike@forespot.com en el ambiente del job entero, el
// banco no lo conocía, no devolvía código y la prueba reventaba con un
// «expected string, got undefined» que no decía por qué.
const DUENA_DEL_BANCO = 'duena@ejemplo.mx';
const EJECUTABLE = process.env.CHROMIUM || undefined;

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const salud = await fetch(`${BASE}/s101/salud`).then((r) => r.json()).catch(() => null);
if (!salud?.data?.entorno || salud.data.entorno === 'produccion') {
  console.log(`El entorno es «${salud?.data?.entorno}»: esta prueba sólo corre contra el banco de pruebas o staging.`);
  process.exit(1);
}
const BANCO_FALSO = salud.data.version === 'falsa';
const SUPER = BANCO_FALSO ? DUENA_DEL_BANCO : (process.env.CORREO_SUPERADMIN || DUENA_DEL_BANCO);

const navegador = await chromium.launch({ executablePath: EJECUTABLE });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' });
const pagina = await ctx.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

try {
  // Entrar por «Olvidé mi contraseña»: el código se lee de la respuesta que
  // pidió la propia interfaz, como en panel.spec.mjs.
  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await pagina.fill('#correo', SUPER);
  await pagina.click('#b-correo');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });
  const [resp] = await Promise.all([
    pagina.waitForResponse((r) => r.url().endsWith('/s101/auth/codigo'), { timeout: 20000 }),
    pagina.click('#olvide'),
  ]);
  const codigo = (await resp.json())?.data?.codigo_prueba;
  if (!codigo) throw new Error(`el servidor no devolvió código de prueba para ${SUPER}: ¿esa cuenta existe ahí?`);
  await pagina.waitForSelector('#v-codigo:not([hidden])', { timeout: 15000 });
  await pagina.fill('#codigo', codigo);
  await pagina.click('#b-codigo');
  await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 20000 });
  await pagina.click('#menu [data-ir="licencias"]');
  await pagina.waitForSelector('#v-licencias:not([hidden])', { timeout: 10000 });
  await pagina.waitForFunction(() => !/Cargando/.test(document.getElementById('l-filas').textContent), null, { timeout: 15000 });
  rev(true, 'la lista de licencias carga');

  // La de muestra del banco: una máquina, dormida.
  await pagina.click('#l-filas tr[data-lic="lic-1"] [data-ver-lic]');
  await pagina.waitForSelector('#l-detalle:not([hidden])', { timeout: 10000 });
  await pagina.waitForSelector('#ld-activaciones tr[data-huella]', { timeout: 10000 });

  console.log('· un solo botón de guardar');
  rev((await pagina.locator('#ld-guardar').count()) === 1, 'hay UN «Guardar cambios»');
  rev((await pagina.locator('#ld-guardar-tipo, #ld-guardar-lugares').count()) === 0, 'y ya no hay dos botones para una sola forma');
  rev((await pagina.locator('#ld-pago').count()) === 1, '«Marcar pago» sigue aparte: no es editar un campo, es asentar un pago');
  rev((await pagina.inputValue('#ld-lugares')) === '1', 'la licencia de muestra permite 1 máquina', await pagina.inputValue('#ld-lugares'));

  await pagina.fill('#ld-lugares', '3');
  await pagina.selectOption('#ld-tipo', 'stripe');
  const [patch] = await Promise.all([
    pagina.waitForRequest((r) => r.method() === 'PATCH' && /\/licencias\/lic-1$/.test(r.url()), { timeout: 10000 }),
    pagina.click('#ld-guardar'),
  ]);
  const mandado = patch.postDataJSON();
  rev(mandado.lugares === 3, 'el PATCH lleva las máquinas', JSON.stringify(mandado));
  rev(mandado.tipo === 'stripe' && typeof mandado.perpetua === 'boolean', 'y el tipo y perpetua, en la misma llamada');

  await pagina.waitForFunction(() => /Ahora 3 máquinas a la vez/.test(document.getElementById('ld-aviso').textContent), null, { timeout: 10000 });
  const acuse = await pagina.textContent('#ld-aviso');
  rev(/Ahora 3 máquinas a la vez \(antes 1\)/.test(acuse), 'el acuse dice de cuánto a cuánto', acuse.trim());
  rev(!/^Guardado\.$/.test(acuse.trim()), 'y no un «Guardado.» a secas');
  rev(/3 máquinas a la vez/.test(await pagina.textContent('#ld-resumen')), 'el resumen ya dice 3: el acuse va DESPUÉS de recargar');
  rev((await pagina.inputValue('#ld-lugares')) === '3', 'y el campo también');
  rev(/lugares: 1 → 3/.test(await pagina.textContent('#ld-bitacora')), 'la bitácora tiene el renglón de lugares, que antes nunca existió');
  rev(/3 de 3|1 de 3/.test(await pagina.textContent('#l-filas tr[data-lic="lic-1"]')), 'y la lista se refrescó');

  console.log('· las máquinas dormidas');
  rev((await pagina.locator('#ld-activaciones tr[data-dormida]').count()) === 1, 'la máquina con 75 días sin latir sale marcada dormida');
  rev(/dormida/.test(await pagina.textContent('#ld-activaciones tr[data-dormida]')), 'y su renglón lo dice');
  rev(!(await pagina.locator('#ld-dormidas').isHidden()) && /30 días sin dar señales/.test(await pagina.textContent('#ld-dormidas')), 'con un aviso arriba de la tabla');
  rev((await pagina.locator('#ld-activaciones tr[data-dormida] [data-liberar]').count()) === 1, 'y sigue activa, con su botón: liberarla lo decide una persona');
  rev(/TALLER-PC/.test(await pagina.textContent('#ld-activaciones')), 'el nombre del equipo (0.21.4) se ve cuando lo hay');

  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
} catch (e) {
  rev(false, 'la prueba reventó', String(e).slice(0, 300));
} finally {
  await navegador.close();
}
console.log(`\n${fallas ? `${fallas} falla(s)` : 'Todo bien'}: ${revisadas} comprobaciones`);
process.exit(fallas ? 1 : 0);
