/* sondeo101: el Worker de sondeo.taller101.com.
 *
 * Cada sondeo es una carpeta de `public/` (p. ej. `public/iconos/`) y le
 * habla a este Worker por `/api/<sondeo>`:
 *
 *   GET  /api/<sondeo>          lo marcado hasta hoy y los envíos
 *   PUT  /api/<sondeo>/<item>   guarda lo de un renglón (JSON, hasta 8 KB)
 *   POST /api/<sondeo>/enviar   «Terminé»: deja una foto de todo lo marcado
 *
 * Todo cae en la D1 `sondeo101` (tablas `respuestas` y `envios`). El chat
 * la lee directo; por eso aquí no hay pantalla de resultados.
 *
 * No pide cuenta: el sondeo es de Mike y la liga es suya. Si un día un
 * sondeo se manda a más gente, se le pone la puerta de la suite. */

const NOMBRE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const MAXIMO = 8 * 1024;

const json = (datos, estado = 200) => new Response(JSON.stringify(datos), {
  status: estado,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

async function cuerpoJson(req) {
  const texto = await req.text();
  if (texto.length > MAXIMO) return { error: 'muy_grande' };
  try {
    const v = JSON.parse(texto || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? { v } : { error: 'no_es_objeto' };
  } catch { return { error: 'json_invalido' }; }
}

export async function api(req, env, partes) {
  const [sondeo, item] = partes;
  if (!sondeo || !NOMBRE.test(sondeo) || partes.length > 2) return json({ error: 'ruta' }, 404);
  const ahora = new Date().toISOString();

  if (partes.length === 1 && req.method === 'GET') {
    const { results: filas } = await env.DB.prepare('SELECT item, datos FROM respuestas WHERE sondeo = ?').bind(sondeo).all();
    const { results: envios } = await env.DB.prepare('SELECT cuando, comentario FROM envios WHERE sondeo = ? ORDER BY id DESC LIMIT 20').bind(sondeo).all();
    const respuestas = {};
    for (const f of filas) respuestas[f.item] = JSON.parse(f.datos);
    return json({ sondeo, respuestas, envios });
  }

  if (item === 'enviar' && req.method === 'POST') {
    const c = await cuerpoJson(req);
    if (c.error) return json({ error: c.error }, 400);
    const comentario = typeof c.v.comentario === 'string' ? c.v.comentario.slice(0, 4000) : '';
    const { results: filas } = await env.DB.prepare('SELECT item, datos FROM respuestas WHERE sondeo = ? ORDER BY item').bind(sondeo).all();
    const foto = {};
    for (const f of filas) foto[f.item] = JSON.parse(f.datos);
    await env.DB.prepare('INSERT INTO envios (sondeo, cuando, quien, comentario, foto) VALUES (?, ?, ?, ?, ?)')
      .bind(sondeo, ahora, req.headers.get('cf-connecting-ip') || '', comentario, JSON.stringify(foto)).run();
    return json({ ok: true, cuando: ahora, renglones: filas.length });
  }

  if (item && item !== 'enviar' && NOMBRE.test(item) && req.method === 'PUT') {
    const c = await cuerpoJson(req);
    if (c.error) return json({ error: c.error }, 400);
    await env.DB.prepare('INSERT INTO respuestas (sondeo, item, datos, cuando) VALUES (?, ?, ?, ?) ON CONFLICT (sondeo, item) DO UPDATE SET datos = excluded.datos, cuando = excluded.cuando')
      .bind(sondeo, item, JSON.stringify(c.v), ahora).run();
    return json({ ok: true, cuando: ahora });
  }

  return json({ error: 'metodo' }, 405);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const d = env.DOMINIO_PROPIO;
    if (d && u.hostname === d && u.protocol === 'http:' && (req.method === 'GET' || req.method === 'HEAD')) {
      return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
    }
    if (u.pathname.startsWith('/api/')) {
      try { return await api(req, env, u.pathname.slice(5).split('/').filter(Boolean)); }
      catch (e) { return json({ error: 'interno', detalle: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
