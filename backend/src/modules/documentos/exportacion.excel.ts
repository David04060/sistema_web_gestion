import ExcelJS from 'exceljs';
import { z } from 'zod';
import { mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate as ceder } from 'node:timers/promises';
import { pool } from '../../config/database.js';
import { actorActual } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { leerRegistrosExcel, type RegistroExcel } from './exportacion.repository.js';

export const periodoExportacion = z
  .object({
    anio: z
      .string()
      .regex(/^\d{4}$/, 'Selecciona un año de cuatro cifras')
      .refine((v) => Number(v) >= 1900 && Number(v) <= 9999, 'El año debe estar entre 1900 y 9999')
      .transform(Number),
    mes: z
      .string()
      .regex(/^(0?[1-9]|1[0-2])$/, 'Selecciona un mes entre enero y diciembre')
      .transform(Number),
  })
  .strict();
type Columna = { header: string; key: keyof RegistroExcel; width: number; fecha?: boolean };
const columnas: Columna[] = [
  { header: 'Código', key: 'codigo', width: 24 },
  { header: 'Tipo documental', key: 'tipo', width: 30 },
  { header: 'Asunto', key: 'asunto', width: 60 },
  { header: 'Clasificación', key: 'clasificacion', width: 18 },
  { header: 'Remitente', key: 'remitente', width: 30 },
  { header: 'Observaciones', key: 'observaciones', width: 50 },
  { header: 'Registrado por', key: 'registrador', width: 30 },
  { header: 'Situación actual', key: 'situacion', width: 25 },
  { header: 'Fecha de registro (hora de Perú)', key: 'registro', width: 27, fecha: true },
  { header: 'Última actualización (hora de Perú)', key: 'actualizacion', width: 27, fecha: true },
  { header: 'Oficina del registrador (actual)', key: 'oficina', width: 30 },
  { header: 'Oficina de ubicación (registrada)', key: 'ubicacion_oficina', width: 30 },
  { header: 'Ubicación física vigente', key: 'ubicacion', width: 45 },
  {
    header: 'Ubicación registrada el (hora de Perú)',
    key: 'ubicacion_fecha',
    width: 27,
    fecha: true,
  },
  { header: 'Delegado a (nombre registrado)', key: 'delegado', width: 30 },
  { header: 'Oficina indicada en delegación', key: 'delegacion_oficina', width: 30 },
  { header: 'Delegación indicada por', key: 'delegado_por', width: 30 },
  { header: 'Fecha de delegación (hora de Perú)', key: 'delegacion_fecha', width: 27, fecha: true },
  { header: 'Observaciones de delegación', key: 'delegacion_observaciones', width: 45 },
  { header: 'PDF: nombre', key: 'pdf_nombre', width: 35 },
  { header: 'PDF: tamaño (bytes)', key: 'pdf_bytes', width: 20 },
  { header: 'PDF: tipo de archivo', key: 'pdf_mime', width: 25 },
  { header: 'PDF: actualizado el (hora de Perú)', key: 'pdf_fecha', width: 27, fecha: true },
];
import { etiquetasSituacion } from '../../shared/documental/presentacion.js';
const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
/** Excel no almacena zona: serial de fecha real con la hora institucional explícita en el encabezado. */
function fechaExcel(valor: Date): Date {
  const p = Object.fromEntries(formatoFecha.formatToParts(valor).map((v) => [v.type, v.value]));
  return new Date(
    `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(valor.getUTCMilliseconds()).padStart(3, '0')}Z`,
  );
}
/** Divide campos completos sin cortar pares sustitutos Unicode ni perder nombres históricos. */
function partesOpcionales(r: RegistroExcel): string[] {
  let texto = r.opcionales.map((v) => `${v.nombre}: ${v.valor}`).join('\n');
  const partes: string[] = [];
  while (texto.length) {
    let fin = Math.min(30000, texto.length);
    if (fin < texto.length && /[\uD800-\uDBFF]/.test(texto[fin - 1]!)) fin--;
    partes.push(texto.slice(0, fin));
    texto = texto.slice(fin);
  }
  return partes;
}

/** Texto explícito (nunca objetos formula/hyperlink), ZIP por flujo y filas liberadas al confirmar. */
export async function escribirExcel(
  ruta: string,
  registros: RegistroExcel[],
  actualizado: Date,
): Promise<void> {
  const partes = registros.map(partesOpcionales),
    cantidad = Math.max(1, ...partes.map((p) => p.length));
  for (const registro of registros)
    for (const columna of columnas) {
      const valor = registro[columna.key];
      if (typeof valor === 'string' && valor.length > 32767)
        throw new HttpError(
          422,
          'Un campo documental supera los 32 767 caracteres que permite Excel por celda. No se genera un archivo parcial.',
        );
    }
  const salida = createWriteStream(ruta, { mode: 0o600 });
  const fallo = new Promise<never>((_, rechazar) => salida.once('error', rechazar));
  void fallo.catch(() => {});
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: salida,
    useSharedStrings: false,
    useStyles: true,
  });
  try {
    libro.creator = 'I.E. Enrique Paillardelle';
    libro.created = actualizado;
    const hoja = libro.addWorksheet('Documentos', { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.columns = [
      ...columnas.map((c) => ({ header: c.header, key: c.key, width: c.width })),
      ...Array.from({ length: cantidad }, (_, i) => ({
        header:
          cantidad === 1
            ? 'Campos opcionales (nombre histórico: valor)'
            : `Campos opcionales (${i + 1}/${cantidad}; continuación)`,
        key: 'opcional_' + i,
        width: 60,
      })),
    ];
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, registros.length + 1), column: hoja.columns.length },
    };
    const cabecera = hoja.getRow(1);
    cabecera.height = 42;
    cabecera.eachCell((c) => {
      c.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075A91' } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    cabecera.commit();
    for (let i = 0; i < registros.length; i++) {
      const r = registros[i]!;
      const valores: ExcelJS.CellValue[] = columnas.map((col) => valorCelda(col, r));
      valores.push(...Array.from({ length: cantidad }, (_, j) => partes[i]?.[j] ?? null));
      const fila = hoja.addRow(valores);
      fila.alignment = { vertical: 'top', wrapText: true };
      fila.font = { name: 'Calibri', size: 11 };
      columnas.forEach((c, j) => {
        if (c.fecha) fila.getCell(j + 1).numFmt = 'dd/mm/yyyy hh:mm:ss';
      });
      fila.commit();
      if (i % 200 === 199) await ceder();
    }
    hoja.commit();
    await Promise.race([libro.commit(), fallo]);
  } catch (error) {
    salida.destroy();
    await finished(salida).catch(() => {});
    throw error;
  }
}
/** Solo retira un directorio hijo directo del temporal del sistema con el prefijo propio de Excel. */
async function limpiarTemporal(carpeta: string) {
  const raiz = resolve(tmpdir()),
    destino = resolve(carpeta);
  if (dirname(destino) !== raiz || !basename(destino).startsWith('paillardelle-excel-'))
    throw new Error('Directorio temporal de Excel inválido');
  await rm(destino, { recursive: true, force: true });
}
let activas = 0;
const actores = new Set<string>();
/** Limita la generación por proceso y actor; cualquier fallo o cancelación retira el archivo temporal. */
export async function prepararExportacion(
  actorId: string,
  periodo: z.infer<typeof periodoExportacion>,
  signal?: AbortSignal,
) {
  if (activas >= 2 || actores.has(actorId))
    throw new HttpError(
      429,
      'Hay una exportación en curso. Espera a que termine e inténtalo de nuevo.',
    );
  activas++;
  actores.add(actorId);
  let carpeta: string | undefined;
  try {
    signal?.throwIfAborted();
    const { registros, actualizado } = await leerInstantaneaExcel(actorId, periodo);
    signal?.throwIfAborted();
    carpeta = await mkdtemp(join(tmpdir(), 'paillardelle-excel-'));
    const nombre = `documentos-${periodo.anio}-${String(periodo.mes).padStart(2, '0')}.xlsx`,
      ruta = join(carpeta, nombre);
    await escribirExcel(ruta, registros, actualizado);
    signal?.throwIfAborted();
    const temporal = carpeta;
    return {
      ruta,
      nombre,
      total: registros.length,
      actualizado: actualizado.toISOString(),
      limpiar: () => limpiarTemporal(temporal),
    };
  } catch (e) {
    if (carpeta) await limpiarTemporal(carpeta);
    throw e;
  } finally {
    activas--;
    actores.delete(actorId);
  }
}

/** Emite texto literal, fecha institucional o número; nunca objetos de fórmula o hipervínculo. */
function valorCelda(col: Columna, r: RegistroExcel): ExcelJS.CellValue {
  const v = r[col.key];
  if (v === null || v === undefined) return col.key === 'clasificacion' ? 'Sin clasificar' : null;
  if (col.fecha) return fechaExcel(v as Date);
  if (col.key === 'pdf_bytes') return Number(v);
  const texto =
    col.key === 'situacion'
      ? (etiquetasSituacion[String(v)] ?? String(v))
      : col.key === 'clasificacion'
        ? v === 'RECIBIDO'
          ? 'Recibido'
          : v === 'EMITIDO'
            ? 'Emitido'
            : 'Sin clasificar'
        : String(v);
  return texto;
}

/** Lee filas y fecha en una instantánea autorizada; libera PostgreSQL antes de escribir el ZIP. */
async function leerInstantaneaExcel(actorId: string, periodo: z.infer<typeof periodoExportacion>) {
  const c = await pool.connect();
  let registros: RegistroExcel[], actualizado: Date;
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='30s'");
    const actor = await actorActual(c, actorId);
    registros = await leerRegistrosExcel(c, actor, periodo.anio, periodo.mes);
    actualizado = (await c.query('SELECT transaction_timestamp() fecha')).rows[0].fecha;
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  return { registros, actualizado };
}
