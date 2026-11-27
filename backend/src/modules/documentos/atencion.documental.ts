/** Archivo: Acciones propias, recorrido cronológico y PDF privados asociados al mismo documento. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { operacion, documento, permisos } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { crearAlmacenR2, prefijoPdf, type AlmacenPdf } from '../documentos-pdf/pdf.storage.js';
import { iniciarSchema } from '../documentos-pdf/pdf.schema.js';
import { limpiarObjetosPdf } from '../documentos-pdf/pdf.limpieza.js';
export const accionSchema = z
  .object({
    descripcion: z.string().trim().min(1).max(20000),
    revision: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .optional(),
    carga: z.uuid().optional(),
    retirar_pdf: z.boolean().optional().default(false),
  })
  .strict()
  .refine((d) => !(d.carga && d.retirar_pdf), 'Selecciona sustituir o retirar el PDF');
export const cargaAccionSchema = iniciarSchema.omit({ revision: true });
/** Una sola autorización para recorrido, acciones y adjuntos; nunca concede edición del registro original. */
export function atencionDocumental(almacen: () => AlmacenPdf = crearAlmacenR2) {
  async function consultar(actor: string, id: string) {
    return operacion(actor, 'Consulta de atención', async (c, u) => {
      const d = await documento(c, u, id);
      if (!permisos(u, d).recorrido) throw new HttpError(403, 'Recorrido no autorizado');
      const acciones = (
        await c.query(
          `SELECT a.id::text,a.responsable_id::text,a.descripcion,a.oficina_nombre,a.creado_en,a.actualizado_en,a.revision::text,a.pdf_nombre,a.pdf_tamano,concat_ws(' ',u.nombre,u.apellido) responsable FROM acciones_documento a JOIN usuarios u ON u.id=a.responsable_id WHERE a.documento_id=$1 ORDER BY a.creado_en,a.id`,
          [id],
        )
      ).rows;
      const delegaciones = (
        await c.query(
          `SELECT e.id::text,e.nombre_persona_guardado destinatario,e.observaciones indicaciones,e.delegado_en fecha,concat_ws(' ',u.nombre,u.apellido) responsable FROM delegaciones_documento e JOIN usuarios u ON u.id=e.delegado_por WHERE e.documento_id=$1 ORDER BY e.delegado_en,e.id`,
          [id],
        )
      ).rows;
      const correcciones = (
        await c.query(
          `SELECT h.id::text,h.fecha,h.anterior,h.posterior,concat_ws(' ',u.nombre,u.apellido) responsable FROM auditoria_documental h JOIN usuarios u ON u.id=h.actor_id WHERE h.documento_id=$1 AND h.accion='ACCION_CORREGIDA' ORDER BY h.fecha,h.id`,
          [id],
        )
      ).rows;
      // La descripción inicial se reconstruye del primer antes; una corrección conserva su lugar cronológico.
      const eventos = [
        {
          id: 'registro',
          tipo: 'REGISTRO',
          fecha: d.creado_en,
          responsable: d.registrado_por_nombre,
          descripcion: String(d.codigo_visible) + ' · ' + String(d.asunto),
        },
        ...delegaciones.map((e) => ({
          ...e,
          id: 'delegacion-' + e.id,
          tipo: 'DELEGACION',
          descripcion: e.destinatario,
        })),
        ...acciones.map((a) => {
          const primera = correcciones.find((h) => h.posterior.accion_id === a.id);
          return {
            id: 'accion-' + a.id,
            tipo: 'ACCION',
            fecha: a.creado_en,
            responsable: a.responsable,
            oficina: a.oficina_nombre,
            descripcion: primera?.anterior.descripcion ?? a.descripcion,
            accion_id: a.id,
            pdf_nombre: a.pdf_nombre,
          };
        }),
        ...correcciones.map((h) => ({
          ...h,
          id: 'correccion-' + h.id,
          tipo: 'CORRECCION',
          descripcion: h.posterior.descripcion,
          accion_id: h.posterior.accion_id,
        })),
      ];
      eventos.sort((a, b) => new Date(a.fecha as string).getTime() - new Date(b.fecha as string).getTime());
      return {
        acciones: acciones.map((a) => ({
          ...a,
          corregir: a.responsable_id === u.id && permisos(u, d).acciones,
        })),
        eventos,
        puede_agregar: permisos(u, d).acciones,
      };
    });
  }
  async function iniciar(actor: string, id: string, datos: z.infer<typeof cargaAccionSchema>) {
    return operacion(actor, 'Preparar PDF de acción', async (c, u) => {
      const d = await documento(c, u, id, true);
      if (!permisos(u, d).acciones) throw new HttpError(403, 'Acción no autorizada');
      const n = (
        await c.query(
          'SELECT count(*)::int n FROM acciones_pdf_cargas WHERE actor_id=$1 AND confirmada_en IS NULL AND vence_en>clock_timestamp()',
          [u.id],
        )
      ).rows[0].n;
      if (n >= 3) throw new HttpError(429, 'Hay cargas pendientes');
      const carga = randomUUID(),
        temporal = 'tmp/' + prefijoPdf() + randomUUID(),
        definitiva = prefijoPdf() + 'acciones/' + randomUUID(),
        vence = new Date(Date.now() + 600000);
      const url = await almacen().subir(temporal, datos.tamano);
      await c.query(
        'INSERT INTO acciones_pdf_cargas(id,documento_id,actor_id,temporal,definitiva,nombre,tamano,vence_en) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [carga, id, u.id, temporal, definitiva, datos.nombre, datos.tamano, vence],
      );
      for (const clave of [temporal, definitiva])
        await c.query(
          'INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde) VALUES($1,$2,$3)',
          [clave, id, vence],
        );
      return { carga, url, headers: { 'Content-Type': 'application/pdf', 'If-None-Match': '*' } };
    });
  }
  /** Intención durable previa al acceso R2: rollback conserva la tarea de limpieza y el adjunto anterior. */
  async function guardar(
    actor: string,
    id: string,
    accionId: string | null,
    datos: z.infer<typeof accionSchema>,
  ) {
    const resultado = await operacion(
      actor,
      accionId ? 'Corrección de acción realizada' : 'Acción realizada',
      async (c, u) => {
        const d = await documento(c, u, id, true);
        if (!permisos(u, d).acciones) throw new HttpError(403, 'Acción no autorizada');
        const anterior = accionId
          ? (
              await c.query('SELECT * FROM acciones_documento WHERE id=$1 AND documento_id=$2 FOR UPDATE', [
                accionId,
                id,
              ])
            ).rows[0]
          : null;
        if (accionId && (!anterior || String(anterior.responsable_id) !== u.id))
          throw new HttpError(403, 'Solo el autor puede corregir esta acción');
        if (anterior && String(anterior.revision) !== datos.revision)
          throw new HttpError(409, 'La acción cambió; vuelve a consultar');
        let clave = datos.retirar_pdf ? null : (anterior?.pdf_clave ?? null),
          nombre = datos.retirar_pdf ? null : (anterior?.pdf_nombre ?? null),
          tamano = datos.retirar_pdf ? null : (anterior?.pdf_tamano ?? null);
        if (datos.carga) {
          const carga = (
            await c.query(
              'SELECT * FROM acciones_pdf_cargas WHERE id=$1 AND documento_id=$2 AND actor_id=$3 FOR UPDATE',
              [datos.carga, id, u.id],
            )
          ).rows[0];
          if (!carga) throw new HttpError(404, 'Carga inexistente');
          // Reintentar el alta confirmada devuelve la misma acción sin duplicarla.
          if (carga.confirmada_en) {
            if (!accionId && carga.accion_id) return { id: String(carga.accion_id) };
            throw new HttpError(409, 'Carga ya utilizada');
          }
          if (new Date(carga.vence_en).getTime() <= Date.now()) throw new HttpError(409, 'Carga vencida');
          await c.query(
            'SELECT clave_r2 FROM pdf_objetos_pendientes WHERE clave_r2 IN ($1,$2) ORDER BY clave_r2 FOR UPDATE',
            [carga.temporal, carga.definitiva],
          );
          await almacen().validarYCopiar(carga.temporal, carga.definitiva, carga.tamano);
          clave = carga.definitiva;
          nombre = carga.nombre;
          tamano = carga.tamano;
        }
        const a = anterior
          ? (
              await c.query(
                'UPDATE acciones_documento SET descripcion=$2,pdf_clave=$3,pdf_nombre=$4,pdf_tamano=$5 WHERE id=$1 RETURNING id::text',
                [accionId, datos.descripcion, clave, nombre, tamano],
              )
            ).rows[0]
          : (
              await c.query(
                'INSERT INTO acciones_documento(documento_id,responsable_id,descripcion,pdf_clave,pdf_nombre,pdf_tamano) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',
                [id, u.id, datos.descripcion, clave, nombre, tamano],
              )
            ).rows[0];
        if (datos.carga) {
          await c.query(
            'UPDATE acciones_pdf_cargas SET accion_id=$2,confirmada_en=clock_timestamp() WHERE id=$1',
            [datos.carga, a.id],
          );
          await c.query(
            'UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE clave_r2=(SELECT temporal FROM acciones_pdf_cargas WHERE id=$1)',
            [datos.carga],
          );
        }
        return a;
      },
    );
    await limpiarObjetosPdf(almacen, 10, id).catch(() => {});
    return resultado;
  }
  /** Contenido autorizado, sin URL R2 reutilizable; se vuelve a comprobar permiso y revisión tras leer. */
  async function abrir(actor: string, id: string, accionId: string) {
    const p = await operacion(actor, 'Abrir PDF de acción', async (c, u) => {
      const d = await documento(c, u, id);
      if (!permisos(u, d).recorrido) throw new HttpError(403, 'PDF no autorizado');
      const a = (
        await c.query(
          'SELECT pdf_clave,pdf_tamano,revision FROM acciones_documento WHERE id=$1 AND documento_id=$2',
          [accionId, id],
        )
      ).rows[0];
      if (!a?.pdf_clave) throw new HttpError(404, 'Sin PDF adjunto');
      return a;
    });
    const bytes = await almacen().leer(p.pdf_clave, p.pdf_tamano);
    return operacion(actor, 'Confirmar lectura PDF de acción', async (c, u) => {
      const d = await documento(c, u, id);
      if (!permisos(u, d).recorrido) throw new HttpError(403, 'PDF no autorizado');
      if (
        !(
          await c.query('SELECT 1 FROM acciones_documento WHERE id=$1 AND documento_id=$2 AND revision=$3', [
            accionId,
            id,
            p.revision,
          ])
        ).rowCount
      )
        throw new HttpError(409, 'El PDF cambió');
      return { contenido: Buffer.from(bytes).toString('base64') };
    });
  }
  return { consultar, iniciar, guardar, abrir };
}
export const atencionActual = atencionDocumental();
