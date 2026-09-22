/* El «atrás» del navegador en el panel del dueño de la suite.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior. Hay funciones que son 3 o 4 clicks
 * para llegar y si le picas back al navegador te saca y pierdes la ruta de
 * navegación que habías hecho».
 *
 * POR QUÉ SE MIDE CON UN HISTORIAL DE MENTIRAS
 *
 * Lo delicado de esto no es el navegador: es la CUENTA de entradas. Un
 * `pushState` de más obliga a picar atrás dos veces; uno de menos saca del
 * panel. Las dos se ven igual de bien en la pantalla y sólo se notan al
 * caminar el recorrido, así que se camina contando.
 *
 * Aquí hay algo que en peek101 no había: CUATRO secciones al mismo nivel. No
 * basta con saber a qué hondura se volvió —hay que saber a cuál de las
 * cuatro—, y eso es lo que más se puede romper sin que se vea.
 *
 *   node pruebas/el-atras.mjs
 */

import { readFileSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

function navegadorFalso() {
  const pila = [{ estado: null }];
  let i = 0;
  const oyentes = [];
  const history = {
    get state() { return pila[i].estado; },
    pushState(estado) { pila.splice(i + 1); pila.push({ estado }); i = pila.length - 1; },
    replaceState(estado) { pila[i] = { estado }; },
    back() { if (i > 0) { i--; oyentes.slice().forEach((f) => f()); } },
  };
  return {
    history,
    addEventListener: (qué, f) => { if (qué === 'popstate') oyentes.push(f); },
    // Retroceder NO acorta la pila —la entrada de adelante sigue ahí, como en
    // un navegador de verdad, para poder dar «adelante»—, así que para saber
    // si volvimos al mismo sitio hay que mirar la POSICIÓN, no el largo.
    posicion: () => i,
    largo: () => pila.length,
  };
}

const g = navegadorFalso();
globalThis.history = g.history;
globalThis.window = { addEventListener: g.addEventListener };
const { irA, sellar, regresar, abrirEncima, alNavegar } = await import('../public/navegar.js');

/* Un panel de mentiras con las mismas piezas que el de verdad: cuatro
 * secciones, dos detalles y un velo. */
const HONDURA = { seccion: 1, detalle: 2 };
let pantalla = '', abierta = null, filtrosPuestos = false, veloAbierto = false;
alNavegar((donde, dato, volviendo) => {
  pantalla = donde || 'empresas';
  abierta = dato;
  if (pantalla === 'licencias' && !volviendo) filtrosPuestos = false;
});

console.log('· entrar al panel no apila: «atrás» desde empresas no lleva a ningún lado');
sellar(HONDURA.seccion, 'empresas');
pantalla = 'empresas';
const alEntrar = g.posicion();
rev(alEntrar === 0, 'entrar deja el historial donde estaba', `posición ${alEntrar}`);
rev(g.largo() === 1, 'y no escribe una entrada de más', `${g.largo()} entradas`);

console.log('· abrir una empresa y regresar con «atrás»');
irA(HONDURA.detalle, 'gente', 'acme');
rev(pantalla === 'gente' && abierta === 'acme', 'se abre la gente de la empresa');
rev(g.posicion() === alEntrar + 1, 'y deja una entrada', `${g.posicion()} vs ${alEntrar}`);
g.history.back();
rev(pantalla === 'empresas', 'atrás regresa a la lista de empresas, no saca del panel');
rev(g.posicion() === alEntrar, 'y queda parado donde estaba', `${g.posicion()} vs ${alEntrar}`);

console.log('· «← Empresas» hace lo mismo que atrás, no algo parecido');
/* Si el botón escribiera una entrada nueva, el siguiente atrás reabriría la
 * empresa que se acaba de cerrar y parecería que el panel se devolvió solo. */
irA(HONDURA.detalle, 'gente', 'acme');
const conEmpresa = g.posicion();
regresar();
rev(pantalla === 'empresas', 'el botón regresa a la lista');
rev(g.posicion() === conEmpresa - 1, 'retrocediendo, no apilando', `${g.posicion()} vs ${conEmpresa}`);

console.log('· alternar entre las cuatro secciones no llena el historial');
const antesDeAlternar = g.posicion();
irA(HONDURA.seccion, 'licencias');
irA(HONDURA.seccion, 'super');
irA(HONDURA.seccion, 'alta');
irA(HONDURA.seccion, 'empresas');
rev(pantalla === 'empresas', 'se llega a donde se picó');
rev(g.posicion() === antesDeAlternar, 'y el historial no creció', `${g.posicion()} vs ${antesDeAlternar}`);

console.log('· atrás sabe a CUÁL de las cuatro secciones volver');
/* Esto es lo que una hondura sola no alcanza a decir: de la gente de una
 * empresa se vuelve a empresas, y de una licencia se vuelve a licencias. */
irA(HONDURA.seccion, 'licencias');
irA(HONDURA.detalle, 'licencia', 'L-1');
rev(pantalla === 'licencia' && abierta === 'L-1', 'se abre la licencia');
g.history.back();
rev(pantalla === 'licencias', 'atrás vuelve a licencias, no a empresas', `volvió a ${pantalla}`);

console.log('· volver a la lista de licencias no le borra los filtros a nadie');
filtrosPuestos = true;
irA(HONDURA.detalle, 'licencia', 'L-2');
g.history.back();
rev(filtrosPuestos, 'los filtros siguen puestos al regresar');
irA(HONDURA.seccion, 'licencias');
rev(!filtrosPuestos, 'pero entrar de nuevo a la sección sí los limpia');

console.log('· salir de un detalle hacia otra sección no apila ni confunde');
irA(HONDURA.detalle, 'gente', 'acme');
const enGente = g.posicion();
irA(HONDURA.seccion, 'super');       // picar el menú desde adentro
rev(pantalla === 'super', 'se va a superadmins');
rev(g.posicion() === enGente, 'sin apilar otra entrada', `${g.posicion()} vs ${enGente}`);
g.history.back();
rev(pantalla !== 'gente', 'y «atrás» no reabre la empresa que ya se había dejado', `volvió a ${pantalla}`);

console.log('· el velo de «quitar a alguien»: atrás lo cierra, no cambia de pantalla');
irA(HONDURA.detalle, 'gente', 'acme');
const bajoElVelo = g.posicion();
pantalla = 'gente';
veloAbierto = true;
let cerrar = abrirEncima(() => { veloAbierto = false; });
rev(g.posicion() === bajoElVelo + 1, 'abrirlo deja una entrada', `${g.posicion()} vs ${bajoElVelo}`);
g.history.back();
rev(!veloAbierto, 'atrás cierra el velo');
rev(pantalla === 'gente', 'y la pantalla de abajo se queda como estaba', `quedó en ${pantalla}`);
rev(g.posicion() === bajoElVelo, 'consumiendo la entrada del velo', `${g.posicion()} vs ${bajoElVelo}`);

console.log('· «Cancelar» del velo hace exactamente lo mismo que atrás');
veloAbierto = true;
cerrar = abrirEncima(() => { veloAbierto = false; });
const conVelo = g.posicion();
cerrar();
rev(!veloAbierto, 'el botón cierra el velo');
rev(g.posicion() === conVelo - 1, 'retrocediendo, para que el siguiente atrás no lo reabra', `${g.posicion()} vs ${conVelo}`);
rev(pantalla === 'gente', 'y sin cambiar la pantalla de abajo');

console.log('· el panel está cableado a esto');
const app = readFileSync('public/app.js', 'utf8');
rev(/import \{[^}]*\} from '\.\/navegar\.js'/.test(app), 'el panel usa el módulo');
rev(/alNavegar\(pintarLugar\)/.test(app), 'y el «atrás» del navegador está enganchado');
rev(/irA\(HONDURA\.detalle, 'gente'/.test(app), 'abrir una empresa entra más hondo');
rev(/irA\(HONDURA\.detalle, 'licencia'/.test(app), 'abrir una licencia también');
rev(/\$\('g-volver'\)\.onclick = regresar;/.test(app), '«← Empresas» retrocede en vez de cambiar de pantalla');
rev(/cerrarVelo = abrirEncima\(/.test(app), 'el velo se abre encima del historial');
rev(!/\$\('q-cancelar'\)\.onclick = \(\) => \{ \$\('velo'\)\.hidden = true;/.test(app),
    'y «Cancelar» ya no lo esconde por su cuenta');
rev(/sellar\(HONDURA\.seccion, 'empresas'\)/.test(app), 'entrar al panel sella en vez de apilar');

console.log('· las pantallas de entrada NO entran al historial');
/* Correo, contraseña y código son pasos de un trámite, no lugares. Si «atrás»
 * los recorriera, alguien podría caer a media entrada con un código ya
 * gastado y creer que el panel se descompuso. */
rev(!/irA\([^)]*'v-(codigo|clave|correo|nueva)'/.test(app), 'ni el código ni la contraseña apilan');
rev(/if \(!YO \|\| !YO\.superadmin\) return undefined;/.test(app),
    'y sin sesión el «atrás» no intenta repintar el panel');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
