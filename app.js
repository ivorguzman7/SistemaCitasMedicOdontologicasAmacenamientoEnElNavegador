/**
 * ==========================================================================
 * SISTEMA DE GESTIÓN ODONTOLÓGICA - LÓGICA DE NEGOCIO Y PERSISTENCIA (app.js)
 * Diseñado para: Consultorio Odontológico Alicia J. Colmenares S.
 * Autor: PNF en Informática (Ivor Guzmán)
 * 
 * ARQUITECTURA DEL SISTEMA:
 * Este script sigue una arquitectura basada en Estado Unificado (State-driven UI).
 * Toda la información reside en un objeto de estado central ('state'). Cualquier
 * modificación sobre el estado (creación, edición, eliminación de citas) se persiste
 * inmediatamente en el almacenamiento local del navegador ('localStorage') y gatilla
 * un renderizado completo de la interfaz de usuario ('UI'). Esto garantiza la
 * consistencia y sincronía de los datos mostrados en pantalla sin necesidad de
 * recargar la página.
 * 
 * PATRONES DE DISEÑO UTILIZADOS:
 * 1. Single State Tree (Árbol de Estado Único): Mantiene los datos centralizados.
 * 2. Observer-like Update Pattern: La UI reacciona y se repinta ante cambios en el estado.
 * 3. Module/Factory Pattern implícito: Estructuración de funciones autocontenidas.
 * 
 * APIS DE NAVEGADOR (Browser APIs) EXPLICADAS:
 * 1. Web Storage API (localStorage): Permite almacenar pares clave-valor en el navegador.
 *    Los datos persisten tras cerrar la pestaña o apagar el computador (offline capability).
 * 2. DOM API (Document Object Model): Permite seleccionar, crear, modificar e inyectar
 *    nodos de HTML reactivamente en respuesta a eventos del usuario.
 * 3. Blob API (Binary Large Object) y URL API: Permiten construir un archivo binario/texto
 *    ficticio (en este caso, un reporte CSV) en la memoria RAM y generar una dirección URL
 *    temporal para forzar su descarga local sin pasar por un servidor.
 * ==========================================================================
 */
/* --------------------------------------------------------------------------
   DOCUMENTACIÓN DE ESTUDIO Y ANÁLISIS (Resumen para desarrolladores)

   Qué es:
     - Lógica de negocio y persistencia para la gestión de citas del sistema.

   Qué hace (funcionalidad principal):
     - Mantiene un único objeto `state` con todas las citas y parámetros de UI.
     - Implementa CRUD completo (crear, leer, actualizar, eliminar) de citas.
     - Persiste datos en `localStorage` y ofrece exportación a CSV.
     - Provee validaciones (no fines de semana, evitar double-booking).
     - Controla tema claro/oscuro y notificaciones (toasts).

   Cómo lo hace (arquitectura y técnicas):
     - Single State Tree: `const state = { ... }` actúa como fuente de verdad.
     - Render pipeline central: `renderizarInterfaz()` filtra, ordena y renderiza.
     - Persistencia via Web Storage: `cargarCitasDesdeAlmacenamiento()` y
       `guardarCitasEnAlmacenamiento()` usan JSON en `localStorage`.
     - Manipulación DOM: referencias a elementos y generación dinámica de tarjetas
       con `innerHTML` y `createElement` para interactividad.
     - Modales y confirmaciones: muestran/ocultan usando clases CSS (`.show`).
     - Seguridad: sanitización con `escaparHTML()` y `escaparJS()` para evitar XSS.

   Por qué (beneficios):
     - Simplicidad y previsibilidad: un único árbol de estado facilita depuración.
     - Operación offline: `localStorage` permite uso sin servidor.
     - UX consistente: validaciones y toasts dan feedback inmediato al usuario.
     - Mantenibilidad: helpers separados (formateo, sanitización, toasts).

   Nota rápida de mantenimiento:
     - Para cambiar colores/tema, editar las variables en el CSS (`style.css`).
     - Al extender funcionalidades, mantén la separación: helpers <-> persistencia <-> render.
--------------------------------------------------------------------------- */

// --------------------------------------------------------------------------
// I. DECLARACIÓN DE VARIABLES GLOBALES Y ELEMENTOS DEL DOM (State & DOM Elements)
// --------------------------------------------------------------------------

/**
 * Estado unificado de la aplicación.
 * @type {Object}
 */
const state = {
  // Lista de citas médicas cargadas. Cada cita contiene {id, paciente, servicio, fecha, hora}
  citas: [],
  // Texto ingresado por el usuario en el buscador para filtrar pacientes
  filtroBusqueda: '',
  // Identificador de la cita que se está eliminando temporalmente (para el modal de confirmación)
  idCitaParaEliminar: null,
  // Tipo de limpieza: 'citas' para vaciar todas las citas, 'cita' para vaciar una sola
  tipoDeLimpieza: 'cita'
};

// Referencias a los elementos del Formulario de Creación (CREATE)
const formularioCita = document.getElementById('cita-form');
const inputPaciente = document.getElementById('paciente');
const inputServicio = document.getElementById('servicio');
const inputFecha = document.getElementById('fecha');
const inputHora = document.getElementById('hora');
const alertaFechaFinSemana = document.getElementById('fecha-warning');

// Referencias a las estadísticas del panel (DASHBOARD STATS)
const statTotalValor = document.getElementById('stat-total-val');
const statHoyValor = document.getElementById('stat-hoy-val');
const statProximaValor = document.getElementById('stat-proxima-val');
const statPopularValor = document.getElementById('stat-popular-val');

// Referencias a la Búsqueda y Mantenimiento de Citas (READ, DELETE, EXPORT)
const inputBuscador = document.getElementById('buscador');
const botonExportar = document.getElementById('exportar-btn');
const botonLimpiarTodo = document.getElementById('btn-limpiar-todo');
const contenedorListaCitas = document.getElementById('lista-citas');

// Referencias al Modal Flotante de Edición (UPDATE)
const modalEdicionOverlay = document.getElementById('edit-modal');
const formularioEdicion = document.getElementById('edit-form');
const inputEditId = document.getElementById('edit-id');
const inputEditPaciente = document.getElementById('edit-paciente');
const inputEditServicio = document.getElementById('edit-servicio');
const inputEditFecha = document.getElementById('edit-fecha');
const inputEditHora = document.getElementById('edit-hora');
const alertaEditFechaFinSemana = document.getElementById('edit-fecha-warning');
const botonCerrarModal = document.getElementById('btn-close-modal');
const botonCancelarModal = document.getElementById('btn-cancel-modal');

// Referencias al Diálogo de Confirmación Personalizado (DELETE CONFIRM)
const modalConfirmacionOverlay = document.getElementById('confirm-modal');
const tituloConfirmacion = document.getElementById('confirm-title');
const descripcionConfirmacion = document.getElementById('confirm-description');
const botonAceptarConfirmacion = document.getElementById('btn-confirm-accept');
const botonCancelarConfirmacion = document.getElementById('btn-confirm-cancel');

// Referencia al contenedor de notificaciones toast flotantes
const contenedorToasts = document.getElementById('toast-container');

// Control de Tema (Tema Claro/Oscuro)
const botonAlternarTema = document.getElementById('btn-theme-toggle');


// --------------------------------------------------------------------------
// II. INICIALIZACIÓN DE LA APLICACIÓN (App Bootstrapping)
// --------------------------------------------------------------------------

/**
 * Escucha el evento DOMContentLoaded que se dispara cuando el navegador
 * ha cargado y analizado por completo el documento HTML inicial.
 * Sirve como punto de entrada (Main Entry Point) de la aplicación.
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar la configuración de Tema Visual (Light/Dark Mode)
  inicializarTemaClaroOscuro();

  // 2. Cargar datos desde localStorage y actualizar el estado
  cargarCitasDesdeAlmacenamiento();

  // 3. Restringir la selección de fechas pasadas en los inputs de fecha (Regla de negocio)
  establecerLimiteFechaMinima();

  // 4. Renderizar la UI por primera vez
  renderizarInterfaz();

  // 5. Emitir un Toast de bienvenida informando sobre el estado offline
  mostrarToast('Sistema listo y operando 100% fuera de línea.', 'success');
});

/**
 * Establece la fecha mínima seleccionable en los calendarios (HTML5 date input).
 * Utiliza la API Date para calcular el día actual en formato local AAAA-MM-DD.
 */
function establecerLimiteFechaMinima() {
  const hoy = new Date();
  
  // Convertimos la fecha local a formato AAAA-MM-DD teniendo en cuenta el huso horario local.
  // Esto evita problemas de fechas corridas por diferencias UTC al usar new Date().toISOString()
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0'); // Los meses van de 0 a 11
  const dia = String(hoy.getDate()).padStart(2, '0');
  
  const fechaMinimaFormateada = `${anio}-${mes}-${dia}`;
  
  // Asignamos la propiedad min a los inputs para deshabilitar fechas pasadas en el selector del sistema
  inputFecha.min = fechaMinimaFormateada;
  inputEditFecha.min = fechaMinimaFormateada;
}


// --------------------------------------------------------------------------
// III. CONTROL DEL TEMA VISUAL (Theme Switching - Light & Dark Mode)
// --------------------------------------------------------------------------

/**
 * Inicializa el tema visual preferido por el usuario.
 * Lee desde localStorage y si no existe, respeta la preferencia del sistema operativo.
 */
function inicializarTemaClaroOscuro() {
  // Recupera la preferencia guardada en localStorage
  const temaGuardado = localStorage.getItem('odontologia-tema');
  
  if (temaGuardado) {
    // Si existe una preferencia explícita, la aplica al elemento raíz del documento (html)
    document.documentElement.setAttribute('data-theme', temaGuardado);
  } else {
    // Si no hay preferencia previa, evalúa el query media match del sistema operativo (Preferencia de Windows)
    const prefiereOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const temaPorDefecto = prefiereOscuro ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', temaPorDefecto);
    localStorage.setItem('odontologia-tema', temaPorDefecto);
  }
}

// Event listener para el botón de alternancia de tema
botonAlternarTema.addEventListener('click', () => {
  // Obtiene el tema actual del atributo de datos
  const temaActual = document.documentElement.getAttribute('data-theme') || 'light';
  
  // Determina el nuevo tema invirtiendo el valor actual
  const nuevoTema = temaActual === 'light' ? 'dark' : 'light';
  
  // Modifica el DOM y lo persiste localmente
  document.documentElement.setAttribute('data-theme', nuevoTema);
  localStorage.setItem('odontologia-tema', nuevoTema);
  
  // Muestra una notificación toast informativa
  mostrarToast(`Tema visual cambiado a modo ${nuevoTema === 'light' ? 'claro' : 'oscuro'}.`, 'info');
});


// --------------------------------------------------------------------------
// IV. PERSISTENCIA DE DATOS (Data Access Layer - LocalStorage)
// --------------------------------------------------------------------------

/**
 * Carga el arreglo de citas almacenado en localStorage y actualiza el estado.
 * Controla errores de parsing en caso de que los datos almacenados estén corruptos.
 */
function cargarCitasDesdeAlmacenamiento() {
  try {
    const rawData = localStorage.getItem('odontologia-citas');
    // Si existen datos, hacemos el parseo JSON. Si no, inicializamos un arreglo vacío.
    state.citas = rawData ? JSON.parse(rawData) : [];
  } catch (error) {
    console.error("Error al analizar los datos de citas en localStorage:", error);
    mostrarToast("Error al cargar citas corruptas. Se inicializó una base de datos limpia.", "error");
    state.citas = [];
    guardarCitasEnAlmacenamiento();
  }
}

/**
 * Guarda la lista de citas actual del estado dentro del localStorage.
 * Serializa el objeto del estado a una cadena de texto (JSON stringify).
 */
function guardarCitasEnAlmacenamiento() {
  try {
    const dataString = JSON.stringify(state.citas);
    localStorage.setItem('odontologia-citas', dataString);
  } catch (error) {
    console.error("Error al escribir datos en localStorage:", error);
    mostrarToast("No se pudo guardar la información. Espacio de almacenamiento lleno.", "error");
  }
}


// --------------------------------------------------------------------------
// V. OPERACIÓN: RENDERIZAR Y MOSTRAR DATOS (READ & Dashboard Statistics)
// --------------------------------------------------------------------------

/**
 * Función principal de renderizado (Central Render Pipeline).
 * Limpia y reconstruye el listado de citas y actualiza los indicadores del dashboard.
 */
function renderizarInterfaz() {
  // 1. Filtrar las citas según la búsqueda ingresada por el usuario
  const citasFiltradas = filtrarCitasActualmente();

  // 2. Ordenar cronológicamente (Fecha y Hora ascendente)
  ordenarCitasCronologicamente(citasFiltradas);

  // 3. Renderizar las tarjetas en el DOM
  renderizarTarjetasCita(citasFiltradas);

  // 4. Calcular y actualizar las estadísticas del Dashboard
  actualizarEstadisticasDashboard();
}

/**
 * Filtra el arreglo de citas del estado según el texto del buscador.
 * Realiza una comparación insensible a mayúsculas/minúsculas.
 * @returns {Array} Arreglo de citas filtradas.
 */
function filtrarCitasActualmente() {
  const query = state.filtroBusqueda.trim().toLowerCase();
  
  if (query === '') {
    return [...state.citas]; // Retorna una copia de todas las citas si no hay búsqueda
  }
  
  // Filtra por concordancia en el nombre del paciente
  return state.citas.filter(cita => 
    cita.paciente.toLowerCase().includes(query)
  );
}

/**
 * Ordena un arreglo de citas en orden cronológico (Fecha más antigua a más nueva).
 * Si las fechas coinciden, ordena por hora.
 * @param {Array} arrayCitas - Arreglo a ordenar (modificado por referencia).
 */
function ordenarCitasCronologicamente(arrayCitas) {
  arrayCitas.sort((a, b) => {
    // Compara las fechas directamente en formato lexicográfico 'AAAA-MM-DD'
    if (a.fecha !== b.fecha) {
      return a.fecha.localeCompare(b.fecha);
    }
    // Si la fecha es igual, compara las horas en formato 'HH:MM'
    return a.hora.localeCompare(b.hora);
  });
}

/**
 * Inyecta las tarjetas de citas dentro del contenedor HTML.
 * Genera interfaces interactivas con botones para EDITAR y ELIMINAR.
 * @param {Array} citasAMostrar - Lista de citas filtradas y ordenadas.
 */
function renderizarTarjetasCita(citasAMostrar) {
  // Limpiamos el contenido anterior del contenedor para evitar duplicados
  contenedorListaCitas.innerHTML = '';

  // CASO DE USO: No hay citas registradas o ninguna coincide con el filtro
  if (citasAMostrar.length === 0) {
    contenedorListaCitas.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true">
          <!-- Icono SVG de un calendario tachado/vacio -->
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
        </div>
        <h3>No se encontraron citas</h3>
        <p>${state.citas.length === 0 ? 'Agrega tu primera cita médica dental usando el formulario de la izquierda.' : 'Modifica tu búsqueda para encontrar citas registradas.'}</p>
      </div>
    `;
    return;
  }

  // CASO DE USO: Renderizado de la lista
  citasAMostrar.forEach(cita => {
    // 1. Creación del nodo contenedor div
    const tarjeta = document.createElement('div');
    
    // Asigna clases generales y específicas para la decoración de color del borde según el servicio
    tarjeta.className = `appointment-card service-${cita.servicio.toLowerCase()}`;
    
    // Formateamos la fecha a un estilo legible en español de Venezuela (ej. Lunes, 22 de junio)
    const fechaLegible = formatearFechaEspanol(cita.fecha);
    // Formateamos la hora a formato de 12 horas con AM/PM
    const horaLegible = formatearHora12(cita.hora);

    // Mapeamos el nombre técnico del servicio a una etiqueta amigable y su badge CSS
    let servicioLegible = cita.servicio;
    let badgeClase = 'badge-evaluacion';
    
    if (cita.servicio === 'Limpieza') {
      servicioLegible = 'Limpieza Dental';
      badgeClase = 'badge-limpieza';
    } else if (cita.servicio === 'Ortodoncia') {
      servicioLegible = 'Control de Ortodoncia';
      badgeClase = 'badge-ortodoncia';
    } else if (cita.servicio === 'Extraccion') {
      servicioLegible = 'Extracción Dental';
      badgeClase = 'badge-extraccion';
    } else if (cita.servicio === 'Evaluacion') {
      servicioLegible = 'Evaluación General';
      badgeClase = 'badge-evaluacion';
    }

    // 2. Definición del marcado interno usando Template Literals.
    // Inyectamos botones con manejadores inline estructurados y SVGs autocontenidos.
    tarjeta.innerHTML = `
      <div class="card-info">
        <h3 class="patient-name">${escaparHTML(cita.paciente)}</h3>
        <div class="card-details">
          <!-- Badge de Servicio -->
          <span class="badge ${badgeClase}">${servicioLegible}</span>
          
          <!-- Detalle Fecha -->
          <div class="detail-item">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25M3 18.75A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75M3 18.75V11.25A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008z"/>
            </svg>
            <span>${fechaLegible}</span>
          </div>

          <!-- Detalle Hora -->
          <div class="detail-item">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>${horaLegible}</span>
          </div>
        </div>
      </div>
      
      <!-- Panel de Acciones (Editar / Eliminar) -->
      <div class="card-actions">
        <!-- Editar Cita (CRUD Update) -->
        <button class="btn-icon btn-icon-edit" onclick="abrirModalEdicion(${cita.id})" title="Editar datos de la cita">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
          </svg>
        </button>
        <!-- Eliminar Cita (CRUD Delete) -->
        <button class="btn-icon btn-icon-delete" onclick="solicitarEliminarCita(${cita.id}, '${escaparJS(cita.paciente)}')" title="Cancelar y eliminar cita">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
          </svg>
        </button>
      </div>
    `;
    
    // Agregamos la tarjeta renderizada al contenedor
    contenedorListaCitas.appendChild(tarjeta);
  });
}

/**
 * Realiza cálculos agregados sobre el estado de citas y actualiza los indicadores del Dashboard.
 * Aplica lógica de filtrado de fechas para calcular estadísticas de hoy y citas venideras.
 */
function actualizarEstadisticasDashboard() {
  const hoyStr = obtenerFechaHoyLocal(); // Formato 'AAAA-MM-DD'
  
  // 1. Total Citas Registradas
  statTotalValor.textContent = state.citas.length;

  // 2. Citas agendadas para el día de Hoy
  const citasHoy = state.citas.filter(c => c.fecha === hoyStr);
  statHoyValor.textContent = citasHoy.length;

  // 3. Próxima Cita más cercana (mayor o igual al día de hoy en el futuro)
  const citasFuturas = state.citas.filter(c => {
    // Compara fechas lexicográficamente
    if (c.fecha > hoyStr) return true;
    if (c.fecha === hoyStr) {
      // Si es hoy, verifica que la hora no haya pasado
      const horaActual = new Date().toTimeString().split(' ')[0].substring(0, 5); // 'HH:MM'
      return c.hora >= horaActual;
    }
    return false;
  });

  // Ordenamos temporalmente las futuras para identificar la más inmediata
  ordenarCitasCronologicamente(citasFuturas);

  if (citasFuturas.length > 0) {
    const proxima = citasFuturas[0];
    const fechaCorta = proxima.fecha.substring(8, 10) + '/' + proxima.fecha.substring(5, 7);
    statProximaValor.textContent = `${escaparHTML(proxima.paciente)} (${fechaCorta} - ${formatearHora12(proxima.hora)})`;
    statProximaValor.title = `Paciente: ${proxima.paciente}\nFecha: ${proxima.fecha}\nHora: ${formatearHora12(proxima.hora)}`;
  } else {
    statProximaValor.textContent = "Ninguna";
    statProximaValor.title = "No hay citas programadas para el día de hoy o el futuro";
  }

  // 4. Servicio Más Solicitado (Moda estadística)
  if (state.citas.length > 0) {
    const contadores = { Limpieza: 0, Ortodoncia: 0, Extraccion: 0, Evaluacion: 0 };
    
    state.citas.forEach(c => {
      if (contadores[c.servicio] !== undefined) {
        contadores[c.servicio]++;
      }
    });

    let popularServicio = 'N/A';
    let maxCitas = 0;

    for (const [servicio, cantidad] of Object.entries(contadores)) {
      if (cantidad > maxCitas) {
        maxCitas = cantidad;
        // Traducimos a cadena descriptiva
        if (servicio === 'Limpieza') popularServicio = 'Limpieza D.';
        else if (servicio === 'Ortodoncia') popularServicio = 'Control Orto.';
        else if (servicio === 'Extraccion') popularServicio = 'Extracción D.';
        else if (servicio === 'Evaluacion') popularServicio = 'Evaluación G.';
      }
    }
    
    statPopularValor.textContent = maxCitas > 0 ? `${popularServicio} (${maxCitas})` : 'N/A';
  } else {
    statPopularValor.textContent = "N/A";
  }
}


// --------------------------------------------------------------------------
// VI. OPERACIÓN: AGENDAR CITA (CREATE - Form Handling & Validations)
// --------------------------------------------------------------------------

/**
 * Escucha el evento submit del formulario principal para agendar citas.
 * Implementa las reglas de negocio críticas especificadas en los requisitos del proyecto.
 */
formularioCita.addEventListener('submit', (e) => {
  e.preventDefault(); // Cancela la recarga nativa de la página

  // Extracción y limpieza de los valores de los inputs
  const paciente = inputPaciente.value.trim();
  const servicio = inputServicio.value;
  const fecha = inputFecha.value;
  const hora = inputHora.value;

  // 1. Validación de campos obligatorios
  if (!paciente || !servicio || !fecha || !hora) {
    mostrarToast("Por favor, complete todos los campos requeridos.", "error");
    return;
  }

  // 2. Validación de regla de negocio: No se atiende fines de semana
  // new Date('YYYY-MM-DD').getUTCDay() evita desfases horarios. 0 = Domingo, 6 = Sábado.
  const diaSemana = new Date(fecha).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    mostrarToast("Error: La clínica no atiende los días sábados ni domingos.", "error");
    alertaFechaFinSemana.style.display = 'flex'; // Muestra indicador visual de advertencia
    return;
  }
  alertaFechaFinSemana.style.display = 'none';

  // 3. Validación de regla de negocio: Choque de Horarios (Double Booking)
  // Verifica si ya existe alguna cita agendada exactamente a la misma fecha y hora
  const choqueCita = state.citas.find(c => c.fecha === fecha && c.hora === hora);
  if (choqueCita) {
    mostrarToast(`Error: Ya existe una cita agendada a esta hora para el paciente: ${choqueCita.paciente}.`, "error");
    return;
  }

  // 4. Inserción de la nueva cita en el estado
  const nuevaCita = {
    id: Date.now(), // Generación de clave primaria única pseudo-aleatoria
    paciente: paciente,
    servicio: servicio,
    fecha: fecha,
    hora: hora
  };

  state.citas.push(nuevaCita);
  
  // 5. Persistencia y sincronización visual
  guardarCitasEnAlmacenamiento();
  formularioCita.reset(); // Limpia los inputs del formulario
  renderizarInterfaz(); // Redibuja el listado y las estadísticas
  
  mostrarToast(`Cita para ${paciente} agendada con éxito.`, "success");
});

/**
 * Listener en el input de fecha del formulario de creación para dar feedback
 * proactivo sobre la validez del día seleccionado (Fin de semana) antes del submit.
 */
inputFecha.addEventListener('input', (e) => {
  const fechaSeleccionada = e.target.value;
  if (!fechaSeleccionada) {
    alertaFechaFinSemana.style.display = 'none';
    return;
  }
  const diaSemana = new Date(fechaSeleccionada).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    alertaFechaFinSemana.style.display = 'flex';
  } else {
    alertaFechaFinSemana.style.display = 'none';
  }
});


// --------------------------------------------------------------------------
// VII. OPERACIÓN: ACTUALIZAR CITA (UPDATE - Modal Form & Edit State)
// --------------------------------------------------------------------------

/**
 * Abre el modal de edición cargando los valores de la cita seleccionada en sus campos.
 * Registra el identificador de la cita en el input hidden.
 * @param {number} id - Clave primaria (timestamp) de la cita a editar.
 */
function abrirModalEdicion(id) {
  // Encuentra la cita correspondiente en el estado
  const cita = state.citas.find(c => c.id === id);
  if (!cita) {
    mostrarToast("Cita no encontrada en el sistema.", "error");
    return;
  }

  // Carga los valores de los datos en los inputs del formulario del modal
  inputEditId.value = cita.id;
  inputEditPaciente.value = cita.paciente;
  inputEditServicio.value = cita.servicio;
  inputEditFecha.value = cita.fecha;
  inputEditHora.value = cita.hora;

  // Verifica si la fecha actual en la cita es fin de semana (en teoría no, pero por control)
  const diaSemana = new Date(cita.fecha).getUTCDay();
  alertaEditFechaFinSemana.style.display = (diaSemana === 0 || diaSemana === 6) ? 'flex' : 'none';

  // Despliega el modal agregando la clase CSS que controla la visibilidad y transición de opacidad
  modalEdicionOverlay.classList.add('show');
  
  // Establece el foco del teclado en el primer input por accesibilidad (A11y focus lock)
  inputEditPaciente.focus();
}

/**
 * Cierra el modal de edición y limpia el formulario de edición.
 */
function cerrarModalEdicion() {
  modalEdicionOverlay.classList.remove('show');
  formularioEdicion.reset();
  alertaEditFechaFinSemana.style.display = 'none';
}

// Escuchadores de eventos para cerrar el modal
botonCerrarModal.addEventListener('click', cerrarModalEdicion);
botonCancelarModal.addEventListener('click', cerrarModalEdicion);

// Cierra el modal si se hace clic fuera del contenedor (en la capa de overlay difuminada)
modalEdicionOverlay.addEventListener('click', (e) => {
  if (e.target === modalEdicionOverlay) {
    cerrarModalEdicion();
  }
});

/**
 * Listener de validación interactiva para el input de fecha del modal de edición
 */
inputEditFecha.addEventListener('input', (e) => {
  const fechaSeleccionada = e.target.value;
  if (!fechaSeleccionada) {
    alertaEditFechaFinSemana.style.display = 'none';
    return;
  }
  const diaSemana = new Date(fechaSeleccionada).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    alertaEditFechaFinSemana.style.display = 'flex';
  } else {
    alertaEditFechaFinSemana.style.display = 'none';
  }
});

/**
 * Escucha el submit del formulario de edición del modal.
 * Valida reglas de negocio (choque y fin de semana) excluyendo el ID editado de las comparaciones.
 */
formularioEdicion.addEventListener('submit', (e) => {
  e.preventDefault();

  const id = parseInt(inputEditId.value);
  const paciente = inputEditPaciente.value.trim();
  const servicio = inputEditServicio.value;
  const fecha = inputEditFecha.value;
  const hora = inputEditHora.value;

  // 1. Validación de campos obligatorios
  if (!paciente || !servicio || !fecha || !hora) {
    mostrarToast("Por favor, complete todos los campos requeridos para actualizar.", "error");
    return;
  }

  // 2. Validación: Fines de semana
  const diaSemana = new Date(fecha).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    mostrarToast("Error: No se pueden agendar consultas en sábados ni domingos.", "error");
    alertaEditFechaFinSemana.style.display = 'flex';
    return;
  }

  // 3. Validación: Choque de Horario
  // IMPORTANTE: Buscamos choques excluyendo la cita actual que se está modificando (c.id !== id)
  const choqueCita = state.citas.find(c => c.id !== id && c.fecha === fecha && c.hora === hora);
  if (choqueCita) {
    mostrarToast(`Error: Ya existe otra cita programada a esa hora para: ${choqueCita.paciente}.`, "error");
    return;
  }

  // 4. Actualización del Estado
  // Buscamos el índice de la cita original y sobreescribimos sus propiedades
  const indice = state.citas.findIndex(c => c.id === id);
  if (indice !== -1) {
    state.citas[indice] = {
      id: id,
      paciente: paciente,
      servicio: servicio,
      fecha: fecha,
      hora: hora
    };
    
    // 5. Persistencia y refresco visual
    guardarCitasEnAlmacenamiento();
    cerrarModalEdicion();
    renderizarInterfaz();
    
    mostrarToast("La cita médica se actualizó correctamente.", "success");
  } else {
    mostrarToast("La cita médica seleccionada no pudo actualizarse.", "error");
  }
});


// --------------------------------------------------------------------------
// VIII. OPERACIÓN: ELIMINAR CITA (DELETE - Custom Modal Confirmations)
// --------------------------------------------------------------------------

/**
 * Solicita la cancelación y eliminación de una cita desplegando un modal interactivo
 * de confirmación personalizado para evitar pérdidas accidentales de datos clínicos.
 * @param {number} id - ID de la cita a eliminar.
 * @param {string} pacienteNombre - Nombre del paciente para feedback visual.
 */
function solicitarEliminarCita(id, pacienteNombre) {
  state.idCitaParaEliminar = id;
  state.tipoDeLimpieza = 'cita';

  // Configura los textos del diálogo
  tituloConfirmacion.textContent = "¿Cancelar esta cita médica?";
  descripcionConfirmacion.innerHTML = `Está a punto de borrar la cita programada para el paciente <strong>${escaparHTML(pacienteNombre)}</strong>. Esta acción eliminará permanentemente el registro de la memoria local del navegador.`;
  
  // Muestra el modal de confirmación
  modalConfirmacionOverlay.classList.add('show');
}

/**
 * Escucha la acción del botón de confirmación de eliminación (Aceptar).
 * Elimina la cita o limpia todo el sistema según el tipo de limpieza configurado en el estado.
 */
botonAceptarConfirmacion.addEventListener('click', () => {
  modalConfirmacionOverlay.classList.remove('show');
  
  if (state.tipoDeLimpieza === 'cita' && state.idCitaParaEliminar !== null) {
    // Caso: Eliminar una sola cita
    const citaEliminada = state.citas.find(c => c.id === state.idCitaParaEliminar);
    const nombrePaciente = citaEliminada ? citaEliminada.paciente : '';
    
    // Filtramos excluyendo la clave primaria eliminada
    state.citas = state.citas.filter(c => c.id !== state.idCitaParaEliminar);
    
    guardarCitasEnAlmacenamiento();
    renderizarInterfaz();
    
    mostrarToast(`Cita de ${nombrePaciente} eliminada del sistema.`, "warning");
    state.idCitaParaEliminar = null;
  } else if (state.tipoDeLimpieza === 'citas') {
    // Caso: Limpieza general de toda la base de datos local
    state.citas = [];
    guardarCitasEnAlmacenamiento();
    renderizarInterfaz();
    mostrarToast("Se han eliminado todos los registros del sistema.", "warning");
  }
});

// Listener para cancelar confirmación
botonCancelarConfirmacion.addEventListener('click', () => {
  modalConfirmacionOverlay.classList.remove('show');
  state.idCitaParaEliminar = null;
});

// Cierra modal de confirmación si se hace clic fuera del contenedor
modalConfirmacionOverlay.addEventListener('click', (e) => {
  if (e.target === modalConfirmacionOverlay) {
    modalConfirmacionOverlay.classList.remove('show');
    state.idCitaParaEliminar = null;
  }
});

/**
 * Escucha el botón global para purgar toda la memoria del sistema.
 * Configura la confirmación masiva.
 */
botonLimpiarTodo.addEventListener('click', () => {
  if (state.citas.length === 0) {
    mostrarToast("No hay registros en el sistema que requieran limpieza.", "info");
    return;
  }
  
  state.tipoDeLimpieza = 'citas';
  
  tituloConfirmacion.textContent = "¿Eliminar TODAS las citas?";
  descripcionConfirmacion.innerHTML = `<strong>¡ADVERTENCIA DE SEGURIDAD!</strong> Esta acción purgará de forma definitiva toda la base de datos de citas almacenada en este dispositivo. Asegúrese de haber descargado su copia de seguridad (CSV) antes de proceder.`;
  
  modalConfirmacionOverlay.classList.add('show');
});


// --------------------------------------------------------------------------
// IX. OPERACIONES ADICIONALES: BÚSQUEDA Y FILTRADO ACTIVO (Search Event Listeners)
// --------------------------------------------------------------------------

/**
 * Escucha el evento input en el buscador de pacientes.
 * Dispara el filtrado y repintado de manera reactiva mientras el usuario escribe (Live Filter).
 */
inputBuscador.addEventListener('input', (e) => {
  state.filtroBusqueda = e.target.value;
  // Volvemos a renderizar la lista con el filtro aplicado
  renderizarInterfaz();
});


// --------------------------------------------------------------------------
// X. OPERACIONES ADICIONALES: EXPORTACIÓN DE REPORTES (EXPORT TO CSV)
// --------------------------------------------------------------------------

/**
 * Genera un archivo CSV con codificación UTF-8 y firma BOM para su correcta
 * lectura en Microsoft Excel en español (soporta eñes y acentos como 'Extracción').
 * Utiliza la API Blob y URL del navegador.
 */
botonExportar.addEventListener('click', () => {
  // Validación de seguridad inicial
  if (state.citas.length === 0) {
    mostrarToast("No hay registros disponibles para exportar.", "info");
    return;
  }

  // 1. Definición de la cabecera del CSV
  // \ufeff es la firma BOM (Byte Order Mark) que le indica a Excel que lea el archivo en UTF-8
  let contenidoCsv = "\ufeff";
  contenidoCsv += "Paciente,Servicio Odontológico,Fecha Consulta,Hora Consulta\n";

  // 2. Recorrido de los datos del estado para alimentar las filas
  // Ordenamos cronológicamente antes de exportar
  const citasOrdenadas = [...state.citas];
  ordenarCitasCronologicamente(citasOrdenadas);

  citasOrdenadas.forEach(cita => {
    // Sanitizamos los nombres de los pacientes para evitar inyecciones CSV (escapamos comillas y comas)
    const pacienteEscapado = cita.paciente.replace(/"/g, '""');
    
    let servicioEspanol = cita.servicio;
    if (cita.servicio === 'Limpieza') servicioEspanol = 'Limpieza Dental';
    else if (cita.servicio === 'Ortodoncia') servicioEspanol = 'Control de Ortodoncia';
    else if (cita.servicio === 'Extraccion') servicioEspanol = 'Extracción Dental';
    else if (cita.servicio === 'Evaluacion') servicioEspanol = 'Evaluación General';

    contenidoCsv += `"${pacienteEscapado}","${servicioEspanol}","${cita.fecha}","${cita.hora}"\n`;
  });

  // 3. Creación del objeto binario/texto en memoria (Blob API)
  const archivoBlob = new Blob([contenidoCsv], { 
    type: 'text/csv;charset=utf-8;' 
  });

  // 4. Generación de un enlace temporal de descarga invisible
  const enlaceDescarga = document.createElement("a");
  
  // Crea una dirección URL virtual vinculada al objeto Blob en la RAM
  const urlTemporal = URL.createObjectURL(archivoBlob);
  
  enlaceDescarga.href = urlTemporal;
  enlaceDescarga.download = `reporte_citas_odontologicas_${obtenerFechaHoyLocal()}.csv`;
  
  // Inyección temporal, ejecución de evento de descarga y remoción del enlace
  document.body.appendChild(enlaceDescarga);
  enlaceDescarga.click();
  
  // Mantenimiento de memoria del navegador: libera el objeto Blob de la memoria RAM
  document.body.removeChild(enlaceDescarga);
  URL.revokeObjectURL(urlTemporal);

  mostrarToast("Reporte descargado correctamente. Se guardó como archivo CSV.", "success");
});


// --------------------------------------------------------------------------
// XI. FUNCIONES AUXILIARES Y DE FORMATEO (Utility Helpers)
// --------------------------------------------------------------------------

/**
 * Obtiene la fecha actual en la zona horaria del cliente en formato 'AAAA-MM-DD'.
 * @returns {string} Fecha formateada.
 */
function obtenerFechaHoyLocal() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Formatea una cadena de fecha estándar AAAA-MM-DD a formato amigable en español.
 * Ej: '2026-06-22' -> 'Lunes, 22 de Junio'
 * @param {string} fechaTexto - Fecha en formato 'AAAA-MM-DD'.
 * @returns {string} Fecha formateada legible.
 */
function formatearFechaEspanol(fechaTexto) {
  // Dividimos la cadena para evitar que la conversión Date asuma huso horario UTC cero
  // y reste un día debido al desajuste de huso horario local americano.
  const partes = fechaTexto.split('-');
  const anio = parseInt(partes[0]);
  const mes = parseInt(partes[1]) - 1; // 0-indexado
  const dia = parseInt(partes[2]);

  const fechaObjeto = new Date(anio, mes, dia);

  // Formato localizado usando la API Intl
  const opciones = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  let fechaFormateada = fechaObjeto.toLocaleDateString('es-ES', opciones);

  // Capitalizamos la primera letra por estética
  return fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
}

/**
 * Formatea una hora militar (HH:MM) a formato de 12 horas (HH:MM AM/PM).
 * Ej: '15:30' -> '03:30 PM'
 * @param {string} horaTexto - Hora en formato de 24 horas 'HH:MM'.
 * @returns {string} Hora en formato amigable de 12 horas.
 */
function formatearHora12(horaTexto) {
  const partes = horaTexto.split(':');
  let horas = parseInt(partes[0]);
  const minutos = partes[1];
  
  const ampm = horas >= 12 ? 'PM' : 'AM';
  
  horas = horas % 12;
  horas = horas ? horas : 12; // La hora '0' pasa a ser '12'
  
  const horaFormateada = String(horas).padStart(2, '0');
  
  return `${horaFormateada}:${minutos} ${ampm}`;
}

/**
 * Evita ataques de inyección de código (Cross-Site Scripting - XSS)
 * codificando entidades HTML especiales al renderizar variables de texto de usuarios.
 * @param {string} texto - Texto sin sanitizar.
 * @returns {string} Texto seguro.
 */
function escaparHTML(texto) {
  const mapa = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&grave;'
  };
  return texto.replace(/[&<>"'`\/]/g, (match) => mapa[match]);
}

/**
 * Escapa comillas simples dentro de cadenas para inyecciones inline en atributos onclick.
 * @param {string} texto - Texto original.
 * @returns {string} Texto escapado.
 */
function escaparJS(texto) {
  return texto.replace(/'/g, "\\'");
}


// --------------------------------------------------------------------------
// XII. MÓDULO AUXILIAR: NOTIFICACIONES FLOTANTES (Custom Toasts Module)
// --------------------------------------------------------------------------

/**
 * Crea e inyecta dinámicamente notificaciones temporales no intrusivas en pantalla.
 * @param {string} mensaje - Texto de la notificación.
 * @param {string} tipo - Severidad de la notificación ('success', 'error', 'warning', 'info').
 */
function mostrarToast(mensaje, tipo = 'success') {
  // 1. Creación del elemento contenedor del Toast
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.setAttribute('role', 'alert');

  // Mapeo de iconos SVG según el tipo de toast
  let svgIcono = '';
  
  if (tipo === 'success') {
    // Check circular
    svgIcono = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  } else if (tipo === 'error') {
    // Equis / Cruz
    svgIcono = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  } else if (tipo === 'warning') {
    // Advertencia de exclamación
    svgIcono = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376C1.83 15.002 2.767 13.5 4.117 13.5H19.88c1.35 0 2.287 1.5 1.562 2.626L13.719 21.75a2.25 2.25 0 01-3.438 0L2.732 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`;
  } else {
    // Letra i de Información
    svgIcono = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.086.77l-1.011 2.923a.75.75 0 001.086.77h.007M12 7.5h.008v.008H12V7.5z"/></svg>`;
  }

  // 2. Estructura interna HTML
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${svgIcono}</span>
    <span class="toast-message">${escaparHTML(mensaje)}</span>
  `;

  // 3. Inyección en el contenedor flotante
  contenedorToasts.appendChild(toast);

  // 4. Temporizador de desvanecimiento (Remoción automática)
  // Tras 4 segundos, iniciamos animación de salida (slide-out)
  setTimeout(() => {
    toast.classList.add('dismissing');
    
    // Esperamos 300ms a que termine la animación CSS para destruir el nodo en el DOM
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 4000);
}
