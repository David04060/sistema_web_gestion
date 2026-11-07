import {lecturaSQL} from '../../dist/shared/documental/nucleo.js';

/** Solo pruebas de calendario/volumen sobre pg_temp. No prueba ni sustituye la autorización productiva.
 * Las suites HTTP y de relevo usan documento_consultable real sobre fixtures públicos aislados.
 */
export function clienteConLecturaSintetica(cliente) {
 const lectura=`($1::bigint IS NOT NULL AND ($2::smallint=1 OR (d.situacion<>'ANULADO' AND
  ($2::smallint IN(3,4) OR ($2::smallint=5 AND d.ambito_id=$3::bigint)))))`;
 return {query:(sql,...args)=>cliente.query(sql.replaceAll(lecturaSQL,lectura),...args)};
}
