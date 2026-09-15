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

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
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
