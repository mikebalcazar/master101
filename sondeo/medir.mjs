/* Mide sondeo101 publicado. BASE=<url> node sondeo/medir.mjs [--escribir]
 * Sin --escribir sólo lee (producción). Con --escribir guarda y envía en el
 * sondeo `prueba-humo` (staging o local). */
const BASE = process.env.BASE; const ESCRIBIR = process.argv.includes('--escribir');
if (!BASE) { console.error('falta BASE'); process.exit(2); }
let n = 0, fallas = 0; const t0 = Date.now();
const ok = (c, m) => { n++; if (!c) fallas++; console.log(`${c ? 'ok   ' : 'FALLA'} ${m}`); };
const ir = (ruta, op) => fetch(BASE + ruta, op);

let r = await ir('/'); ok(r.status === 200 && (await r.text()).includes('Sondeos 101'), 'GET / → la lista de sondeos');
r = await ir('/iconos/'); const html = await r.text();
ok(r.status === 200 && html.includes('Íconos de la suite 101') && html.includes("SONDEO = 'iconos-suite'"), 'GET /iconos/ → la hoja de íconos');
r = await ir('/iconos-2/'); const h2 = await r.text();
ok(r.status === 200 && h2.includes("SONDEO = 'iconos-suite-2'"), 'GET /iconos-2/ → la segunda vuelta');
r = await ir('/api/iconos-suite'); let j = await r.json().catch(() => null);
ok(r.status === 200 && j && typeof j.respuestas === 'object', 'GET /api/iconos-suite → lo marcado (JSON)');
r = await ir('/api/NO_VALE'); ok(r.status === 404, 'un nombre de sondeo inválido → 404');
r = await ir('/no-existe/'); ok(r.status === 404, 'una página que no existe → 404');

if (ESCRIBIR) {
  const marca = { estado: 'queda', elegida: true, nota: 'humo ' + Date.now() };
  r = await ir('/api/prueba-humo/app-1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(marca) });
  ok(r.status === 200, 'PUT una marca → 200');
  r = await ir('/api/prueba-humo'); j = await r.json();
  ok(j.respuestas?.['app-1']?.nota === marca.nota, 'la marca se lee de vuelta igual');
  r = await ir('/api/prueba-humo/app-1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '[1]' });
  ok(r.status === 400, 'un cuerpo que no es objeto → 400');
  r = await ir('/api/prueba-humo/app-1', { method: 'PUT', body: 'x'.repeat(9000) });
  ok(r.status === 400, 'un cuerpo de más de 8 KB → 400');
  r = await ir('/api/prueba-humo/enviar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comentario: 'humo' }) });
  j = await r.json(); ok(r.status === 200 && j.renglones >= 1, '«Enviar» guarda la foto de lo marcado');
  r = await ir('/api/prueba-humo'); j = await r.json();
  ok(j.envios?.[0]?.comentario === 'humo', 'el envío aparece en la lista');
}
console.log(`\n${n} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas ? 1 : 0);
