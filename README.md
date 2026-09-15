# master101

El panel **nuestro**: el del dueño de la suite 101. Ahí damos de alta a una
empresa cliente, le prendemos y apagamos apps, le ponemos o quitamos gente, y
la suspendemos si deja de pagar. No lo ve ningún cliente.

Es un Worker de Cloudflare que sirve un HTML y le habla a `suite101-api` por
dentro (service binding, `/s101/*`, `X-App: master101`). Sin framework: es
una herramienta para dos personas.

| | |
|---|---|
| Staging | `master101-staging.mike-929.workers.dev` → `suite101-api-staging` (org `demo` y las de prueba) |
| Producción | `master101.mike-929.workers.dev` → `suite101-api` (`forespot`) |

## Las pantallas

1. **Empresas.** Una fila por empresa con seis interruptores (dash, quell,
   peek, cotizador, roster, nest) y «Suspender / Reactivar». Cada interruptor
   hace `PATCH /admin/orgs/:o` y repinta con lo que la API contesta.
2. **Alta de empresa.** Nombre, identificador (se sugiere del nombre), moneda,
   apps iniciales y el correo del dueño: `POST /admin/orgs` y luego
   `POST …/miembros` con `rol: owner`.
3. **Gente de una empresa.** Lista con rol; agregar por correo y rol; quitar
   escribiendo el correo tal cual.
4. **Importar.** Un enlace a `/s101/admin/importar`, la página que ya vive en
   la API.

Sólo entra un superadmin: `/s101/yo` tiene que traer `superadmin: true`. Si
no, la pantalla dice «esta cuenta no manda aquí» y no pide nada más.

## Cómo se prueba

```
npm install
node pruebas/servidor.mjs --falso      # banco de pruebas con una API de mentiras, en :8791
node pruebas/panel.spec.mjs            # Playwright, 390×844 y 1440, contra el banco
```

Contra staging de verdad (sólo desde donde se alcance `*.workers.dev`):

```
BASE=https://master101-staging.mike-929.workers.dev \
API_ORIGEN=https://suite101-api-staging.mike-929.workers.dev \
CORREO_SUPERADMIN=… CORREO_CONTROL=… node pruebas/panel.spec.mjs
```

Eso mismo corre en `.github/workflows/publicar.yml` después de publicar
staging y antes de publicar producción; lo medido queda como comentario del
commit. En producción sólo se mira: nunca se entra ni se escribe.

Lo que no existe todavía en la API (propuesto en el arranque, decide Mike):
gestión de superadmins, bitácora de quién cambió qué, conteos por empresa.
