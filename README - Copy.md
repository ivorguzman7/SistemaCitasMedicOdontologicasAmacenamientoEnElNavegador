# Sistema de Gestión Odontológica — MaterialCodigo

Resumen y guía rápida para desarrolladores.

## Qué es
Una aplicación web cliente, estática y offline, para gestionar citas odontológicas: crear, listar, editar, eliminar, ver estadísticas y exportar datos a CSV.

## Archivos principales

- `index.html`:
  - Archivo HTML principal que contiene la estructura de la interfaz: formulario de creación, panel de estadísticas, lista de citas, modales (edición/confirmación) y contenedor de toasts.
  - Contiene elementos con `id` que `app.js` usa para seleccionar y manipular el DOM (ej.: `#cita-form`, `#lista-citas`, `#btn-theme-toggle`).
  - Si cambias IDs o la estructura, actualiza las referencias en `app.js`.

- `style.css`:
  - Hoja de estilos principal. Usa variables CSS (design tokens) en `:root` para colores, radios, sombras y transiciones.
  - Soporta modo oscuro mediante `[data-theme="dark"]` y emplea Grid/Flexbox para el layout responsivo.
  - Para modificar la paleta o comportamiento visual, cambia las variables en `:root` y en el bloque del tema oscuro.

- `app.js`:
  - Lógica de negocio y persistencia (Single State Tree). Mantiene `state` con todas las citas.
  - Operaciones principales: CRUD de citas, validaciones (no fines de semana, evitar double-booking), persistencia en `localStorage`, renderizado de la UI y exportación a CSV.
  - Helpers: formateo de fecha/hora, sanitización (`escaparHTML`, `escaparJS`), y módulo de toasts (`mostrarToast`).
  - Inicialización en `DOMContentLoaded` y control de tema con `localStorage`.

## Flujo de trabajo (resumido)
1. El usuario completa `#cita-form` → `app.js` valida y crea una cita en `state`.
2. `guardarCitasEnAlmacenamiento()` persiste en `localStorage`.
3. `renderizarInterfaz()` reconstruye la lista y actualiza estadísticas.
4. Acciones como editar/eliminar usan modales manejados por clases CSS (`.show`).

## Cómo ejecutar localmente
1. Abrir `index.html` en el navegador (doble clic o `File -> Open`).
2. No requiere servidor; todas las operaciones son locales y usan `localStorage`.

## Buenas prácticas y notas de mantenimiento
- Mantén lógica y presentación separadas: evita escribir estilos inline desde `app.js`.
- Usa `escaparHTML()` siempre que inyectes texto de usuario en el DOM.
- Para cambiar el tema visual, modifica `:root` en `style.css` y prueba el toggle de tema en la UI.
- Si añades nuevos elementos referenciados por `id`, registra la referencia al inicio de `app.js`.

## Contacto del autor
Autor: Ívor Guzmán | Estudiante del PNF de Informática Trallecto I
Universidad Politécnica Territorial Agroindustrial del Estado Táchira (UPTAIET) Sede Central, Estado Tachira, Venezuela
