# Sesión y carga percibida — 24 de octubre de 2026

## Causas comprobadas

La recuperación por foco/visibilidad publicaba el estado global verificando y
desmontaba el layout. Al volver a montarse, Dashboard y metadatos SíseVe volvían
a consultar. El Dashboard añadía dos eventos de actualización y useConsulta
eliminaba resultados antes de cada recarga. Un límite fijo de 15 segundos era
insuficiente para algunos arranques en frío de Render Free.

React.lazy ya está declarado fuera de los componentes. Sus promesas y módulos
resueltos se reutilizan; no se agregó precarga, keep-alive ni caché de documentos.
La navegación real entre páginas sigue consultando datos vigentes. Las pruebas
de bundle mantienen las pantallas fuera de la entrada inicial.

## Comportamiento implementado

- La restauración inicial bloquea contenido hasta validar /me. Una revalidación
  pendiente conserva la sesión previamente verificada y el layout ordinario.
- Foco, pageshow y visibilidad comparten /me pendiente; los eventos automáticos
  respetan una ventana de 30 segundos desde el último éxito. El reintento explícito
  sigue disponible. Nunca se aplaza exp; comprobar el reloj no renueva la sesión.
- Un fallo de revalidación bloquea las vistas. Un 401 autenticado invalida la
  sesión; /me 401/403 elimina el JWT. Un 403 de una operación conserva la identidad,
  pero descarta sus resultados. La revocación sigue siendo validada en cada API;
  el navegador no dispone de notificación push de revocaciones.
- Las recargas ordinarias del mismo contexto conservan resultados en memoria del
  montaje y exponen actualizando. Primera carga, cuenta/perfil/filtros distintos
  o rechazo no reutilizan esos resultados. Desmontar descarta respuestas tardías.
  No hay persistencia documental ni caché compartida.
- Dashboard conserva indicadores durante una recarga, agrupa eventos de regreso,
  aplica 30 segundos a recargas automáticas y conserva Actualizar panel.
- SíseVe no usa conservación de resultados. Ocultar la página, revalidar la sesión
  o volver al módulo exige metadatos nuevos y desmonta la vista restringida hasta
  completar la comprobación. Claves y autorizaciones adicionales no se reutilizan.
- GET ordinarios: hasta dos intentos, con plazos de 15 y 50 segundos, solo por fallo
  de transporte o HTTP 502/503/504. No se repiten 401/403/429/500, solicitudes con
  señal explícita, escrituras, login ni rutas SíseVe (salvo metadatos propios).
  El login tiene un único intento de hasta 65 segundos. Desde 8 segundos se muestra
  un aviso de demora/inicio posible; no se afirma que la causa sea conocida.
  Fetch usa no-store, sin cambiar los contratos HTTP.

## Verificación

Frontend: TypeScript, ESLint, build y 51 pruebas correctas. Backend sin cambios:
TypeScript, ESLint, build y 36 pruebas unitarias correctas. No se ejecutaron suites
de escritura en production. Las nuevas pruebas cubren eventos simultáneos,
ventana temporal, caducidad durante /me, logout, fallos, cambios de perfil,
contextos de consultas, resultados restringidos y límites de reintentos.

En Chrome, con la aplicación real y API sintética local, los indicadores siguieron
visibles durante una respuesta demorada 1,5 segundos, con aviso de actualización.
Se navegó repetidamente Dashboard → Roles → Dashboard sin pantalla global de
verificación de sesión ni alertas. El modo desarrollo usa StrictMode y puede
ejecutar dos efectos iniciales; no se cuentan esas duplicaciones como producción.

Medición real de lectura desde Node local hacia Neon production, tres muestras:
perfil 105,85–114,40 ms; Dashboard administrativo 635,52–654,55 ms. Abrir pool y
verificar identidad: 1533,76 ms. Pool: una conexión libre reutilizada, cero esperas,
máximo configurado 10. No son mediciones internas de Render ni una estimación para
todos los roles. No se registraron usuarios, JWT, hashes ni contenido documental.

Dashboard conserva su transacción REPEATABLE READ READ ONLY, agregados SQL y
exclusión de SíseVe. La lectura del actor dentro de esa instantánea mantiene sus
garantías aunque el middleware haya autenticado antes. No se cambiaron consultas,
índices, funciones ni triggers sin evidencia adicional de un cuello de botella.

## Operación

Se publica solamente el frontend en el proyecto Pages existente. No se requiere
desplegar Render porque su código no cambia. La ventana reduce solicitudes y
desmontajes; no acelera la ejecución SQL ni elimina el arranque en frío.
Render Free puede suspenderse tras 15 minutos y tardar aproximadamente un minuto
en despertar: https://render.com/docs/free. Si supera el presupuesto acotado, el
usuario recibirá error y podrá reintentar manualmente. No se añaden keep-alives,
servicios de pago ni debilitamientos criptográficos.

Publicación confirmada en Pages Production/main:
3b9dee20-957f-4fb5-ae56-97ac6d36cda8, commit de aplicación
7e75b102f266d505332a11bccbee29794a76ea9d. El dominio
https://sistema-documental-p.pages.dev devolvió HTTP 200; HTML y hashes de JS/CSS
principales coincidieron con el artefacto local. Login visible sin alertas en
Chrome. API remota: salud 200; /me, Dashboard y acceso SíseVe sin token 401.
En esta etapa no se inició otra sesión institucional remota: las regresiones
autenticadas del cambio se probaron con datos sintéticos locales.

Prueba sintética reproducible: desde frontend, node tests/performance-server.mjs;
abrir http://127.0.0.1:5176. Cualquier usuario y contraseña sintéticos no vacíos
sirven solo en ese servidor, que intercepta /api y no importa PostgreSQL.
