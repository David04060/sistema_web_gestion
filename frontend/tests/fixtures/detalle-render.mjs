// Presenta componentes reales con datos de prueba en memoria, sin servidor ni navegador.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocumentoDetallePage } from '../../src/features/documentos/pages/DocumentoDetallePage.tsx';
import { DocumentosListaPage } from '../../src/features/documentos/pages/DocumentosListaPage.tsx';
import { UsuarioFormularioPage } from '../../src/features/usuarios/pages/UsuarioFormularioPage.tsx';
import { UsuarioDetallePage } from '../../src/features/usuarios/pages/UsuarioDetallePage.tsx';
import { UsuariosListaPage } from '../../src/features/usuarios/pages/UsuariosListaPage.tsx';
import { UbicacionesPage } from '../../src/features/ubicaciones/pages/UbicacionesPage.tsx';
import { OficinasActualesPage } from '../../src/features/usuarios/pages/OficinasListaPage.tsx';
import { OficinaDetallePage } from '../../src/features/usuarios/pages/OficinaDetallePage.tsx';
import { OficinaFormularioPage } from '../../src/features/usuarios/pages/OficinaFormularioPage.tsx';
import { DocumentoFormularioPage } from '../../src/features/documentos/pages/DocumentoFormularioPage.tsx';
import { PrevisualizacionRegistroPdf } from '../../src/features/documentos/components/PrevisualizacionRegistroPdf.tsx';
import { AccionesDocumento } from '../../src/features/documentos/components/AccionesDocumento.tsx';
import { GrupoDocumental } from '../../src/features/documentos/components/GrupoDocumental.tsx';
import { Formulario as FormularioCuenta } from '../../src/features/usuarios/pages/UsuarioFormularioPage.tsx';
import { elegir } from 'virtual:estado';
/** Detecta claves repetidas entre elementos hermanos antes de convertir la pantalla a HTML. */
function inspeccionar(elemento) {
  if (!React.isValidElement(elemento)) return;
  const hijos = [elemento.props.children].flat(Infinity).filter(React.isValidElement);
  const claves = hijos.filter((h) => h.key !== null).map((h) => h.key);
  if (new Set(claves).size !== claves.length) throw Error('Claves hermanas duplicadas: ' + claves.join(','));
  hijos.forEach(inspeccionar);
}
function Detalle() {
  const arbol = DocumentoDetallePage();
  inspeccionar(arbol);
  return arbol;
}
/** Elige una pantalla y un perfil simulados y devuelve su HTML para las comprobaciones. */
export function renderizar(pantalla, cuentaCampo = '', mensaje = '', delegado = false) {
  elegir(pantalla, delegado);
  const componentes = {
    detalle: Detalle,
    listado: DocumentosListaPage,
    docRegistro: DocumentoFormularioPage,
    usuarioForm: UsuarioFormularioPage,
    usuarioDetalle: UsuarioDetallePage,
    usuarios: UsuariosListaPage,
    ubicaciones: UbicacionesPage,
    oficinas: OficinasActualesPage,
    oficinaDetalle: OficinaDetallePage,
    oficinaForm: OficinaFormularioPage,
  };
  const path = pantalla.startsWith('oficina')
    ? '/oficinas/:id'
    : pantalla.startsWith('usuario')
      ? '/usuarios/:id'
      : pantalla === 'docRegistro'
        ? '/documentos/nuevo'
        : '/documentos/:id';
  const url = pantalla.startsWith('oficina')
    ? '/oficinas/9'
    : pantalla.startsWith('usuario')
      ? '/usuarios/3'
      : pantalla === 'docRegistro'
        ? '/documentos/nuevo'
        : '/documentos/4';
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      {
        initialEntries: [
          mensaje
            ? { pathname: url, state: { mensaje } }
            : url + (pantalla === 'listado' && cuentaCampo ? '?' + cuentaCampo : ''),
        ],
      },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path, element: React.createElement(componentes[pantalla]) }),
      ),
    ),
  );
}
export function grupo(grupo) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(GrupoDocumental, { documento: { id: '4', grupo, relacionados: [] } }),
    ),
  );
}
export function usuarioSinAsignar(rol) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(FormularioCuenta, {
        token: 'sintetico',
        inicial: { rol_id: rol, oficina_id: null },
        roles: [
          { id: 3, nombre: 'Dirección' },
          { id: 4, nombre: 'Secretaría' },
        ],
        oficinas: [
          { id: '1', nombre: 'Dirección', activa: true },
          { id: '2', nombre: 'Mesa de Partes', activa: true },
        ],
      }),
    ),
  );
}
export function acciones(ubicacion, permitir) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AccionesDocumento, {
        token: 'sintetico',
        documento: {
          id: '4',
          revision: '1',
          ubicacion,
          permisos: { delegar: false, ubicar: permitir, anular: false },
        },
        actualizar: () => {},
      }),
    ),
  );
}
export function previsualizar() {
  return renderToStaticMarkup(
    React.createElement(PrevisualizacionRegistroPdf, {
      archivo: { name: 'archivo seleccionado.pdf', size: 1048576 },
      bytes: new Uint8Array(),
      ocupado: false,
      quitar: () => {},
    }),
  );
}
