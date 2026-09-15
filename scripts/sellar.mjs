/* Escribe la versión servida en la portada, antes de publicar.
 *
 * master101 no tiene empaquetador —es HTML y JS tal cual— así que no hay
 * «construcción» donde inyectar nada. Esto es lo que hace de construcción:
 * pone el commit en `<meta name="master101-version">` para que la medición
 * pueda comprobar que el borde de Cloudflare ya suelta la copia nueva y no la
 * anterior.
 *
 *   node scripts/sellar.mjs <version>
 *
 * Sin argumento deja `dev`, que es lo que dice el archivo en el repositorio.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PORTADA = fileURLToPath(new URL('../public/index.html', import.meta.url));
const version = (process.argv[2] || 'dev').trim();
const marca = /(<meta name="master101-version" content=")([^"]*)(">)/;

const antes = await readFile(PORTADA, 'utf8');
if (!marca.test(antes)) {
  console.error('la portada no tiene <meta name="master101-version">: no se sella nada a ciegas');
  process.exit(1);
}
await writeFile(PORTADA, antes.replace(marca, `$1${version}$3`));
console.log(`portada sellada con la versión ${version}`);
