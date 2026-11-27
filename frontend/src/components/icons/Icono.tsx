/** Archivo: Dibuja los iconos decorativos del sistema a partir de trazos SVG propios.
 */
import type { CSSProperties } from 'react';
export type IconName =
  | 'panel'
  | 'documentos'
  | 'movimientos'
  | 'tipos'
  | 'ubicaciones'
  | 'seguridad'
  | 'roles'
  | 'oficinas'
  | 'usuarios'
  | 'menu'
  | 'cerrar'
  | 'salir'
  | 'flecha';
const trazos: Record<IconName, string> = {
  panel: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  documentos: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6',
  movimientos: 'M4 7h15 M15 3l4 4-4 4 M20 17H5 M9 13l-4 4 4 4',
  tipos: 'M3 6h7l2 2h9v12H3z M3 6V4h7l2 2',
  ubicaciones: 'M4 3h16v18H4z M4 9h16 M4 15h16 M8 6h2 M8 12h2 M8 18h2',
  seguridad: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M9 12l2 2 4-4',
  roles: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M9 11h6 M12 8v6',
  oficinas: 'M4 21V7h9v14 M13 11h7v10 M2 21h20 M7 11h3 M7 15h3 M16 15h1 M16 18h1',
  usuarios:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 ' +
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  cerrar: 'M6 6l12 12 M18 6L6 18',
  salir: 'M9 4H4v16h5 M12 12h10 M18 8l4 4-4 4',
  flecha: 'M5 12h14 M14 7l5 5-5 5',
};
/** Iconografía lineal propia, decorativa y sin dependencias adicionales. */
export function Icono({
  nombre,
  tamano = 20,
  style,
}: {
  nombre: IconName;
  tamano?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d={trazos[nombre]} />
    </svg>
  );
}
