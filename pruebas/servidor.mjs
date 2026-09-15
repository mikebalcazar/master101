/* El Worker, pero en esta máquina, para poder probar con un navegador.
 *
 * `wrangler dev` no sirve aquí: el *service binding* a `suite101-api` sólo
 * existe dentro de Cloudflare. Así que este guion hace lo MISMO que
 * `worker/index.js` —servir `public/` y reenviar `/s101/*` poniendo
 * `X-App: master101`— pero por HTTP contra la API de STAGING.
 *
 * Y tiene un segundo modo, `--falso`, para donde staging no se alcanza (el
 * chat que escribe el código no llega a *.workers.dev): una API de mentiras,
 * en memoria, con las mismas rutas y los mismos códigos de error que
 * `suite101-api/src/rutas/admin.ts`, `auth.ts` y `orgs.ts`. Sirve para medir
 * la PANTALLA; que el Worker de verdad y la API de verdad se entiendan lo mide
 * `scripts/medir.mjs` desde el corredor, contra lo publicado. Las dos
 * mediciones hacen falta.
 *
 *   node pruebas/servidor.mjs [puerto]           contra staging
 *   node pruebas/servidor.mjs --falso [puerto]   con la API de mentiras
 *
 * En el modo falso: `duena@ejemplo.mx` es superadmin, `cliente@ejemplo.mx`
 * no; el código de prueba siempre es el que devuelve /auth/codigo.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLICO = fileURLToPath(new URL('../public/', import.meta.url));
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const args = process.argv.slice(2);
const FALSO = args.includes('--falso');
const PUERTO = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PUERTO || 8791);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

/* ─────────────── la API de mentiras ─────────────── */

export function apiFalsa() {
  const SUPER = 'duena@ejemplo.mx';
  const usuarios = new Map([
    ['u-duena', { id: 'u-duena', correo: SUPER, nombre: 'Dueña', creado_at: '2026-09-01T00:00:00Z' }],
    ['u-cliente', { id: 'u-cliente', correo: 'cliente@ejemplo.mx', nombre: 'Familia Ramírez', creado_at: '2026-09-01T00:00:00Z' }],
    ['u-demo-owner', { id: 'u-demo-owner', correo: 'owner@demo.mx', nombre: 'Owner Demo', creado_at: '2026-09-01T00:00:00Z' }],
  ]);
  const orgs = new Map([
    ['demo', { id: 'demo', nombre: 'Demo', plan: 'prueba', apps: { dash: true, quell: true, peek: true, cotizador: true, roster: false, nest: false }, moneda: 'MXN', activa: true, creado_at: '2026-09-01T00:00:00Z' }],
  ]);
  const miembros = new Map([['demo', [{ org_id: 'demo', usuario_id: 'u-demo-owner', rol: 'owner', apps: [], negocios: [] }]]]);
  const sesiones = new Map();   // cookie → usuario_id
  const codigos = new Map();    // correo → codigo
  const accesos = new Map([['u-cliente', { org_id: 'demo', tipo: 'cliente', ref_id: 'c1' }]]);
  const LLAVE = { dash101: 'dash', quell101: 'quell', peek101: 'peek', cotizador101: 'cotizador', roster101: 'roster', nest101: 'nest' };
  let n = 0;

  const ok = (data, estado = 200, cabeceras = {}) => ({ estado, cuerpo: { ok: true, data }, cabeceras });
  const err = (error, estado, detalle) => ({ estado, cuerpo: { ok: false, error, ...(detalle ? { detalle } : {}) }, cabeceras: {} });
  const porCorreo = (c) => [...usuarios.values()].find((u) => u.correo === c);

  return async function atender(metodo, ruta, cabeceras, cuerpo) {
    const galleta = (cabeceras.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('s101='))?.slice(5);
    const uid = galleta ? sesiones.get(galleta) : null;
    const app = cabeceras['x-app'] || '';
    const url = new URL(ruta, 'http://x');
    const p = url.pathname.replace(/\/$/, '') || '/';

    if (p === '/salud') return ok({ servicio: 'suite101-api', version: 'falsa', contrato: '0.4.0', entorno: 'prueba', d1: `si (${orgs.size} orgs)`, at: new Date().toISOString() });
    if (p === '/') return ok({ servicio: 'suite101-api', que_es: 'de mentiras' });

    if (p === '/auth/codigo' && metodo === 'POST') {
      const correo = String(cuerpo.correo || '').toLowerCase();
      if (!porCorreo(correo)) return ok({ enviado: false, mensaje: 'Si ese correo tiene acceso, le llega un código.' });
      const codigo = String(100000 + Math.floor(Math.random() * 900000));
      codigos.set(correo, codigo);
      return ok({ enviado: false, vence_en_segundos: 600, codigo_prueba: codigo });
    }
    if (p === '/auth/entrar' && metodo === 'POST') {
      const correo = String(cuerpo.correo || '').toLowerCase();
      const u = porCorreo(correo);
      if (!u) return err('sin_permiso', 403);
      if (cuerpo.codigo !== undefined) {
        if (codigos.get(correo) !== String(cuerpo.codigo)) return err('codigo_invalido', 401, { intentos_restantes: 4 });
        codigos.delete(correo);
      } else if (cuerpo.pin !== undefined) {
        if (String(cuerpo.pin) !== '246810') return err('pin_invalido', 401);
      } else return err('datos_invalidos', 400, { falta: 'codigo o pin' });
      const c = `ses-${++n}-${Math.random().toString(36).slice(2)}`;
      sesiones.set(c, u.id);
      return ok({ usuario: u, vive_segundos: 3600 }, 200, { 'Set-Cookie': `s101=${c}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=3600` });
    }
    if (p === '/auth/salir' && metodo === 'POST') { if (galleta) sesiones.delete(galleta); return ok({ cerrada: true }, 200, { 'Set-Cookie': 's101=; Path=/; Max-Age=0' }); }

    if (!uid) return err('sin_sesion', 401);
    const yo = usuarios.get(uid);
    const superadmin = yo.correo === SUPER;

    if (p === '/yo') {
      return ok({ usuario: yo, superadmin, orgs: superadmin ? [...orgs.values()].map((o) => ({ id: o.id, nombre: o.nombre, rol: 'owner', apps: [], negocios: [] })) : [], acceso: accesos.get(uid) ?? null });
    }

    // /orgs/:o/... — la puerta que aplica org_inactiva y app_inactiva, como orgs.ts
    let m = p.match(/^\/orgs\/([^/]+)(\/.*)?$/);
    if (m) {
      if (!app) return err('sin_app', 400);
      if (!LLAVE[app] && app !== 'master101' && app !== 'suite101') return err('app_desconocida', 400);
      const o = orgs.get(m[1]);
      if (!o) return err('org_desconocida', 404);
      if (!o.activa) return err('org_inactiva', 403);
      if (LLAVE[app] && o.apps[LLAVE[app]] !== true) return err('app_inactiva', 403, { app });
      return ok({ org: o.id, ruta: m[2] || '/' });
    }

    if (!p.startsWith('/admin')) return err('no_encontrado', 404);
    if (p === '/admin/importar' && metodo === 'GET') return { estado: 200, html: '<!doctype html><title>Importar · Taller 101</title><p>La página del importador, tal como vive en la API (#0080C1).</p>', cabeceras: {} };
    if (!superadmin) return err('sin_permiso', 403);

    if (p === '/admin/orgs' && metodo === 'GET') return ok({ total: orgs.size, filas: [...orgs.values()] });
    if (p === '/admin/orgs' && metodo === 'POST') {
      const id = String(cuerpo.id || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{2,40}$/.test(id)) return err('datos_invalidos', 400, { id: 'slug de a-z, 0-9 y guiones' });
      if (!cuerpo.nombre) return err('datos_invalidos', 400, { falta: 'nombre' });
      if (orgs.has(id)) return err('datos_invalidos', 409, { id: 'ya existe' });
      const o = { id, nombre: cuerpo.nombre, plan: cuerpo.plan || '', apps: { dash: false, quell: false, peek: false, cotizador: false, roster: false, nest: false, ...(cuerpo.apps || {}) }, moneda: cuerpo.moneda || 'MXN', activa: true, creado_at: new Date().toISOString() };
      orgs.set(id, o); miembros.set(id, []);
      return ok({ org: o, org_db_version: 3 }, 201);
    }
    m = p.match(/^\/admin\/orgs\/([^/]+)$/);
    if (m && metodo === 'PATCH') {
      const o = orgs.get(m[1]);
      if (!o) return err('org_desconocida', 404);
      if (cuerpo.nombre !== undefined) o.nombre = cuerpo.nombre;
      if (cuerpo.plan !== undefined) o.plan = cuerpo.plan;
      if (cuerpo.apps !== undefined) o.apps = cuerpo.apps;
      if (cuerpo.activa !== undefined) o.activa = !!cuerpo.activa;
      return ok({ ...o });
    }
    if (m && metodo === 'DELETE') {
      if (!orgs.has(m[1])) return err('org_desconocida', 404);
      orgs.delete(m[1]); miembros.delete(m[1]);
      return ok({ reiniciada: m[1], org_db_version: 3 });
    }
    m = p.match(/^\/admin\/orgs\/([^/]+)\/miembros$/);
    if (m && metodo === 'GET') {
      if (!orgs.has(m[1])) return err('org_desconocida', 404);
      const filas = (miembros.get(m[1]) || []).map((x) => ({ ...x, correo: usuarios.get(x.usuario_id).correo, nombre: usuarios.get(x.usuario_id).nombre }));
      return ok({ total: filas.length, filas });
    }
    if (m && metodo === 'POST') {
      if (!orgs.has(m[1])) return err('org_desconocida', 404);
      const correo = String(cuerpo.correo || '').trim().toLowerCase();
      if (!correo) return err('datos_invalidos', 400, { falta: 'correo' });
      if (!['owner', 'admin', 'socio', 'staff'].includes(cuerpo.rol)) return err('datos_invalidos', 400, { rol: ['owner', 'admin', 'socio', 'staff'] });
      let u = porCorreo(correo);
      if (!u) { u = { id: `u-${++n}`, correo, nombre: cuerpo.nombre ?? null, creado_at: new Date().toISOString() }; usuarios.set(u.id, u); }
      const lista = miembros.get(m[1]);
      const ya = lista.find((x) => x.usuario_id === u.id);
      if (ya) ya.rol = cuerpo.rol; else lista.push({ org_id: m[1], usuario_id: u.id, rol: cuerpo.rol, apps: cuerpo.apps || [], negocios: cuerpo.negocios || [] });
      return ok({ usuario_id: u.id, correo, rol: cuerpo.rol }, 201);
    }
    m = p.match(/^\/admin\/orgs\/([^/]+)\/miembros\/([^/]+)$/);
    if (m && metodo === 'DELETE') {
      const lista = miembros.get(m[1]) || [];
      miembros.set(m[1], lista.filter((x) => x.usuario_id !== m[2]));
      return ok({ quitado: true });
    }
    return err('no_encontrado', 404);
  };
}

/* ─────────────── el servidor ─────────────── */

const atender = FALSO ? apiFalsa() : null;

const servidor = createServer(async (pet, res) => {
  const u = new URL(pet.url, `http://127.0.0.1:${PUERTO}`);

  // Sólo en el modo falso: una puerta a la API de mentiras SIN sobrescribir
  // X-App, para que la prueba pueda pegarle como peek101 o dash101 y ver el
  // 403 app_inactiva / org_inactiva. Contra staging esa puerta es la API misma.
  if (FALSO && u.pathname.startsWith('/api-directa/')) {
    const ruta = u.pathname.slice('/api-directa'.length) + u.search;
    const trozos = [];
    for await (const t of pet) trozos.push(t);
    let cuerpo = {};
    try { cuerpo = trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {}; } catch { cuerpo = {}; }
    const r = await atender(pet.method, ruta, pet.headers, cuerpo);
    res.writeHead(r.estado, { ...r.cabeceras, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.cuerpo));
    return;
  }

  if (u.pathname === '/s101' || u.pathname.startsWith('/s101/')) {
    const ruta = (u.pathname.slice('/s101'.length) || '/') + u.search;
    const trozos = [];
    for await (const t of pet) trozos.push(t);
    const crudo = Buffer.concat(trozos);

    if (FALSO) {
      let cuerpo = {};
      try { cuerpo = crudo.length ? JSON.parse(crudo.toString('utf8')) : {}; } catch { cuerpo = {}; }
      // El Worker de verdad sobrescribe X-App: aquí se hace lo mismo.
      const r = await atender(pet.method, ruta, { ...pet.headers, 'x-app': 'master101' }, cuerpo);
      const salida = { ...r.cabeceras };
      if (salida['Set-Cookie']) salida['Set-Cookie'] = salida['Set-Cookie'].replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax');
      if (r.html) { res.writeHead(r.estado, { ...salida, 'Content-Type': 'text/html; charset=utf-8' }); res.end(r.html); return; }
      res.writeHead(r.estado, { ...salida, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.cuerpo));
      return;
    }

    const destino = new URL(API);
    destino.pathname = ruta.split('?')[0];
    destino.search = u.search;
    const cabeceras = { 'X-App': 'master101' };
    if (pet.headers.cookie) cabeceras.Cookie = pet.headers.cookie;
    if (pet.headers['content-type']) cabeceras['Content-Type'] = pet.headers['content-type'];
    const r = await fetch(destino, { method: pet.method, headers: cabeceras, body: crudo.length ? crudo : undefined, redirect: 'manual' });
    const cuerpo = Buffer.from(await r.arrayBuffer());
    const salida = { 'Content-Type': r.headers.get('content-type') ?? 'application/json' };
    // La galleta de la API dice `Secure`, y en http://127.0.0.1 el navegador
    // la tiraría. Se le quita SÓLO aquí, en el banco de pruebas.
    const puesta = r.headers.get('set-cookie');
    if (puesta) salida['Set-Cookie'] = puesta.replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax');
    res.writeHead(r.status, salida);
    res.end(cuerpo);
    return;
  }

  const limpia = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICO, limpia === '/' ? 'index.html' : limpia);
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('no está');
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`master101 en http://127.0.0.1:${PUERTO}  →  ${FALSO ? 'API de mentiras, en memoria' : API}`);
});
