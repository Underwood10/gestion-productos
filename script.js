// Variables globales para los datos del usuario
let userId = null;
let userEmail = null;
let articulos = [];
let grupos = ["Sin grupo"];
let stockMinimo = 5;
let configuracionCarga = {
  nombre: true,
  marca: true,
  codigo: true,
  cantidad: true,
  grupo: true,
  foto: true
};

// Función para cargar datos del usuario actual
async function reloadUserData() {
  if (typeof getCurrentUserId === 'function') {
    userId = getCurrentUserId();
    userEmail = getCurrentUserEmail();
    
    if (userId) {
      console.log('Cargando datos para usuario:', userEmail);
      
      try {
        // Cargar datos desde Supabase
        articulos = await cargarProductosDB();
        grupos = await cargarGruposDB();
        
        const config = await cargarConfiguracionDB();
        stockMinimo = config.stockMinimo;
        configuracionCarga = config.configuracionCarga;
        
        // Migrar datos locales si es la primera vez
        if (articulos.length === 0) {
          await migrarDatosLocalASupabase();
          // Recargar después de la migración
          articulos = await cargarProductosDB();
          grupos = await cargarGruposDB();
          const newConfig = await cargarConfiguracionDB();
          stockMinimo = newConfig.stockMinimo;
          configuracionCarga = newConfig.configuracionCarga;
        }
        
        // Recargar la interfaz
        cargarGrupos();
        renderizar();
        cargarConfiguracionCarga();
        const cantidadMinima = document.getElementById("cantidadMinima");
        if (cantidadMinima) {
          cantidadMinima.value = stockMinimo;
        }
        actualizarFormulario();
        
        console.log('Datos cargados:', { 
          productos: articulos.length, 
          grupos: grupos.length, 
          stockMinimo 
        });
        
      } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        showAuthMessage('Error cargando datos', 'error');
      }
    }
  }
}
let indiceEditar = null;
let indiceEliminar = null;
let modoEdicion = false;

// Guardar - Ahora usa Supabase
async function guardar() { 
  // Mantener localStorage como backup
  localStorage.setItem("articulos_" + userId, JSON.stringify(articulos)); 
}

async function guardarGrupos() { 
  // Mantener localStorage como backup
  localStorage.setItem("grupos_" + userId, JSON.stringify(grupos)); 
}

async function guardarStockMinimo() { 
  stockMinimo = parseInt(document.getElementById("cantidadMinima").value) || 5;
  localStorage.setItem("stockMinimo_" + userId, stockMinimo.toString());
  
  // Guardar en Supabase
  await guardarConfiguracionDB(stockMinimo, configuracionCarga);
}

async function guardarConfiguracionCarga() { 
  localStorage.setItem("configuracionCarga_" + userId, JSON.stringify(configuracionCarga));
  
  // Guardar en Supabase
  await guardarConfiguracionDB(stockMinimo, configuracionCarga);
}

// Función removida - ya no se necesita el cambio de local

// Capitalizar
function capitalizar(texto) {
  return texto.split(" ").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

// Renderizar
function renderizar(lista=null){
  const mostrar = lista || [...articulos]
    .filter(art => art.visible !== false) // Solo mostrar artículos visibles por defecto
    .sort((a,b) => {
      // Ordenar primero por marca, luego por nombre
      if(a.marca !== b.marca) {
        return a.marca.localeCompare(b.marca);
      }
      return a.nombre.localeCompare(b.nombre);
    });
  const contenedor = document.getElementById("listaArticulos");
  contenedor.innerHTML="";
  
  mostrar.forEach((art,originalIndex)=>{
    const realIndex = articulos.findIndex(a => a === art);
    const stockBajo = (art.cantidad !== undefined && art.cantidad <= stockMinimo);
    const esPedir = art.faltante || stockBajo;
    
    const botonesEdicion = modoEdicion ? `
      <div class="articulo-actions">
        <button class="action-btn edit-btn" onclick="abrirEditar(${realIndex})" title="Editar">
          <i class="ph ph-pencil-simple"></i>
        </button>
        <button class="action-btn delete-btn" onclick="abrirEliminar(${realIndex})" title="Eliminar">
          <i class="ph ph-trash"></i>
        </button>
        <button class="action-btn visibility-btn ${art.visible !== false ? 'visible' : 'hidden'}" 
                onclick="toggleVisibilidad(${realIndex})" 
                title="${art.visible !== false ? 'Ocultar' : 'Mostrar'}">
          <i class="ph ${art.visible !== false ? 'ph-eye' : 'ph-eye-slash'}"></i>
        </button>
      </div>
    ` : '';
    
    contenedor.innerHTML += `
      <div class="producto ${esPedir?'pedir':''} ${modoEdicion?'edit-mode':''}">
        ${botonesEdicion}
        <img src="${art.foto}" alt="Foto">
        <h3>${art.nombre}</h3>
        <p><b>Stock:</b> 
          <span class="stock-display stock-cantidad ${stockBajo?'stock-bajo':''}" onclick="editarStockInline(${realIndex})" style="cursor: pointer; user-select: none;" title="Clic para editar stock" id="stock-${realIndex}">${art.cantidad !== undefined ? art.cantidad : 'No definido'}</span>
        </p>
        <div class="acciones-con-cantidad">
          <button class="quantity-btn minus" onclick="cambiarCantidad(${realIndex}, -1)">
            <i class="ph ph-minus"></i>
          </button>
          <button class="${art.faltante?'okBtn':'pedirBtn'}" onclick="marcarFaltanteIndex(${realIndex})">
            <i class="ph ${art.faltante?'ph-check':'ph-shopping-cart'}"></i> ${art.faltante?"Disponible":"Pedir"}
          </button>
          <button class="quantity-btn" onclick="cambiarCantidad(${realIndex}, 1)">
            <i class="ph ph-plus"></i>
          </button>
        </div>
        <div class="codigo-producto">${art.codigo}</div>
      </div>
    `;
  });
}

// Agregar - Ahora usa Supabase
async function agregar(){
  const nombre = configuracionCarga.nombre ? capitalizar(document.getElementById("nombre").value) : "Producto";
  const marca = configuracionCarga.marca ? capitalizar(document.getElementById("marca").value) : "Sin marca";
  const codigo = configuracionCarga.codigo ? document.getElementById("codigo").value.trim() : Date.now().toString();
  const cantidad = configuracionCarga.cantidad ? (parseInt(document.getElementById("cantidad").value) || 0) : 0;
  const grupo = configuracionCarga.grupo ? document.getElementById("grupo").value : "";
  const archivo = configuracionCarga.foto ? document.getElementById("foto").files[0] : null;
  
  // Validar solo campos habilitados y obligatorios según configuración
  const camposObligatorios = [];
  if(configuracionCarga.nombre && !document.getElementById("nombre").value.trim()) camposObligatorios.push("Nombre");
  if(configuracionCarga.marca && !document.getElementById("marca").value.trim()) camposObligatorios.push("Marca");
  if(configuracionCarga.codigo && !document.getElementById("codigo").value.trim()) camposObligatorios.push("Código");
  // Grupo y foto no son campos obligatorios por defecto
  
  if(camposObligatorios.length > 0) {
    return alert("Completa los siguientes campos obligatorios: " + camposObligatorios.join(", "));
  }

  // Mostrar loading en el botón
  const btnAgregar = document.querySelector('.btn-add-pro');
  const btnText = btnAgregar.querySelector('span');
  const btnLoader = btnAgregar.querySelector('.btn-loader');
  btnAgregar.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';

  try {
    let fotoBase64 = null;
    
    if(archivo) {
      // Convertir imagen a base64
      fotoBase64 = await new Promise((resolve) => {
        const lector = new FileReader();
        lector.onload = e => resolve(e.target.result);
        lector.readAsDataURL(archivo);
      });
    } else {
      // Foto por defecto
      fotoBase64 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Ctext x='50' y='55' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle'%3ESin foto%3C/text%3E%3C/svg%3E";
    }
    
    const nuevoProducto = {
      nombre,
      marca,
      codigo,
      cantidad,
      grupo,
      foto: fotoBase64,
      faltante: false,
      visible: true
    };
    
    // Guardar en Supabase
    const productoGuardado = await guardarProductoDB(nuevoProducto);
    
    if (productoGuardado) {
      // Agregar a la lista local
      articulos.push(productoGuardado);
      console.log('Producto agregado:', productoGuardado);
    } else {
      // Fallback: agregar solo localmente
      articulos.push({...nuevoProducto, id: Date.now().toString()});
    }
    
    await guardar();
    renderizar();
    limpiarFormulario();
    
  } catch (error) {
    console.error('Error agregando producto:', error);
    alert('Error al guardar el producto. Inténtalo de nuevo.');
  } finally {
    // Restaurar botón
    btnAgregar.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

function limpiarFormulario() {
  document.getElementById("nombre").value="";
  document.getElementById("marca").value="";
  document.getElementById("codigo").value="";
  document.getElementById("cantidad").value="";
  document.getElementById("grupo").value="";
  document.getElementById("foto").value="";
  
  // Resetear el texto del archivo
  const textSpan = document.querySelector('.file-input-text');
  if(textSpan) {
    textSpan.textContent = 'Seleccionar imagen...';
    textSpan.style.color = '#7f8c8d';
  }
}

// Faltante
function marcarFaltanteIndex(index){ articulos[index].faltante=!articulos[index].faltante; guardar(); renderizar(); }

// Cambiar cantidad con botones +/-
function cambiarCantidad(index, cambio) {
  const cantidadActual = articulos[index].cantidad || 0;
  const nuevaCantidad = Math.max(0, cantidadActual + cambio);
  articulos[index].cantidad = nuevaCantidad;
  guardar();
  renderizar();
}

// --- EDITAR ---
function abrirEditar(index){
  indiceEditar=index;
  const art=articulos[index];
  document.getElementById("editNombre").value=art.nombre;
  document.getElementById("editMarca").value=art.marca;
  document.getElementById("editCodigo").value=art.codigo;
  document.getElementById("editCantidad").value=art.cantidad || 0;
  document.getElementById("editGrupo").value=art.grupo || "";
  document.getElementById("editFoto").src=art.foto;
  document.getElementById("editArchivo").value="";
  document.getElementById("modalEditar").style.display="flex";
}
function guardarEdicion(){
  const nuevoNombre=capitalizar(document.getElementById("editNombre").value);
  const nuevaMarca=capitalizar(document.getElementById("editMarca").value);
  const nuevoCodigo=document.getElementById("editCodigo").value.trim();
  const nuevaCantidad=parseInt(document.getElementById("editCantidad").value) || 0;
  const nuevoGrupo=document.getElementById("editGrupo").value;
  const archivo=document.getElementById("editArchivo").files[0];
  if(!nuevoNombre||!nuevaMarca||!nuevoCodigo){alert("Completa todos los campos obligatorios");return;}
  articulos[indiceEditar].nombre=nuevoNombre;
  articulos[indiceEditar].marca=nuevaMarca;
  articulos[indiceEditar].codigo=nuevoCodigo;
  articulos[indiceEditar].cantidad=nuevaCantidad;
  articulos[indiceEditar].grupo=nuevoGrupo;
  if(archivo){
    const lector=new FileReader();
    lector.onload=e=>{
      articulos[indiceEditar].foto=e.target.result;
      guardar(); renderizar(); cerrarModal();
    };
    lector.readAsDataURL(archivo);
  }else{guardar(); renderizar(); cerrarModal();}
}
function cerrarModal(){ document.getElementById("modalEditar").style.display="none"; }

// --- ELIMINAR ---
function abrirEliminar(index){ 
  indiceEliminar=index; 
  document.getElementById("modalEliminar").style.display="flex"; 
}
function confirmarEliminar(){ 
  articulos.splice(indiceEliminar,1); 
  guardar(); 
  renderizar(); 
  document.getElementById("modalEliminar").style.display="none";
}
function cancelarEliminar(){ 
  document.getElementById("modalEliminar").style.display="none"; 
}

// --- BUSCADOR ---
// La función filtrar está ahora implementada más abajo para manejar también filtros por grupo

// --- EXCEL ---
function descargarExcel() {
  const modal = document.getElementById("modalExcelInfo");
  if(modal) {
    modal.style.display = "flex";
  } else {
    alert("No se pudo encontrar el modal de Excel");
  }
}

function generarExcel() {
  const empresa = document.getElementById("nombreEmpresa").value.trim();
  const usuario = document.getElementById("nombreUsuario").value.trim();
  if(!empresa || !usuario) return alert("Completa todos los campos");
  
  const productosAPedir = articulos.filter(a => {
    return a.faltante === true;
  }).sort((a,b) => {
    if(a.marca !== b.marca) {
      return a.marca.localeCompare(b.marca);
    }
    return a.nombre.localeCompare(b.nombre);
  });
  
  const fecha = new Date();
  const fechaFormateada = fecha.toLocaleDateString('es-ES');
  const horaFormateada = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  
  // Crear nuevo libro de trabajo
  const wb = XLSX.utils.book_new();
  
  // Datos de la hoja
  const wsData = [];
  
  // Encabezado principal
  wsData.push([`LISTA DE PRODUCTOS MARCADOS PARA PEDIR - ${empresa.toUpperCase()}`]);
  wsData.push([`Fecha: ${fechaFormateada} - ${horaFormateada}`]);
  wsData.push([`Generado por: ${usuario}`]);
  wsData.push([`Total de productos marcados: ${productosAPedir.length}`]);
  wsData.push([]);
  
  // Encabezados de la tabla
  wsData.push(['PRODUCTO', 'MARCA', 'CÓDIGO/SKU']);
  
  // Datos de los productos
  productosAPedir.forEach(art => {
    wsData.push([
      art.nombre || 'Sin nombre',
      art.marca || 'Sin marca',
      art.codigo || 'Sin código'
    ]);
  });
  
  // Crear hoja de trabajo
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Configurar anchos de columna para mejor presentación
  ws['!cols'] = [
    { wch: 25 },  // Producto
    { wch: 18 },  // Marca
    { wch: 15 }   // Código
  ];
  
  // Fusionar celdas para el título principal
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
  ];
  
  // Agregar hoja al libro
  XLSX.utils.book_append_sheet(wb, ws, 'Productos Stock Bajo');
  
  // Guardar archivo
  const nombreArchivo = `productos_marcados_para_pedir_${fechaFormateada.replace(/\//g,'-')}_${empresa.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
  
  try {
    XLSX.writeFile(wb, nombreArchivo);
    alert('Excel descargado exitosamente');
  } catch (error) {
    console.error('Error al generar Excel:', error);
    alert('Error al generar el archivo Excel. Por favor, inténtalo de nuevo.');
  }
  
  cancelarExcel();
}

function cancelarExcel() {
  document.getElementById("modalExcelInfo").style.display = "none";
  document.getElementById("nombreEmpresa").value = "";
  document.getElementById("nombreUsuario").value = "";
}

// Variable global para almacenar cantidad de productos marcados
let productosMarcadosCount = 0;

// Función para resetear todos los productos marcados como "pedir"
function resetearTodosLosMarcados() {
  productosMarcadosCount = articulos.filter(a => a.faltante === true).length;
  
  if(productosMarcadosCount === 0) {
    alert("No hay productos marcados para pedir.");
    return;
  }
  
  // Actualizar el texto del modal con la cantidad específica
  const textoConfirmacion = document.getElementById('textoConfirmacion');
  textoConfirmacion.textContent = `¿Estás seguro de que quieres desmarcar todos los ${productosMarcadosCount} productos que están marcados para pedir?`;
  
  // Mostrar el modal personalizado
  document.getElementById('modalConfirmReset').style.display = 'flex';
}

// Función para cancelar el reset
function cancelarReset() {
  document.getElementById('modalConfirmReset').style.display = 'none';
}

// Función para confirmar el reset
function confirmarReset() {
  // Resetear todos los productos marcados
  articulos.forEach(art => {
    if(art.faltante === true) {
      art.faltante = false;
    }
  });
  
  // Guardar cambios y re-renderizar
  guardar();
  
  // Si hay filtros activos, aplicarlos, sino renderizar normal
  if(filtroActual.texto || filtroActual.grupo || filtroActual.visibilidad || filtroActual.stock !== 'todos') {
    aplicarFiltros();
  } else {
    renderizar();
  }
  
  // Cerrar modal
  document.getElementById('modalConfirmReset').style.display = 'none';
  
  // Mostrar mensaje de confirmación
  alert(`Se desmarcaron ${productosMarcadosCount} productos correctamente.`);
}


// Función para edición inline del stock
function editarStockInline(index) {
  const stockElement = document.getElementById(`stock-${index}`);
  if(!stockElement) return;
  
  const valorActual = articulos[index].cantidad !== undefined ? articulos[index].cantidad : 0;
  
  // Crear input temporal
  const input = document.createElement('input');
  input.type = 'number';
  input.value = valorActual;
  input.min = '0';
  input.style.width = '60px';
  input.style.textAlign = 'center';
  input.style.border = '2px solid #007bff';
  input.style.borderRadius = '4px';
  input.style.padding = '2px 4px';
  input.style.fontSize = '14px';
  
  // Reemplazar el span con el input
  const originalText = stockElement.textContent;
  stockElement.innerHTML = '';
  stockElement.appendChild(input);
  
  // Seleccionar todo el texto del input
  input.select();
  input.focus();
  
  // Función para guardar cambios
  function guardarCambios() {
    const nuevoValor = parseInt(input.value) || 0;
    articulos[index].cantidad = nuevoValor;
    guardar();
    
    // Restaurar el display normal
    stockElement.textContent = nuevoValor;
    stockElement.className = `stock-display stock-cantidad ${nuevoValor <= stockMinimo ? 'stock-bajo' : ''}`;
    
    // Re-renderizar para actualizar estado visual
    if(filtroActual.texto || filtroActual.grupo || filtroActual.visibilidad || filtroActual.stock !== 'todos') {
      aplicarFiltros();
    } else {
      renderizar();
    }
  }
  
  // Función para cancelar cambios
  function cancelarCambios() {
    stockElement.textContent = originalText;
  }
  
  // Event listeners para el input
  input.addEventListener('keydown', function(e) {
    if(e.key === 'Enter') {
      e.preventDefault();
      guardarCambios();
    } else if(e.key === 'Escape') {
      e.preventDefault();
      cancelarCambios();
    }
  });
  
  input.addEventListener('blur', function() {
    guardarCambios();
  });
}

// --- CONFIGURACION ---
function abrirConfiguracion() {
  const sidebar = document.getElementById("sidebarConfiguracion");
  const overlay = document.getElementById("overlay");
  
  if(sidebar.classList.contains("active")) {
    // Cerrar sidebar
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  } else {
    // Abrir sidebar
    cargarGrupos();
    renderizarGrupos();
    sidebar.classList.add("active");
    overlay.classList.add("active");
  }
}

function cerrarConfiguracion() {
  document.getElementById("sidebarConfiguracion").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
}

// Toggle de secciones colapsables
function toggleSection(sectionId) {
  const content = document.getElementById(sectionId);
  const arrow = document.getElementById(`arrow-${sectionId}`);
  
  if(content.classList.contains("collapsed")) {
    content.classList.remove("collapsed");
    arrow.classList.remove("rotated");
    arrow.innerHTML = '<i class="ph ph-caret-down"></i>';
  } else {
    content.classList.add("collapsed");
    arrow.classList.add("rotated");
    arrow.innerHTML = '<i class="ph ph-caret-right"></i>';
  }
}

function cargarGrupos() {
  const selectGrupo = document.getElementById("grupo");
  const selectEditGrupo = document.getElementById("editGrupo");
  const selectFiltroGrupo = document.getElementById("filtroGrupo");
  
  if(selectGrupo) {
    selectGrupo.innerHTML = '<option value="" data-placeholder="true">📁 Seleccionar grupo...</option>';
    grupos.forEach(grupo => {
      if (grupo !== "Sin grupo") {
        selectGrupo.innerHTML += `<option value="${grupo}">📂 ${grupo}</option>`;
      }
    });
  }
  
  if(selectEditGrupo) {
    selectEditGrupo.innerHTML = '<option value="" data-placeholder="true">📁 Seleccionar grupo</option>';
    grupos.forEach(grupo => {
      if (grupo !== "Sin grupo") {
        selectEditGrupo.innerHTML += `<option value="${grupo}">📂 ${grupo}</option>`;
      }
    });
  }
  
  if(selectFiltroGrupo) {
    selectFiltroGrupo.innerHTML = '<option value="" data-placeholder="true">🗂️ Todos los grupos</option>';
    grupos.forEach(grupo => {
      selectFiltroGrupo.innerHTML += `<option value="${grupo}">📂 ${grupo}</option>`;
    });
  }
}

function renderizarGrupos() {
  const lista = document.getElementById("listaGrupos");
  lista.innerHTML = "";
  grupos.forEach((grupo, index) => {
    lista.innerHTML += `
      <div class="grupo-item">
        <span>${grupo}</span>
        <button onclick="eliminarGrupo(${index})"><i class="ph ph-trash"></i></button>
      </div>
    `;
  });
}

async function agregarGrupo() {
  const nombre = capitalizar(document.getElementById("nuevoGrupo").value);
  if(!nombre) return alert("Ingresa el nombre del grupo");
  if(grupos.includes(nombre)) return alert("El grupo ya existe");
  
  try {
    // Guardar en Supabase
    const grupoGuardado = await guardarGrupoDB(nombre);
    
    if (grupoGuardado || !supabase) {
      // Agregar a la lista local
      grupos.push(nombre);
      await guardarGrupos();
      cargarGrupos();
      renderizarGrupos();
      document.getElementById("nuevoGrupo").value = "";
      console.log('Grupo agregado:', nombre);
    } else {
      alert('Error al crear el grupo. Inténtalo de nuevo.');
    }
  } catch (error) {
    console.error('Error agregando grupo:', error);
    alert('Error al crear el grupo. Inténtalo de nuevo.');
  }
}

async function eliminarGrupo(index) {
  if(grupos[index] === "Sin grupo") return alert("No se puede eliminar el grupo por defecto");
  if(!confirm(`¿Eliminar el grupo "${grupos[index]}"?`)) return;
  
  const nombreGrupo = grupos[index];
  
  try {
    // Eliminar de Supabase
    const eliminado = await eliminarGrupoDB(nombreGrupo);
    
    if (eliminado || !supabase) {
      // Eliminar de la lista local
      grupos.splice(index, 1);
      await guardarGrupos();
      cargarGrupos();
      renderizarGrupos();
      console.log('Grupo eliminado:', nombreGrupo);
    } else {
      alert('Error al eliminar el grupo. Inténtalo de nuevo.');
    }
  } catch (error) {
    console.error('Error eliminando grupo:', error);
    alert('Error al eliminar el grupo. Inténtalo de nuevo.');
  }
}

// --- FILTROS ---
let filtroActual = {
  texto: '',
  grupo: '',
  visibilidad: '', // Por defecto sin filtro específico, se ocultan automáticamente los ocultos
  stock: 'todos'
};

function filtrar() {
  filtroActual.texto = document.getElementById("buscador").value.toLowerCase();
  aplicarFiltros();
}

function filtrarPorGrupo() {
  filtroActual.grupo = document.getElementById("filtroGrupo").value;
  aplicarFiltros();
  
  // Cerrar el dropdown después de seleccionar
  document.getElementById('filtroGrupos').style.display = 'none';
}

function filtrarPorVisibilidad() {
  const radios = document.querySelectorAll('input[name="filtroVis"]');
  for(let radio of radios) {
    if(radio.checked) {
      filtroActual.visibilidad = radio.value;
      break;
    }
  }
  aplicarFiltros();
  
  // Cerrar el dropdown después de seleccionar
  document.getElementById('filtroVisibilidad').style.display = 'none';
}

function filtrarPorStock() {
  const radios = document.querySelectorAll('input[name="filtroStock"]');
  for(let radio of radios) {
    if(radio.checked) {
      filtroActual.stock = radio.value;
      break;
    }
  }
  aplicarFiltros();
  
  // Cerrar el dropdown después de seleccionar
  document.getElementById('filtroStock').style.display = 'none';
}

function aplicarFiltros() {
  let articulosFiltrados = [...articulos];
  
  // Filtro por texto
  if(filtroActual.texto) {
    articulosFiltrados = articulosFiltrados.filter(art =>
      art.nombre.toLowerCase().includes(filtroActual.texto) ||
      art.marca.toLowerCase().includes(filtroActual.texto) ||
      art.codigo.toLowerCase().includes(filtroActual.texto)
    );
  }
  
  // Filtro por grupo
  if(filtroActual.grupo) {
    articulosFiltrados = articulosFiltrados.filter(art => art.grupo === filtroActual.grupo);
  }
  
  // Filtro por visibilidad
  if(filtroActual.visibilidad === 'visibles') {
    articulosFiltrados = articulosFiltrados.filter(art => art.visible !== false);
  } else if(filtroActual.visibilidad === 'ocultos') {
    articulosFiltrados = articulosFiltrados.filter(art => art.visible === false);
  } else if(filtroActual.visibilidad === 'todos') {
    // Mostrar TODOS los artículos sin filtro de visibilidad (incluyendo ocultos)
  } else {
    // Por defecto, ocultar artículos marcados como ocultos
    articulosFiltrados = articulosFiltrados.filter(art => art.visible !== false);
  }
  
  // Filtro por stock
  if(filtroActual.stock === 'bajo') {
    // Stock bajo: cantidad <= stockMinimo y cantidad > 0
    articulosFiltrados = articulosFiltrados.filter(art => 
      art.cantidad !== undefined && 
      art.cantidad <= stockMinimo && 
      art.cantidad > 0
    );
  } else if(filtroActual.stock === 'sin') {
    // Sin stock: cantidad = 0 o undefined
    articulosFiltrados = articulosFiltrados.filter(art => 
      art.cantidad === undefined || art.cantidad === 0
    );
  }
  // Si stock === 'todos', no se aplica ningún filtro adicional
  
  // Aplicar filtro de visibilidad solo si no se especificó uno anteriormente
  if(filtroActual.visibilidad === '' || filtroActual.visibilidad === undefined) {
    // Por defecto, solo mostrar artículos visibles
    articulosFiltrados = articulosFiltrados.filter(art => art.visible !== false);
  }
  
  // Renderizar con los artículos filtrados (sin filtro de visibilidad automático)
  renderizarFiltrados(articulosFiltrados);
}

function renderizarFiltrados(lista) {
  const mostrar = lista.sort((a,b) => {
    if(a.marca !== b.marca) {
      return a.marca.localeCompare(b.marca);
    }
    return a.nombre.localeCompare(b.nombre);
  });
  
  const contenedor = document.getElementById("listaArticulos");
  contenedor.innerHTML="";
  
  mostrar.forEach((art,originalIndex)=>{
    const realIndex = articulos.findIndex(a => a === art);
    const stockBajo = (art.cantidad !== undefined && art.cantidad <= stockMinimo);
    const esPedir = art.faltante || stockBajo;
    
    const botonesEdicion = modoEdicion ? `
      <div class="articulo-actions">
        <button class="action-btn edit-btn" onclick="abrirEditar(${realIndex})" title="Editar">
          <i class="ph ph-pencil-simple"></i>
        </button>
        <button class="action-btn delete-btn" onclick="abrirEliminar(${realIndex})" title="Eliminar">
          <i class="ph ph-trash"></i>
        </button>
        <button class="action-btn visibility-btn ${art.visible !== false ? 'visible' : 'hidden'}" 
                onclick="toggleVisibilidad(${realIndex})" 
                title="${art.visible !== false ? 'Ocultar' : 'Mostrar'}">
          <i class="ph ${art.visible !== false ? 'ph-eye' : 'ph-eye-slash'}"></i>
        </button>
      </div>
    ` : '';
    
    contenedor.innerHTML += `
      <div class="producto ${esPedir?'pedir':''} ${modoEdicion?'edit-mode':''}">
        ${botonesEdicion}
        <img src="${art.foto}" alt="Foto">
        <h3>${art.nombre}</h3>
        <p><b>Stock:</b> 
          <span class="stock-display stock-cantidad ${stockBajo?'stock-bajo':''}" onclick="editarStockInline(${realIndex})" style="cursor: pointer; user-select: none;" title="Clic para editar stock" id="stock-${realIndex}">${art.cantidad !== undefined ? art.cantidad : 'No definido'}</span>
        </p>
        <div class="acciones-con-cantidad">
          <button class="quantity-btn minus" onclick="cambiarCantidad(${realIndex}, -1)">
            <i class="ph ph-minus"></i>
          </button>
          <button class="${art.faltante?'okBtn':'pedirBtn'}" onclick="marcarFaltanteIndex(${realIndex})">
            <i class="ph ${art.faltante?'ph-check':'ph-shopping-cart'}"></i> ${art.faltante?"Disponible":"Pedir"}
          </button>
          <button class="quantity-btn" onclick="cambiarCantidad(${realIndex}, 1)">
            <i class="ph ph-plus"></i>
          </button>
        </div>
        <div class="codigo-producto">${art.codigo}</div>
      </div>
    `;
  });
}

function abrirFiltroGrupos() {
  const button = event.target.closest('.fixed-filter-icon');
  posicionarDropdown('filtroGrupos', button);
}

function abrirFiltroVisibilidad() {
  const button = event.target.closest('.fixed-filter-icon');
  posicionarDropdown('filtroVisibilidad', button);
}

function abrirFiltroStock() {
  const button = event.target.closest('.fixed-filter-icon');
  posicionarDropdown('filtroStock', button);
}

function posicionarDropdown(dropdownId, button) {
  // Cerrar otros dropdowns
  const dropdowns = ['filtroGrupos', 'filtroVisibilidad', 'filtroStock'];
  dropdowns.forEach(id => {
    if(id !== dropdownId) {
      document.getElementById(id).style.display = 'none';
    }
  });
  
  const dropdown = document.getElementById(dropdownId);
  
  // Toggle el dropdown
  if(dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
    return;
  }
  
  // Mostrar el dropdown
  dropdown.style.display = 'block';
  
  // Posicionar debajo del botón
  if(button) {
    const buttonRect = button.getBoundingClientRect();
    dropdown.style.left = buttonRect.left + 'px';
    dropdown.style.top = (buttonRect.bottom + 8) + 'px';
  }
}

function toggleDropdown(dropdownId) {
  // Función legacy para compatibilidad
  posicionarDropdown(dropdownId, null);
}

// --- CONFIGURACION DE CARGA ---
function aplicarConfiguracionCarga() {
  configuracionCarga.nombre = document.getElementById("habilitarNombre").checked;
  configuracionCarga.codigo = document.getElementById("habilitarCodigo").checked;
  configuracionCarga.marca = document.getElementById("habilitarMarca").checked;
  configuracionCarga.cantidad = document.getElementById("habilitarCantidad").checked;
  configuracionCarga.grupo = document.getElementById("habilitarGrupo").checked;
  configuracionCarga.foto = document.getElementById("habilitarFoto").checked;
  
  guardarStockMinimo();
  guardarConfiguracionCarga();
  
  // Forzar la reorganización del formulario
  setTimeout(() => {
    actualizarFormulario();
  }, 100);
  
  alert("Configuración actualizada correctamente");
}

function actualizarFormulario() {
  // Ocultar/mostrar campos individualmente en el nuevo orden
  const camposBasicos = [
    { id: 'nombre', enabled: configuracionCarga.nombre },
    { id: 'codigo', enabled: configuracionCarga.codigo },
    { id: 'marca', enabled: configuracionCarga.marca },
    { id: 'cantidad', enabled: configuracionCarga.cantidad }
  ];
  
  camposBasicos.forEach(campo => {
    const elemento = document.getElementById(campo.id);
    if(elemento) {
      const container = elemento.closest('.input-group-pro');
      if(container) {
        container.style.display = campo.enabled ? 'block' : 'none';
        // Ocultar asterisco si el campo no está habilitado
        const required = container.querySelector('.required');
        if(required) {
          required.style.display = campo.enabled ? 'inline' : 'none';
        }
      }
    }
  });
  
  // Reorganizar grid layout
  reorganizarGrid();
  
  // Manejo especial para secciones completas
  const sections = document.querySelectorAll('.form-section');
  sections.forEach(section => {
    if(section.querySelector('.image-upload-container')) {
      section.style.display = configuracionCarga.foto ? "block" : "none";
    }
    if(section.querySelector('#grupo')) {
      section.style.display = configuracionCarga.grupo ? "block" : "none";
    }
  });
}

function reorganizarGrid() {
  const filas = document.querySelectorAll('.form-row');
  
  filas.forEach(fila => {
    const camposVisibles = Array.from(fila.children).filter(child => 
      window.getComputedStyle(child).display !== 'none'
    );
    
    if(camposVisibles.length === 1) {
      fila.style.gridTemplateColumns = '1fr';
      fila.style.justifyItems = 'center';
      camposVisibles[0].style.maxWidth = '400px';
    } else if(camposVisibles.length === 2) {
      fila.style.gridTemplateColumns = '1fr 1fr';
      fila.style.justifyItems = 'stretch';
      camposVisibles.forEach(campo => {
        campo.style.maxWidth = 'none';
      });
    }
    
    // Ocultar fila si no tiene campos visibles
    if(camposVisibles.length === 0) {
      fila.style.display = 'none';
    } else {
      fila.style.display = 'grid';
    }
  });
}

function cargarConfiguracionCarga() {
  document.getElementById("habilitarNombre").checked = configuracionCarga.nombre;
  document.getElementById("habilitarCodigo").checked = configuracionCarga.codigo;
  document.getElementById("habilitarMarca").checked = configuracionCarga.marca;
  document.getElementById("habilitarCantidad").checked = configuracionCarga.cantidad;
  document.getElementById("habilitarGrupo").checked = configuracionCarga.grupo;
  document.getElementById("habilitarFoto").checked = configuracionCarga.foto;
  actualizarFormulario();
}

// --- MODO EDICION ---
function toggleEditMode() {
  modoEdicion = !modoEdicion;
  const btn = document.querySelector('.edit-mode-btn');
  
  if(modoEdicion) {
    btn.classList.add('active');
    btn.title = 'Salir del modo edición';
  } else {
    btn.classList.remove('active');
    btn.title = 'Modo edición';
  }
  
  renderizar();
}

function toggleVisibilidad(index) {
  if(articulos[index].visible === undefined) {
    articulos[index].visible = true;
  }
  articulos[index].visible = !articulos[index].visible;
  guardar();
  aplicarFiltros();
}

// Función para actualizar el nombre del archivo
function actualizarNombreArchivo() {
  const input = document.getElementById("foto");
  const textSpan = document.querySelector('.file-input-text');
  
  if(input.files && input.files[0]) {
    textSpan.textContent = `📎 ${input.files[0].name}`;
    textSpan.style.color = '#667eea';
    textSpan.style.fontWeight = '600';
  } else {
    textSpan.textContent = 'Sin imagen seleccionada';
    textSpan.style.color = '#7f8c8d';
    textSpan.style.fontWeight = 'normal';
  }
}

// Mostrar información del usuario logueado
function mostrarInfoUsuario() {
  // Esta función ahora se maneja desde auth.js con updateUserInfo()
  // Solo mantenemos compatibilidad
}

window.onload = function() {
  // Solo inicializar si hay datos de usuario (se cargan desde auth.js)
  if (userId) {
    initializeApp();
  }
};

function initializeApp() {
  cargarGrupos();
  renderizar();
  cargarConfiguracionCarga();
  
  // Cargar el stock mínimo en el input
  const cantidadMinima = document.getElementById("cantidadMinima");
  if (cantidadMinima) {
    cantidadMinima.value = stockMinimo;
  }
  
  // Event listener para el input de archivo
  const fotoInput = document.getElementById("foto");
  if(fotoInput) {
    fotoInput.addEventListener('change', actualizarNombreArchivo);
  }
  
  // Cerrar todas las secciones de la sidebar por defecto
  inicializarSidebar();
  
  // Aplicar la reorganización inicial del formulario
  setTimeout(() => {
    actualizarFormulario();
  }, 200);
}

// Función para inicializar todas las secciones de la sidebar como cerradas
function inicializarSidebar() {
  // Lista de todas las secciones de la sidebar
  const secciones = ['configuracionCarga', 'gestionGrupos', 'proximamente'];
  
  secciones.forEach(seccionId => {
    const content = document.getElementById(seccionId);
    const arrow = document.getElementById(`arrow-${seccionId}`);
    
    if(content && arrow) {
      content.classList.add("collapsed");
      arrow.classList.add("rotated");
      arrow.innerHTML = '<i class="ph ph-caret-right"></i>';
    }
  });
}

// Toggle del formulario de productos
function toggleFormularioProducto() {
  const formContainer = document.querySelector('.product-form-container');
  const formContent = document.getElementById('form-content-collapsible');
  const formActions = document.getElementById('form-actions-collapsible');
  const toggleIcon = document.getElementById('formulario-toggle-icon');
  
  const isCollapsed = formContent.classList.contains('form-content-collapsed');
  
  if(isCollapsed) {
    // Expandir - mostrar X
    formContainer.classList.remove('collapsed');
    formContent.classList.remove('form-content-collapsed');
    formActions.classList.remove('form-actions-collapsed');
    toggleIcon.className = 'ph ph-x';
  } else {
    // Colapsar - mostrar +
    formContainer.classList.add('collapsed');
    formContent.classList.add('form-content-collapsed');
    formActions.classList.add('form-actions-collapsed');
    toggleIcon.className = 'ph ph-plus';
  }
}

// Función para cambiar visibilidad de un artículo
function toggleVisibilidad(index) {
  const articulo = articulos[index];
  const estadoAnterior = articulo.visible !== false;
  
  // Cambiar el estado de visibilidad
  articulo.visible = !estadoAnterior;
  guardar();
  
  // Lógica inteligente según el filtro actual
  if(filtroActual.visibilidad === 'todos') {
    // Si estamos en "todos", mantener el artículo visible en la lista
    renderizar();
  } else if(filtroActual.visibilidad === 'visibles' && !articulo.visible) {
    // Si estamos en "solo visibles" y ocultamos el artículo, cambiamos a "ocultos"
    filtroActual.visibilidad = 'ocultos';
    // Actualizar el radio button correspondiente
    document.querySelector('input[name="filtroVis"][value="ocultos"]').checked = true;
    aplicarFiltros();
  } else if(filtroActual.visibilidad === 'ocultos' && articulo.visible) {
    // Si estamos en "ocultos" y mostramos el artículo, cambiamos a "visibles"
    filtroActual.visibilidad = 'visibles';
    // Actualizar el radio button correspondiente
    document.querySelector('input[name="filtroVis"][value="visibles"]').checked = true;
    aplicarFiltros();
  } else {
    // En otros casos, simplemente re-renderizar
    renderizar();
  }
}

// Función para el botón de modo edición
function toggleEditMode() {
  modoEdicion = !modoEdicion;
  const editBtn = document.querySelector('.edit-mode-btn');
  
  if(modoEdicion) {
    // Activar modo edición
    editBtn.classList.add('active');
    editBtn.innerHTML = '<i class="ph ph-check"></i>';
    editBtn.title = 'Salir del modo edición';
    
    // Si hay filtros activos, aplicar filtros para mostrar solo artículos filtrados en modo edición
    if(filtroActual.texto || filtroActual.grupo || filtroActual.visibilidad || filtroActual.stock !== 'todos') {
      aplicarFiltros();
    } else {
      renderizar();
    }
  } else {
    // Desactivar modo edición
    editBtn.classList.remove('active');
    editBtn.innerHTML = '<i class="ph ph-pencil-simple"></i>';
    editBtn.title = 'Modo edición';
    
    // Volver a la vista normal (respetando filtros)
    if(filtroActual.texto || filtroActual.grupo || filtroActual.visibilidad || filtroActual.stock !== 'todos') {
      aplicarFiltros();
    } else {
      renderizar();
    }
  }
}

// Función para cargar grupos en el formulario
function cargarGruposEnFormulario() {
  const selectGrupo = document.getElementById("grupo");
  if (selectGrupo) {
    selectGrupo.innerHTML = '<option value="">Seleccionar grupo...</option>';
    grupos.forEach(grupo => {
      if (grupo !== "Sin grupo") {
        selectGrupo.innerHTML += `<option value="${grupo}">${grupo}</option>`;
      }
    });
  }
}

// Inicialización cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
  renderizar(); // Cargar artículos (solo visibles por defecto)
  cargarGruposEnFormulario();
  cargarGruposEnFiltro();
  
  // Cerrar dropdowns al hacer clic fuera
  document.addEventListener('click', function(event) {
    const isFilterButton = event.target.closest('.fixed-filter-icon');
    const isDropdown = event.target.closest('.filter-dropdown');
    
    if(!isFilterButton && !isDropdown) {
      const dropdowns = ['filtroGrupos', 'filtroVisibilidad', 'filtroStock'];
      dropdowns.forEach(id => {
        document.getElementById(id).style.display = 'none';
      });
    }
  });
});

