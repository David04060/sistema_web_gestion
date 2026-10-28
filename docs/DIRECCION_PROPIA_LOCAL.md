# Documentos propios de Dirección

Entorno verificado: sistema_web_final, PostgreSQL local ::1:5432, esquema public.
Vite en localhost:5173 utiliza el backend local en 127.0.0.1:3000.

Se aplicó 20261027-flujo-propio-direccion-local.sql mediante el migrador existente.
Amplía las protecciones de entregas_secretaria a los documentos ordinarios de Dirección.
Los registros anteriores de Dirección reciben únicamente PENDIENTE_DECISION: no se
deducen destinos, ubicaciones ni entregas de sus movimientos anteriores. El migrador
comprobó la conservación de 30 documentos, 13 tablas previas y sus secuencias.

Dirección puede registrar recibido o emitido y elegir una decisión inicial opcional.
Registro y decisión se guardan en una transacción. El formulario y el detalle comparten
controles y validaciones de oficina/persona y ubicación. Se conserva el remitente.
Guardar y delegar son alternativas excluyentes; ambas cierran la decisión.
Secretaría confirma también los delegados registrados por Dirección, sin transferir
autoría ni acceso al destinatario. Para documentos de Secretaría se conserva la
restricción de confirmación por la autora. Los recorridos terminados no se reabren.
Corregir y anular conservan sus motivos obligatorios y permisos propios.

## Arranque habitual

En dos terminales:

```powershell
cd C:\Users\David\Sistema_Web_Final\backend
npm run dev
```

```powershell
cd C:\Users\David\Sistema_Web_Final\frontend
npm run dev
```

La migración ya está aplicada. Para comprobar o aplicar migraciones locales pendientes,
el comando existente es `npm run migrate:local` desde backend; valida el destino local.

## Verificación de esta ampliación

- `npm run test:direccion:local`: recorrido por Vite y API real. La ejecución final
  hizo 58 solicitudes secuenciales y 4 concurrentes: recibido/emitido por cada decisión,
  decisión posterior, destinatario manual y usuario/oficina, entrega por Secretaría,
  confirmación duplicada, privacidad por API, motivo obligatorio y rollback completo
  ante oficina/usuario incompatibles. Decisiones concurrentes y confirmaciones
  concurrentes devolvieron una respuesta 200 y otra 409.
- Comparación exacta de documentos, movimientos, historial, relaciones y recorridos
  que existían al iniciar la prueba: conservados.
- Backend: lint, compilación y 36 pruebas unitarias correctos. Frontend: typecheck,
  lint, 53 pruebas y compilación correctos.
- Interfaz real: Dirección registró INF2026022 recibido, con remitente y delegación
  manual. El usuario cambió a Secretaría y confirmó su entrega. Se verificó después
  el detalle Entregado, autoría de Dirección, actor de confirmación Secretaría y
  persistencia al recargar.

Estas pruebas escriben registros identificados como comprobaciones locales en la base
autorizada; no eliminan registros ni crean usuarios, bases o copias. Se realizaron dos
ejecuciones de integración, la segunda tras añadir comprobaciones de concurrencia.
Los registros de la ejecución final son INF2026023 a INF2026028 y un registro adicional
de carrera. No se importaron datos QA ni se modificó producción.
