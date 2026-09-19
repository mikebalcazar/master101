/* master101 — el panel del dueño de la suite.
 *
 * Cuatro pantallas sobre rutas que la API ya tiene: empresas (con los
 * interruptores de apps y suspender), alta de empresa con su dueño, gente de
 * una empresa, y el enlace a importar. Sólo entra un superadmin: `/s101/yo`
 * tiene que traer `superadmin: true`; si no, la pantalla dice «esta cuenta no
 * manda aquí» y no enseña nada.
 *
 * Todo pasa por `/s101/*`, que el Worker reenvía a `suite101-api` desde este
 * mismo origen (decisión D1). El Worker pone `X-App: master101`; aquí no se
 * manda.
 *
 * Regla de la casa: cambiar un interruptor hace PATCH y se repinta con lo que
 * la API devuelve, nunca con lo que se cree. */

const API = '/s101';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Las seis apps de una empresa, con la llave que usa `orgs.apps` en la API. */
export const APPS = [
  ['dash', 'dash101'], ['quell', 'quell101'], ['peek', 'peek101'],
  ['cotizador', 'quote101'], ['roster', 'roster101'], ['nest', 'nest101'],
];

const ROLES = { owner: 'dueño', admin: 'administración', socio: 'socio', staff: 'oficina' };

/** Los errores de la API, con palabras de quien administra. */
const ERRORES = {
  codigo_invalido: 'Ese código no es. Revisa el correo y vuelve a intentar.',
  demasiados_intentos: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  sin_permiso: 'Esa cuenta no manda aquí.',
  sin_sesion: 'Tu sesión terminó. Vuelve a entrar.',
  org_desconocida: 'Esa empresa ya no existe.',
  datos_invalidos: 'Revisa lo que escribiste.',
  correo_no_configurado: 'El envío de códigos no está disponible ahora. Intenta más tarde.',
  sin_respuesta: 'La API no contestó. Vuelve a intentar.',
  ultimo_superadmin: 'Es el último superadmin: no se puede quitar. Agrega a otro primero.',
  no_encontrado: 'Eso ya no existe.',
  google_no_configurado: 'Entrar con Google todavía no está prendido. Entra con tu correo.',
  origen_no_permitido: 'Esta dirección no está dada de alta para entrar con Google. Entra con tu correo.',
  entrada_invalida: 'El boleto de Google ya no sirve. Vuelve a intentar.',
};

class ErrorApi extends Error {
  constructor(error, estado, detalle) {
    super(ERRORES[error] ?? `Algo no salió bien (${error}). Vuelve a intentar.`);
    this.error = error; this.estado = estado; this.detalle = detalle;
  }
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    credentials: 'include',
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
  if (!r.ok || !cuerpo?.ok) throw new ErrorApi(cuerpo?.error ?? 'sin_respuesta', r.status, cuerpo?.detalle);
  return cuerpo.data;
}

/** Fecha y hora cortas, en la del centro de México. */
function cuando(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const z = { timeZone: 'America/Mexico_City' };
  return d.toLocaleDateString('es-MX', { ...z, day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { ...z, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Cómo se lee un renglón de la bitácora del panel. */
const CAMPOS = { creada: 'Se creó la empresa', nombre: 'Nombre', plan: 'Plan', moneda: 'Moneda', activa: 'Activa', miembro: 'Gente', superadmin: 'Superadmin', pago: 'Pago', cortesia: 'Cortesía', paga_hasta: 'Pagada hasta', bienvenida: 'Bienvenida', razon_social: 'Razón social', rfc: 'RFC', telefono: 'Teléfono', director_correo: 'Correo del director', director_nombre: 'Nombre del director', director_telefono: 'Teléfono del director' };
function campoLegible(campo) {
  if (campo.startsWith('apps.')) { const k = campo.slice(5); const app = APPS.find(([a]) => a === k); return `App ${app ? app[1] : k}`; }
  return CAMPOS[campo] || campo;
}
const valorLegible = (v) => (v === null || v === undefined || v === '' ? '—' : v === 'true' ? 'prendida' : v === 'false' ? 'apagada' : v);

function filasBitacora(filas, conQue) {
  if (!filas.length) return `<tr><td colspan="${conQue ? 5 : 4}" class="nota">Sin cambios apuntados todavía.</td></tr>`;
  return filas.map((f) => `<tr>
    <td class="fecha">${esc(cuando(f.cuando))}</td>
    <td class="mono">${esc(f.quien)}</td>
    ${conQue ? `<td>${esc(campoLegible(f.campo))}</td>` : ''}
    <td class="antes">${esc(valorLegible(f.antes))}</td>
    <td class="despues">${esc(valorLegible(f.despues))}</td>
  </tr>`).join('');
}

/* ─────────────── estado ─────────────── */

let YO = null;          // lo que dijo /yo
let EMPRESAS = [];      // lo último que contestó GET /admin/orgs
let ORG = null;         // la empresa abierta en «gente»
let correo = '';
const VISTAS = ['v-correo', 'v-clave', 'v-codigo', 'v-nueva', 'v-nomanda', 'v-cargando', 'v-empresas', 'v-alta', 'v-gente', 'v-super', 'v-licencias'];
function mostrar(cual) {
  for (const v of VISTAS) $(v).hidden = v !== cual;
  for (const b of document.querySelectorAll('#menu [data-ir]')) b.classList.toggle('activo', `v-${b.dataset.ir}` === cual);
  window.scrollTo(0, 0);
}

function aviso(id, texto, tono = 'mal') {
  const el = $(id);
  el.className = `aviso ${tono}`;
  el.textContent = texto;
  el.hidden = !texto;
}

/* ─────────────── entrada ─────────────── */

function pintarClave() {
  $('clave-p').textContent = `La de tu cuenta, ${correo}.`;
  $('clave').value = '';
  $('err-clave').textContent = '';
  $('err-clave').classList.remove('bien');
  $('clave').focus();
}

function pintarCodigo() {
  $('codigo-p').textContent = `Te lo mandamos a ${correo}. Vence en 10 minutos.`;
  $('codigo').value = '';
  $('err-codigo').textContent = '';
  $('err-codigo').classList.remove('bien');
  $('codigo').focus();
}

function pintarNueva(primera) {
  $('nueva-t').textContent = primera ? 'Ponle una contraseña' : 'Tu contraseña nueva';
  $('nueva-p').textContent = primera
    ? 'Con ella entras de ahora en adelante, aquí y en las demás apps de la suite.'
    : 'Tecléala dos veces; la segunda, de memoria.';
  $('nueva').value = ''; $('nueva2').value = '';
  $('err-nueva').textContent = '';
  $('nueva').focus();
}

$('f-correo').onsubmit = async (ev) => {
  ev.preventDefault();
  const c = $('correo').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c)) { $('err-correo').textContent = 'Escribe un correo válido.'; return; }
  correo = c;
  $('err-correo').textContent = '';
  /* Ya no se pide un código aquí: se pasa a la contraseña. Y NO se le pregunta
   * a la API si esta persona tiene una, porque eso volvería esta pantalla un
   * directorio de quién tiene cuenta. Lo que no coincide se dice al intentar
   * entrar, con el mismo mensaje para un correo que no existe y para una
   * contraseña equivocada. */
  mostrar('v-clave');
  pintarClave();
};

// En staging la API devuelve `codigo_prueba`; la prueba lo lee desde fuera.
// Aquí no se enseña ni se guarda.
const pedirCodigo = () => pedir('/auth/codigo', { method: 'POST', body: { correo } });

$('f-clave').onsubmit = async (ev) => {
  ev.preventDefault();
  // La contraseña NO se recorta: un espacio al principio o al final es parte
  // de ella —la suite rechaza esas al ponerlas, no al usarlas— y recortarla
  // aquí haría que una buena no entrara y nadie sabría por qué.
  const v = $('clave').value;
  if (!v) { $('err-clave').textContent = 'Escribe tu contraseña.'; return; }
  const b = $('b-clave'); b.disabled = true; b.textContent = 'Entrando…';
  $('err-clave').textContent = '';
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, clave: v } });
    await entrar();
  } catch (e) {
    /* `sin_permiso` es el correo que no tiene cuenta y `clave_invalida` la
     * contraseña equivocada. Se dicen IGUAL a propósito: distinguirlos le
     * diría a cualquiera qué correos tienen cuenta aquí. */
    $('err-clave').textContent = e.error === 'sin_permiso' || e.error === 'clave_invalida'
      ? 'Ese correo y esa contraseña no coinciden.'
      : e.message;
    $('clave').value = '';
    $('clave').focus();
  } finally { b.disabled = false; b.textContent = 'Entrar'; }
};

/* «Olvidé mi contraseña», que es la misma puerta para quien nunca tuvo una. */
$('olvide').onclick = async () => {
  const b = $('olvide'); b.disabled = true; b.textContent = 'Mandando…';
  $('err-clave').textContent = '';
  try {
    await pedirCodigo();
    mostrar('v-codigo');
    pintarCodigo();
  } catch (e) { $('err-clave').textContent = e.message; }
  finally { b.disabled = false; b.textContent = 'Olvidé mi contraseña'; }
};

$('f-codigo').onsubmit = async (ev) => {
  ev.preventDefault();
  const v = $('codigo').value.trim();
  if (!/^\d{6}$/.test(v)) { $('err-codigo').textContent = 'El código son 6 dígitos.'; return; }
  const b = $('b-codigo'); b.disabled = true; b.textContent = 'Entrando…';
  $('err-codigo').textContent = '';
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, codigo: v } });
    await entrar();
  } catch (e) {
    let msg = e.message;
    const quedan = e.detalle?.intentos_restantes;
    if (e.error === 'codigo_invalido' && typeof quedan === 'number') {
      msg = quedan > 0 ? `Ese código no es. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.` : 'Ese código no es y se acabaron los intentos. Pide uno nuevo.';
    }
    $('err-codigo').textContent = msg;
    $('codigo').value = '';
    $('codigo').focus();
  } finally { b.disabled = false; b.textContent = 'Continuar'; }
};

$('f-nueva').onsubmit = async (ev) => {
  ev.preventDefault();
  const a = $('nueva').value, c = $('nueva2').value;
  if (a.length < 10) { $('err-nueva').textContent = 'La contraseña necesita al menos 10 caracteres.'; return; }
  if (a !== c) {
    // No se dice cuál falló ni se deja la primera puesta: si no coincidieron,
    // una de las dos está mal y no hay forma de saber cuál.
    $('err-nueva').textContent = 'No coincidieron. Vamos otra vez, desde el principio.';
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
    return;
  }
  const b = $('b-nueva'); b.disabled = true; b.textContent = 'Guardando…';
  $('err-nueva').textContent = '';
  try {
    await pedir('/auth/clave', { method: 'POST', body: { clave: a } });
    await entrar();
  } catch (e) {
    // La suite dice con palabras por qué una contraseña no pasa. Se enseña tal
    // cual: es más útil que «contraseña inválida».
    $('err-nueva').textContent = e.detalle?.porque || e.message;
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
  } finally { b.disabled = false; b.textContent = 'Guardar y entrar'; }
};

/* ─────────────── entrar con Google ───────────────
 * La API manda al navegador a Google y Google devuelve a la API; ella abre la
 * sesión y regresa aquí con `?entrada=<boleto de un solo uso>`, que el
 * arranque canjea por la cookie en este origen (ver abajo). Antes de saltar
 * se pregunta sin seguir el salto: si Google no está prendido en la API
 * contesta 501 y se dice aquí, no en una pestaña con un JSON. */
const urlGoogle = () => `${API}/auth/google?volver_a=${encodeURIComponent(location.origin + '/')}`;

$('b-google').onclick = async () => {
  const b = $('b-google'); b.disabled = true; b.textContent = 'Abriendo Google…';
  $('err-correo').textContent = '';
  try {
    const r = await fetch(urlGoogle(), { redirect: 'manual', credentials: 'include' });
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) { location.href = urlGoogle(); return; }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
    throw new ErrorApi(cuerpo?.error ?? 'sin_respuesta', r.status, cuerpo?.detalle);
  } catch (e) {
    $('err-correo').textContent = e.message;
    b.disabled = false; b.textContent = 'Entrar con Google';
  }
};


$('reenviar').onclick = async () => {
  const b = $('reenviar'); b.disabled = true;
  try {
    await pedirCodigo();
    $('err-codigo').classList.add('bien');
    $('err-codigo').textContent = 'Te mandamos otro código.';
  } catch (e) { $('err-codigo').classList.remove('bien'); $('err-codigo').textContent = e.message; }
  finally { b.disabled = false; }
};

function alCorreo() {
  for (const e of ['err-correo', 'err-clave', 'err-codigo', 'err-nueva']) {
    $(e).textContent = ''; $(e).classList.remove('bien');
  }
  $('clave').value = ''; $('codigo').value = '';
  $('nueva').value = ''; $('nueva2').value = '';
  mostrar('v-correo');
  $('correo').focus();
}
$('otro-correo').onclick = alCorreo;
$('otro-correo-2').onclick = alCorreo;

async function salir() {
  try { await pedir('/auth/salir', { method: 'POST' }); } catch { /* la sesión ya no estaba */ }
  YO = null; EMPRESAS = []; ORG = null;
  $('quien').hidden = true;
  $('menu').hidden = true;
  mostrar('v-correo');
}
$('salir').onclick = salir;
$('nomanda-salir').onclick = salir;

/* ─────────────── entrar: sólo superadmin ─────────────── */

async function entrar() {
  mostrar('v-cargando');
  try {
    YO = await pedir('/yo');
  } catch (e) {
    $('err-clave').textContent = e.message;
    mostrar(correo ? 'v-clave' : 'v-correo');
    return;
  }

  /* Entró con un código y no tiene contraseña NI cuenta de Google ligada: no
   * tiene por dónde volver mañana, porque el código es de un solo uso y de
   * diez minutos. Se le pide antes de enseñarle nada.
   *
   * Con Google no se le pide, ni al entrar con él ni después: Google ya es
   * una forma de entrar. `tiene_google` llegó con el contrato 0.17.2, porque
   * sin él a quien tenía Google ligado se le pedía una contraseña cada vez
   * que entraba con un código, sin necesitarla (le pasó al dueño de la suite
   * el 19-sep). Una API vieja no lo manda: entonces se comporta como antes. */
  if (!YO.tiene_clave && !YO.tiene_google && YO.entro_con === 'codigo') {
    mostrar('v-nueva');
    pintarNueva(true);
    return;
  }
  if (!YO.superadmin) {
    // Entró bien, pero no manda aquí. No se pide nada más a la API: no hay
    // nada que enseñarle.
    $('nomanda-correo').textContent = YO.usuario?.correo ?? correo;
    mostrar('v-nomanda');
    return;
  }
  $('quien-n').textContent = YO.usuario.correo;
  $('quien').hidden = false;
  $('menu').hidden = false;
  await irAEmpresas();
}

/* ─────────────── empresas ─────────────── */

async function cargarEmpresas() {
  const d = await pedir('/admin/orgs');
  EMPRESAS = [...(d.filas ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  return EMPRESAS;
}

async function irAEmpresas() {
  aviso('e-aviso', '');
  mostrar('v-empresas');
  $('e-filas').innerHTML = '<tr><td colspan="12" class="nota">Cargando…</td></tr>';
  try {
    await cargarEmpresas();
    pintarEmpresas();
  } catch (e) {
    $('e-filas').innerHTML = '';
    aviso('e-aviso', e.message);
  }
}

function pintarEmpresas() {
  const activas = EMPRESAS.filter((o) => o.activa).length;
  $('e-sub').textContent = `${EMPRESAS.length} empresa${EMPRESAS.length === 1 ? '' : 's'} · ${activas} activa${activas === 1 ? '' : 's'}`;
  if (!EMPRESAS.length) {
    $('e-filas').innerHTML = '<tr><td colspan="12" class="nota">Todavía no hay ninguna empresa. Da de alta la primera.</td></tr>';
    return;
  }
  $('e-filas').innerHTML = EMPRESAS.map((o) => `
    <tr data-org="${esc(o.id)}" class="${o.activa ? '' : 'inactiva'}">
      <td><div class="n">${esc(o.nombre)}</div><div class="m mono">${esc(o.id)} · ${esc(o.moneda || 'MXN')}</div></td>
      <td>${o.plan ? esc(o.plan) : '<span class="nota">—</span>'}<div class="m">${esc(cobroCorto(o))}</div></td>
      ${APPS.map(([k, nombre]) => `<td class="app"><label class="sw" title="${esc(nombre)} · ${esc(o.nombre)}"><input type="checkbox" data-app="${k}" data-org="${esc(o.id)}"${o.apps?.[k] ? ' checked' : ''}${o.activa ? '' : ' disabled'}><i></i></label></td>`).join('')}
      <td class="r num" data-personas="${esc(o.id)}">${esc(o.personas ?? '—')}</td>
      <td class="fecha" data-entrada="${esc(o.id)}">${o.ultima_entrada ? esc(cuando(o.ultima_entrada)) : '<span class="nota">nadie aún</span>'}</td>
      <td>${chipEstado(o)}</td>
      <td><div class="acciones">
        <button class="btn suave chico" data-gente="${esc(o.id)}">Gente</button>
        <button class="btn ${o.activa ? 'peligro' : ''} chico" data-suspender="${esc(o.id)}">${o.activa ? 'Suspender' : 'Reactivar'}</button>
      </div></td>
    </tr>`).join('');

  for (const sw of $('e-filas').querySelectorAll('input[data-app]')) sw.onchange = () => cambiarApp(sw);
  for (const b of $('e-filas').querySelectorAll('[data-suspender]')) b.onclick = () => suspender(b.dataset.suspender, b);
  for (const b of $('e-filas').querySelectorAll('[data-gente]')) b.onclick = () => irAGente(b.dataset.gente);
}

/** Cómo se lee el cobro de una empresa en una línea. */
function cobroCorto(o) {
  if (o.cortesia) return 'cortesía';
  if (o.paga_hasta) return `${o.estado === 'sin_pago' ? 'venció el' : 'hasta el'} ${diaLegible(o.paga_hasta)}`;
  return 'sin fecha de pago';
}
function chipEstado(o) {
  if (!o.activa) return '<span class="chip mal">suspendida</span>';
  if (o.estado === 'sin_pago') return '<span class="chip mal">sin pago</span>';
  return '<span class="chip ok">activa</span>';
}
const bienvenidaLegible = (b) => !b ? '' : b.enviado ? 'La bienvenida ya le llegó por correo.' : b.motivo === 'correo_apagado_fuera_de_produccion' ? 'La bienvenida no se mandó: fuera de producción el correo está apagado.' : `La bienvenida no salió (${b.motivo}); puedes reenviarla desde «Gente».`;

/** Sustituye una empresa en la lista con lo que contestó la API y repinta. */
function reemplaza(org) {
  const i = EMPRESAS.findIndex((o) => o.id === org.id);
  if (i >= 0) EMPRESAS[i] = org; else EMPRESAS.push(org);
  pintarEmpresas();
}

async function cambiarApp(sw) {
  const o = EMPRESAS.find((x) => x.id === sw.dataset.org);
  if (!o) return;
  const apps = { ...(o.apps || {}), [sw.dataset.app]: sw.checked };
  sw.disabled = true;
  aviso('e-aviso', '');
  try {
    // Lo que se manda es el mapa completo: la API guarda `apps` entero.
    const org = await pedir(`/admin/orgs/${encodeURIComponent(o.id)}`, { method: 'PATCH', body: { apps } });
    reemplaza(org);
  } catch (e) {
    aviso('e-aviso', `No se pudo cambiar ${sw.dataset.app} en ${o.nombre}: ${e.message}`);
    pintarEmpresas();   // se regresa a lo que la API sí tiene
  }
}

async function suspender(id, boton) {
  const o = EMPRESAS.find((x) => x.id === id);
  if (!o) return;
  if (o.activa && !confirm(`¿Suspender a ${o.nombre}?\n\nToda su gente recibe «pausada» en todas las apps hasta que la reactives. Sus datos no se tocan.`)) return;
  boton.disabled = true;
  aviso('e-aviso', '');
  try {
    const org = await pedir(`/admin/orgs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { activa: !o.activa } });
    reemplaza(org);
    aviso('e-aviso', org.activa ? `${org.nombre} está activa otra vez.` : `${org.nombre} quedó suspendida.`, 'bien');
  } catch (e) {
    boton.disabled = false;
    aviso('e-aviso', e.message);
  }
}

$('e-refrescar').onclick = irAEmpresas;
$('e-nueva').onclick = () => irAAlta();
for (const b of document.querySelectorAll('#menu [data-ir]')) {
  b.onclick = () => (b.dataset.ir === 'alta' ? irAAlta() : b.dataset.ir === 'super' ? irASuper() : b.dataset.ir === 'licencias' ? irALicencias() : irAEmpresas());
}

/* ─────────────── alta de empresa ─────────────── */

/** El identificador sale del nombre: sin acentos, minúsculas, guiones. */
export function slugDe(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
const SLUG = /^[a-z0-9-]{2,40}$/;

let idTocado = false;
$('a-nombre').oninput = () => { if (!idTocado) $('a-id').value = slugDe($('a-nombre').value); };
$('a-cortesia').onchange = () => { $('l-a-hasta').hidden = $('a-cortesia').checked; };
$('a-id').oninput = () => { idTocado = $('a-id').value !== ''; };

function irAAlta() {
  $('f-alta').reset();
  $('l-a-hasta').hidden = true;
  idTocado = false;
  $('err-alta').textContent = '';
  $('a-listo').hidden = true;
  $('f-alta').hidden = false;
  mostrar('v-alta');
  $('a-nombre').focus();
}
$('a-cancelar').onclick = irAEmpresas;

$('f-alta').onsubmit = async (ev) => {
  ev.preventDefault();
  const nombre = $('a-nombre').value.trim();
  const id = $('a-id').value.trim().toLowerCase();
  const dueno = $('a-dueno').value.trim().toLowerCase();
  const errores = [];
  if (!nombre) errores.push('el nombre');
  if (!SLUG.test(id)) errores.push('el identificador (minúsculas, números y guiones, de 2 a 40)');
  if (!/^\S+@\S+\.\S+$/.test(dueno)) errores.push('el correo del director');

  const cortesia = $('a-cortesia').checked;
  const hasta = $('a-hasta').value;
  if (!cortesia && !hasta) errores.push('hasta qué día está pagada (o márcala como cortesía)');
  if (errores.length) { $('err-alta').textContent = `Revisa ${errores.join(', ')}.`; return; }

  const apps = {};
  for (const c of $('f-alta').querySelectorAll('input[data-app]')) apps[c.dataset.app] = c.checked;
  const b = $('b-alta'); b.disabled = true; b.textContent = 'Creando…';
  $('err-alta').textContent = '';
  try {
    // 0.14.0: un solo paso. La API crea la empresa, su base, al director como
    // dueño y le manda la bienvenida.
    const creada = await pedir('/admin/orgs', { method: 'POST', body: {
      id, nombre, plan: $('a-plan').value.trim() || undefined, moneda: $('a-moneda').value, apps,
      razon_social: $('a-razon').value.trim() || undefined, rfc: $('a-rfc').value.trim().toUpperCase() || undefined, telefono: $('a-telefono').value.trim() || undefined,
      director: { correo: dueno, nombre: $('a-dueno-nombre').value.trim() || undefined, telefono: $('a-dueno-telefono').value.trim() || undefined },
      cortesia, paga_hasta: cortesia ? null : hasta,
    } });
    const miembro = creada.director;

    const org = creada.org ?? {};
    const prendidas = APPS.filter(([k]) => org.apps?.[k]).map(([, n]) => n);
    $('f-alta').hidden = true;
    $('a-listo').innerHTML = `<b>${esc(org.nombre)}</b> (<span class="mono">${esc(org.id)}</span>) quedó creada, con su base en la versión ${esc(creada.org_db_version)}.<br>`
      + (prendidas.length ? `Apps prendidas: ${esc(prendidas.join(', '))}.` : 'Ninguna app prendida todavía.') + ` Cobro: ${esc(cobroCorto(org))}.<br>`
      + (miembro
        ? `Su director entra con <b>${esc(miembro.correo)}</b> (rol ${esc(ROLES[miembro.rol] || miembro.rol)}): le llega un código a ese correo en su panel o en cualquiera de sus apps. ${esc(bienvenidaLegible(creada.bienvenida))}`
        : `<span style="color:var(--alerta)">La empresa se creó sin director. Agrégalo desde «Gente».</span>`)
      + `<div class="acciones" style="margin-top:12px"><button class="btn suave chico" id="a-ver-gente">Ver su gente</button><button class="btn chico" id="a-ver-empresas">Ir a empresas</button></div>`;
    $('a-listo').hidden = false;
    $('a-ver-gente').onclick = () => irAGente(id);
    $('a-ver-empresas').onclick = irAEmpresas;
    await cargarEmpresas().catch(() => {});
  } catch (e) {
    const d = e.detalle || {};
    $('err-alta').textContent = d.id === 'ya existe' ? `Ya hay una empresa con el identificador «${id}». Escoge otro.`
      : d.id ? `El identificador no sirve: ${d.id}.` : e.message;
  } finally { b.disabled = false; b.textContent = 'Crear la empresa'; }
};

/* ─────────────── gente de una empresa ─────────────── */

async function irAGente(id) {
  ORG = EMPRESAS.find((o) => o.id === id) || { id, nombre: id };
  aviso('g-aviso', '');
  $('g-id').textContent = ORG.id;
  $('g-nombre').textContent = ORG.nombre;
  $('g-sub').textContent = 'Cargando…';
  $('g-filas').innerHTML = '';
  $('g-bitacora').innerHTML = '';
  $('f-gente').reset();
  $('err-gente').textContent = '';
  $('err-cobro').textContent = '';
  $('err-datos').textContent = '';
  pintarCobro();
  $('g-quell').textContent = 'Cargando…';
  $('g-roster').textContent = 'Cargando…';
  mostrar('v-gente');
  await Promise.all([cargarGente(), cargarBitacoraDe(ORG.id), cargarQuell(ORG.id), cargarRoster(ORG.id)]);
}

/* ─────────────── quell101 dentro de la empresa (0.16.0) ─────────────── */

const NOMBRES_QUELL = { quell_projects: 'obras', quell_plans: 'planos', quell_elements: 'ítems', quell_log_entries: 'renglones de bitácora', quell_punch_items: 'pendientes', quell_photos: 'fotos', quell_users: 'personas', quell_dudas: 'dudas' };
function quellLegible(filas) {
  const partes = Object.entries(NOMBRES_QUELL).map(([k, n]) => `${filas[k] ?? 0} ${n}`);
  return (filas.quell_projects ? 'Tiene ' : 'Todavía no tiene nada: ') + partes.join(', ') + '.';
}
async function cargarQuell(id) {
  try {
    const d = await pedir(`/admin/orgs/${encodeURIComponent(id)}/quell`);
    $('g-quell').textContent = quellLegible(d.filas || {});
  } catch (e) { $('g-quell').textContent = `No se pudo leer lo de quell101: ${e.message}`; }
}
/* ─────────────── roster101 dentro de la empresa (0.17.0) ─────────────── */

const NOMBRES_ROSTER = { roster_trabajadores: 'expedientes', roster_documentos: 'documentos', roster_consentimientos: 'avisos aceptados', roster_papelera: 'en la papelera', roster_administradores: 'cuentas del panel', roster_bitacora: 'renglones de bitácora' };
function rosterLegible(filas) {
  const partes = Object.entries(NOMBRES_ROSTER).map(([k, n]) => `${filas[k] ?? 0} ${n}`);
  return (filas.roster_trabajadores ? 'Tiene ' : 'Todavía no tiene nada: ') + partes.join(', ') + '.';
}
async function cargarRoster(id) {
  try {
    const d = await pedir(`/admin/orgs/${encodeURIComponent(id)}/roster`);
    $('g-roster').textContent = rosterLegible(d.filas || {});
  } catch (e) { $('g-roster').textContent = `No se pudo leer lo de roster101: ${e.message}`; }
}
/* ─────────────── plan y cobro, datos de la empresa (0.14.0) ─────────────── */

function pintarCobro() {
  const o = ORG;
  const quien = o.director_correo ? ` Director: ${o.director_nombre ? `${o.director_nombre}, ` : ''}${o.director_correo}.` : ' Sin director apuntado.';
  const texto = !o.activa ? 'Suspendida por nosotros: nadie entra hasta reactivarla.'
    : o.cortesia ? 'Cortesía: no vence nunca.'
    : o.estado === 'sin_pago' ? `Sin pago: venció el ${diaLegible(o.paga_hasta)}. Sus apps están cerradas; su panel sigue abriendo.`
    : `Pagada hasta el ${diaLegible(o.paga_hasta)} (${o.origen_pago === 'stripe' ? 'Stripe' : 'a mano'}).`;
  $('g-cobro').textContent = texto + quien + (o.bienvenida_at ? ` Bienvenida enviada el ${cuando(o.bienvenida_at)}.` : ' La bienvenida no ha salido.');
  $('g-hasta').value = o.paga_hasta || '';
  $('g-cortesia').textContent = o.cortesia ? 'Quitar la cortesía' : 'Hacer cortesía';
  $('g-razon').value = o.razon_social || '';
  $('g-rfc').value = o.rfc || '';
  $('g-telefono').value = o.telefono || '';
  $('g-dir-correo').value = o.director_correo || '';
  $('g-dir-nombre').value = o.director_nombre || '';
  $('g-dir-telefono').value = o.director_telefono || '';
}

function tomaOrg(org) {
  ORG = org;
  reemplaza(org);
  pintarCobro();
}

$('f-cobro').onsubmit = async (ev) => {
  ev.preventDefault();
  const hasta = $('g-hasta').value;
  if (!hasta) { $('err-cobro').textContent = 'Escoge hasta qué día está pagada.'; return; }
  const b = $('g-pago'); b.disabled = true; $('err-cobro').textContent = '';
  try {
    tomaOrg(await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}/pago`, { method: 'POST', body: { hasta } }));
    aviso('g-aviso', `Pagada hasta el ${diaLegible(hasta)}. Sus apps abren en la siguiente petición.`, 'bien');
    await cargarBitacoraDe(ORG.id);
  } catch (e) { $('err-cobro').textContent = e.message; }
  finally { b.disabled = false; }
};

$('g-cortesia').onclick = async () => {
  const b = $('g-cortesia'); b.disabled = true; $('err-cobro').textContent = '';
  try {
    const cortesia = !ORG.cortesia;
    tomaOrg(await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}`, { method: 'PATCH', body: cortesia ? { cortesia: true, paga_hasta: null } : { cortesia: false } }));
    aviso('g-aviso', cortesia ? `${ORG.nombre} es cortesía: no vence.` : `${ORG.nombre} ya no es cortesía: ${ORG.paga_hasta ? `vence el ${diaLegible(ORG.paga_hasta)}` : 'marca hasta cuándo está pagada o sus apps quedan cerradas'}.`, cortesia ? 'bien' : 'mal');
    await cargarBitacoraDe(ORG.id);
  } catch (e) { $('err-cobro').textContent = e.message; }
  finally { b.disabled = false; }
};

$('f-datos').onsubmit = async (ev) => {
  ev.preventDefault();
  const dc = $('g-dir-correo').value.trim().toLowerCase();
  if (dc && !/^\S+@\S+\.\S+$/.test(dc)) { $('err-datos').textContent = 'El correo del director no se ve bien.'; return; }
  const b = $('b-datos'); b.disabled = true; $('err-datos').textContent = '';
  try {
    tomaOrg(await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}`, { method: 'PATCH', body: {
      razon_social: $('g-razon').value.trim() || null, rfc: $('g-rfc').value.trim().toUpperCase() || null, telefono: $('g-telefono').value.trim() || null,
      director_correo: dc || null, director_nombre: $('g-dir-nombre').value.trim() || null, director_telefono: $('g-dir-telefono').value.trim() || null,
    } }));
    aviso('g-aviso', 'Datos guardados.', 'bien');
    await cargarBitacoraDe(ORG.id);
  } catch (e) { $('err-datos').textContent = e.message; }
  finally { b.disabled = false; }
};

$('g-bienvenida').onclick = async () => {
  const b = $('g-bienvenida'); b.disabled = true; $('err-datos').textContent = '';
  try {
    const r = await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}/bienvenida`, { method: 'POST', body: { correo: $('g-dir-correo').value.trim().toLowerCase() || undefined } });
    aviso('g-aviso', r.enviado ? `Bienvenida enviada a ${r.correo}.` : bienvenidaLegible(r), r.enviado ? 'bien' : 'mal');
    if (r.enviado) { ORG = { ...ORG, bienvenida_at: new Date().toISOString() }; pintarCobro(); }
    await cargarBitacoraDe(ORG.id);
  } catch (e) { $('err-datos').textContent = e.message; }
  finally { b.disabled = false; }
};

async function cargarBitacoraDe(id) {
  try {
    const d = await pedir(`/admin/orgs/${encodeURIComponent(id)}/bitacora`);
    $('g-bitacora').innerHTML = filasBitacora(d.filas ?? [], true);
  } catch (e) {
    $('g-bitacora').innerHTML = `<tr><td colspan="5" class="nota">${esc(e.message)}</td></tr>`;
  }
}

async function cargarGente() {
  try {
    const d = await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}/miembros`);
    const filas = [...(d.filas ?? [])].sort((a, b) => a.correo.localeCompare(b.correo));
    $('g-sub').textContent = `${filas.length} persona${filas.length === 1 ? '' : 's'} con acceso`;
    $('g-filas').innerHTML = filas.length ? filas.map((m) => `
      <tr>
        <td class="mono">${esc(m.correo)}</td>
        <td>${m.nombre ? esc(m.nombre) : '<span class="nota">—</span>'}</td>
        <td><span class="chip ${m.rol === 'owner' ? 'marca' : ''}">${esc(ROLES[m.rol] || m.rol)}</span></td>
        <td><div class="acciones"><button class="btn peligro chico" data-quitar="${esc(m.usuario_id)}" data-correo="${esc(m.correo)}">Quitar</button></div></td>
      </tr>`).join('') : '<tr><td colspan="4" class="nota">Nadie tiene acceso todavía.</td></tr>';
    for (const b of $('g-filas').querySelectorAll('[data-quitar]')) b.onclick = () => pedirConfirmacion(b.dataset.quitar, b.dataset.correo);
  } catch (e) {
    $('g-sub').textContent = '';
    aviso('g-aviso', e.message);
  }
}

$('g-volver').onclick = irAEmpresas;

$('f-gente').onsubmit = async (ev) => {
  ev.preventDefault();
  const c = $('p-correo').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c)) { $('err-gente').textContent = 'Escribe un correo válido.'; return; }
  const b = $('b-gente'); b.disabled = true; b.textContent = 'Agregando…';
  $('err-gente').textContent = '';
  try {
    await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}/miembros`, { method: 'POST', body: { correo: c, nombre: $('p-nombre').value.trim() || undefined, rol: $('p-rol').value } });
    $('f-gente').reset();
    aviso('g-aviso', `${c} ya tiene acceso a ${ORG.nombre}.`, 'bien');
    await Promise.all([cargarGente(), cargarBitacoraDe(ORG.id), cargarEmpresas().catch(() => {})]);
  } catch (e) {
    $('err-gente').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Agregar'; }
};

/* Quitar a alguien pide escribir su correo tal cual: es la confirmación que
 * no se da por reflejo. */
let porQuitar = null;
function pedirConfirmacion(usuario_id, correoDe, que = 'miembro') {
  porQuitar = { usuario_id, correo: correoDe, que };
  $('q-titulo').textContent = que === 'super' ? 'Quitar a este superadmin' : 'Quitar a esta persona';
  $('q-texto').innerHTML = que === 'super'
    ? 'Deja de mandar en este panel. Su usuario y sus accesos a empresas no se tocan. Para confirmar, escribe su correo tal cual:'
    : `Deja de entrar a <b>${esc(ORG?.nombre ?? '')}</b>. Sus datos no se tocan. Para confirmar, escribe su correo tal cual:`;
  $('q-correo').textContent = correoDe;
  $('q-escrito').value = '';
  $('q-quitar').disabled = true;
  $('velo').hidden = false;
  $('q-escrito').focus();
}
$('q-escrito').oninput = () => { $('q-quitar').disabled = $('q-escrito').value.trim().toLowerCase() !== (porQuitar?.correo ?? '#'); };
$('q-cancelar').onclick = () => { $('velo').hidden = true; porQuitar = null; };
$('q-quitar').onclick = async () => {
  if (!porQuitar) return;
  const b = $('q-quitar'); b.disabled = true; b.textContent = 'Quitando…';
  const esSuper = porQuitar.que === 'super';
  const cajaAviso = esSuper ? 's-aviso' : 'g-aviso';
  try {
    if (esSuper) {
      await pedir(`/admin/superadmins/${encodeURIComponent(porQuitar.usuario_id)}`, { method: 'DELETE' });
      $('velo').hidden = true;
      aviso(cajaAviso, `${porQuitar.correo} ya no es superadmin.`, 'bien');
      porQuitar = null;
      await cargarSuper();
    } else {
      await pedir(`/admin/orgs/${encodeURIComponent(ORG.id)}/miembros/${encodeURIComponent(porQuitar.usuario_id)}`, { method: 'DELETE' });
      $('velo').hidden = true;
      aviso(cajaAviso, `${porQuitar.correo} ya no entra a ${ORG.nombre}.`, 'bien');
      porQuitar = null;
      await Promise.all([cargarGente(), cargarBitacoraDe(ORG.id), cargarEmpresas().catch(() => {})]);
    }
  } catch (e) {
    aviso(cajaAviso, e.error === 'datos_invalidos' && e.detalle?.motivo === 'a_ti_mismo' ? 'No te puedes quitar a ti mismo.' : e.message);
    $('velo').hidden = true;
  } finally { b.textContent = 'Quitar'; }
};

/* ─────────────── superadmins ───────────────
 * Quién manda en este panel. Los candados los pone la API (el último no se
 * quita, nadie se quita a sí mismo); aquí sólo se enseñan sus mensajes. */

async function irASuper() {
  aviso('s-aviso', '');
  $('s-filas').innerHTML = '<tr><td colspan="3" class="nota">Cargando…</td></tr>';
  $('s-bitacora').innerHTML = '';
  $('f-super').reset();
  $('err-super').textContent = '';
  mostrar('v-super');
  await cargarSuper();
}

async function cargarSuper() {
  try {
    const [d, b] = await Promise.all([pedir('/admin/superadmins'), pedir('/admin/bitacora')]);
    const filas = [...(d.filas ?? [])].sort((a, c) => a.correo.localeCompare(c.correo));
    $('s-sub').textContent = `${filas.length} superadmin${filas.length === 1 ? '' : 's'}. Ven y tocan todas las empresas.`;
    $('s-filas').innerHTML = filas.map((x) => {
      const soyYo = x.usuario_id === YO.usuario.id;
      return `<tr>
        <td class="mono">${esc(x.correo)}${soyYo ? ' <span class="nota">(tú)</span>' : ''}</td>
        <td>${x.nombre ? esc(x.nombre) : '<span class="nota">—</span>'}</td>
        <td><div class="acciones">${soyYo || filas.length <= 1 ? '' : `<button class="btn peligro chico" data-quitar-super="${esc(x.usuario_id)}" data-correo="${esc(x.correo)}">Quitar</button>`}</div></td>
      </tr>`;
    }).join('');
    for (const btn of $('s-filas').querySelectorAll('[data-quitar-super]')) btn.onclick = () => pedirConfirmacion(btn.dataset.quitarSuper, btn.dataset.correo, 'super');
    $('s-bitacora').innerHTML = filasBitacora((b.filas ?? []).filter((f) => f.campo === 'superadmin'), false);
  } catch (e) {
    $('s-filas').innerHTML = '';
    aviso('s-aviso', e.message);
  }
}

$('f-super').onsubmit = async (ev) => {
  ev.preventDefault();
  const c = $('s-correo').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c)) { $('err-super').textContent = 'Escribe un correo válido.'; return; }
  const b = $('b-super'); b.disabled = true; b.textContent = 'Agregando…';
  $('err-super').textContent = '';
  try {
    const r = await pedir('/admin/superadmins', { method: 'POST', body: { correo: c, nombre: $('s-nombre').value.trim() || undefined } });
    $('f-super').reset();
    aviso('s-aviso', r.ya_lo_era ? `${c} ya era superadmin.` : `${c} ya manda en este panel. Entra con su correo, como tú.`, 'bien');
    await cargarSuper();
  } catch (e) {
    $('err-super').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Agregar'; }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('velo').hidden) $('q-cancelar').click(); });

/* ─────────────── licencias (contrato 0.13.0) ───────────────
 * Las suscripciones de las apps que se venden (draw101 primero). Mike crea la
 * clave, marca el pago a mano hasta que haya pasarela, sube lugares, suspende
 * y ve en qué máquinas está. Las reglas viven en la API; aquí sólo se
 * enseñan sus respuestas. Decisiones de Mike del 18-sep-2026. */

let LIC = null;          // la licencia abierta en el detalle

const diaLegible = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '—');
/* Cómo se llama cada tipo en pantalla. La lista la cierra la API (contrato
 * 0.19.0): un tipo que no esté aquí se enseña tal cual en vez de quedarse en
 * blanco, para que agregar uno del lado de la API no deje una columna muda. */
const TIPOS_LICENCIA = { cortesia: 'Cortesía', suite101: 'Incluida en suite101', stripe: 'Pago por Stripe', appstore: 'App Store' };
const nombreTipo = (t) => TIPOS_LICENCIA[t] || t || '—';

function estadoDe(l) {
  if (l.estado === 'suspendida') return ['suspendida', 'mal'];
  if (l.vigente) return [l.perpetua ? 'no vence' : 'vigente', 'bien'];
  return ['sin pago', 'mal'];
}
const ACCIONES = { crear: 'Se creó', cambiar: 'Cambio', pago: 'Pago', activar: 'Se activó una máquina', latido_negado: 'Latido negado', desactivar: 'Se liberó una máquina', borrar: 'Se borró' };
function detalleLegible(d) {
  if (!d) return '—';
  try {
    const o = typeof d === 'string' ? JSON.parse(d) : d;
    if (o.campo) return `${o.campo}: ${valorLegible(String(o.antes ?? ''))} → ${valorLegible(String(o.despues ?? ''))}`;
    if (o.hasta) return `hasta ${diaLegible(o.hasta)}${o.origen ? ` (${o.origen})` : ''}${o.referencia ? ` · ${o.referencia}` : ''}`;
    if (o.huella) return `máquina ${String(o.huella).slice(0, 12)}…${o.motivo ? ` · ${o.motivo}` : ''}${o.version ? ` · v${o.version}` : ''}`;
    return Object.entries(o).map(([k, v]) => `${k}: ${v ?? '—'}`).join(' · ');
  } catch { return String(d); }
}

async function irALicencias() {
  aviso('l-aviso', '');
  $('l-filas').innerHTML = '<tr><td colspan="8" class="nota">Cargando…</td></tr>';
  // Los filtros se limpian al entrar: una lista corta por un filtro que quedó
  // puesto la vez pasada se lee como que no hay licencias.
  $('l-f-tipo').value = ''; $('l-f-programa').value = ''; $('l-f-correo').value = ''; $('l-f-vigentes').checked = false;
  $('f-licencia').reset();
  $('err-licencia').textContent = '';
  $('l-detalle').hidden = true;
  LIC = null;
  mostrar('v-licencias');
  await cargarLicencias();
}

/* Los filtros los resuelve la API, no el navegador: el día que haya cientos
 * de licencias, traerlas todas para esconder la mayoría sería traer de más, y
 * «vigente» se decide con la fecha de hoy del servidor, no con la del
 * teléfono de quien mira. */
const filtroLic = () => {
  const p = new URLSearchParams();
  if ($('l-f-tipo').value) p.set('tipo', $('l-f-tipo').value);
  if ($('l-f-programa').value) p.set('programa', $('l-f-programa').value);
  const correo = $('l-f-correo').value.trim();
  if (correo) p.set('correo', correo);
  if ($('l-f-vigentes').checked) p.set('vigentes', '1');
  return p.toString();
};

async function cargarLicencias() {
  try {
    const q = filtroLic();
    const d = await pedir(`/licencias${q ? `?${q}` : ''}`);
    const filas = d.filas ?? [];
    pintarFiltroTipos(d.por_tipo || {});
    const hayFiltro = q.length > 0;
    $('l-sub').textContent = `${filas.length} licencia${filas.length === 1 ? '' : 's'}${hayFiltro ? ' con este filtro' : ''}. Quién tiene clave, en cuántos equipos está y cuándo vence.`;
    if (!filas.length) {
      $('l-filas').innerHTML = `<tr><td colspan="8" class="nota">${hayFiltro ? 'Ninguna licencia cumple este filtro. Quítalo para verlas todas.' : 'Todavía no hay licencias. Crea la primera abajo.'}</td></tr>`;
      return;
    }
    $('l-filas').innerHTML = filas.map((l) => {
      const [texto, tono] = estadoDe(l);
      return `<tr data-lic="${esc(l.id)}">
        <td>${l.correo ? esc(l.correo) : '<span class="nota">sin correo</span>'}</td>
        <td>${esc(l.cliente)}<div class="nota mono">${esc(l.clave)}</div></td>
        <td>${esc(nombreTipo(l.tipo))}</td>
        <td>${esc(l.programa)}</td>
        <td class="r">${l.activaciones} de ${l.lugares}</td>
        <td>${l.perpetua ? 'No vence' : esc(diaLegible(l.paga_hasta))}</td>
        <td><span class="${tono}">${texto}</span></td>
        <td><div class="acciones"><button class="btn suave chico" data-ver-lic="${esc(l.id)}">Ver</button></div></td>
      </tr>`;
    }).join('');
    for (const btn of $('l-filas').querySelectorAll('[data-ver-lic]')) btn.onclick = () => abrirLicencia(btn.dataset.verLic);
  } catch (e) {
    $('l-filas').innerHTML = '';
    aviso('l-aviso', e.message);
  }
}

/* Los conteos vienen SIN el filtro de tipo puesto, así que el que está
 * escogido también dice cuántas hay: si dijera cero de los demás, el filtro
 * se volvería un callejón sin salida. */
function pintarFiltroTipos(porTipo) {
  const sel = $('l-f-tipo');
  const escogido = sel.value;
  const total = Object.values(porTipo).reduce((a, b) => a + b, 0);
  sel.innerHTML = `<option value="">Todos (${total})</option>` +
    Object.keys(TIPOS_LICENCIA).map((k) => `<option value="${k}">${esc(nombreTipo(k))} (${porTipo[k] ?? 0})</option>`).join('');
  sel.value = escogido;
}

async function abrirLicencia(id) {
  aviso('ld-aviso', '');
  try {
    const l = await pedir(`/licencias/${encodeURIComponent(id)}`);
    LIC = l;
    const [texto] = estadoDe(l);
    $('ld-titulo').textContent = `${l.cliente} · ${l.programa}`;
    $('ld-clave').textContent = l.clave;
    $('ld-resumen').textContent = `${nombreTipo(l.tipo)} · ${texto}${l.perpetua ? '' : ` · pagada hasta ${diaLegible(l.paga_hasta)}`} · ${l.lugares} máquina${l.lugares === 1 ? '' : 's'} a la vez · plan ${l.plan}${l.correo ? ` · ${l.correo}` : ''}${l.notas ? ` · ${l.notas}` : ''}`;
    $('ld-hasta').value = l.paga_hasta || '';
    $('ld-lugares').value = l.lugares;
    $('ld-tipo').value = l.tipo || 'cortesia';
    $('ld-perpetua').checked = !!l.perpetua;
    $('ld-suspender').textContent = l.estado === 'suspendida' ? 'Reanudar' : 'Suspender';
    $('ld-borrar').textContent = 'Borrar'; delete $('ld-borrar').dataset.seguro;
    const acts = l.activaciones ?? [];
    $('ld-activaciones').innerHTML = acts.length ? acts.map((a) => `<tr data-huella="${esc(a.huella)}">
        <td class="mono">${esc(a.huella.slice(0, 16))}…</td>
        <td>${a.version ? esc(a.version) : '—'}</td>
        <td class="fecha">${esc(cuando(a.alta_at))}</td>
        <td class="fecha">${esc(cuando(a.ultimo_latido_at))}</td>
        <td>${a.activa ? '<span class="bien">activa</span>' : '<span class="nota">liberada</span>'}</td>
        <td>${a.activa ? `<button class="btn suave chico" data-liberar="${esc(a.huella)}">Liberar</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="nota">Ninguna máquina ha activado esta clave.</td></tr>';
    for (const btn of $('ld-activaciones').querySelectorAll('[data-liberar]')) btn.onclick = () => liberar(btn.dataset.liberar, btn);
    const bit = l.bitacora ?? [];
    $('ld-bitacora').innerHTML = bit.length ? bit.map((b) => `<tr>
        <td class="fecha">${esc(cuando(b.cuando))}</td>
        <td class="mono">${esc(b.quien)}</td>
        <td>${esc(ACCIONES[b.accion] || b.accion)}</td>
        <td>${esc(detalleLegible(b.detalle))}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="nota">Nada apuntado todavía.</td></tr>';
    $('l-detalle').hidden = false;
    $('l-detalle').scrollIntoView({ block: 'start' });
  } catch (e) {
    aviso('l-aviso', e.message);
  }
}

async function liberar(huella, btn) {
  btn.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}/desactivar`, { method: 'POST', body: { huella } });
    aviso('ld-aviso', 'Lugar liberado. Esa máquina tendrá que volver a activar.', 'bien');
    await Promise.all([abrirLicencia(LIC.id), cargarLicencias()]);
  } catch (e) { aviso('ld-aviso', e.message); btn.disabled = false; }
}

$('l-refrescar').onclick = cargarLicencias;

for (const id of ['l-f-tipo', 'l-f-programa', 'l-f-vigentes']) $(id).onchange = cargarLicencias;
// El correo se busca al picar Enter o al salir del campo, no en cada tecla:
// una llamada por letra no le enseña nada a nadie.
$('l-f-correo').onchange = cargarLicencias;
$('l-f-correo').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cargarLicencias(); } };

$('ld-guardar-tipo').onclick = async () => {
  const b = $('ld-guardar-tipo'); b.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}`, { method: 'PATCH', body: { tipo: $('ld-tipo').value, perpetua: $('ld-perpetua').checked } });
    aviso('ld-aviso', 'Guardado.', 'bien');
    await Promise.all([abrirLicencia(LIC.id), cargarLicencias()]);
  } catch (e) { aviso('ld-aviso', e.message); } finally { b.disabled = false; }
};

$('f-licencia').onsubmit = async (ev) => {
  ev.preventDefault();
  const cliente = $('l-cliente').value.trim();
  if (!cliente) { $('err-licencia').textContent = 'Escribe a nombre de quién es.'; return; }
  const correo = $('l-correo').value.trim().toLowerCase();
  if (correo && !/^\S+@\S+\.\S+$/.test(correo)) { $('err-licencia').textContent = 'Ese correo no se ve bien.'; return; }
  const cuerpo = {
    cliente, programa: $('l-programa').value, lugares: Number($('l-lugares').value) || 1,
    tipo: $('l-tipo').value,
    perpetua: $('l-perpetua').checked,
    ...(correo ? { correo } : {}),
    ...($('l-hasta').value ? { paga_hasta: $('l-hasta').value } : {}),
    ...($('l-notas').value.trim() ? { notas: $('l-notas').value.trim() } : {}),
  };
  const b = $('b-licencia'); b.disabled = true; b.textContent = 'Creando…';
  $('err-licencia').textContent = '';
  try {
    const r = await pedir('/licencias', { method: 'POST', body: cuerpo });
    $('f-licencia').reset();
    aviso('l-aviso', `Lista. La clave de ${r.cliente} es ${r.clave}. Dásela tal cual: la teclea al instalar.`, 'bien');
    await cargarLicencias();
    await abrirLicencia(r.id);
  } catch (e) {
    $('err-licencia').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Crear licencia'; }
};

$('ld-pago').onclick = async () => {
  if (!LIC) return;
  const hasta = $('ld-hasta').value;
  if (!hasta) { aviso('ld-aviso', 'Escoge hasta qué día está pagado.'); return; }
  const b = $('ld-pago'); b.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}/pago`, { method: 'POST', body: { hasta } });
    aviso('ld-aviso', `Pagada hasta ${diaLegible(hasta)}. La app lo sabe en su siguiente latido.`, 'bien');
    await Promise.all([abrirLicencia(LIC.id), cargarLicencias()]);
  } catch (e) { aviso('ld-aviso', e.message); }
  finally { b.disabled = false; }
};

$('ld-guardar-lugares').onclick = async () => {
  if (!LIC) return;
  const lugares = Number($('ld-lugares').value);
  const b = $('ld-guardar-lugares'); b.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}`, { method: 'PATCH', body: { lugares } });
    aviso('ld-aviso', `Ahora ${lugares} máquina${lugares === 1 ? '' : 's'} a la vez.`, 'bien');
    await Promise.all([abrirLicencia(LIC.id), cargarLicencias()]);
  } catch (e) { aviso('ld-aviso', e.message); }
  finally { b.disabled = false; }
};

$('ld-suspender').onclick = async () => {
  if (!LIC) return;
  const estado = LIC.estado === 'suspendida' ? 'activa' : 'suspendida';
  const b = $('ld-suspender'); b.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}`, { method: 'PATCH', body: { estado } });
    aviso('ld-aviso', estado === 'suspendida' ? 'Suspendida. En su siguiente latido la app pasa a modo lectura.' : 'Reanudada. En su siguiente latido la app vuelve a entrar.', 'bien');
    await Promise.all([abrirLicencia(LIC.id), cargarLicencias()]);
  } catch (e) { aviso('ld-aviso', e.message); }
  finally { b.disabled = false; }
};

// Borrar pide dos clics: el primero cambia el botón, el segundo borra.
$('ld-borrar').onclick = async () => {
  if (!LIC) return;
  const b = $('ld-borrar');
  if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Borrar'; return; }
  b.disabled = true;
  try {
    await pedir(`/licencias/${encodeURIComponent(LIC.id)}`, { method: 'DELETE' });
    LIC = null;
    $('l-detalle').hidden = true;
    aviso('l-aviso', 'Licencia borrada. Su clave ya no existe.', 'bien');
    await cargarLicencias();
  } catch (e) { aviso('ld-aviso', e.message); }
  finally { b.disabled = false; b.textContent = 'Borrar'; delete b.dataset.seguro; }
};

/* ─────────────── arranque ───────────────
 * Si la cookie todavía vive, se entra directo. Si venció, se pide el correo
 * sin enseñar ningún error: no falló nada, sólo pasó el tiempo. */

(async () => {
  // Google regresa con `?entrada=<boleto>`: se canjea por la cookie de este
  // origen y se quita de la barra, para que un recargar no lo repita.
  const u = new URL(location.href);
  const entrada = u.searchParams.get('entrada');
  if (entrada) {
    u.searchParams.delete('entrada');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    try {
      await pedir('/auth/canje', { method: 'POST', body: { entrada } });
    } catch (e) {
      mostrar('v-correo');
      $('err-correo').textContent = e.message;
      return;
    }
  }
  try {
    await pedir('/yo');
    await entrar();
  } catch {
    /* La cookie no vive: se pide el correo, pero SÓLO si la persona no se
     * adelantó. Con red lenta, /yo contesta después de que ya tecleó su correo
     * y está en la contraseña, y regresarla a la primera pantalla es un rebote
     * que nadie entiende: el botón «Olvidé mi contraseña» desaparecía debajo
     * del dedo. Medido en peek101 el 18-sep-2026 desde el sandbox (/yo tarda
     * ~700 ms ahí); en el runner contesta antes de que nadie teclee. */
    if (!correo) mostrar('v-correo');
  }
})();
