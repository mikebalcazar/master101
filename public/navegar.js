/* El botón «atrás» del navegador, que hasta hoy sacaba del panel.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior. Hay funciones que son 3 o 4 clicks
 * para llegar y si le picas back al navegador te saca y pierdes la ruta de
 * navegación que habías hecho».
 *
 * Es el mismo módulo que quell101 y peek101, con una pieza más que allá no
 * hacía falta: aquí hay CUATRO secciones al mismo nivel, así que saber a qué
 * hondura se volvió no alcanza para saber qué pintar. Cada entrada del
 * historial se lleva también un nombre —`donde`— y, cuando el lugar depende
 * de algo, el `dato` con que se abrió (la empresa, la licencia).
 *
 * LA IDEA, QUE ES LA MISMA EN TODAS
 *
 * Cada pantalla tiene una HONDURA:
 *
 *   · ir más hondo empuja una entrada  → «atrás» regresa a donde estabas;
 *   · moverse al mismo nivel la reemplaza → alternar entre secciones no
 *     llena el historial de escalones que nadie pidió;
 *   · salir hacia afuera con un botón de la app es `history.back()` → se
 *     consume la entrada que había en vez de apilar una tercera.
 *
 * La tercera es la que no es obvia: cerrar con el botón propio de la app
 * tiene que dejar el historial igual que si se hubiera picado «atrás». Si
 * no, el siguiente «atrás» reabre lo que la persona acaba de cerrar y parece
 * que el panel se devolvió solo.
 */

const est = () => history.state || {};
export const honduraActual = () => (typeof est().hondura === 'number' ? est().hondura : 0);
export const dondeActual = () => est().donde ?? null;
export const datoActual = () => est().dato ?? null;

/* Lo que la app hace para pintar un lugar. Recibe `volviendo` porque no es lo
 * mismo ENTRAR a una sección que REGRESAR a ella: entrar a licencias limpia
 * los filtros a propósito (una lista corta por un filtro viejo se lee como
 * que no hay licencias), pero regresar de una licencia a la lista con los
 * filtros borrados sería quitarle a la persona el trabajo que ya hizo. */
let pintar = () => {};
let cerrarEncima = null;

/**
 * Enganchar el «atrás» del navegador. Se llama una vez, al arrancar la app.
 * `alPintar(donde, dato, volviendo)` enseña el lugar que le digan.
 */
export function alNavegar(alPintar) {
  pintar = alPintar;
  window.addEventListener('popstate', () => {
    /* Con algo encima —un velo, una confirmación—, el primer «atrás» lo
     * cierra y ahí se acaba el paso: la pantalla de abajo no se toca porque
     * nunca se fue. */
    if (cerrarEncima) { const f = cerrarEncima; cerrarEncima = null; f(); return; }
    pintar(dondeActual(), datoActual(), true);
  });
}

/** Apuntar dónde estamos sin movernos. Hace falta al caer en una pantalla sin
 *  haber navegado —al recargar, o al entrar con la sesión ya puesta—: ahí el
 *  estado viene nulo y sin esto el módulo creería estar en el primer nivel. */
export function sellar(hondura, donde, dato = null) {
  if (history.state && honduraActual() === hondura && dondeActual() === donde) return;
  history.replaceState({ hondura, donde, dato }, '', null);
}

/** Moverse a un lugar y pintarlo. */
export function irA(hondura, donde, dato = null) {
  if (hondura > honduraActual()) history.pushState({ hondura, donde, dato }, '', null);
  else history.replaceState({ hondura, donde, dato }, '', null);
  pintar(donde, dato, false);
}

/** Salir hacia afuera con un botón de la app («← Empresas», «Cancelar»).
 *  Retrocede de verdad, para dejar el historial como lo dejaría «atrás». */
export function regresar() { history.back(); }

/**
 * Abrir algo ENCIMA de lo que hay: un velo, una confirmación. Devuelve la
 * función con la que la app lo cierra; cerrarlo así y picar «atrás» hacen lo
 * mismo, que es lo único que se puede explicar.
 */
export function abrirEncima(cerrar) {
  cerrarEncima = cerrar;
  history.pushState({ ...est(), hondura: honduraActual() + 1, encima: true }, '', null);
  return () => { if (cerrarEncima) regresar(); };
}
