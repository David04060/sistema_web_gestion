# Plan de rediseño institucional local

Objetivo: aplicar un sistema de diseño persistente al frontend activo sin modificar datos ni contratos.
Arquitectura: tokens semánticos globales, CSS Modules compartidos, selector de tema independiente del árbol de rutas y del estado de formularios/PDF. React 19.3.1, TypeScript, Vite 8.3.4.
Especificación: solicitud del usuario y design-system/paillardelle-documental/MASTER.md. Ejecución en esta sesión; prohibidos commit, push, despliegue y copias de bases.

- [x] Inventariar rutas efectivas, cinco perfiles, componentes activos y logo real. Conservar cambios locales previos.
- [x] Ejecutar búsquedas de la skill y persistir MASTER sin --force; adaptar recomendaciones a identidad institucional.
- [x] Probar política de tema: prioridad manual/sistema, valor corrupto y almacenamiento bloqueado. Implementar selector accesible y arranque previo al render.
- [x] Aplicar marca, login, favicon, navegación, formularios, estados, tablas y PDF en ambos temas.
- [x] Probar texto extenso y conservar información completa en detalle/auditoría; tarjetas móviles con todas las columnas y acciones.
- [x] Verificar recorridos de cinco roles con sesiones iniciadas por el usuario; escritorio/tableta/móvil, temas y persistencia. Registrar operaciones no ejecutadas sobre datos existentes.
- [x] Ejecutar suite completa, typecheck, lint y build finales; documentar resultados y pendientes reales.

Riesgos a comprobar: selector oculto por reglas antiguas, anchura de tabla, foco del drawer al cambiar breakpoint, reinicio accidental del visor, contraste de colores fijos. No regenerar el escudo; los PNG de favicon son derivados nuevos. No cambiar funciones ni permisos del backend.

Resultados y límites de cada recorrido: docs/REDISENO_INTERFAZ_LOCAL.md. Las marcas completadas se refieren al alcance de interfaz documentado; no certifican las escrituras pendientes.
