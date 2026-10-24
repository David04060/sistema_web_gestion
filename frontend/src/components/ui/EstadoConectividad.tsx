import { useSyncExternalStore } from 'react';
import { estadoConectividad, suscribirConectividad } from '../../api/conectividad';
/** No identifica la causa con certeza: Render puede estar despertando o existir demora de red. */
export function EstadoConectividad() {
    const lenta = useSyncExternalStore(suscribirConectividad, estadoConectividad, () => false);
    return lenta ? <p role="status" aria-live="polite">El servicio está tardando en responder; puede estar iniciándose. Espera un momento.</p> : null;
}
