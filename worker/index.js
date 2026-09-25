/* La puerta del Worker de master101.
 *
 * Decisión D1: cada app vive en su propio Worker y le habla a `suite101-api`
 * desde su mismo origen, por `/s101/*`, con un *service binding*. La sesión
 * es la cookie `s101` de la API; servida desde el mismo origen es cookie
 * propia y no hay CORS que configurar.
 *
 * El Worker pone `X-App: master101`; la interfaz no lo manda, y si lo manda se
 * sobrescribe: la app no decide quién dice ser. Con `master101` la API no
 * aplica el apagado por `apps` (es el panel de control), pero sí exige
 * superadmin en todo `/admin/*`: eso lo decide la API, no este Worker.
 *
 * Lo demás son archivos de `public/`, servidos tal cual por `env.ASSETS`. */

const PREFIJO = '/s101';

/* Desde el 25-sep-2026 la app vive en su dominio propio (`DOMINIO_PROPIO`, en
 * el wrangler.toml de producción). La dirección de workers.dev SE QUEDA VIVA
 * pero manda para allá (Mike, 25-sep: «redirigir, no apagar»): las ligas que
 * ya se mandaron siguen sirviendo y todos acaban en el dominio. Sólo las
 * lecturas (GET/HEAD) y sólo lo que no es la puerta a la suite: una petición
 * a `/s101/*` desde workers.dev viene de una página que ya se está yendo.
 * Staging no tiene `DOMINIO_PROPIO` y no redirige. */
export function aDominioPropio(req, env, u) {
  const d = env.DOMINIO_PROPIO;
  if (!d || u.hostname === d || !u.hostname.endsWith('.workers.dev')) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) return null;
  return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const ida = aDominioPropio(req, env, u);
    if (ida) return ida;
    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      // `/s101/admin/orgs` → `/admin/orgs`. Un `/s101` pelón va a la raíz.
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', 'master101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  },
};
