# Selector de delegación y cierre de ubicación vigente

- El alta y el detalle usan un solo combobox de persona. El resultado distingue cuenta y oficina. El teclado permite recorrer coincidencias, elegir con Enter y cerrar con Escape. El filtro de oficina y el nombre manual siguen disponibles.
- El alta muestra Delegar como sección plegable después de Ubicación opcional y conserva Registrar documento como acción principal. Abrir la sección incluye el destino en la misma transacción del alta.
- La ubicación vigente debe pertenecer al actor para delegar un documento ubicado. Dirección puede delegar desde Guardado en Dirección si gestiona esa ubicación en el ámbito compartido. Secretaría y Usuario conservan los requisitos de autoría. El trigger marca la ubicación histórica, cambia el estado y registra el antes y después en auditoría.
- El incremental 006 sustituye tres funciones, sin actualizar filas existentes. Se comparó la definición previa de cada función con el punto de partida versionado antes de publicarlo.
- Ejemplo comprobado en PostgreSQL aislado. Dirección registra en Ubicación de prueba y el estado inicial es Guardado en Dirección. Al delegar a Persona indicada, la auditoría conserva la ruta Ubicación de prueba y el estado anterior. El estado nuevo es Delegado y la ruta vigente queda vacía. Se comprobaron el actor, la fecha y la permanencia de otro documento en la misma ubicación. Secretaría y Usuario pasaron la misma comprobación desde sus estados de origen.
- El permiso PDF del autor sigue disponible después de delegar. Se comprobó el permiso y se ejecutaron las regresiones de carga y reemplazo con almacenamiento simulado.

## Publicación y evidencia

- Render Live en 001e9e8d830a049a332562e83e2a10d0e4ead116, despliegue dep-dblln38ae00c73c93it0. Pages 09ba7462-a877-4d5f-857c-d2762a635911. El dominio principal sirvió 53 recursos idénticos al build y la ruta de alta respondió 200.
- Neon verificó las tres funciones del incremental 006 en sistema_documental_produccion. Antes y después había cuatro ubicaciones vigentes de cuatro filas totales. Se conservaron copias privadas de las definiciones anteriores.
- En la sesión de Dirección en el dominio principal se comprobó el control anterior y se recargó la interfaz publicada. En el alta se abrió Delegar, se buscó dentro de Usuario y se eligió con flechas y Enter. También se abrió la modalidad de nombre manual. En el detalle de un registro Guardado en Dirección se abrió Delegar documento, se capturaron las coincidencias y se eligió una por clic. Estas interacciones se verificaron antes de enviar. Las escrituras, destino inválido y el ejemplo de historial se probaron en el clúster aislado.
- Backend general 62/62, revisión 38/38, frontend 70/70. Typecheck, lint y compilación verificados. La repetición de revisión incluyó dos homónimos sintéticos con nombre idéntico y cuentas y oficinas distintas.
- Capturas privadas del dominio principal: delegacion-registro-selector.png y delegacion-detalle-selector.png. La prueba de ancho móvil solicitó 390 px pero el navegador mantuvo 1905 px. Queda pendiente confirmar la interacción táctil y el diseño a ancho móvil efectivo.
