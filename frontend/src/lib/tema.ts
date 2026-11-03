export type Tema = 'claro' | 'oscuro';
export const claveTema = 'paillardelle-tema';

export function resolverTema(almacen: Pick<Storage, 'getItem'> | undefined, oscuro: boolean): Tema {
  try {
    const guardado = almacen?.getItem(claveTema);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    /* El modo sigue funcionando si el navegador bloquea almacenamiento. */
  }
  return oscuro ? 'oscuro' : 'claro';
}

export function guardarTema(almacen: Pick<Storage, 'setItem'> | undefined, tema: Tema) {
  try {
    almacen?.setItem(claveTema, tema);
  } catch {
    /* Preferencia solo para esta visita. */
  }
}
