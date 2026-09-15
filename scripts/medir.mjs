/* Mide el Worker de master101 ya publicado en Cloudflare.
 *
 * El chat no alcanza *.workers.dev: el proxy de salida se lo rechaza. El
 * corredor de GitHub sí. Por eso esto corre allá y lo que mide vuelve por el
 * comentario del commit, que es lo único que el chat puede leer (OPERAR §6).
 *
 * Lo que se mide, y por qué:
 *
 *   la portada y sus piezas  que los archivos de `public/` estén servidos.
 *   la versión servida       que lo que contesta el borde sea lo que se acaba
 *                            de construir, y no la copia anterior.
 *   /s101/salud              que el enlace de servicio llegue a la API, y a
 *                            LA QUE TOCA. Un enlace cruzado sería el panel de
 *                            prueba tocando las empresas reales.
 *   la cabecera X-App        el Worker la pone; el navegador nunca la manda.
 *   sólo superadmin          en staging se entra como superadmin y /admin/orgs
 *                            trae la org `demo`; una cuenta que no lo es
 *                            recibe 403. En producción NO se entra y NO se
 *                            escribe: ahí está `forespot`.
 */

const PROD = process.env.PROD;
const STAGING = process.env.STAGING;
const VERSION_ESPERADA = process.env.VERSION_ESPERADA || '';
const CORREO_SUPER = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const CORREO_CONTROL = process.env.CORREO_CONTROL || 'familia.ramirez@ejemplo.mx';

const PIEZAS = ['/estilo.css', '/app.js', '/fonts/fira-cifras-400.woff2', '/fonts/raleway-400.woff2', '/fonts/sansation-700.woff2'];

let fallas = 0, revisadas = 0;
const linea = (t) => console.log(t);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function rev(ok, texto, extra = '') {
  revisadas++; if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function traer(base, ruta, { method = 'GET', body, cabeceras = {}, galleta } = {}) {
  const t0 = Date.now();
  const h = { ...cabeceras };
  if (body) h['Content-Type'] = 'application/json';
  if (galleta) h.Cookie = galleta;
  const r = await fetch(`${base}${ruta}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const texto = await r.text();
  let crudo = null;
  try { crudo = JSON.parse(texto); } catch { /* HTML o una fuente */ }
  const cuerpo = crudo && typeof crudo === 'object' && 'ok' in crudo
    ? (crudo.ok ? crudo.data : { error: crudo.error, detalle: crudo.detalle })
    : crudo;
  return { estado: r.status, ms: Date.now() - t0, tipo: r.headers.get('content-type') || '', puesta: r.headers.get('set-cookie') || '', bytes: texto.length, texto, cuerpo };
}

async function laCascara(base, quien) {
  linea('');
  linea(`== ${quien} ==  ${base}`);
  let portada = await traer(base, '/');
  let intentos = 1;
  const sirveLaNueva = (r) => r.estado === 200 && (!VERSION_ESPERADA || r.texto.includes(VERSION_ESPERADA));
  while (!sirveLaNueva(portada) && intentos < 12) { await dormir(5000); portada = await traer(base, '/'); intentos++; }
  rev(portada.estado === 200, 'la portada contesta', `${portada.estado} en ${portada.ms} ms · ${intentos} intento${intentos === 1 ? '' : 's'}`);
  rev(portada.texto.includes('master101'), 'la portada trae su marca');
  if (VERSION_ESPERADA) {
    const m = portada.texto.match(/name="master101-version" content="([^"]*)"/);
    rev(m?.[1] === VERSION_ESPERADA, 'la portada es la versión que se acaba de construir', `sirve ${m?.[1]?.slice(0, 8) ?? '(sin versión)'}, se esperaba ${VERSION_ESPERADA.slice(0, 8)}`);
  }
  let peso = portada.bytes;
  for (const pieza of PIEZAS) {
    const r = await traer(base, pieza);
    peso += r.bytes;
    rev(r.estado === 200, `la pieza ${pieza}`, `${r.estado} ${r.tipo.split(';')[0]}`);
  }
  linea(`       la primera carga pesa ~${Math.round(peso / 1024)} KB (portada + ${PIEZAS.length} piezas)`);
  const html = portada.texto + (await traer(base, '/estilo.css')).texto;
  rev(!/fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr/.test(html), 'cero peticiones a terceros');
  rev(portada.texto.includes('name="robots" content="noindex"'), 'la portada pide no indexarse');
}

async function elEnlace(base, entornoEsperado, quien) {
  const salud = await traer(base, '/s101/salud');
  const d = salud.cuerpo || {};
  rev(salud.estado === 200, `${quien}: /s101/salud contesta`, `${salud.estado} en ${salud.ms} ms`);
  rev(d.entorno === entornoEsperado, `${quien}: el enlace va a la API de ${entornoEsperado}`, `contestó «${d.entorno}»`);
  linea(`       contrato ${d.contrato}  ·  versión ${d.version}  ·  D1 ${d.d1}`);
  const sinSesion = await traer(base, '/s101/admin/orgs');
  rev(sinSesion.estado === 401 && sinSesion.cuerpo?.error === 'sin_sesion', `${quien}: sin sesión /s101/admin/orgs contesta 401, y no los archivos`, `${sinSesion.estado} ${sinSesion.cuerpo?.error ?? sinSesion.tipo}`);
}

/* ─────────────── producción: mirar, no tocar ─────────────── */

async function produccion() {
  await laCascara(PROD, 'Producción');
  await elEnlace(PROD, 'produccion', 'producción');
  const c = await traer(PROD, '/s101/auth/codigo', { method: 'POST', body: { correo: 'nadie@ejemplo.mx' } });
  rev(c.cuerpo?.codigo_prueba === undefined, 'producción NUNCA devuelve el código en la respuesta');
}

/* ─────────────── staging: sólo superadmin ─────────────── */

async function entrar(base, correo) {
  for (let i = 0; i < 4; i++) {
    const pide = await traer(base, '/s101/auth/codigo', { method: 'POST', body: { correo } });
    const codigo = pide.cuerpo?.codigo_prueba;
    if (!codigo) {
      if (pide.cuerpo?.error === 'demasiados_intentos') {
        const s = (pide.cuerpo.detalle?.espera_segundos ?? 45) + 2;
        linea(`       (la API pide esperar ${s} s para otro código de ${correo})`);
        await dormir(s * 1000);
        continue;
      }
      return { error: `staging no devolvió codigo_prueba para ${correo}: ${pide.estado} ${pide.cuerpo?.error ?? ''}` };
    }
    const entra = await traer(base, '/s101/auth/entrar', { method: 'POST', body: { correo, codigo } });
    if (entra.estado === 200) return { galleta: entra.puesta.split(';')[0], puesta: entra.puesta };
    if (i === 3) return { error: `entrar como ${correo}: ${entra.estado} ${entra.cuerpo?.error ?? ''}` };
  }
  return { error: 'no se pudo entrar' };
}

async function staging() {
  await laCascara(STAGING, 'Staging');
  await elEnlace(STAGING, 'staging', 'staging');

  const s = await entrar(STAGING, CORREO_SUPER);
  if (s.error) { rev(false, 'entrar como superadmin', s.error); return; }
  rev(s.puesta.includes('s101='), 'la galleta de sesión se pone en el origen de master101', s.galleta.slice(0, 12) + '…');

  const yo = await traer(STAGING, '/s101/yo', { galleta: s.galleta });
  rev(yo.cuerpo?.superadmin === true, '/s101/yo dice superadmin: true', `${yo.estado}`);

  // El Worker pone X-App: master101. Se le manda una basura a propósito: si
  // la pusiera el navegador, la API contestaría 400 app_desconocida.
  const conBasura = await traer(STAGING, '/s101/orgs/demo/negocios', { galleta: s.galleta, cabeceras: { 'X-App': 'basura-a-proposito' } });
  rev(conBasura.cuerpo?.error !== 'app_desconocida' && conBasura.cuerpo?.error !== 'sin_app', 'el Worker sobrescribe X-App: master101 (se mandó basura y no fue app_desconocida)', `${conBasura.estado} ${conBasura.cuerpo?.error ?? 'ok'}`);

  const lista = await traer(STAGING, '/s101/admin/orgs', { galleta: s.galleta });
  const filas = lista.cuerpo?.filas ?? [];
  rev(lista.estado === 200, '/s101/admin/orgs contesta al superadmin', `${lista.estado} · ${filas.length} empresa(s)`);
  rev(filas.some((o) => o.id === 'demo'), 'y trae la org demo', filas.map((o) => o.id).join(', '));
  linea(`       ${filas.map((o) => `${o.id}${o.activa ? '' : ' (suspendida)'} · ${o.personas ?? '?'} persona(s)`).join(' · ')}`);
  rev(filas.every((o) => typeof o.personas === 'number' && 'ultima_entrada' in o), 'cada empresa trae personas y ultima_entrada (contrato 0.5.0)');
  const supers = await traer(STAGING, '/s101/admin/superadmins', { galleta: s.galleta });
  rev(supers.estado === 200 && (supers.cuerpo?.filas ?? []).some((x) => x.correo === CORREO_SUPER), '/s101/admin/superadmins trae al superadmin', `${supers.cuerpo?.total ?? supers.estado}`);
  const bitacora = await traer(STAGING, '/s101/admin/bitacora', { galleta: s.galleta });
  rev(bitacora.estado === 200 && Array.isArray(bitacora.cuerpo?.filas), '/s101/admin/bitacora contesta', `${bitacora.cuerpo?.total ?? bitacora.estado} renglón(es)`);

  // El control: quien no es superadmin recibe 403 en /admin.
  const c = await entrar(STAGING, CORREO_CONTROL);
  if (c.error) { rev(false, `entrar como la cuenta de control ${CORREO_CONTROL}`, c.error); return; }
  const yoC = await traer(STAGING, '/s101/yo', { galleta: c.galleta });
  rev(yoC.cuerpo?.superadmin === false, 'la cuenta de control NO es superadmin');
  const noPuede = await traer(STAGING, '/s101/admin/orgs', { galleta: c.galleta });
  rev(noPuede.estado === 403 && noPuede.cuerpo?.error === 'sin_permiso', 'y /s101/admin/orgs le contesta 403', `${noPuede.estado} ${noPuede.cuerpo?.error ?? ''}`);
}

/* ─────────────── ─────────────── */

const t0 = Date.now();
linea(`master101 como Worker — medido el ${new Date().toISOString()}`);
if (!PROD && !STAGING) { linea('No hay nada que medir: faltan PROD y STAGING.'); process.exit(1); }
try {
  if (PROD) await produccion();
  if (STAGING) await staging();
} catch (e) {
  fallas++;
  linea(`\nSe cayó la medición: ${e?.stack || e}`);
}
linea('');
linea(`${revisadas} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas === 0 ? 0 : 1);
