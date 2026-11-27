# Mapa principal del proyecto

[README principal](README.md) · [Recorrido detallado del código](documentacion-publica/ESTRUCTURA.md)

```text
Sistema_Web_Final/
  backend/                 API Express, permisos, validaciones y herramientas locales.
    src/                   Configuración, middlewares, módulos y reglas compartidas.
    tests/                 Pruebas; consultar sus requisitos antes de ejecutarlas.
    scripts/               Herramientas de mantenimiento y ejecución de pruebas.
  frontend/                Aplicación React y configuración Vite.
    src/                   Pantallas, componentes, contratos HTTP y sesión.
    public/                Recursos estáticos y fuentes.
    tests/                 Verificación de contratos, componentes y sesión.
  database/                Instalación SQL y documentación de PostgreSQL.
    instalacion/           Funciones, tablas y restricciones del instalador dividido.
    schema/                Referencia por tema; no es un instalador.
    changes/               Cambios versionados para bases existentes.
  documentacion-publica/   Guías públicas de funcionamiento, estructura y despliegue.
  docs/                    Material interno, informes y evidencias; no publicar.
  design-system/           Referencias internas de diseño.
  .github/                 Configuración del repositorio en GitHub.
```

- [Backend: estructura, entrada HTTP y responsabilidades](backend/README.md#estructura-y-solicitud-http).
- [Archivos importantes del backend y recorrido completo](documentacion-publica/ESTRUCTURA.md#backend).
- [Frontend: instalación, componentes y comprobaciones](frontend/README.md).
- [Base de datos: instalación y organización SQL](database/README.md).
- [Registro, delegación y reglas de consulta y acciones](documentacion-publica/FUNCIONAMIENTO.md).

Las carpetas ocultas de configuración privada o herramientas locales no forman parte del funcionamiento desplegado. Este mapa no incluye credenciales ni evidencias internas.
