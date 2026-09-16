/* El panel, manejado con un navegador de verdad.
 *
 * Entra como superadmin de STAGING usando el `codigo_prueba` que la API
 * devuelve fuera de producción, y recorre lo que pide el arranque (§4):
 *
 *   crear `prueba-<hhmm>` → que exista en GET /admin/orgs con org_db_version
 *   ≥ 3 → apagar peek y que la API conteste 403 app_inactiva a peek101 →
 *   prenderlo y que ya no → suspender y 403 org_inactiva en cualquier ruta →
 *   reactivar → gente: agregar y quitar → entrar con una cuenta que NO es
 *   superadmin y que la pantalla no enseñe empresas (prueba de control).
 *
 * Corre a 390 × 844 y a 1440. Contra el banco de pruebas por omisión (que
 * puede ser la API de mentiras, `node pruebas/servidor.mjs --falso`), o
 * contra lo publicado si se le pasa BASE:
 *
 *   node pruebas/panel.spec.mjs
 *   BASE=https://master101-staging.mike-929.workers.dev \
 *   API_ORIGEN=https://suite101-api-staging.mike-929.workers.dev \
 *   CORREO_SUPERADMIN=… CORREO_CONTROL=… node pruebas/panel.spec.mjs
 *
 * Nunca contra producción: ahí está `forespot`. Si /s101/salud no dice
 * staging o prueba, se para. Lo que crea, lo borra al final
 * (DELETE /admin/orgs/:o sólo existe fuera de producción).
 */

import { chromium } from 'playwright';

const BASE = (process.env.BASE || 'http://127.0.0.1:8791').replace(/\/$/, '');
// La API «directa», para pegarle con otra X-App que no sea master101: en el
// banco falso es una puerta del mismo servidor; contra staging, la API misma.
const API_DIRECTA = (process.env.API_ORIGEN || `${BASE}/api-directa`).replace(/\/$/, '');
const SUPER = process.env.CORREO_SUPERADMIN || 'duena@ejemplo.mx';
const CONTROL = process.env.CORREO_CONTROL || 'cliente@ejemplo.mx';
const EJECUTABLE = process.env.CHROMIUM || undefined;
const hhmm = new Date().toISOString().slice(11, 16).replace(':', '');
const ORG = `prueba-${hhmm}-${Math.random().toString(36).slice(2, 6)}`;

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, { method = 'GET', body, cabeceras = {} } = {}) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...cabeceras }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let c = null; try { c = await r.json(); } catch { /* sin JSON */ }
  return { estado: r.status, cuerpo: c, puesta: r.headers.get('set-cookie') || '' };
}

/** Pide un código esperando si la API dice que todavía no toca (45 s). */
async function codigoNuevo(correo, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const r = await json(`${BASE}/s101/auth/codigo`, { method: 'POST', body: { correo } });
    if (r.cuerpo?.data?.codigo_prueba) return r.cuerpo.data.codigo_prueba;
    if (r.cuerpo?.error === 'demasiados_intentos') {
      const s = (r.cuerpo.detalle?.espera_segundos ?? 45) + 2;
      console.log(`  (la API pide esperar ${s} s para otro código de ${correo})`);
      await dormir(s * 1000);
      continue;
    }
    throw new Error(`la API no devolvió codigo_prueba para ${correo} (${r.estado} ${r.cuerpo?.error ?? ''}): esto no es staging`);
  }
  throw new Error('no se pudo obtener un código después de esperar');
}

/** Una sesión por fuera del navegador, para comprobar por la API lo que la pantalla hizo. */
async function sesionDe(correo) {
  const codigo = await codigoNuevo(correo);
  const r = await json(`${BASE}/s101/auth/entrar`, { method: 'POST', body: { correo, codigo } });
  const galleta = r.puesta.split(';')[0];
  if (!galleta) throw new Error(`no vino la galleta de sesión de ${correo} (${r.estado})`);
  return galleta;
}

/* ─────────────── el entorno: nunca producción ─────────────── */

const salud = await json(`${BASE}/s101/salud`);
const entorno = salud.cuerpo?.data?.entorno;
if (entorno === 'produccion' || !entorno) {
  console.log(`El entorno es «${entorno}»: esta prueba sólo corre contra staging o el banco de pruebas.`);
  process.exit(1);
}
console.log(`entorno: ${entorno} · panel: ${BASE} · API directa: ${API_DIRECTA} · org de prueba: ${ORG}`);

const galletaSuper = await sesionDe(SUPER);
const yo = await json(`${BASE}/s101/yo`, { cabeceras: { Cookie: galletaSuper } });
if (yo.cuerpo?.data?.superadmin !== true) {
  console.log(`${SUPER} no es superadmin en este entorno: no hay con qué probar.`);
  process.exit(1);
}

/** Entra en el navegador con el código que la propia interfaz pidió. */
async function entrarEnPantalla(pagina, correo) {
  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await pagina.fill('#correo', correo);
  let codigo = null;
  for (let i = 0; i < 4 && !codigo; i++) {
    const espera = pagina.waitForResponse((r) => r.url().endsWith('/s101/auth/codigo'), { timeout: 20000 });
    await pagina.click('#b-correo');
    const cuerpo = await (await espera).json().catch(() => null);
    codigo = cuerpo?.data?.codigo_prueba ?? null;
    if (!codigo) {
      const s = (cuerpo?.detalle?.espera_segundos ?? 45) + 2;
      console.log(`  (la API pide esperar ${s} s para otro código)`);
      await dormir(s * 1000);
    }
  }
  if (!codigo) throw new Error('la interfaz no consiguió un código de prueba');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });
  await pagina.fill('#clave', codigo);
  await pagina.click('#b-clave');
}

async function contexto(navegador, ancho, alto) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-MX' });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  const terceros = [];
  pagina.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin) terceros.push(u.host); });
  return { ctx, pagina, errores, terceros };
}

const sinScroll = async (pagina, donde) => {
  const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rev(sobra <= 1, `sin scroll horizontal en ${donde}`, `sobran ${sobra} px`);
};

/* ─────────────── el recorrido, en un celular ─────────────── */

async function recorrido(navegador) {
  console.log(`\n== celular (390 × 844) ==`);
  const { ctx, pagina, errores, terceros } = await contexto(navegador, 390, 844);

  // Un código equivocado se dice con palabras.
  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await sinScroll(pagina, 'la entrada');
  await entrarEnPantalla(pagina, SUPER);
  await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 20000 });
  rev(true, 'con el código bueno entra a Empresas');
  rev((await pagina.textContent('#quien-n')).trim() === SUPER, 'arriba dice quién entró', SUPER);
  await pagina.waitForFunction(() => document.querySelectorAll('#e-filas tr[data-org]').length > 0, null, { timeout: 15000 });
  const enApi = (await json(`${BASE}/s101/admin/orgs`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  const pintadas = await pagina.locator('#e-filas tr[data-org]').count();
  rev(pintadas === enApi.length, 'hay una fila por empresa de GET /admin/orgs', `${pintadas} de ${enApi.length}`);
  rev(await pagina.locator('#e-filas tr[data-org="demo"]').count() === 1, 'la org demo está en la tabla');
  await sinScroll(pagina, 'la tabla de empresas');

  // ── alta ──
  await pagina.click('#e-nueva');
  await pagina.waitForSelector('#v-alta:not([hidden])', { timeout: 10000 });
  await pagina.fill('#a-nombre', 'Prueba Ñandú & Cía');
  rev((await pagina.inputValue('#a-id')) === 'prueba-nandu-cia', 'el identificador se sugiere del nombre, sin acentos ni símbolos', await pagina.inputValue('#a-id'));
  await pagina.fill('#a-id', ORG);
  await pagina.uncheck('#f-alta input[data-app="roster"]');
  await pagina.fill('#a-dueno', `dueno-${ORG}@ejemplo.mx`);
  await pagina.fill('#a-dueno-nombre', 'Dueño de prueba');
  await pagina.click('#b-alta');
  await pagina.waitForSelector('#a-listo:not([hidden])', { timeout: 30000 });
  const listo = await pagina.textContent('#a-listo');
  rev(listo.includes(ORG), 'la pantalla dice que la empresa quedó creada', ORG);
  rev(/versión 3|versión [4-9]/.test(listo), 'y que su base está en la versión 3 o más', listo.match(/versión \d+/)?.[0] ?? '');
  rev(listo.includes(`dueno-${ORG}@ejemplo.mx`), 'y con qué correo entra el dueño');
  rev(/dash101, quell101, peek101, quote101/.test(listo) && !/roster101/.test(listo), 'y qué apps quedaron prendidas (roster no)', listo.match(/Apps prendidas: [^.]+/)?.[0] ?? '');

  const creada = (await json(`${BASE}/s101/admin/orgs`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas?.find((o) => o.id === ORG);
  rev(!!creada && creada.activa === true, `GET /admin/orgs trae ${ORG}, activa`);
  rev(creada?.apps?.peek === true && creada?.apps?.roster === false, 'con peek prendido y roster apagado', JSON.stringify(creada?.apps));
  const gente = (await json(`${BASE}/s101/admin/orgs/${ORG}/miembros`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  rev(gente.length === 1 && gente[0].rol === 'owner' && gente[0].correo === `dueno-${ORG}@ejemplo.mx`, 'su dueño quedó como owner', JSON.stringify(gente.map((g) => [g.correo, g.rol])));

  // ── interruptores: apagar peek ──
  await pagina.click('#a-ver-empresas');
  await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 10000 });
  await pagina.waitForSelector(`#e-filas tr[data-org="${ORG}"]`, { timeout: 15000 });
  const swPeek = pagina.locator(`#e-filas input[data-app="peek"][data-org="${ORG}"]`);
  rev(await swPeek.isChecked(), 'el interruptor de peek está prendido');
  const esperaPatch = pagina.waitForResponse((r) => r.url().includes(`/s101/admin/orgs/${ORG}`) && r.request().method() === 'PATCH', { timeout: 15000 });
  await swPeek.click({ force: true });
  await esperaPatch;
  await pagina.waitForFunction((org) => !document.querySelector(`#e-filas input[data-app="peek"][data-org="${org}"]`)?.checked, ORG, { timeout: 10000 });
  // 0.2.0: la tabla trae gente y última entrada por empresa (contrato 0.5.0).
  rev((await pagina.textContent(`#e-filas [data-personas="${ORG}"]`)).trim() === '1', 'la tabla dice que la empresa nueva tiene 1 persona (su dueño)', await pagina.textContent(`#e-filas [data-personas="${ORG}"]`));
  rev((await pagina.textContent(`#e-filas [data-entrada="${ORG}"]`)).includes('nadie'), 'y que nadie ha entrado todavía');
  const peekApagado = await json(`${API_DIRECTA}/orgs/${ORG}/peek`, { cabeceras: { Cookie: galletaSuper, 'X-App': 'peek101' } });
  rev(peekApagado.estado === 403 && peekApagado.cuerpo?.error === 'app_inactiva', 'con peek apagado, la API le contesta 403 app_inactiva a peek101', `${peekApagado.estado} ${peekApagado.cuerpo?.error ?? ''}`);

  // ── y prenderlo otra vez ──
  const esperaPatch2 = pagina.waitForResponse((r) => r.url().includes(`/s101/admin/orgs/${ORG}`) && r.request().method() === 'PATCH', { timeout: 15000 });
  await swPeek.click({ force: true });
  await esperaPatch2;
  await pagina.waitForFunction((org) => document.querySelector(`#e-filas input[data-app="peek"][data-org="${org}"]`)?.checked, ORG, { timeout: 10000 });
  const peekPrendido = await json(`${API_DIRECTA}/orgs/${ORG}/peek`, { cabeceras: { Cookie: galletaSuper, 'X-App': 'peek101' } });
  rev(peekPrendido.cuerpo?.error !== 'app_inactiva', 'con peek prendido ya no es app_inactiva', `${peekPrendido.estado} ${peekPrendido.cuerpo?.error ?? 'ok'}`);

  // ── suspender ──
  pagina.once('dialog', (d) => d.accept());
  const esperaSusp = pagina.waitForResponse((r) => r.url().includes(`/s101/admin/orgs/${ORG}`) && r.request().method() === 'PATCH', { timeout: 15000 });
  await pagina.click(`#e-filas [data-suspender="${ORG}"]`);
  await esperaSusp;
  await pagina.waitForSelector(`#e-filas tr[data-org="${ORG}"].inactiva`, { timeout: 10000 });
  rev((await pagina.textContent(`#e-filas tr[data-org="${ORG}"] .chip`)).trim() === 'suspendida', 'la fila dice suspendida');
  rev(await pagina.locator(`#e-filas input[data-app="dash"][data-org="${ORG}"]`).isDisabled(), 'y sus interruptores quedan apagados de tocar');
  const suspendida = await json(`${API_DIRECTA}/orgs/${ORG}/negocios`, { cabeceras: { Cookie: galletaSuper, 'X-App': 'dash101' } });
  rev(suspendida.estado === 403 && suspendida.cuerpo?.error === 'org_inactiva', 'suspendida, la API contesta 403 org_inactiva en cualquier ruta', `${suspendida.estado} ${suspendida.cuerpo?.error ?? ''}`);

  // ── reactivar ──
  const esperaReact = pagina.waitForResponse((r) => r.url().includes(`/s101/admin/orgs/${ORG}`) && r.request().method() === 'PATCH', { timeout: 15000 });
  await pagina.click(`#e-filas [data-suspender="${ORG}"]`);
  await esperaReact;
  await pagina.waitForSelector(`#e-filas tr[data-org="${ORG}"]:not(.inactiva)`, { timeout: 10000 });
  const reactivada = await json(`${API_DIRECTA}/orgs/${ORG}/negocios`, { cabeceras: { Cookie: galletaSuper, 'X-App': 'dash101' } });
  rev(reactivada.cuerpo?.error !== 'org_inactiva', 'reactivada, ya no es org_inactiva', `${reactivada.estado} ${reactivada.cuerpo?.error ?? 'ok'}`);

  // ── gente ──
  await pagina.click(`#e-filas [data-gente="${ORG}"]`);
  await pagina.waitForSelector('#v-gente:not([hidden])', { timeout: 10000 });
  await pagina.waitForSelector('#g-filas td.mono', { timeout: 15000 });
  // 0.2.0: la bitácora de la empresa ya trae lo que se hizo arriba, con quién.
  await pagina.waitForFunction(() => document.querySelectorAll('#g-bitacora tr').length > 1, null, { timeout: 15000 });
  const textoBit = await pagina.locator('#g-bitacora').innerText();
  rev(/App peek101/.test(textoBit) && /apagada/.test(textoBit) && /prendida/.test(textoBit), 'la bitácora de la empresa enseña que peek se apagó y se prendió', textoBit.split('\n').slice(0, 3).join(' | '));
  rev(/Activa/.test(textoBit), 'y que se suspendió y reactivó');
  rev(textoBit.includes(SUPER), 'con el correo de quien lo hizo');
  rev(/Se creó la empresa/.test(textoBit), 'y la creación');
  rev((await pagina.locator('#g-filas [data-quitar]').count()) === 1, 'la gente de la empresa trae al dueño');
  await pagina.fill('#p-correo', `oficina-${ORG}@ejemplo.mx`);
  await pagina.selectOption('#p-rol', 'staff');
  await pagina.click('#b-gente');
  await pagina.waitForFunction(() => document.querySelectorAll('#g-filas [data-quitar]').length === 2, null, { timeout: 15000 });
  rev(true, 'se agrega a alguien de oficina y aparece en la lista');
  const conDos = (await json(`${BASE}/s101/admin/orgs/${ORG}/miembros`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  rev(conDos.some((m) => m.correo === `oficina-${ORG}@ejemplo.mx` && m.rol === 'staff'), 'y la API la tiene como staff');
  await sinScroll(pagina, 'la gente de una empresa');

  // Quitar: el botón no se habilita hasta escribir el correo tal cual.
  await pagina.click(`#g-filas [data-correo="oficina-${ORG}@ejemplo.mx"]`);
  await pagina.waitForSelector('#velo:not([hidden])', { timeout: 5000 });
  rev(await pagina.locator('#q-quitar').isDisabled(), 'quitar pide escribir el correo: el botón arranca apagado');
  await pagina.fill('#q-escrito', 'otro@correo.mx');
  rev(await pagina.locator('#q-quitar').isDisabled(), 'con otro correo sigue apagado');
  await pagina.fill('#q-escrito', `oficina-${ORG}@ejemplo.mx`);
  rev(!(await pagina.locator('#q-quitar').isDisabled()), 'con el correo exacto se prende');
  await pagina.click('#q-quitar');
  await pagina.waitForFunction(() => document.querySelectorAll('#g-filas [data-quitar]').length === 1, null, { timeout: 15000 });
  const conUno = (await json(`${BASE}/s101/admin/orgs/${ORG}/miembros`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  rev(conUno.length === 1, 'quitada de la pantalla y de la API', `${conUno.length} persona(s)`);

  // Y quitar a la de oficina también quedó apuntado.
  await pagina.waitForFunction((c) => document.querySelector('#g-bitacora')?.innerText.includes(c), `oficina-${ORG}@ejemplo.mx (staff)`, { timeout: 15000 });
  rev(true, 'agregar y quitar gente queda en la bitácora de la empresa');

  // ── superadmins (0.2.0) ──
  await pagina.click('#menu [data-ir="super"]');
  await pagina.waitForSelector('#v-super:not([hidden])', { timeout: 10000 });
  // Se espera a una fila DE VERDAD (con correo), no al renglón de «Cargando…»:
  // contra staging la primera corrida leyó ese renglón y falló por eso.
  await pagina.waitForSelector('#s-filas td.mono', { timeout: 15000 });
  const supersAntes = await pagina.locator('#s-filas tr').count();
  rev((await pagina.locator('#s-filas').innerText()).includes(SUPER), 'la lista de superadmins trae al que entró', `${supersAntes} superadmin(s)`);
  rev((await pagina.locator(`#s-filas [data-quitar-super]`).count()) < supersAntes, 'uno mismo no tiene botón de quitar');
  const nuevoSuper = `super-${ORG}@ejemplo.mx`;
  await pagina.fill('#s-correo', nuevoSuper);
  await pagina.fill('#s-nombre', 'Súper de prueba');
  await pagina.click('#b-super');
  await pagina.waitForFunction((n) => document.querySelectorAll('#s-filas tr').length === n + 1, supersAntes, { timeout: 15000 });
  rev(true, 'se agrega un superadmin por correo y aparece en la lista');
  const listaSuper = (await json(`${BASE}/s101/admin/superadmins`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  const agregado = listaSuper.find((x) => x.correo === nuevoSuper);
  rev(!!agregado, 'y la API lo tiene como superadmin');
  const miUid = (await json(`${BASE}/s101/yo`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.usuario?.id;
  const aMiMismo = await json(`${BASE}/s101/admin/superadmins/${miUid}`, { method: 'DELETE', cabeceras: { Cookie: galletaSuper } });
  rev(aMiMismo.estado === 409 && aMiMismo.cuerpo?.detalle?.motivo === 'a_ti_mismo', 'quitarse a sí mismo por la API da 409 a_ti_mismo', `${aMiMismo.estado} ${aMiMismo.cuerpo?.error ?? ''}`);
  await sinScroll(pagina, 'superadmins');
  await pagina.click(`#s-filas [data-quitar-super="${agregado?.usuario_id}"]`);
  await pagina.waitForSelector('#velo:not([hidden])', { timeout: 5000 });
  rev((await pagina.textContent('#q-titulo')).includes('superadmin'), 'quitar un superadmin pide escribir su correo');
  await pagina.fill('#q-escrito', nuevoSuper);
  await pagina.click('#q-quitar');
  await pagina.waitForFunction((n) => document.querySelectorAll('#s-filas tr').length === n, supersAntes, { timeout: 15000 });
  rev(true, 'quitado: la lista vuelve a como estaba');
  const textoSuperBit = await pagina.locator('#s-bitacora').innerText();
  rev(textoSuperBit.includes(nuevoSuper), 'el alta y la baja del superadmin quedaron en su bitácora');
  const yaNo = (await json(`${BASE}/s101/admin/superadmins`, { cabeceras: { Cookie: galletaSuper } })).cuerpo?.data?.filas ?? [];
  rev(!yaNo.some((x) => x.correo === nuevoSuper), 'y la API ya no lo tiene');
  await pagina.click('#menu [data-ir="empresas"]');
  await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 10000 });

  // Importar es un enlace a la página que ya existe en la API.
  rev((await pagina.getAttribute('#liga-importar', 'href')) === '/s101/admin/importar', 'importar es un enlace a la página de la API, no una copia');

  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
  rev(terceros.length === 0, 'cero peticiones a terceros', [...new Set(terceros)].join(', '));
  await ctx.close();
}

/* ─────────────── el control: quien no es superadmin no ve nada ─────────────── */

async function control(navegador) {
  console.log(`\n== control: ${CONTROL} no manda aquí (1440 × 900) ==`);
  const { ctx, pagina, errores } = await contexto(navegador, 1440, 900);
  await entrarEnPantalla(pagina, CONTROL);
  await pagina.waitForSelector('#v-nomanda:not([hidden])', { timeout: 20000 });
  rev(true, 'entra, pero cae en «esta cuenta no manda aquí»');
  rev((await pagina.textContent('#nomanda-correo')).trim() === CONTROL, 'y dice qué cuenta es');
  rev(await pagina.locator('#v-empresas').isHidden(), 'la tabla de empresas no se enseña');
  rev(await pagina.locator('#menu').isHidden(), 'ni el menú');
  rev((await pagina.locator('#e-filas tr').count()) === 0, 'y no se pidió ninguna empresa a la API');
  const galletaControl = (await ctx.cookies()).find((c) => c.name === 's101')?.value;
  const directo = await json(`${BASE}/s101/admin/orgs`, { cabeceras: { Cookie: `s101=${galletaControl}` } });
  rev(directo.estado === 403, 'y aunque pida /admin/orgs a mano, la API le dice 403', `${directo.estado} ${directo.cuerpo?.error ?? ''}`);
  await pagina.click('#nomanda-salir');
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 10000 });
  rev(true, 'salir regresa al correo');
  await sinScroll(pagina, 'la pantalla de control');
  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ─────────────── en escritorio, la tabla completa ─────────────── */

async function escritorio(navegador) {
  console.log(`\n== computadora (1440 × 900) ==`);
  const { ctx, pagina, errores } = await contexto(navegador, 1440, 900);
  await entrarEnPantalla(pagina, SUPER);
  await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 20000 });
  await pagina.waitForSelector(`#e-filas tr[data-org="${ORG}"]`, { timeout: 15000 });
  rev((await pagina.locator('#e-tabla thead th.app').count()) === 6, 'seis columnas de apps');
  rev((await pagina.locator('#e-tabla thead th').count()) === 12, 'doce columnas: empresa, plan, seis apps, gente, última entrada, estado y acciones');
  rev((await pagina.locator(`#e-filas tr[data-org="${ORG}"] input[data-app]`).count()) === 6, 'seis interruptores por empresa');
  await sinScroll(pagina, 'la tabla en escritorio');
  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ─────────────── entrar con Google ───────────────
 * Contra el banco falso se recorre el camino entero: el botón, la API «manda
 * a Google» y regresa con `?entrada=`, la app canjea el boleto y queda
 * dentro. Contra staging no se puede pasar por Google de verdad: se
 * intercepta /s101/auth/google con el 501 de «no configurado» y se mide que
 * la pantalla lo diga con palabras, y que un boleto inventado no entre. */

async function google(navegador) {
  console.log(`\n== entrar con Google (390 × 844) ==`);
  const { ctx, pagina, errores } = await contexto(navegador, 390, 844);
  const contraStaging = Boolean(process.env.BASE);
  if (contraStaging) {
    await pagina.route('**/s101/auth/google**', (r) => r.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'google_no_configurado' }) }));
  }
  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  rev(await pagina.isVisible('#b-google'), 'el botón «Entrar con Google» está en la pantalla del correo');
  rev(/Entrar con Google/.test(await pagina.locator('#b-google').innerText()), 'y dice «Entrar con Google»');
  await pagina.click('#b-google');
  if (contraStaging) {
    await pagina.waitForFunction(() => document.getElementById('err-correo').textContent.trim() !== '', null, { timeout: 10000 });
    const aviso = (await pagina.locator('#err-correo').innerText()).trim();
    rev(/todavía no está prendido/.test(aviso), 'sin llaves de Google la pantalla lo dice con palabras', aviso);
    rev(!/501|google_no_configurado/.test(aviso), 'y sin códigos de programador');
    rev(await pagina.isVisible('#v-correo'), 'y se queda en la pantalla del correo');
  } else {
    await pagina.waitForSelector('#v-empresas:not([hidden])', { timeout: 20000 });
    rev(true, 'Google (de mentiras) regresó con el boleto, se canjeó y la dueña quedó dentro');
    rev(!new URL(pagina.url()).searchParams.has('entrada'), 'el boleto se quitó de la barra de direcciones');
    const quien = (await pagina.locator('#quien-n').innerText()).trim();
    rev(quien.includes(SUPER), 'y la sesión es la de la dueña', quien);
  }
  // Un boleto inventado no entra, y se dice.
  await pagina.goto(`${BASE}/?entrada=boleto-inventado`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  // #v-correo se ve desde el primer pintado: hay que esperar a que la API
  // conteste el canje, no a la pantalla. Contra staging la respuesta tarda
  // más que contra el banco, y leer antes deja el aviso vacío (run del
  // 16-sep, 02:53Z).
  await pagina.waitForFunction(() => document.getElementById('err-correo').textContent.trim() !== '', null, { timeout: 15000 });
  const malo = (await pagina.locator('#err-correo').innerText()).trim();
  rev(/ya no sirve/.test(malo), 'un boleto inventado no entra y se dice con palabras', malo);
  rev(!new URL(pagina.url()).searchParams.has('entrada'), 'y también se quita de la barra');
  await sinScroll(pagina, 'la pantalla del correo con el botón de Google');
  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ─────────────── ─────────────── */

const navegador = await chromium.launch(EJECUTABLE ? { executablePath: EJECUTABLE } : {});
try {
  await recorrido(navegador);
  await escritorio(navegador);
  await control(navegador);
  await google(navegador);
} catch (e) {
  fallas++;
  console.log(`  FALLA la prueba tronó: ${e?.stack || e}`);
} finally {
  await navegador.close();
  // Lo que se creó, se borra: DELETE /admin/orgs/:o sólo existe fuera de producción.
  const borrada = await json(`${BASE}/s101/admin/orgs/${ORG}`, { method: 'DELETE', cabeceras: { Cookie: galletaSuper } }).catch(() => ({ estado: 0 }));
  console.log(`\n  ${borrada.estado === 200 ? 'ok   ' : 'AVISO'} la org de prueba ${ORG} ${borrada.estado === 200 ? 'se borró' : 'NO se pudo borrar (' + borrada.estado + ')'}`);
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
