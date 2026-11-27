/**
 * Archivo: Aplica la apariencia guardada antes de mostrar la página para evitar un cambio de color
 * al arrancar.
 */
/* Antes del primer pintado, sin red externa y sin afectar a la sesión. */
(() => {
  let tema;
  try {
    tema = localStorage.getItem('paillardelle-tema');
  } catch {
    /* Almacenamiento bloqueado. */
  }
  if (tema !== 'claro' && tema !== 'oscuro')
    tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  document.documentElement.dataset.tema = tema;
})();
