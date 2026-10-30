# Visor interno de PDF

## Objetivo y alcance

El apartado Archivo PDF del detalle documental presenta un único punto de acción:
- Sin adjunto: Sin PDF adjunto y Subir archivo PDF para quien puede modificar.
- Con adjunto: nombre y Visualizar archivo PDF.
Al visualizar se muestra el documento dentro de la misma interfaz y ruta. Las
acciones Descargar PDF, Actualizar PDF y Eliminar PDF aparecen en esa vista;
actualizar/eliminar siguen condicionadas al permiso que devuelve el backend.
Volver al documento libera el visor y devuelve el resumen.

## Integración realizada

1. Se instaló pdfjs-dist 6.4.299 desde npm y se actualizaron package.json/lockfile.
   No se usa un servicio de visualización externo ni un CDN.
2. VisorPdf.tsx se carga con React.lazy al visualizar. Vite empaqueta PDF.js y
   pdf.worker.min.mjs como recursos de la aplicación. GlobalWorkerOptions apunta
   al worker local, con la misma versión de la biblioteca.
3. ArchivoPdf conserva clientePdf y los endpoints actuales. Primero solicita
   autorización al backend; después obtiene los bytes de la URL temporal de R2.
   Esa URL no sustituye los controles de autorización del servidor.
4. obtenerContenidoPdf utiliza credentials=omit, cache=no-store y no-referrer.
   No envía JWT ni contraseña SíseVe a R2. Rechaza errores HTTP, archivos vacíos,
   tamaño superior a 15 MiB y respuestas de un contexto que perdió vigencia.
5. PDF.js interpreta los bytes en el navegador y dibuja una página a la vez en
   canvas. Se incluyen anterior/siguiente, contador, carga y errores. No se
   construyen capas de anotaciones, enlaces ni formularios interactivos del PDF.
   XFA queda deshabilitado. El render se limita a 2048 x 4096 píxeles como máximo.
6. Se cancelan renderizados pendientes al cambiar de página y se destruye la
   tarea PDF al desmontar. Los bytes no se guardan en almacenamiento persistente.
7. Descargar solicita nuevamente autorización, obtiene el archivo y usa una URL
   blob temporal con nombre de descarga; la URL se revoca. No abre otra pestaña.
8. El selector de archivo está oculto y se abre desde Subir/Actualizar. Seleccionar
   presenta una previsualización local; solo Confirmar subida inicia la carga.
   Reemplazo y eliminación mantienen confirmación.
   Tras confirmar carga o eliminación se vuelve al resumen con estado actualizado.
9. SíseVe conserva la clave por operación. Ocultar su página descarta el visor,
   contenido y credenciales de esa operación. No se modificaron permisos backend.

## Diseño

Resumen compacto y adaptable; barra interna de acciones; eliminación diferenciada;
canvas sobre fondo de lectura y botones apilados en móvil. No se rediseñaron otros
módulos. El documento se visualiza, no se edita su contenido: Actualizar sustituye
el adjunto mediante el proceso autorizado existente.

## Comprobaciones ejecutadas

- Chrome local, Secretaría, documento ficticio previo 88: resumen con nombre y
  un único botón Visualizar archivo PDF; apertura dentro de /documentos/88 y canvas
  774 x 1095 mostrando página 1 de 1.
- La vista interna mostró Volver, Descargar, Actualizar y Eliminar. Volver regresó
  al resumen y se pudo reabrir.
- Descarga desde el visor: archivo de 879 bytes, SHA-256 idéntico al ficticio original.
- Vista móvil de 390 x 844: canvas presente y sin desbordamiento horizontal.
- Frontend: 60 pruebas aprobadas, typecheck, lint y build correctos. El build generó
  el worker local y un chunk independiente VisorPdf. Instalación npm: cero
  vulnerabilidades reportadas.
- No se afirma haber probado todos los formatos especiales de PDF, selección de
  texto, formularios o un recorrido real de SíseVe: estos no forman parte del visor
  canvas implementado. La prueba de contexto y las regresiones SíseVe existentes
  sí se ejecutaron automáticamente.

Evidencias locales privadas: backend/.private/pdf-rollout/evidencias/visor-interno-*.png.
No se cambiaron tablas ni registros documentales para integrar este visor; no se
hicieron commit, push ni despliegue en esta etapa.

Referencia técnica: https://mozilla.github.io/pdf.js/examples/

Comprobación adicional de navegador: el documento local 86, sin adjunto, mostró
Sin PDF adjunto y únicamente Subir archivo PDF dentro de la sección. No se cargó
ni sustituyó un archivo para esta comprobación. El PDF de prueba del documento 88
se conservó. La navegación entre múltiples páginas quedó implementada pero el
recorrido visual ejecutado utilizó un PDF de una página; no se declara una prueba
visual de PDF multipágina.

La última repetición de typecheck, lint y build terminó correctamente después de
ajustar el tipo Uint8Array<ArrayBuffer> para Blob y el import explícito TextDecoder
en la prueba Node. La descarga visual produjo qa-uno (2).pdf, de 879 bytes, con
SHA-256 52407F12458BC2DECE176B3B66154F270F4D746BC1832A45720617FFA98DF7AC,
idéntico al archivo ficticio original.
