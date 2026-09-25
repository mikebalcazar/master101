// La dirección de workers.dev manda al dominio propio; el dominio y staging sirven.
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('api') };
const prod = { DOMINIO_PROPIO: 'master101.taller101.com', ASSETS, API };
const staging = { ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://master101.mike-929.workers.dev/?x=1#y', prod);
ok(r.status === 301, 'una lectura en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://master101.taller101.com/?x=1', 'y conserva ruta y consulta');
r = await pide('https://master101.mike-929.workers.dev/estilo.css', prod);
ok(r.status === 301, 'los archivos también');
r = await pide('https://master101.taller101.com/', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio se sirve el sitio');
r = await pide('https://master101.mike-929.workers.dev/s101/yo', prod);
ok(r.status === 200 && await r.text() === 'api', 'la puerta a la suite no se redirige');
r = await pide('https://master101.mike-929.workers.dev/s101/auth/salir', prod, { method: 'POST' });
ok(r.status === 200, 'ni lo que no es lectura');
r = await pide('https://master101-staging.mike-929.workers.dev/', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'staging, sin DOMINIO_PROPIO, sirve tal cual');
console.log(`${n} revisadas · 0 fallas`);
