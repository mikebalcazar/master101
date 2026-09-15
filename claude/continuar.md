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
