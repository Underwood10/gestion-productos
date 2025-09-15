// ========================================
// OPERACIONES DE BASE DE DATOS SUPABASE
// ========================================

// Variables globales para sincronización
let isOnline = navigator.onLine;
let pendingSync = [];

// Verificar estado de conexión
window.addEventListener('online', () => {
  isOnline = true;
  syncPendingChanges();
});

window.addEventListener('offline', () => {
  isOnline = false;
});

// ========================================
// FUNCIONES DE PRODUCTOS
// ========================================

async function cargarProductosDB() {
  if (!supabase || !currentUser) {
    console.warn('Supabase o usuario no disponible');
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('marca', { ascending: true })
      .order('nombre', { ascending: true });
    
    if (error) {
      console.error('Error cargando productos:', error);
      return getLocalProducts(); // Fallback a localStorage
    }
    
    // Guardar en localStorage como backup
    localStorage.setItem('productos_backup_' + currentUser.id, JSON.stringify(data));
    return data || [];
    
  } catch (error) {
    console.error('Error de conexión:', error);
    return getLocalProducts(); // Fallback a localStorage
  }
}

async function guardarProductoDB(producto) {
  if (!supabase || !currentUser) {
    console.warn('Guardando en localStorage: Supabase no disponible');
    saveLocalProduct(producto);
    return;
  }
  
  try {
    // Preparar datos para insertar
    const productoData = {
      user_id: currentUser.id,
      nombre: producto.nombre,
      marca: producto.marca,
      codigo: producto.codigo,
      cantidad: producto.cantidad || 0,
      grupo: producto.grupo || null,
      foto: producto.foto || null,
      faltante: producto.faltante || false,
      visible: producto.visible !== false
    };
    
    const { data, error } = await supabase
      .from('productos')
      .insert([productoData])
      .select()
      .single();
    
    if (error) {
      console.error('Error guardando producto:', error);
      saveLocalProduct(producto);
      return null;
    }
    
    console.log('Producto guardado en Supabase:', data);
    return data;
    
  } catch (error) {
    console.error('Error de conexión guardando producto:', error);
    saveLocalProduct(producto);
    return null;
  }
}

async function actualizarProductoDB(id, cambios) {
  if (!supabase || !currentUser) {
    console.warn('Actualizando localStorage: Supabase no disponible');
    updateLocalProduct(id, cambios);
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('productos')
      .update(cambios)
      .eq('id', id)
      .eq('user_id', currentUser.id)
      .select()
      .single();
    
    if (error) {
      console.error('Error actualizando producto:', error);
      updateLocalProduct(id, cambios);
      return null;
    }
    
    return data;
    
  } catch (error) {
    console.error('Error de conexión actualizando producto:', error);
    updateLocalProduct(id, cambios);
    return null;
  }
}

async function eliminarProductoDB(id) {
  if (!supabase || !currentUser) {
    console.warn('Eliminando de localStorage: Supabase no disponible');
    deleteLocalProduct(id);
    return;
  }
  
  try {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);
    
    if (error) {
      console.error('Error eliminando producto:', error);
      deleteLocalProduct(id);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error de conexión eliminando producto:', error);
    deleteLocalProduct(id);
    return false;
  }
}

// ========================================
// FUNCIONES DE GRUPOS
// ========================================

async function cargarGruposDB() {
  if (!supabase || !currentUser) {
    console.warn('Supabase o usuario no disponible');
    return getLocalGroups();
  }
  
  try {
    const { data, error } = await supabase
      .from('grupos')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('nombre', { ascending: true });
    
    if (error) {
      console.error('Error cargando grupos:', error);
      return getLocalGroups();
    }
    
    // Guardar en localStorage como backup
    const gruposArray = data.map(g => g.nombre);
    localStorage.setItem('grupos_backup_' + currentUser.id, JSON.stringify(gruposArray));
    return gruposArray;
    
  } catch (error) {
    console.error('Error de conexión cargando grupos:', error);
    return getLocalGroups();
  }
}

async function guardarGrupoDB(nombreGrupo) {
  if (!supabase || !currentUser) {
    console.warn('Guardando grupo en localStorage: Supabase no disponible');
    saveLocalGroup(nombreGrupo);
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('grupos')
      .insert([{
        user_id: currentUser.id,
        nombre: nombreGrupo
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error guardando grupo:', error);
      saveLocalGroup(nombreGrupo);
      return null;
    }
    
    return data;
    
  } catch (error) {
    console.error('Error de conexión guardando grupo:', error);
    saveLocalGroup(nombreGrupo);
    return null;
  }
}

async function eliminarGrupoDB(nombreGrupo) {
  if (!supabase || !currentUser) {
    console.warn('Eliminando grupo de localStorage: Supabase no disponible');
    deleteLocalGroup(nombreGrupo);
    return;
  }
  
  try {
    const { error } = await supabase
      .from('grupos')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('nombre', nombreGrupo);
    
    if (error) {
      console.error('Error eliminando grupo:', error);
      deleteLocalGroup(nombreGrupo);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error de conexión eliminando grupo:', error);
    deleteLocalGroup(nombreGrupo);
    return false;
  }
}

// ========================================
// FUNCIONES DE CONFIGURACIÓN
// ========================================

async function cargarConfiguracionDB() {
  if (!supabase || !currentUser) {
    console.warn('Supabase o usuario no disponible');
    return getLocalConfig();
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracion_usuario')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No existe configuración, crear una nueva
        await crearConfiguracionInicialDB();
        return getDefaultConfig();
      }
      console.error('Error cargando configuración:', error);
      return getLocalConfig();
    }
    
    return {
      stockMinimo: data.stock_minimo,
      configuracionCarga: data.configuracion_carga
    };
    
  } catch (error) {
    console.error('Error de conexión cargando configuración:', error);
    return getLocalConfig();
  }
}

async function guardarConfiguracionDB(stockMinimo, configuracionCarga) {
  if (!supabase || !currentUser) {
    console.warn('Guardando configuración en localStorage: Supabase no disponible');
    saveLocalConfig(stockMinimo, configuracionCarga);
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracion_usuario')
      .upsert({
        user_id: currentUser.id,
        stock_minimo: stockMinimo,
        configuracion_carga: configuracionCarga
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error guardando configuración:', error);
      saveLocalConfig(stockMinimo, configuracionCarga);
      return null;
    }
    
    return data;
    
  } catch (error) {
    console.error('Error de conexión guardando configuración:', error);
    saveLocalConfig(stockMinimo, configuracionCarga);
    return null;
  }
}

async function crearConfiguracionInicialDB() {
  const configDefault = getDefaultConfig();
  return await guardarConfiguracionDB(configDefault.stockMinimo, configDefault.configuracionCarga);
}

// ========================================
// FUNCIONES DE FALLBACK (localStorage)
// ========================================

function getLocalProducts() {
  if (!currentUser) return [];
  return JSON.parse(localStorage.getItem('productos_backup_' + currentUser.id)) || [];
}

function saveLocalProduct(producto) {
  if (!currentUser) return;
  const productos = getLocalProducts();
  productos.push({ ...producto, id: Date.now().toString() });
  localStorage.setItem('productos_backup_' + currentUser.id, JSON.stringify(productos));
}

function updateLocalProduct(id, cambios) {
  if (!currentUser) return;
  const productos = getLocalProducts();
  const index = productos.findIndex(p => p.id === id);
  if (index >= 0) {
    productos[index] = { ...productos[index], ...cambios };
    localStorage.setItem('productos_backup_' + currentUser.id, JSON.stringify(productos));
  }
}

function deleteLocalProduct(id) {
  if (!currentUser) return;
  const productos = getLocalProducts();
  const filtered = productos.filter(p => p.id !== id);
  localStorage.setItem('productos_backup_' + currentUser.id, JSON.stringify(filtered));
}

function getLocalGroups() {
  if (!currentUser) return ['Sin grupo'];
  return JSON.parse(localStorage.getItem('grupos_backup_' + currentUser.id)) || ['Sin grupo'];
}

function saveLocalGroup(nombreGrupo) {
  if (!currentUser) return;
  const grupos = getLocalGroups();
  if (!grupos.includes(nombreGrupo)) {
    grupos.push(nombreGrupo);
    localStorage.setItem('grupos_backup_' + currentUser.id, JSON.stringify(grupos));
  }
}

function deleteLocalGroup(nombreGrupo) {
  if (!currentUser) return;
  const grupos = getLocalGroups();
  const filtered = grupos.filter(g => g !== nombreGrupo);
  localStorage.setItem('grupos_backup_' + currentUser.id, JSON.stringify(filtered));
}

function getLocalConfig() {
  if (!currentUser) return getDefaultConfig();
  const config = localStorage.getItem('configuracion_backup_' + currentUser.id);
  return config ? JSON.parse(config) : getDefaultConfig();
}

function saveLocalConfig(stockMinimo, configuracionCarga) {
  if (!currentUser) return;
  const config = { stockMinimo, configuracionCarga };
  localStorage.setItem('configuracion_backup_' + currentUser.id, JSON.stringify(config));
}

function getDefaultConfig() {
  return {
    stockMinimo: 5,
    configuracionCarga: {
      nombre: true,
      marca: true,
      codigo: true,
      cantidad: true,
      grupo: true,
      foto: true
    }
  };
}

// ========================================
// SINCRONIZACIÓN Y MIGRACIÓN
// ========================================

async function migrarDatosLocalASupabase() {
  if (!supabase || !currentUser) return;
  
  console.log('Migrando datos locales a Supabase...');
  
  try {
    // Migrar productos
    const productosLocales = JSON.parse(localStorage.getItem("articulos_" + currentUser.id)) || [];
    for (const producto of productosLocales) {
      await guardarProductoDB(producto);
    }
    
    // Migrar grupos
    const gruposLocales = JSON.parse(localStorage.getItem("grupos_" + currentUser.id)) || [];
    for (const grupo of gruposLocales) {
      if (grupo !== 'Sin grupo') {
        await guardarGrupoDB(grupo);
      }
    }
    
    // Migrar configuración
    const stockMinimo = parseInt(localStorage.getItem("stockMinimo_" + currentUser.id)) || 5;
    const configuracionCarga = JSON.parse(localStorage.getItem("configuracionCarga_" + currentUser.id)) || getDefaultConfig().configuracionCarga;
    await guardarConfiguracionDB(stockMinimo, configuracionCarga);
    
    console.log('Migración completada');
    
  } catch (error) {
    console.error('Error durante la migración:', error);
  }
}

async function syncPendingChanges() {
  // Implementar sincronización de cambios pendientes cuando vuelva la conexión
  if (pendingSync.length > 0) {
    console.log('Sincronizando cambios pendientes...');
    // TODO: Implementar lógica de sincronización
    pendingSync = [];
  }
}

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

function showConnectionStatus() {
  const status = isOnline ? 'En línea' : 'Sin conexión';
  const color = isOnline ? 'green' : 'orange';
  console.log(`%c${status}`, `color: ${color}; font-weight: bold;`);
}

// Mostrar estado de conexión al cargar
showConnectionStatus();