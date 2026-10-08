# master101 — para seguir en otro chat

Léelo después de `OPERAR.md` y del `CONTEXTO.md` de Drive. El documento de
arranque es Drive `suite101/coordinacion/master101-arranque.md` (14-sep).

## Qué es

El panel del dueño de la suite: alta de empresas cliente, prender y apagar sus
apps, su gente, suspender. Misma arquitectura que peek101 (D1, D2): Worker
`master101` y `master101-staging`, static assets + proxy `/s101/*` con
`X-App: master101`, HTML y JS sin empaquetador. **roster101 no se toca**: tiene
su propio panel maestro por tenant.

```
worker/index.js          el Worker: /s101/* → suite101-api (service binding), lo demás assets
public/index.html        las vistas: entrada, «no manda aquí», empresas, alta, gente, diálogo de quitar
public/app.js            la lógica; `pedir()` desenvuelve {ok,data}/{ok:false,error}
public/estilo.css        identidad de la suite; barra en azul oscuro para no confundirlo con un portal
pruebas/servidor.mjs     el banco: sirve public/ y reenvía /s101/* a staging, o `--falso` con una API en memoria
pruebas/panel.spec.mjs   Playwright: el recorrido del arranque §4, 390×844 y 1440, más el control
scripts/medir.mjs        desde el corredor: cáscara, enlace, versión, superadmin sí / control no
scripts/sellar.mjs       pone el commit en <meta name="master101-version">
.github/workflows/publicar.yml   staging → medir → navegador → producción → medir → comentario
```

## Lo que la API ya da (medido en suite101-api/src/rutas/admin.ts)

`GET/POST /admin/orgs`, `PATCH /admin/orgs/:o {nombre, plan, apps, activa}`,
`DELETE /admin/orgs/:o` (sólo fuera de producción: reinicia), `GET/POST
/admin/orgs/:o/miembros`, `DELETE /admin/orgs/:o/miembros/:uid`. `apps` es el
mapa completo `{dash, quell, peek, cotizador, roster, nest}`; se manda entero.
Superadmin: tabla `superadmins`; en staging `mike@forespot.com` (la misma
cuenta que la prueba de humo de la API); fuera de producción `/auth/codigo`
devuelve `codigo_prueba`.

## Decisiones que quedaron aquí

- El alta hace dos llamadas (org y luego owner). Si la segunda falla, la
  pantalla lo dice y manda a «Gente»: la empresa ya existe.
- Quitar a alguien pide teclear su correo; el botón no se habilita antes.
- Una empresa suspendida tiene los interruptores apagados de tocar: primero se
  reactiva.
- «plan» es texto libre; el arranque lo deja para que Mike decida.

## 0.2.0 (15-sep): lo que Mike decidió, una pregunta por vez

Contrato 0.5.0 de la API (suite101-api PR #43, muro `0420-jr`): superadmins
por ruta (`/admin/superadmins`, candados `ultimo_superadmin` y `a_ti_mismo`),
`bitacora_admin` (la escribe la API en PATCH de org, altas y bajas de gente y
de superadmins; se lee en `/admin/bitacora` y `/admin/orgs/:o/bitacora`), y
`personas` + `ultima_entrada` en `GET /admin/orgs`. master101 0.2.0 los
enseña: vista Superadmins, columnas Gente y Última entrada, bitácora en la
vista de cada empresa. «plan» se queda como etiqueta. La API de mentiras del
banco (`pruebas/servidor.mjs --falso`) imita todo eso, incluido que
`ultima_entrada` sale de las sesiones de los miembros.

Las 105 orgs de humo de staging las barrió `pruebas/humo.mjs` de la API en
su primera corrida con 0.5.0 (107 borradas); desde entonces cada corrida
limpia lo suyo.

## 8-oct-2026 · el look de cost101

Mike, 8-oct: «todas las plataformas (…) con el diseño look and feel de
cost101 pero siguiendo los parámetros de tipografía y de logo de dash y
quell». En `public/estilo.css`: en pantalla siempre oscuro (degradado azul,
vidrio, botones redondos, menú activo en píldora, diálogo de vidrio); al
imprimir vuelven los claros y la barra no sale. Tipografía igual (Cifras +
Raleway locales, títulos en 600; Sansation ya no se declara). Logo oficial
`public/master101-claro.svg` en la barra (28 px) y en la entrada (36 px).
Probado: dominio, entrada, atrás, versión y licencias en verde; capturas a
1440×900 y 390×844 sin desborde de página ni texto oscuro sobre oscuro.
Ojo: `panel.spec.mjs` contra el banco falso da 6 fallas que YA estaban en
main (el banco no imita el alta con director/cortesía); contra staging, que
es como corre en el flujo, pasa.

**8-oct (tarde), la tabla de Empresas cabe.** Con 14 columnas, «Suspender»
salía cortado a 1440 px (venía de antes del estilo nuevo). `#v-empresas` se
abre a 1400 px, las columnas se aprietan y nombre/plan ya no se parten:
cabe sin desplazar desde ~1230 px; en celular sigue desplazándose dentro de
su caja. Medido con Chromium contra el banco falso a 1440, 1280 y 390.

**8-oct (noche), patron101 en la tabla de Empresas.** Encargo del chat que
construyó patron101 (Drive suite101/patron101/encargo-integrar-patron101.md).
Llave `investor` en `APPS` (por dentro sigue siendo investor101; el
encabezado dice «patron»). Licencia propia, como `cost`: una empresa nueva no
nace con ella. Los `th.app` llevan `data-app` y la prueba compara contra esa
llave, no contra el texto. Con nueve columnas las de interruptores van a 4 px
de relleno para que «Suspender» siga cabiendo desde 1280 px.
