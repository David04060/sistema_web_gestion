/** Archivo: Gestiona preparación, confirmación, lectura y retirada de PDF; comprueba permisos y revisión del
 * documento.
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { limpiarObjetosPdf } from './pdf.limpieza.js';
import { limpiarRetencionesPdf } from './pdf.retencion.js';
import { operacion, documento, permisos, type Actor, type Registro } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { crearAlmacenR2, prefijoPdf, type AlmacenPdf } from './pdf.storage.js';
import type { iniciarSchema } from './pdf.schema.js';
/** El permiso nuevo del autor delegado cubre carga y reemplazo; conserva la eliminación anterior. */
function puedeEliminarPdf(actor: Actor, d: Registro) {
  return (
    permisos(actor, d).pdf &&
    (([3, 4].includes(actor.rol_id) && actor.ambito_id === d.ambito_id) ||
      (actor.rol_id === 5 && d.situacion !== 'DELEGADO'))
  );
}
/** Servicio del esquema vigente; el almacenamiento se resuelve solo al usar una operación R2.
 * @param almacen Fábrica del adaptador privado; las pruebas inyectan un almacén controlado.
 * @returns Operaciones que validan actor y revisión antes de modificar metadatos o archivos.
 * SQL y R2 no comparten transacción: las intenciones y colas durables permiten compensar fallos.
 */
export function pdfDocumental(almacen: () => AlmacenPdf = crearAlmacenR2) {
  /** Devuelve metadatos públicos y capacidad de modificación, nunca claves privadas del objeto. */
  async function consultar(actor: string, id: string) {
    return operacion(actor, 'Consulta PDF', async (cliente, identidad) => {
      const d = await documento(cliente, identidad, id);
      const p =
        (
          await cliente.query(
            'SELECT revision,nombre,tamano_bytes,actualizado_en FROM documentos_pdf WHERE documento_id=$1',
            [id],
          )
        ).rows[0] ?? null;
      return {
        archivo: p,
        modificar: permisos(identidad, d).pdf,
        eliminar: puedeEliminarPdf(identidad, d),
        limpieza_pendiente: (
          await cliente.query(
            `SELECT count(*)::int cantidad FROM pdf_objetos_pendientes o WHERE documento_id=$1 AND eliminado_en
  IS NULL AND (intentos>0 OR limpiar_desde<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM
  documentos_pdf p WHERE p.clave_r2=o.clave_r2) AND NOT EXISTS(SELECT 1 FROM acciones_documento a WHERE a.pdf_clave=o.clave_r2)`,
            [id],
          )
        ).rows[0].cantidad,
      };
    });
  }
  /**
   * Bloquea el documento, comprueba revisión y registra intención durable para ambas claves antes de
   * confirmar la transacción.
   */
  async function iniciar(actor: string, id: string, datos: z.infer<typeof iniciarSchema>) {
    return operacion(actor, 'Preparar PDF', async (cliente, identidad) => {
      const d = await documento(cliente, identidad, id, true);
      if (!permisos(identidad, d).pdf) throw new HttpError(403, 'Gestión PDF no autorizada');
      const p = (await cliente.query('SELECT revision FROM documentos_pdf WHERE documento_id=$1', [id]))
        .rows[0];
      if ((p?.revision ?? null) !== datos.revision) throw new HttpError(409, 'El PDF cambió');
      if (
        Number(
          (
            await cliente.query(
              'SELECT count(*) n FROM pdf_cargas WHERE actor_id=$1 AND confirmada_en IS NULL AND ' +
                'vence_en>clock_timestamp()',
              [identidad.id],
            )
          ).rows[0].n,
        ) >= 3
      )
        throw new HttpError(429, 'Hay cargas pendientes');
      const almacenPdf = almacen(),
        carga = randomUUID(),
        temporal = 'tmp/' + prefijoPdf() + randomUUID(),
        definitiva = prefijoPdf() + 'pdf/' + randomUUID(),
        vence = new Date(Date.now() + 600000);
      const url = await almacenPdf.subir(temporal, datos.tamano);
      await cliente.query(
        `INSERT INTO pdf_cargas(id,documento_id,actor_id,clave_temporal,
  clave_definitiva,nombre,tamano_bytes,vence_en,revision_esperada) VALUES($1,
  $2,$3,$4,$5,$6,$7,$8,$9)`,
        [carga, id, identidad.id, temporal, definitiva, datos.nombre, datos.tamano, vence, datos.revision],
      );
      for (const clave of [temporal, definitiva])
        await cliente.query(
          'INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde) VALUES($1,$2,$3)',
          [clave, id, vence],
        );
      return { carga, url, headers: { 'Content-Type': 'application/pdf', 'If-None-Match': '*' } };
    });
  }
  /**
   * Revalida permiso y revisión bajo bloqueo; valida y copia el PDF antes de vincularlo, con confirmación
   * idempotente.
   */
  async function confirmar(actor: string, id: string, carga: string) {
    await operacion(actor, 'Confirmar PDF', async (cliente, identidad) => {
      const d = await documento(cliente, identidad, id, true);
      if (!permisos(identidad, d).pdf) throw new HttpError(403, 'Gestión PDF no autorizada');
      const datos = (
        await cliente.query(
          'SELECT * FROM pdf_cargas WHERE id=$1 AND documento_id=$2 AND actor_id=$3 FOR UPDATE',
          [carga, id, identidad.id],
        )
      ).rows[0];
      if (!datos) throw new HttpError(404, 'Carga inexistente');
      const p = (await cliente.query('SELECT revision FROM documentos_pdf WHERE documento_id=$1', [id]))
        .rows[0];
      if (datos.confirmada_en && p?.revision === carga) return;
      if (
        datos.confirmada_en ||
        new Date(datos.vence_en).getTime() <= Date.now() ||
        (p?.revision ?? null) !== datos.revision_esperada
      )
        throw new HttpError(409, 'Carga vencida o revisión obsoleta');
      await cliente.query(
        'SELECT clave_r2 FROM pdf_objetos_pendientes WHERE clave_r2 IN ($1,$2) ORDER BY clave_r2 FOR UPDATE',
        [datos.clave_temporal, datos.clave_definitiva],
      );
      await almacen().validarYCopiar(datos.clave_temporal, datos.clave_definitiva, datos.tamano_bytes);
      await cliente.query(
        `INSERT INTO documentos_pdf(documento_id,revision,clave_r2,nombre,
  tamano_bytes,actualizado_por) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(documento_id) DO UPDATE
  SET revision=EXCLUDED.revision,clave_r2=EXCLUDED.clave_r2,nombre=EXCLUDED.nombre,
  tamano_bytes=EXCLUDED.tamano_bytes,actualizado_por=EXCLUDED.actualizado_por,
  actualizado_en=clock_timestamp()`,
        [id, carga, datos.clave_definitiva, datos.nombre, datos.tamano_bytes, identidad.id],
      );
      await cliente.query('UPDATE pdf_cargas SET confirmada_en=clock_timestamp() WHERE id=$1', [carga]);
      await cliente.query(
        'UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE clave_r2=$1',
        [datos.clave_temporal],
      );
    }); // La mutación ya está confirmada; un fallo del recolector conserva el pendiente para mantenimiento.
    await limpiar(20, id).catch(() => {});
    return consultar(actor, id);
  }
  /** Retira solo la revisión esperada; el trigger conserva auditoría y programa la recolección del objeto. */
  async function eliminar(actor: string, id: string, revision: string) {
    await operacion(actor, 'Eliminar PDF', async (cliente, identidad) => {
      const d = await documento(cliente, identidad, id, true);
      if (!puedeEliminarPdf(identidad, d)) throw new HttpError(403, 'Gestión PDF no autorizada');
      const r = await cliente.query('DELETE FROM documentos_pdf WHERE documento_id=$1 AND revision=$2', [
        id,
        revision,
      ]);
      if (!r.rowCount) throw new HttpError(409, 'El PDF cambió');
    }); // La mutación ya está confirmada; un fallo del recolector conserva el pendiente para mantenimiento.
    await limpiar(20, id).catch(() => {});
    return consultar(actor, id);
  }
  /** Exige lectura vigente y firma una URL privada de 60 segundos; no concede gestión por poder leer. */
  async function abrir(actor: string, id: string, descargar: boolean) {
    const lectura = await operacion(actor, 'Abrir PDF', async (cliente, identidad) => {
      const d = await documento(cliente, identidad, id);
      const p = (
        await cliente.query(
          'SELECT clave_r2,nombre,tamano_bytes,revision FROM documentos_pdf WHERE documento_id=$1',
          [id],
        )
      ).rows[0];
      if (!p) throw new HttpError(404, 'Sin PDF adjunto');
      if (d.delegado_por_nombre) return { archivo: p };
      return { enlace: { url: await almacen().abrir(p.clave_r2, p.nombre, descargar), vence_en: 60 } };
    });
    if (lectura.enlace) return lectura.enlace;

    const p = lectura.archivo;
    const bytes = await almacen().leer(p.clave_r2, Number(p.tamano_bytes));
    return operacion(actor, 'Confirmar consulta PDF', async (cliente, identidad) => {
      await documento(cliente, identidad, id);
      const vigente = await cliente.query(
        'SELECT 1 FROM documentos_pdf WHERE documento_id=$1 AND revision=$2',
        [id, p.revision],
      );
      if (!vigente.rowCount) throw new HttpError(404, 'Sin PDF adjunto');
      return { contenido: Buffer.from(bytes).toString('base64') };
    });
  }
  /** Comparte el adaptador de esta instancia con el recolector, incluido el adaptador aislado de pruebas. */
  async function limpiar(limite = 20, id?: string) {
    const retencion = await limpiarRetencionesPdf(almacen, limite, id);
    const objetos = await limpiarObjetosPdf(almacen, limite, id);
    return {
      eliminados: retencion.eliminados + objetos.eliminados,
      pendientes: retencion.pendientes + objetos.pendientes,
    };
  }
  return { consultar, iniciar, confirmar, eliminar, abrir, limpiar };
}
export const pdfActual = pdfDocumental();
