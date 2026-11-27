/** Archivo: Conecta con el almacenamiento privado R2, verifica archivos y crea enlaces de duración limitada.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument } from 'pdf-lib';
import { HttpError } from '../../shared/http/HttpError.js';
import { MAX_PDF } from './pdf.schema.js';

/** Contrato sustituible en QA. Ningún método usa almacenamiento persistente local. */
export interface AlmacenPdf {
  subir(clave: string, tamano: number): Promise<string>;
  validarYCopiar(origen: string, destino: string, tamano: number): Promise<void>;
  abrir(clave: string, nombre: string, descargar: boolean): Promise<string>;
  leer(clave: string, tamano: number): Promise<Uint8Array>;
  eliminar(clave: string): Promise<void>;
}
/** El prefijo queda persistido en cada clave; cambiar el entorno no redirige archivos existentes. */
export function prefijoPdf(): string {
  const prefijo = process.env.R2_PDF_PREFIX ?? '';
  if (prefijo && !/^(?:[a-z0-9][a-z0-9-]{0,62}\/){1,4}$/.test(prefijo))
    throw new HttpError(503, 'Prefijo PDF no configurado correctamente');
  return prefijo;
}
/** Comprueba cabecera y parseo completo acotado; rechaza cifrados y documentos sin páginas. */
export async function validarPdf(bytes: Uint8Array, tamano: number) {
  if (
    bytes.length !== tamano ||
    bytes.length > MAX_PDF ||
    !Buffer.from(bytes.subarray(0, 8))
      .toString('ascii')
      .match(/^%PDF-[12]\.[0-9]/)
  )
    throw new HttpError(400, 'Archivo PDF inválido o tamaño incompatible');
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    if (!pdf.getPageCount() || !Buffer.from(bytes.subarray(-2048)).toString('latin1').includes('%%EOF'))
      throw new Error();
  } catch {
    throw new HttpError(400, 'El archivo no es un PDF válido sin cifrado');
  }
}
/** Configuración privada y diferida: un despliegue sin R2 conserva el registro sin PDF. */
export function crearAlmacenR2(): AlmacenPdf {
  const {
    R2_PDF_ACCOUNT_ID: account,
    R2_PDF_BUCKET: bucket,
    R2_PDF_ACCESS_KEY_ID: accessKeyId,
    R2_PDF_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env;
  if (
    !account ||
    !/^[a-f0-9]{32}$/.test(account) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey ||
    bucket === process.env.R2_BUCKET
  )
    throw new HttpError(503, 'Almacenamiento PDF no configurado');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return crearAlmacenS3(s3, bucket);
}
/** Adaptador S3 aislable: permite probar comandos reales sin efectuar solicitudes de red. */
export function crearAlmacenS3(s3: S3Client, bucket: string): AlmacenPdf {
  return {
    async subir(clave, tamano) {
      return getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: clave,
          ContentType: 'application/pdf',
          ContentLength: tamano,
          IfNoneMatch: '*',
        }),
        { expiresIn: 300, signableHeaders: new Set(['content-type', 'if-none-match']) },
      );
    },
    async validarYCopiar(origen, destino, tamano) {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: origen }), {
        abortSignal: AbortSignal.timeout(20_000),
      });
      if (
        head.ContentLength !== tamano ||
        tamano > MAX_PDF ||
        head.ContentType !== 'application/pdf' ||
        !head.ETag
      )
        throw new HttpError(400, 'Tamaño o tipo PDF incompatible');
      const objeto = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: origen, IfMatch: head.ETag }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (!objeto.Body) throw new HttpError(400, 'PDF vacío');
      for await (const chunk of objeto.Body as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > MAX_PDF || total > tamano) throw new HttpError(400, 'PDF demasiado grande');
        chunks.push(chunk);
      }
      await validarPdf(Buffer.concat(chunks), tamano);
      // La clave final nunca recibe una URL PUT. La condición evita validar un objeto y copiar otro.
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: destino,
          CopySource: `${bucket}/${origen}`,
          CopySourceIfMatch: head.ETag,
          ContentType: 'application/pdf',
          CacheControl: 'no-store',
          MetadataDirective: 'REPLACE',
        }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
    },
    async abrir(clave, nombre, descargar) {
      const nombreSeguro = encodeURIComponent(nombre).replace(
        /['()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: clave,
          ResponseContentType: 'application/pdf',
          ResponseCacheControl: 'no-store',
          ResponseContentDisposition:
            `${descargar ? 'attachment' : 'inline'}; filename="documento.pdf"; ` +
            `filename*=UTF-8''${nombreSeguro}`,
        }),
        { expiresIn: 60 },
      );
    },
    async leer(clave, tamano) {
      const respuesta = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: clave }), {
        abortSignal: AbortSignal.timeout(20_000),
      });
      if (!respuesta.Body || respuesta.ContentLength !== tamano || tamano < 1 || tamano > MAX_PDF) {
        if (respuesta.Body && 'destroy' in respuesta.Body) respuesta.Body.destroy();
        throw new HttpError(502, 'El PDF almacenado tiene un tamaño inválido');
      }
      const bytes = await respuesta.Body.transformToByteArray();
      if (bytes.length !== tamano) throw new HttpError(502, 'El PDF almacenado está incompleto');
      return bytes;
    },
    async eliminar(clave) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }), {
        abortSignal: AbortSignal.timeout(20_000),
      });
      // R2 es consistente: un DELETE aceptado no basta si HEAD aún encuentra el objeto.
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }), {
          abortSignal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return;
        throw error;
      }
      throw new HttpError(503, 'La ausencia del PDF no se pudo confirmar');
    },
  };
}
