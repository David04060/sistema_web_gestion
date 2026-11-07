import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, etiquetas, situacion } from '../../../api/documental';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { TextoExpandible } from '../../../components/ui/TextoExpandible';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
import { ExportarDocumentos } from '../components/ExportarDocumentos';
/** La URL conserva los filtros al navegar y volver; los resultados siempre proceden del alcance del servidor. */
export function DocumentosListaPage() {
  const { token, usuario } = useAuth().sesion!,
    [url, setParams] = useSearchParams();
  const situaciones = situacion.options.filter((s) =>
    usuario.rol === 'Usuario' ? s === 'PERSONAL' || s === 'DELEGADO'
      : s !== 'ANULADO' || usuario.rol === 'Superadministrador',
  );
  const situacionUrl = url.get('situacion');
  const incompatible = situacionUrl !== null && !situaciones.some((s) => s === situacionUrl);
  const params = new URLSearchParams(url);
  if (incompatible) {
    params.delete('situacion');
    params.delete('pagina');
  }
  const consultaUrl = params.toString();
  useEffect(() => {
    if (incompatible) setParams(consultaUrl, { replace: true });
  }, [incompatible, consultaUrl, setParams]);
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '');
  const [fecha, setFecha] = useState(params.get('fecha') ?? ''),
    [precision, setPrecision] = useState(
      params.get('fecha')?.length === 4
        ? 'anio'
        : params.get('fecha')?.length === 7
          ? 'mes'
          : 'dia',
    );
  const busquedaUrl = params.get('q') ?? '',
    fechaUrl = params.get('fecha') ?? '';
  useEffect(() => {
    setBusqueda(busquedaUrl);
    setFecha(fechaUrl);
    if (fechaUrl)
      setPrecision(fechaUrl.length === 4 ? 'anio' : fechaUrl.length === 7 ? 'mes' : 'dia');
  }, [busquedaUrl, fechaUrl]);
  const criterios = [
    params.get('con_relacionados') === 'true' ? 'Con documentos relacionados' : null,
    params.get('q') ? 'Código o asunto: ' + params.get('q') : null,
    params.get('situacion') ? 'Situación: ' + etiquetas[params.get('situacion')!] : null,
    params.get('clasificacion')
      ? 'Clasificación: ' + (params.get('clasificacion') === 'RECIBIDO' ? 'Recibido' : 'Emitido')
      : null,
    params.get('fecha') ? 'Registro: ' + params.get('fecha') + ' (hora de Perú)' : null,
  ].filter(Boolean);
  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(params);
    for (const [k, v] of [
      ['q', busqueda.trim()],
      ['fecha', precision === 'anio' && fecha ? String(Number(fecha)).padStart(4, '0') : fecha],
    ]) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('pagina');
    setParams(p);
  }
  function limpiar() {
    setBusqueda('');
    setFecha('');
    setParams({});
  }
  const consulta = useConsulta(
    useCallback(() => api.lista(token, consultaUrl), [token, consultaUrl]),
  );
  const mensajeRuta = (useLocation().state as { mensaje?: unknown } | null)?.mensaje;
  const registrar = ['Usuario', 'Director(a)', 'Secretaria de Dirección'].includes(usuario.rol);
  function filtro(nombre: string, valor: string) {
    const p = new URLSearchParams(params);
    if (valor) p.set(nombre, valor);
    else p.delete(nombre);
    p.delete('pagina');
    setParams(p);
  }
  const pagina = consulta.datos?.pagina ?? 1;
  return (
    <main className={`${styles.pagina} ${styles.paginaAmplia}`}>
      <h1>Documentos</h1>
      {typeof mensajeRuta === 'string' && (
        <p className={styles.exito} role="status">
          {mensajeRuta}
        </p>
      )}
      <div className={styles.acciones}>
        {registrar && (
          <Link className={styles.boton} to="/documentos/nuevo">
            Registrar documento
          </Link>
        )}
        {['Usuario', 'Director(a)', 'Secretaria de Dirección', 'Superadministrador'].includes(
          usuario.rol,
        ) && <ExportarDocumentos key={token} token={token} rol={usuario.rol} conRelacionados={params.get('con_relacionados') === 'true'} />}
      </div>
      <section className={styles.tarjeta}>
        <form onSubmit={buscar} className={styles.filtrosDocumentos}>
          <label className={styles.campo}><input type="checkbox" checked={params.get('con_relacionados')==='true'} onChange={e=>filtro('con_relacionados',e.target.checked?'true':'')}/>Con documentos relacionados</label>
          <label className={styles.campo}>
            Buscar por código o asunto
            <input
              placeholder="Ej.: INF2026001 o informe de gestión"
              value={busqueda}
              maxLength={250}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
          <label className={styles.campo}>
            Situación
            <select
              value={params.get('situacion') ?? ''}
              onChange={(e) => filtro('situacion', e.target.value)}
            >
              <option value="">{usuario.rol === 'Usuario' ? 'Todos mis documentos' : 'Documentos ordinarios'}</option>
              {situaciones
                .map((s) => (
                  <option key={s} value={s}>
                    {etiquetas[s]}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.campo}>
            Clasificación
            <select
              value={params.get('clasificacion') ?? ''}
              onChange={(e) => filtro('clasificacion', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="RECIBIDO">Recibido</option>
              <option value="EMITIDO">Emitido</option>
            </select>
          </label>
          <fieldset className={styles.filtroFecha}>
            <legend>Fecha de registro</legend>
            <div className={styles.formularioDosColumnas}>
              <label className={styles.campo}>
                Buscar por
                <select
                  value={precision}
                  onChange={(e) => {
                    setPrecision(e.target.value);
                    setFecha('');
                  }}
                >
                  <option value="dia">Día concreto</option>
                  <option value="mes">Mes y año</option>
                  <option value="anio">Año completo</option>
                </select>
              </label>
              <label className={styles.campo}>
                {precision === 'dia' ? 'Día' : precision === 'mes' ? 'Mes y año' : 'Año'}
                <input
                  aria-label="Periodo de registro"
                  type={precision === 'dia' ? 'date' : precision === 'mes' ? 'month' : 'number'}
                  min={precision === 'dia' ? '0001-01-01' : precision === 'mes' ? '0001-01' : '1'}
                  max={
                    precision === 'dia' ? '9999-12-31' : precision === 'mes' ? '9999-12' : '9999'
                  }
                  step={precision === 'anio' ? 1 : undefined}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>
            </div>
          </fieldset>
          <div className={styles.acciones}>
            <button className={`${styles.boton} ${styles.buscarDocumentos}`}>Buscar</button>
            <button className={styles.secundario} type="button" onClick={limpiar}>
              Limpiar filtros
            </button>
          </div>
        </form>
        {criterios.length > 0 && (
          <aside aria-label="Filtros activos" className={styles.criterios}>
            <strong>Filtros activos</strong>
            <ul>
              {criterios.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </aside>
        )}
      </section>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {consulta.datos && (
        <section className={styles.tarjeta}>
          <p>
            {consulta.datos.total} {consulta.datos.total === 1 ? 'documento' : 'documentos'}
          </p>
          <div className={`${styles.tabla} ${styles.tablaDocumentos}`}>
            <table role="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Asunto</th>
                  <th>Clasificación</th>
                  <th>Registrado por</th>
                  <th>Situación</th>
                  <th>Registro</th>
                  <th>Ubicación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {consulta.datos.documentos.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Código" className={styles.codigoDocumento}>
                      <Link to={'/documentos/' + d.id}>{d.codigo_visible}</Link>
                    </td>
                    <td data-label="Tipo" className={styles.soloEscritorioDocumento}>
                      {d.tipo_nombre_guardado}
                    </td>
                    <td data-label="Asunto" className={styles.asuntoDocumento}>
                      <TextoExpandible texto={d.asunto} />
                    </td>
                    <td data-label="Clasificación">
                      {d.clasificacion === 'RECIBIDO'
                        ? 'Recibido'
                        : d.clasificacion === 'EMITIDO'
                          ? 'Emitido'
                          : 'Sin clasificar'}
                    </td>
                    <td data-label="Registrado por">
                      {d.registrado_por_nombre}
                      {d.registrado_por_oficina && (
                        <span className={styles.oficinaRegistro}>{d.registrado_por_oficina}</span>
                      )}
                    </td>
                    <td data-label="Situación">{etiquetas[d.situacion]}</td>
                    <td data-label="Registro">{fechaLocal(d.creado_en)}</td>
                    <td
                      data-label="Ubicación"
                      className={d.ubicacion_ruta ? undefined : styles.sinUbicacionDocumento}
                    >
                      {d.ubicacion_ruta ?? 'Sin ubicación'}
                    </td>
                    <td data-label="Acciones" className={styles.accionDocumento}>
                      <Link className={styles.secundario} to={'/documentos/' + d.id}>
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!consulta.datos.total && (
            <p className={styles.vacio}>
              No hay documentos que coincidan. Prueba con otro código o limpia los filtros.
            </p>
          )}
          <div className={styles.acciones}>
            <button
              className={styles.secundario}
              disabled={pagina <= 1 || consulta.actualizando}
              onClick={() => {
                const p = new URLSearchParams(params);
                p.set('pagina', String(pagina - 1));
                setParams(p);
              }}
            >
              Anterior
            </button>
            <span>Página {pagina}</span>
            <button
              className={styles.secundario}
              disabled={
                pagina * consulta.datos.limite >= consulta.datos.total || consulta.actualizando
              }
              onClick={() => {
                const p = new URLSearchParams(params);
                p.set('pagina', String(pagina + 1));
                setParams(p);
              }}
            >
              Siguiente
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
