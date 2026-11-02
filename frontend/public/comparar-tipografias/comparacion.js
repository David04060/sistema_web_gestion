const tema = document.querySelector('#tema');
const vista = document.querySelector('#vista');
function actualizar() {
 document.documentElement.dataset.tema = tema.value === 'oscuro' ? 'oscuro' : 'claro';
 document.querySelectorAll('.pareja').forEach(element => {element.hidden=tema.value !== 'ambos' && element.dataset.tema !== tema.value;});
 document.querySelectorAll('.marco').forEach(element => {element.hidden=vista.value !== 'ambos' && element.dataset.vista !== vista.value;});
 document.body.classList.toggle('solo-escritorio',vista.value==='escritorio');
 document.body.classList.toggle('solo-movil',vista.value==='movil');
 document.querySelector('#estado-comparacion').textContent='Vista: '+tema.selectedOptions[0].textContent+' · '+vista.selectedOptions[0].textContent+'. Las tres propuestas mantienen el mismo contenido.';
}
tema.addEventListener('change',actualizar);
vista.addEventListener('change',actualizar);
actualizar();

// Evita recortar muestras o introducir scrolls anidados al cargar cada fuente.
function ajustarMarco(marco) {
 if (!marco.getBoundingClientRect().width || !marco.contentDocument?.body) return;
 const doc = marco.contentDocument;
 Promise.resolve(doc.fonts.ready).then(() => {
  if (marco.getBoundingClientRect().width && doc.body) marco.style.height = Math.ceil(doc.body.scrollHeight + 2) + 'px';
 });
}
function ajustarTodos() { document.querySelectorAll('iframe').forEach(ajustarMarco); }
document.querySelectorAll('iframe').forEach(marco => {marco.addEventListener('load', () => ajustarMarco(marco)); ajustarMarco(marco);});
tema.addEventListener('change', () => requestAnimationFrame(ajustarTodos));
vista.addEventListener('change', () => requestAnimationFrame(ajustarTodos));
window.addEventListener('resize',ajustarTodos);
