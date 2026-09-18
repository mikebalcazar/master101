/* Qué ofrece la pantalla de entrada, y que esté bien cableada.
 *
 * El 16-sep-2026 la entrada se homologó por encargo de Mike: Google o correo y
 * contraseña en todas las apps de la suite menos roster101. El código de 6
 * dígitos se queda como recuperación, no como forma de entrar, y el PIN se fue
 * de aquí.
 *
 * Corre sin red, sin navegador y sin la API, a propósito: es la única
 * comprobación de esta pantalla que se puede hacer siempre.
 *
 * LO QUE DE VERDAD APORTA es el cableado. Esta app no se empaqueta: el HTML y
 * el JS se sirven tal cual. Nadie compila nada, así que un `$('b-clave')` que
 * apunta a un id que ya no existe no truena al armar —no hay armado— ni al
 * cargar la página: truena cuando alguien le pica, y en pantalla se ve como
 * que el botón no hace nada. Es el riesgo de partir una pantalla en tres.
 *
 *   node pruebas/entrada.mjs
 */

import { readFileSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const jsCrudo = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

/* Los comentarios se quitan antes de afirmar que algo NO está: este archivo y
 * `app.js` explican con letras lo que se quitó, y una afirmación sobre el texto
 * crudo se cacha a sí misma. Pasó en el corte de dash101 ese mismo día. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const js = sinComentarios(jsCrudo);
const htmlSinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');

console.log('\n· el cableado: cada id que el JS busca existe en algún lado');
/* No todos los ids viven en el HTML: varios los pinta el propio JS con
 * `innerHTML` y luego los cablea. La primera versión de esta prueba sólo miraba
 * el HTML y reportó `a-ver-empresas` y `a-ver-gente` de master101 como
 * faltantes — y no faltaban, los crea el JS tres renglones antes de usarlos. Se
 * revisó antes de "arreglar" nada: el defecto era de la prueba. Así que un id
 * vale si está en el HTML o si el propio JS lo escribe. */
const usados = [...new Set([...js.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))].sort();
const faltantes = usados.filter((id) =>
  !new RegExp(`id="${id}"`).test(html) && !new RegExp(`id="${id}"`).test(js));
rev(faltantes.length === 0, `los ${usados.length} ids que usa app.js están en el HTML o los pinta el JS`,
  faltantes.length ? `faltan: ${faltantes.join(', ')}` : '');

/* Y al revés, sólo para las vistas: una vista que el HTML trae y `mostrar()` no
 * conoce se queda visible encima de las demás al cambiar de pantalla. */
const vistas = [...html.matchAll(/id="(v-[a-z0-9-]+)"/g)].map((m) => m[1]);
const lista = js.match(/VISTAS = \[([^\]]+)\]/)?.[1] ?? js.match(/for \(const v of \[([^\]]+)\]\)/)?.[1] ?? '';
const noConocidas = vistas.filter((v) => !lista.includes(`'${v}'`));
rev(noConocidas.length === 0, `las ${vistas.length} vistas del HTML las conoce mostrar()`,
  noConocidas.length ? `no conoce: ${noConocidas.join(', ')}` : '');

console.log('\n· qué se ofrece para entrar');
rev(/body: \{ correo, clave: v \}/.test(js), 'entra con correo y contraseña');
rev(/body: \{ correo, codigo: v \}/.test(js), 'y con el código, que es la recuperación');
rev(/auth\/google/.test(js), 'y Google sigue ahí');
rev(/Olvid[ée] mi contrase/i.test(htmlSinComentarios), 'la pantalla ofrece «Olvidé mi contraseña»');
rev(/type="password"/.test(htmlSinComentarios), 'y tiene campo de contraseña');
rev(/name="password"/.test(htmlSinComentarios) && /name="new-password"/.test(htmlSinComentarios),
  'con nombre, para que el administrador del teléfono la guarde');

console.log('\n· qué ya NO se ofrece');
rev(!/\bpin\b/i.test(js), 'app.js no manda ningún PIN a la suite');
rev(!/\bPIN\b/.test(htmlSinComentarios), 'la pantalla no menciona el PIN');
rev(!/cambiar-modo/.test(js) && !/cambiar-modo/.test(html), 'se fue el botón que cambiaba de código a PIN');
rev(!/one-time-code/.test(htmlSinComentarios.split('id="v-codigo"')[0]),
  'la primera pantalla ya no pide un código de un solo uso');

console.log('\n· la contraseña obligatoria después del código');
rev(/!(YO|yo)\.tiene_clave\s*&&\s*(YO|yo)\.entro_con\s*===\s*'codigo'/.test(js),
  'se le pide poner contraseña a quien entró con código y no tiene');
rev(!/!(YO|yo)\.tiene_clave\s*\)/.test(js), 'y a quien entró con Google no se le pide (guarda)');

/* La contraseña NO se recorta al mandarla: un espacio al principio o al final
 * es parte de ella. Recortarla haría que una buena no entrara, sin explicación. */
rev(/const v = \$\('clave'\)\.value;/.test(js), 'la contraseña se manda tal cual, sin recortarla');

// El marcador dice cuántas pasaron, no cuántas fallaron: la primera versión
// imprimía «FALLAS: 13/15» con 13 buenas, que se lee exactamente al revés.
console.log(`\n${fallas ? `${fallas} FALLA${fallas > 1 ? 'S' : ''}` : 'todo bien'} · ${revisadas - fallas} de ${revisadas} pasaron\n`);
process.exit(fallas ? 1 : 0);
