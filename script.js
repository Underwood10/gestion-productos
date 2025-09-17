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
        cargarDescuentosDesdeStorage();
        cargarMarcasEnSelect();
        actualizarListaDescuentosActivos();
        inicializarCarrito();
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

// Función para obtener clase de stock
function getStockClass(cantidad) {
  if (cantidad === undefined || cantidad === null) return 'stock-sin';
  if (cantidad === 0) return 'stock-sin';
  if (cantidad <= stockMinimo) return 'stock-bajo';
  if (cantidad <= stockMinimo * 2) return 'stock-medio';
  return 'stock-alto';
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

    // Calcular precio con descuentos
    const precioInfo = calcularPrecioConDescuento(art);
    const tieneDescuento = precioInfo.tieneDescuento;

    contenedor.innerHTML += `
      <div class="producto-item ${esPedir?'producto-marcado':''} ${modoEdicion?'edit-mode':''} ${art.visible === false ? 'producto-oculto' : ''}">
        <div class="producto-imagen">
          ${art.foto ? `<img src="${art.foto}" alt="${art.nombre}">` : '<div class="no-image"><i class="ph ph-image"></i></div>'}
        </div>
        <div class="producto-info">
          <h3>${art.nombre}</h3>
          <p class="producto-marca">${art.marca}</p>
          <div class="producto-codigo">Código: ${art.codigo}</div>
          <div class="producto-precio">
            ${tieneDescuento ?
              `<span class="precio-anterior">$${(art.precio_mayorista || 0).toFixed(2)}</span>
               <span class="precio-actual">$${calcularPrecioMayoristaConDescuento(art).toFixed(2)}</span>
               <span class="descuento-badge">${precioInfo.descuento}% OFF</span>` :
              `$${(art.precio_mayorista || 0).toFixed(2)}`
            }
          </div>
          <div class="producto-stock">
            <span class="stock-badge ${getStockClass(art.cantidad)}">
              Stock: <span onclick="editarStockInline(${realIndex})" style="cursor: pointer;" id="stock-${realIndex}">${art.cantidad !== undefined ? art.cantidad : 'No definido'}</span>
            </span>
          </div>
          <div class="producto-actions">
            ${modoEdicion ? `
              <button class="btn-producto btn-editar" onclick="abrirEditar(${realIndex})" title="Editar">
                <i class="ph ph-pencil"></i>
              </button>
              <button class="btn-producto btn-eliminar" onclick="abrirEliminar(${realIndex})" title="Eliminar">
                <i class="ph ph-trash"></i>
              </button>
              <button class="btn-producto btn-ocultar" onclick="toggleVisibilidad(${realIndex})" title="${art.visible !== false ? 'Ocultar' : 'Mostrar'}">
                <i class="ph ${art.visible !== false ? 'ph-eye' : 'ph-eye-slash'}"></i>
              </button>
            ` : ''}
            <button class="btn-producto btn-marcar ${art.faltante ? 'marcado' : ''}" onclick="marcarFaltanteIndex(${realIndex})">
              <i class="ph ${art.faltante?'ph-check':'ph-shopping-cart'}"></i>
              ${art.faltante?"Disponible":(isAdmin() ? "Solo" : "Pedir")}
            </button>
          </div>
        </div>
        <div class="acciones-con-cantidad" style="display: none;">
          <button class="quantity-btn minus" onclick="cambiarCantidad(${realIndex}, -1)">
            <i class="ph ph-minus"></i>
          </button>
          <button class="quantity-btn" onclick="cambiarCantidad(${realIndex}, 1)">
            <i class="ph ph-plus"></i>
          </button>
        </div>
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
  const precioMayorista = parseFloat(document.getElementById("precioMayorista").value) || 0;
  
  // Validar solo campos habilitados y obligatorios según configuración
  const camposObligatorios = [];
  if(configuracionCarga.nombre && !document.getElementById("nombre").value.trim()) camposObligatorios.push("Nombre");
  if(configuracionCarga.marca && !document.getElementById("marca").value.trim()) camposObligatorios.push("Marca");
  if(configuracionCarga.codigo && !document.getElementById("codigo").value.trim()) camposObligatorios.push("Código");
  if(!precioMayorista || precioMayorista <= 0) camposObligatorios.push("Precio Mayorista");
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
      precio_mayorista: precioMayorista,
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
  document.getElementById("precioMayorista").value="";
  
  // Resetear el texto del archivo
  const textSpan = document.querySelector('.file-input-text');
  if(textSpan) {
    textSpan.textContent = 'Seleccionar imagen...';
    textSpan.style.color = '#7f8c8d';
  }
}

// Variables globales para el carrito
let carrito = [];
let totalCarrito = 0;

// Faltante
function marcarFaltanteIndex(index) {
  if (isAdmin()) {
    // Para admin: comportamiento original (solo marcar faltante)
    articulos[index].faltante = !articulos[index].faltante;
    guardar();
    renderizar();
  } else {
    // Para usuarios normales: agregar al carrito
    if (!articulos[index].faltante) {
      // Agregar al carrito
      const producto = articulos[index];
      const precioInfo = calcularPrecioConDescuento(producto);

      const itemCarrito = {
        id: producto.id,
        nombre: producto.nombre,
        marca: producto.marca,
        codigo: producto.codigo,
        precio: precioInfo.precio,
        descuento: precioInfo.descuento,
        tieneDescuento: precioInfo.tieneDescuento
      };

      carrito.push(itemCarrito);
      articulos[index].faltante = true; // Marcar como "en carrito"
      actualizarCarrito();
      guardar();
      renderizar();
    } else {
      // Remover del carrito
      const producto = articulos[index];
      carrito = carrito.filter(item => item.id !== producto.id);
      articulos[index].faltante = false;
      actualizarCarrito();
      guardar();
      renderizar();
    }
  }
}

// Función para inicializar el carrito según el rol del usuario
function inicializarCarrito() {
  const carritoDisplay = document.getElementById('carrito-display');

  if (carritoDisplay) {
    if (isAdmin()) {
      // Para admin: ocultar carrito completamente
      carritoDisplay.style.display = 'none';
    } else {
      // Para usuarios normales: mostrar carrito si hay items
      actualizarCarrito();
    }
  }
}

// Función para actualizar el carrito
function actualizarCarrito() {
  totalCarrito = carrito.reduce((total, item) => total + item.precio, 0);
  actualizarDisplayCarrito();
}

// Función para actualizar la visualización del carrito
function actualizarDisplayCarrito() {
  const carritoElement = document.getElementById('carrito-display');
  const carritoCount = document.getElementById('carrito-count');
  const carritoTotal = document.getElementById('carrito-total');

  if (carritoElement) {
    if (carrito.length === 0) {
      carritoElement.style.display = 'none';
    } else {
      carritoElement.style.display = 'block';

      if (carritoCount) {
        carritoCount.textContent = carrito.length;
      }

      if (carritoTotal) {
        carritoTotal.textContent = totalCarrito.toFixed(2);
      }

      // Actualizar lista de productos en el carrito
      const carritoLista = document.getElementById('carrito-lista');
      if (carritoLista) {
        carritoLista.innerHTML = carrito.map(item => `
          <div class="carrito-item">
            <div class="carrito-item-info">
              <strong>${item.nombre}</strong>
              <small>${item.marca} - ${item.codigo}</small>
            </div>
            <div class="carrito-item-precio">
              ${item.tieneDescuento ?
                `<span class="precio-descuento">$${item.precio.toFixed(2)} <small>(${item.descuento}% OFF)</small></span>` :
                `$${item.precio.toFixed(2)}`
              }
            </div>
            <button class="carrito-remove-btn" onclick="removerDelCarrito('${item.id}')">
              <i class="ph ph-x"></i>
            </button>
          </div>
        `).join('');
      }
    }
  }
}

// Función para remover un item del carrito
function removerDelCarrito(itemId) {
  carrito = carrito.filter(item => item.id !== itemId);

  // Encontrar el producto en articulos y desmarcarlo
  const productIndex = articulos.findIndex(art => art.id === itemId);
  if (productIndex >= 0) {
    articulos[productIndex].faltante = false;
  }

  actualizarCarrito();
  guardar();
  renderizar();
}

// Función para vaciar el carrito
function vaciarCarrito() {
  if (carrito.length === 0) return;

  if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
    // Desmarcar todos los productos del carrito
    carrito.forEach(item => {
      const productIndex = articulos.findIndex(art => art.id === item.id);
      if (productIndex >= 0) {
        articulos[productIndex].faltante = false;
      }
    });

    carrito = [];
    actualizarCarrito();
    guardar();
    renderizar();
  }
}

// Función para toggle del carrito
function toggleCarrito() {
  const carritoPanel = document.getElementById('carrito-panel');
  const toggleIcon = document.querySelector('.carrito-toggle-icon');

  if (carritoPanel) {
    if (carritoPanel.style.display === 'block') {
      carritoPanel.style.display = 'none';
      if (toggleIcon) toggleIcon.className = 'ph ph-caret-down carrito-toggle-icon';
    } else {
      carritoPanel.style.display = 'block';
      if (toggleIcon) toggleIcon.className = 'ph ph-caret-up carrito-toggle-icon';
    }
  }
}

// Función para procesar el pedido
function procesarPedido() {
  if (carrito.length === 0) {
    alert('El carrito está vacío');
    return;
  }

  // Crear resumen del pedido
  let resumen = 'RESUMEN DEL PEDIDO\n\n';
  resumen += `Productos (${carrito.length}):\n`;
  resumen += '------------------------\n';

  carrito.forEach(item => {
    resumen += `• ${item.nombre}\n`;
    resumen += `  Marca: ${item.marca}\n`;
    resumen += `  Código: ${item.codigo}\n`;
    if (item.tieneDescuento) {
      resumen += `  Precio: $${item.precio.toFixed(2)} (${item.descuento}% OFF)\n`;
    } else {
      resumen += `  Precio: $${item.precio.toFixed(2)}\n`;
    }
    resumen += '\n';
  });

  resumen += '------------------------\n';
  resumen += `TOTAL: $${totalCarrito.toFixed(2)}\n`;

  if (confirm(`${resumen}\n¿Confirmar pedido?`)) {
    // Aquí se podría implementar envío de email o almacenamiento del pedido
    alert('Pedido procesado exitosamente. En breve nos pondremos en contacto contigo.');

    // Limpiar carrito después del pedido
    carrito.forEach(item => {
      const productIndex = articulos.findIndex(art => art.id === item.id);
      if (productIndex >= 0) {
        articulos[productIndex].faltante = false;
      }
    });

    carrito = [];
    actualizarCarrito();
    guardar();
    renderizar();
  }
}

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
  document.getElementById("editPrecioMayorista").value=art.precio_mayorista || 0;
  document.getElementById("editFoto").src=art.foto;
  document.getElementById("editArchivo").value="";
  document.getElementById("modalEditar").classList.add("show");
}
async function guardarEdicion(){
  const nuevoNombre=capitalizar(document.getElementById("editNombre").value);
  const nuevaMarca=capitalizar(document.getElementById("editMarca").value);
  const nuevoCodigo=document.getElementById("editCodigo").value.trim();
  const nuevaCantidad=parseInt(document.getElementById("editCantidad").value) || 0;
  const nuevoGrupo=document.getElementById("editGrupo").value;
  const nuevoPrecioMayorista=parseFloat(document.getElementById("editPrecioMayorista").value) || 0;
  const archivo=document.getElementById("editArchivo").files[0];

  if(!nuevoNombre||!nuevaMarca||!nuevoCodigo){alert("Completa todos los campos obligatorios");return;}
  if(nuevoPrecioMayorista <= 0){alert("El precio mayorista debe ser mayor a 0");return;}

  // Actualizar datos locales
  articulos[indiceEditar].nombre=nuevoNombre;
  articulos[indiceEditar].marca=nuevaMarca;
  articulos[indiceEditar].codigo=nuevoCodigo;
  articulos[indiceEditar].cantidad=nuevaCantidad;
  articulos[indiceEditar].grupo=nuevoGrupo;
  articulos[indiceEditar].precio_mayorista=nuevoPrecioMayorista;

  // Actualizar en Supabase
  const cambios = {
    nombre: nuevoNombre,
    marca: nuevaMarca,
    codigo: nuevoCodigo,
    cantidad: nuevaCantidad,
    grupo: nuevoGrupo,
    precio_mayorista: nuevoPrecioMayorista
  };

  if(archivo){
    const lector=new FileReader();
    lector.onload=async e=>{
      articulos[indiceEditar].foto=e.target.result;
      cambios.foto = e.target.result;
      await actualizarProductoDB(articulos[indiceEditar].id, cambios);
      await guardar();
      renderizar();
      cerrarModal();
    };
    lector.readAsDataURL(archivo);
  }else{
    await actualizarProductoDB(articulos[indiceEditar].id, cambios);
    await guardar();
    renderizar();
    cerrarModal();
  }
}
function cerrarModal(){ document.getElementById("modalEditar").classList.remove("show"); }

// --- ELIMINAR ---
function abrirEliminar(index){ 
  indiceEliminar=index; 
  document.getElementById("modalEliminar").classList.add("show"); 
}
function confirmarEliminar(){ 
  articulos.splice(indiceEliminar,1); 
  guardar(); 
  renderizar(); 
  document.getElementById("modalEliminar").classList.remove("show");
}
function cancelarEliminar(){ 
  document.getElementById("modalEliminar").classList.remove("show"); 
}

// --- BUSCADOR ---
// La función filtrar está ahora implementada más abajo para manejar también filtros por grupo

// --- EXCEL ---
function descargarExcel() {
  const modal = document.getElementById("modalExcelInfo");
  if(modal) {
    modal.classList.add("show");
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
  document.getElementById("modalExcelInfo").classList.remove("show");
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
  document.getElementById('modalConfirmReset').classList.add('show');
}

// Función para cancelar el reset
function cancelarReset() {
  document.getElementById('modalConfirmReset').classList.remove('show');
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
  document.getElementById('modalConfirmReset').classList.remove('show');
  
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
  
  if(sidebar.classList.contains("open")) {
    // Cerrar sidebar
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  } else {
    // Abrir sidebar
    cargarGrupos();
    renderizarGrupos();
    sidebar.classList.add("open");
    overlay.classList.add("open");
  }
}

function cerrarConfiguracion() {
  document.getElementById("sidebarConfiguracion").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
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
    selectGrupo.innerHTML = '<option value="" data-placeholder="true"><i class="ph ph-folder"></i> Seleccionar grupo...</option>';
    grupos.forEach(grupo => {
      if (grupo !== "Sin grupo") {
        selectGrupo.innerHTML += `<option value="${grupo}"><i class="ph ph-folder-open"></i> ${grupo}</option>`;
      }
    });
  }
  
  if(selectEditGrupo) {
    selectEditGrupo.innerHTML = '<option value="" data-placeholder="true"><i class="ph ph-folder"></i> Seleccionar grupo</option>';
    grupos.forEach(grupo => {
      if (grupo !== "Sin grupo") {
        selectEditGrupo.innerHTML += `<option value="${grupo}"><i class="ph ph-folder-open"></i> ${grupo}</option>`;
      }
    });
  }
  
  if(selectFiltroGrupo) {
    selectFiltroGrupo.innerHTML = '<option value="" data-placeholder="true"><i class="ph ph-folders"></i> Todos los grupos</option>';
    grupos.forEach(grupo => {
      selectFiltroGrupo.innerHTML += `<option value="${grupo}"><i class="ph ph-folder-open"></i> ${grupo}</option>`;
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
            <i class="ph ${art.faltante?'ph-check':'ph-shopping-cart'}"></i> ${art.faltante?"Disponible":(isAdmin() ? "Solo" : "Pedir")}
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
    textSpan.innerHTML = `<i class="ph ph-paperclip"></i> ${input.files[0].name}`;
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
  inicializarCarrito();
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

// ========== FUNCIONES DE DESCUENTOS POR MARCA ==========
let descuentosPorMarca = {}; // {marca: porcentaje}

function calcularPrecioConDescuento(producto) {
  const precioBaseMayorista = producto.precio_mayorista || 0;
  const descuentoMarca = descuentosPorMarca[producto.marca] || 0;

  if (descuentoMarca > 0) {
    const precioConDescuento = precioBaseMayorista * (1 - descuentoMarca / 100);
    return {
      precio: precioConDescuento,
      descuento: descuentoMarca,
      tieneDescuento: true
    };
  }

  return {
    precio: precioBaseMayorista,
    descuento: 0,
    tieneDescuento: false
  };
}

function calcularPrecioMayoristaConDescuento(producto) {
  const precioBaseMayorista = producto.precio_mayorista || 0;
  const descuentoMarca = descuentosPorMarca[producto.marca] || 0;

  if (descuentoMarca > 0) {
    return precioBaseMayorista * (1 - descuentoMarca / 100);
  }

  return precioBaseMayorista;
}

async function cargarMarcasEnSelect() {
  const selectMarca = document.getElementById("marcaDescuento");
  if (!selectMarca) return;

  // Obtener marcas únicas de los productos
  const marcasUnicas = [...new Set(articulos.map(art => art.marca))].filter(marca => marca && marca !== "Sin marca");

  selectMarca.innerHTML = '<option value="">Seleccionar marca...</option>';
  marcasUnicas.forEach(marca => {
    selectMarca.innerHTML += `<option value="${marca}">${marca}</option>`;
  });
}

async function aplicarDescuentoPorMarca() {
  const marca = document.getElementById("marcaDescuento").value;
  const porcentaje = parseInt(document.getElementById("porcentajeDescuento").value) || 0;

  if (!marca) {
    alert("Selecciona una marca");
    return;
  }

  if (porcentaje < 0 || porcentaje > 100) {
    alert("El porcentaje debe estar entre 0 y 100");
    return;
  }

  // Aplicar descuento
  descuentosPorMarca[marca] = porcentaje;

  // Guardar en localStorage
  localStorage.setItem("descuentosPorMarca_" + userId, JSON.stringify(descuentosPorMarca));

  alert(`Descuento del ${porcentaje}% aplicado a la marca ${marca}`);

  // Actualizar vista
  renderizar();
  actualizarListaDescuentosActivos();

  // Limpiar formulario
  document.getElementById("marcaDescuento").value = "";
  document.getElementById("porcentajeDescuento").value = "";
}

async function eliminarDescuentoPorMarca() {
  const marca = document.getElementById("marcaDescuento").value;

  if (!marca) {
    alert("Selecciona una marca");
    return;
  }

  if (descuentosPorMarca[marca]) {
    delete descuentosPorMarca[marca];

    // Guardar en localStorage
    localStorage.setItem("descuentosPorMarca_" + userId, JSON.stringify(descuentosPorMarca));

    alert(`Descuento eliminado para la marca ${marca}`);

    // Actualizar vista
    renderizar();
    actualizarListaDescuentosActivos();

    // Limpiar formulario
    document.getElementById("marcaDescuento").value = "";
    document.getElementById("porcentajeDescuento").value = "";
  } else {
    alert("Esta marca no tiene descuento aplicado");
  }
}

function actualizarListaDescuentosActivos() {
  const container = document.getElementById("descuentosActivosList");
  if (!container) return;

  const descuentos = Object.entries(descuentosPorMarca);

  if (descuentos.length === 0) {
    container.innerHTML = '<p class="no-descuentos">No hay descuentos activos</p>';
    return;
  }

  container.innerHTML = descuentos.map(([marca, porcentaje]) => `
    <div class="descuento-activo">
      <span><strong>${marca}</strong> - ${porcentaje}% OFF</span>
      <button onclick="eliminarDescuentoMarca('${marca}')" class="btn-remove-descuento">
        <i class="ph ph-x"></i>
      </button>
    </div>
  `).join('');
}

function eliminarDescuentoMarca(marca) {
  if (confirm(`¿Eliminar descuento de ${marca}?`)) {
    delete descuentosPorMarca[marca];
    localStorage.setItem("descuentosPorMarca_" + userId, JSON.stringify(descuentosPorMarca));
    renderizar();
    actualizarListaDescuentosActivos();
  }
}

function cargarDescuentosDesdeStorage() {
  if (userId) {
    const descuentosGuardados = localStorage.getItem("descuentosPorMarca_" + userId);
    if (descuentosGuardados) {
      descuentosPorMarca = JSON.parse(descuentosGuardados);
    }
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

