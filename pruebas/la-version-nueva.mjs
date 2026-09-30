/* El letrero de versión nueva (30-sep-2026).
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * Se mide sobre el fuente, sin red: que la página cargue version-nueva.js,
 * que ese archivo pida /huella.txt sin caché y compare con la huella de al
 * abrir, que revise cada 2 minutos y al volver la pestaña (no con focus), que
 * el letrero diga que guarde y tenga botón de recargar, que el estilo exista,
 * y que quien publica deje la huella.
 *
 *   node pruebas/la-version-nueva.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const PUB = 'public';
const js = readFileSync(`${PUB}/version-nueva.js`, 'utf8');
const css = readFileSync(`${PUB}/estilo.css`, 'utf8');
console.log('· la página carga el vigilante');
for (const h of ["index.html"]) rev(/<script src="version-nueva\.js" defer><\/script>/.test(readFileSync(`${PUB}/${h}`, 'utf8')), `${h} carga version-nueva.js`);
console.log('· el vigilante');
rev(/fetch\('\/huella\.txt', \{ cache: 'no-store' \}\)/.test(js), 'pide /huella.txt sin caché');
rev(/if \(base === null\) base = h;\s*else if \(h !== base\) avisar\(\);/.test(js), 'compara con la huella de al abrir y avisa si cambió');
rev(/setInterval\(revisar, 120000\)/.test(js), 'revisa cada 2 minutos');
rev(/visibilitychange/.test(js) && !/addEventListener\('focus'/.test(js), 'y al volver la pestaña, no con focus');
rev(/Termina lo que estés haciendo, guarda, y recarga\./.test(js), 'el letrero dice que guarde y recargue');
rev(/b\.textContent = 'Recargar';[\s\S]{0,80}location\.reload\(\)/.test(js), 'con un botón que recarga');
rev(/const APP = 'master101';/.test(js), 'y dice de qué app es');
rev(/#aviso-version\s*\{[^}]*position: fixed/.test(css), 'el letrero tiene su estilo');
console.log('· quien publica deja la huella');
rev(/huella\.txt/.test(readFileSync('scripts/sellar.mjs', 'utf8')) && /version \+ '\\n'/.test(readFileSync('scripts/sellar.mjs', 'utf8')), 'la huella se escribe al publicar');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
