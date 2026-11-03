import fs from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {suites} from './helpers/suites.mjs';

/** Registro de selección/requisitos; no representa resultados de ejecución. */
export function inventariarPruebas(){
 const dir=fileURLToPath(new URL('./',import.meta.url));
 return fs.readdirSync(dir).filter(f=>f.endsWith('.mjs')).sort().map(archivo=>{
  const grupos=Object.entries(suites).filter(([,files])=>files.includes(archivo)).map(([nombre])=>nombre);
  const contenido=fs.readFileSync(new URL(archivo,import.meta.url),'utf8');
  const navegador=/browser|visual/i.test(archivo);
  const r2Real=archivo==='revision-r2-local.integration.mjs';
  const historial=/estado_tramite|responsable_actual_id|movimientos_documentales|clasificacion_registro|entregas_secretaria|archivador_id/.test(contenido);
  const notas=[];
  let clase=grupos.includes('completa')||grupos.includes('revision')?'vigente_aislada':grupos.includes('unitarias-heredadas')?'unitaria_complementaria':'manual_no_portada';
  if(archivo==='catalogo-pruebas.mjs')clase='herramienta_de_inventario';
  else if(!grupos.length&&historial)clase='integracion_o_auxiliar_historico';
  if(grupos.length)notas.push('Runner aislado y fixtures sintéticos; sin credenciales reales');
  if(navegador)notas.push('Navegador/Playwright o sesión visual, frontend y servidor QA separados; revisar rutas/runtime antes de ejecutar');
  if(r2Real)notas.push('Requiere credenciales, bucket privado y prefijo R2 de pruebas; escribe objetos y registros: no ejecutar en estas suites');
  if(historial&&!grupos.length)notas.push('Esquema/circuito anterior; no demuestra el contrato vigente ni reactiva rutas');
  if(archivo==='pdf.test.mjs')notas.push('Unidad histórica PDF/SíseVe con URL /fixture incompatible con el guard actual; almacenamiento simulado, pendiente de adaptación');
  if(archivo==='pdf.postgres.integration.mjs')notas.push('Cluster propio pero SQL 005/repositorio PDF anterior; PDF_TEST_PG_BIN, no pertenece al esquema nuevo');
  if(archivo==='revision-concurrencia-local.integration.mjs')notas.push('Depende de manifiesto R2 anterior y actor fijo; escenario sustituido por concurrencia-aislada.test.mjs, original no ejecutado');
  if(archivo==='neon.test.mjs')notas.push('Validación de configuración con URLs ficticias; no conecta a Neon ni verifica Render real');
  if(!grupos.length&&!notas.length)notas.push('Revisar fixtures, perfiles, escrituras y destino antes de ejecución manual; excluido del runner');
  return {archivo,clase,suites:grupos,navegador,r2Real,requisitos:notas};
 });
}
