// ========== CONFIGURACIÓN DE SUPABASE ==========
// Las variables se obtienen del archivo config.js
const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY;

// Solo inicializar si las credenciales están configuradas
let supabase = null;
let currentUser = null;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('TU_URL_DE_SUPABASE_AQUI') || SUPABASE_ANON_KEY.includes('TU_CLAVE_ANONIMA_DE_SUPABASE_AQUI')) {
    showAuthMessage('⚠️ Configura primero tus credenciales de Supabase en config.js', 'warning');
    return false;
  }

  try {
    // Verificar que la librería de Supabase esté cargada
    if (!window.supabase || !window.supabase.createClient) {
      console.error('La librería de Supabase no está cargada');
      showAuthMessage('Error: Librería de Supabase no disponible', 'error');
      return false;
    }

    console.log('Inicializando Supabase con:', {
      url: SUPABASE_URL,
      keyLength: SUPABASE_ANON_KEY.length
    });

    // Crear cliente de Supabase
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('✅ Supabase inicializado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error inicializando Supabase:', error);
    showAuthMessage('Error de conexión con Supabase: ' + error.message, 'error');
    return false;
  }
}

// ========== FUNCIONES DE AUTENTICACIÓN ==========
async function login() {
  if (!window.supabase) return;

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showAuthMessage('Por favor completa todos los campos', 'error');
    return;
  }

  const loginBtn = document.getElementById('loginBtn');
  setLoading(loginBtn, true);

  try {
    console.log('🔄 Iniciando sesión con sistema alternativo...');

    // Buscar usuario en nuestra tabla
    const { data: userData, error } = await window.supabase
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !userData) {
      showAuthMessage('Email o contraseña incorrectos', 'error');
      return;
    }

    // Verificar contraseña (codificación simple)
    const passwordMatch = atob(userData.password_hash) === password;

    if (!passwordMatch) {
      showAuthMessage('Email o contraseña incorrectos', 'error');
      return;
    }

    console.log('✅ Credenciales correctas');

    // Verificar estado del usuario
    if (userData.estado === 'pendiente') {
      showAuthMessage('Tu cuenta está pendiente de autorización por el administrador', 'warning');
      return;
    }

    if (userData.estado !== 'autorizado') {
      showAuthMessage('Tu cuenta no está autorizada', 'error');
      return;
    }

    // Login exitoso
    currentUser = {
      id: userData.id,
      email: userData.email,
      user_metadata: {
        full_name: userData.nombre,
        empresa: userData.empresa,
        telefono: userData.telefono
      }
    };

    console.log('✅ Login exitoso:', { email: userData.email, role: userData.role });

    showAuthMessage('¡Bienvenido de vuelta!', 'success');

    setTimeout(async () => {
      const userRole = await checkUserRole(userData.email);
      showAppBasedOnRole(userRole);
    }, 1000);

  } catch (error) {
    console.error('❌ Error en login:', error);
    showAuthMessage('Error de conexión: ' + error.message, 'error');
  } finally {
    setLoading(loginBtn, false);
  }
}

async function register() {
  if (!window.supabase) return;

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const empresa = document.getElementById('registerEmpresa').value.trim();
  const telefono = document.getElementById('registerTelefono').value.trim();
  const password = document.getElementById('registerPassword').value;

  if (!name || !email || !empresa || !telefono || !password) {
    showAuthMessage('Por favor completa todos los campos', 'error');
    return;
  }

  if (password.length < 6) {
    showAuthMessage('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  const registerBtn = document.getElementById('registerBtn');
  setLoading(registerBtn, true);

  try {
    console.log('🔄 Registrando usuario directamente en base de datos...');

    // Verificar si el usuario ya existe
    const { data: existingUser, error: checkError } = await window.supabase
      .from('user_profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      showAuthMessage('Este email ya está registrado', 'error');
      return;
    }

    // Si no existe, crear el registro directamente
    const isAdminUser = email === window.APP_CONFIG.ADMIN_EMAIL;

    const userData = {
      email: email,
      nombre: name,
      empresa: empresa,
      telefono: telefono,
      password_hash: btoa(password), // Codificación simple (no segura para producción)
      estado: isAdminUser ? 'autorizado' : 'pendiente',
      role: isAdminUser ? 'admin' : 'solicitante',
      puede_ver_precios: isAdminUser,
      created_at: new Date().toISOString()
    };

    console.log('📝 Creando registro directo:', { ...userData, password_hash: '[HIDDEN]' });

    const { data, error } = await window.supabase
      .from('user_profiles')
      .insert([userData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando usuario:', error);

      if (error.code === '23505') {
        showAuthMessage('Este email ya está registrado', 'error');
      } else if (error.code === '42501') {
        showAuthMessage('Error de permisos en la base de datos', 'error');
      } else {
        showAuthMessage('Error creando cuenta: ' + error.message, 'error');
      }
      return;
    }

    console.log('✅ Usuario registrado correctamente:', data);

    if (isAdminUser) {
      showAuthMessage('¡Bienvenido Admin! Iniciando sesión...', 'success');
      setTimeout(() => {
        // Simular login del admin
        currentUser = { id: data.id, email: data.email };
        showAppBasedOnRole('admin');
      }, 1000);
    } else {
      showAuthMessage('¡Solicitud enviada correctamente! El administrador revisará tu solicitud.', 'success');
      setTimeout(() => {
        showAuthScreen();
      }, 2000);
    }

  } catch (error) {
    console.error('❌ Error en registro:', error);
    showAuthMessage('Error de conexión: ' + error.message, 'error');
  } finally {
    setLoading(registerBtn, false);
  }
}

async function createUserProfileOnRegister(user, name, empresa, telefono) {
  try {
    const isAdminUser = user.email === window.APP_CONFIG.ADMIN_EMAIL;

    console.log('=== DIAGNÓSTICO DE REGISTRO ===');
    console.log('Creando perfil para:', {
      id: user.id,
      email: user.email,
      nombre: name,
      empresa: empresa,
      telefono: telefono,
      isAdmin: isAdminUser
    });

    // Verificar conexión a Supabase
    if (!window.supabase) {
      throw new Error('Supabase no está inicializado');
    }

    console.log('Supabase conectado correctamente');

    // Verificar si la tabla existe y es accesible
    console.log('Verificando acceso a tabla user_profiles...');
    const { data: testData, error: testError } = await window.supabase
      .from('user_profiles')
      .select('id')
      .limit(1);

    if (testError) {
      console.error('❌ Error de acceso a tabla user_profiles:', {
        code: testError.code,
        message: testError.message,
        details: testError.details,
        hint: testError.hint
      });

      // Verificar si es un problema de RLS
      if (testError.code === '42501' || testError.message.includes('permission denied')) {
        throw new Error('Permisos insuficientes para tabla user_profiles. Verifica las políticas RLS en Supabase.');
      } else if (testError.code === '42P01' || testError.message.includes('does not exist')) {
        throw new Error('La tabla user_profiles no existe en Supabase. Necesitas crearla.');
      } else {
        throw new Error('Error de base de datos: ' + testError.message);
      }
    }

    console.log('✅ Tabla user_profiles accesible, insertando perfil...');

    // Intentar insertar el perfil
    const profileData = {
      id: user.id,
      email: user.email,
      nombre: name,
      empresa: empresa,
      telefono: telefono,
      estado: isAdminUser ? 'autorizado' : 'pendiente',
      role: isAdminUser ? 'admin' : 'solicitante',
      puede_ver_precios: isAdminUser
    };

    console.log('Datos a insertar:', profileData);

    const { data, error } = await window.supabase
      .from('user_profiles')
      .insert([profileData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error insertando perfil:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      // Mensajes de error más específicos
      if (error.code === '23505') {
        throw new Error('Este usuario ya está registrado');
      } else if (error.code === '42501') {
        throw new Error('Permisos insuficientes para crear perfil');
      } else {
        throw new Error('Error creando perfil: ' + error.message);
      }
    } else {
      console.log('✅ Perfil creado correctamente:', data);
      return data;
    }

  } catch (error) {
    console.error('❌ Error en createUserProfileOnRegister:', error);
    throw error; // Propagar el error
  }
}

async function logout() {
  if (!window.supabase) return;
  
  if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
    try {
      await window.supabase.auth.signOut();
      currentUser = null;
      showAuthScreen();
      showAuthMessage('Sesión cerrada correctamente', 'info');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}

// ========== GESTIÓN DE SESIÓN ==========
async function checkAuthState() {
  // En nuestro sistema alternativo, no hay persistencia automática de sesión
  // El usuario debe hacer login cada vez
  console.log('🔄 Sistema alternativo: mostrando pantalla de login');
  showAuthScreen();
}

// Escuchar cambios en el estado de autenticación
function setupAuthListener() {
  // Sistema alternativo sin Supabase Auth
  console.log('✅ Sistema de autenticación alternativo configurado');
}

// ========== FUNCIONES DE UI ==========
function showLogin() {
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('registerForm').classList.remove('active');
  clearAuthMessage();
}

function showRegister() {
  document.getElementById('loginTab').classList.remove('active');
  document.getElementById('registerTab').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
  document.getElementById('registerForm').classList.add('active');
  clearAuthMessage();
}

function showAuthScreen() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
  clearAuthMessage();
}

function showAppBasedOnRole(role) {
  console.log('Mostrando app para rol:', role);

  if (role === 'admin') {
    // Admin ve todo el sistema actual + panel de administración en sidebar
    showMainApp();
    setTimeout(() => {
      // Mostrar panel de admin en el sidebar
      const panelAdminSection = document.getElementById('panelAdminSection');
      if (panelAdminSection) {
        panelAdminSection.style.display = 'block';
        cargarDatosAdmin();
      }
    }, 500);

  } else if (role === 'mayorista_autorizado') {
    // Cliente autorizado ve catálogo con precios
    showCatalogoMayorista();

  } else {
    // Cliente no autorizado ve catálogo sin precios
    showCatalogoPublico();
  }
}

function showMainApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  // Actualizar información del usuario en la app principal
  updateUserInfo();

  // Recargar datos del usuario actual
  if (typeof reloadUserData === 'function') {
    reloadUserData();
  }

  // Inicializar la app principal
  if (typeof initializeApp === 'function') {
    initializeApp();
  }
}

function showCatalogoMayorista() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').innerHTML = `
    <div class="catalogo-mayorista">
      <header class="catalogo-header">
        <h1><i class="ph ph-storefront"></i> Catálogo Mayorista</h1>
        <div class="user-info-mayorista">
          <span>Bienvenido: ${currentUser.email}</span>
          <button onclick="logout()" class="btn-logout">
            <i class="ph ph-sign-out"></i> Cerrar Sesión
          </button>
        </div>
      </header>

      <div class="search-section">
        <input type="text" id="buscadorMayorista" placeholder="Buscar productos..." oninput="filtrarProductosMayorista()">
        <i class="ph ph-magnifying-glass"></i>
      </div>

      <div id="productosConPrecios" class="productos-grid"></div>

      <div id="carritoCompras" class="carrito-section" style="display: none;">
        <h3><i class="ph ph-shopping-cart"></i> Carrito de Compras</h3>
        <div id="itemsCarrito"></div>
        <div class="carrito-total">
          <strong>Total: $<span id="totalCarrito">0</span></strong>
        </div>
        <button onclick="solicitarCotizacion()" class="btn-cotizar">
          <i class="ph ph-file-text"></i> Solicitar Cotización
        </button>
      </div>
    </div>
  `;
  document.getElementById('mainApp').style.display = 'block';

  // Cargar productos con precios
  cargarProductosParaMayoristas();
}

function showCatalogoPublico() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').innerHTML = `
    <div class="catalogo-publico">
      <header class="catalogo-header">
        <h1><i class="ph ph-storefront"></i> Nuestros Productos</h1>
        <div class="user-info-publico">
          <span>${currentUser.email} - Acceso Pendiente</span>
          <button onclick="logout()" class="btn-logout">
            <i class="ph ph-sign-out"></i> Cerrar Sesión
          </button>
        </div>
      </header>

      <div class="solicitud-info">
        <div class="info-card">
          <i class="ph ph-clock"></i>
          <h3>Solicitud en Revisión</h3>
          <p>Tu solicitud de acceso está siendo revisada por nuestro equipo. Te notificaremos cuando sea aprobada.</p>
        </div>
      </div>

      <div class="search-section">
        <input type="text" id="buscadorPublico" placeholder="Buscar productos..." oninput="filtrarProductosPublicos()">
        <i class="ph ph-magnifying-glass"></i>
      </div>

      <div id="productosPublicos" class="productos-grid"></div>

      <div class="cta-contacto">
        <h3>¿Necesitas más información?</h3>
        <p>Contáctanos para obtener precios y condiciones especiales</p>
        <button onclick="contactarVentas()" class="btn-contacto">
          <i class="ph ph-phone"></i> Contactar Ventas
        </button>
      </div>
    </div>
  `;
  document.getElementById('mainApp').style.display = 'block';

  // Cargar productos sin precios
  cargarProductosPublicos();
}

// ========== FUNCIONES PARA CATÁLOGOS ==========
async function cargarProductosParaMayoristas() {
  if (!window.supabase || !currentUser) return;

  try {
    const productos = await cargarProductosDB();
    const container = document.getElementById('productosConPrecios');

    if (productos.length === 0) {
      container.innerHTML = `
        <div class="empty-catalog">
          <i class="ph ph-package"></i>
          <h3>Catálogo en construcción</h3>
          <p>Pronto tendremos productos disponibles para ti.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = productos.map(producto => `
      <div class="producto-card-mayorista">
        <div class="producto-imagen">
          ${producto.foto ? `<img src="${producto.foto}" alt="${producto.nombre}">` : '<div class="no-image"><i class="ph ph-image"></i></div>'}
        </div>
        <div class="producto-info">
          <h3>${producto.nombre}</h3>
          <p class="marca">${producto.marca}</p>
          <p class="codigo">Código: ${producto.codigo}</p>
          <div class="precio-mayorista">
            <span class="precio">$${producto.precio_base_mayorista || 'Consultar'}</span>
          </div>
          <button onclick="agregarAlCarrito('${producto.id}')" class="btn-agregar-carrito">
            <i class="ph ph-shopping-cart"></i> Agregar al Carrito
          </button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error cargando productos para mayoristas:', error);
  }
}

async function cargarProductosPublicos() {
  if (!window.supabase || !currentUser) return;

  try {
    const productos = await cargarProductosDB();
    const container = document.getElementById('productosPublicos');

    if (productos.length === 0) {
      container.innerHTML = `
        <div class="empty-catalog">
          <i class="ph ph-package"></i>
          <h3>Catálogo en construcción</h3>
          <p>Pronto tendremos productos disponibles.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = productos.map(producto => `
      <div class="producto-card-publico">
        <div class="producto-imagen">
          ${producto.foto ? `<img src="${producto.foto}" alt="${producto.nombre}">` : '<div class="no-image"><i class="ph ph-image"></i></div>'}
        </div>
        <div class="producto-info">
          <h3>${producto.nombre}</h3>
          <p class="marca">${producto.marca}</p>
          <p class="codigo">Código: ${producto.codigo}</p>
          <div class="precio-placeholder">
            <span class="precio-solicitar">Precio: Solicita acceso</span>
          </div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error cargando productos públicos:', error);
  }
}

// Funciones básicas para el carrito (implementar después)
function agregarAlCarrito(productoId) {
  console.log('Agregando al carrito:', productoId);
  // TODO: Implementar lógica del carrito
}

function solicitarCotizacion() {
  console.log('Solicitando cotización');
  // TODO: Implementar solicitud de cotización
}

function contactarVentas() {
  console.log('Contactando ventas');
  // TODO: Implementar contacto de ventas
}

function filtrarProductosMayorista() {
  // TODO: Implementar filtros para mayoristas
}

function filtrarProductosPublicos() {
  // TODO: Implementar filtros para vista pública
}

// ========== FUNCIONES DEL PANEL DE ADMINISTRACIÓN ==========
async function cargarDatosAdmin() {
  if (!isAdmin()) return;

  try {
    await cargarSolicitudesPendientes();
    await cargarUsuariosAutorizados();
    await cargarClientesParaPrecios();
  } catch (error) {
    console.error('Error cargando datos de admin:', error);
  }
}

async function cargarSolicitudesPendientes() {
  try {
    const { data, error } = await window.supabase
      .from('user_profiles')
      .select('*')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando solicitudes:', error);
      return;
    }

    const container = document.getElementById('listaSolicitudesPendientes');
    const badge = document.getElementById('badgePendientes');

    badge.textContent = data.length;

    if (data.length === 0) {
      container.innerHTML = '<p class="no-data">No hay solicitudes pendientes</p>';
      return;
    }

    container.innerHTML = data.map(user => `
      <div class="solicitud-item">
        <div class="user-info">
          <strong>${user.email}</strong>
          <p>Empresa: ${user.empresa || 'No especificada'}</p>
          <p>Teléfono: ${user.telefono || 'No especificado'}</p>
          <p>Solicitado: ${new Date(user.created_at).toLocaleDateString()}</p>
        </div>
        <div class="actions">
          <button onclick="autorizarUsuario('${user.id}')" class="btn-autorizar">
            <i class="ph ph-check"></i> Autorizar
          </button>
          <button onclick="rechazarUsuario('${user.id}')" class="btn-rechazar">
            <i class="ph ph-x"></i> Rechazar
          </button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error en cargarSolicitudesPendientes:', error);
  }
}

async function cargarUsuariosAutorizados() {
  try {
    const { data, error } = await window.supabase
      .from('user_profiles')
      .select('*')
      .eq('estado', 'autorizado')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando usuarios autorizados:', error);
      return;
    }

    const container = document.getElementById('listaUsuariosAutorizados');
    const badge = document.getElementById('badgeAutorizados');

    badge.textContent = data.length;

    if (data.length === 0) {
      container.innerHTML = '<p class="no-data">No hay usuarios autorizados</p>';
      return;
    }

    container.innerHTML = data.map(user => `
      <div class="usuario-item">
        <div class="user-info">
          <strong>${user.email}</strong>
          <p>Empresa: ${user.empresa}</p>
          <p>Autorizado: ${new Date(user.authorized_at || user.created_at).toLocaleDateString()}</p>
        </div>
        <div class="actions">
          <button onclick="revocarAutorizacion('${user.id}')" class="btn-rechazar">
            <i class="ph ph-prohibition"></i> Revocar
          </button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error en cargarUsuariosAutorizados:', error);
  }
}

async function autorizarUsuario(userId) {
  if (!confirm('¿Autorizar a este usuario para ver precios mayoristas?')) return;

  try {
    const { error } = await window.supabase
      .from('user_profiles')
      .update({
        estado: 'autorizado',
        role: 'mayorista_autorizado',
        puede_ver_precios: true,
        authorized_by: currentUser.id,
        authorized_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('Error autorizando usuario:', error);
      alert('Error al autorizar usuario');
      return;
    }

    alert('Usuario autorizado correctamente');
    await cargarSolicitudesPendientes();
    await cargarUsuariosAutorizados();

  } catch (error) {
    console.error('Error en autorizarUsuario:', error);
    alert('Error al autorizar usuario');
  }
}

async function rechazarUsuario(userId) {
  if (!confirm('¿Rechazar la solicitud de este usuario?')) return;

  try {
    const { error } = await window.supabase
      .from('user_profiles')
      .update({
        estado: 'rechazado',
        role: 'solicitante'
      })
      .eq('id', userId);

    if (error) {
      console.error('Error rechazando usuario:', error);
      alert('Error al rechazar usuario');
      return;
    }

    alert('Usuario rechazado');
    await cargarSolicitudesPendientes();

  } catch (error) {
    console.error('Error en rechazarUsuario:', error);
  }
}

async function revocarAutorizacion(userId) {
  if (!confirm('¿Revocar el acceso de este usuario?')) return;

  try {
    const { error } = await window.supabase
      .from('user_profiles')
      .update({
        estado: 'rechazado',
        role: 'solicitante',
        puede_ver_precios: false
      })
      .eq('id', userId);

    if (error) {
      console.error('Error revocando autorización:', error);
      alert('Error al revocar autorización');
      return;
    }

    alert('Autorización revocada');
    await cargarUsuariosAutorizados();

  } catch (error) {
    console.error('Error en revocarAutorizacion:', error);
  }
}

async function cargarClientesParaPrecios() {
  try {
    const { data, error } = await window.supabase
      .from('user_profiles')
      .select('id, email, empresa')
      .eq('estado', 'autorizado')
      .neq('role', 'admin');

    if (error) {
      console.error('Error cargando clientes:', error);
      return;
    }

    const select = document.getElementById('clienteSeleccionado');
    select.innerHTML = '<option value="">Seleccionar cliente...</option>';

    data.forEach(cliente => {
      select.innerHTML += `<option value="${cliente.id}">${cliente.email} - ${cliente.empresa}</option>`;
    });

  } catch (error) {
    console.error('Error en cargarClientesParaPrecios:', error);
  }
}

function cargarPreciosCliente() {
  const clienteId = document.getElementById('clienteSeleccionado').value;
  const panel = document.getElementById('preciosClientePanel');

  if (!clienteId) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = '<p>Función de precios personalizados - Por implementar</p>';
}

function updateUserInfo() {
  const userInfoElement = document.getElementById('userInfo');
  if (userInfoElement && currentUser) {
    const displayName = currentUser.user_metadata?.full_name || currentUser.email;
    userInfoElement.textContent = displayName;

    // Agregar botón de logout si no existe
    const userInfoContainer = userInfoElement.parentElement;
    let logoutBtn = userInfoContainer.querySelector('.user-logout-btn');
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.className = 'user-logout-btn';
      logoutBtn.innerHTML = '<i class="ph ph-sign-out"></i>';
      logoutBtn.onclick = logout;
      logoutBtn.title = 'Cerrar sesión';
      userInfoContainer.appendChild(logoutBtn);
    }
  }
}

function showAuthMessage(message, type = 'info') {
  const messageEl = document.getElementById('authMessage');
  messageEl.textContent = message;
  messageEl.className = `auth-message ${type}`;
  messageEl.style.display = 'block';
}

function clearAuthMessage() {
  const messageEl = document.getElementById('authMessage');
  messageEl.style.display = 'none';
  messageEl.textContent = '';
}

function setLoading(button, loading) {
  const btnText = button.querySelector('.btn-text');
  const btnLoader = button.querySelector('.btn-loader');
  
  if (loading) {
    button.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
  } else {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

function getErrorMessage(error) {
  const errorMessages = {
    'Invalid login credentials': 'Email o contraseña incorrectos',
    'Email not confirmed': 'Por favor confirma tu email antes de iniciar sesión',
    'User already registered': 'Este email ya está registrado',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
    'Invalid email': 'Email inválido'
  };
  
  return errorMessages[error.message] || error.message || 'Error desconocido';
}

// ========== FUNCIONES DE VERIFICACIÓN DE ROLES ==========
async function checkUserRole(email) {
  // Si es el email madre = admin directo
  if (email === window.APP_CONFIG.ADMIN_EMAIL) {
    return 'admin';
  }

  try {
    // Verificar en base de datos si tiene perfil
    const { data, error } = await window.supabase
      .from('user_profiles')
      .select('estado, role, puede_ver_precios')
      .eq('email', email)
      .single();

    if (error || !data) {
      // Primera vez que se registra - crear perfil pendiente
      await createUserProfile(email);
      return 'solicitante';
    }

    // Retornar rol según el estado
    if (data.estado === 'autorizado' && data.puede_ver_precios) {
      return 'mayorista_autorizado';
    } else {
      return 'solicitante';
    }

  } catch (error) {
    console.error('Error verificando rol de usuario:', error);
    return 'solicitante';
  }
}

async function createUserProfile(email) {
  try {
    const { data, error } = await window.supabase
      .from('user_profiles')
      .insert([{
        id: currentUser.id,
        email: email,
        estado: 'pendiente',
        role: 'solicitante',
        puede_ver_precios: false
      }]);

    if (error) {
      console.error('Error creando perfil de usuario:', error);
    }

  } catch (error) {
    console.error('Error en createUserProfile:', error);
  }
}

function isAdmin() {
  return currentUser && currentUser.email === window.APP_CONFIG.ADMIN_EMAIL;
}

async function getUserProfile(userId) {
  try {
    const { data, error } = await window.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error obteniendo perfil:', error);
      return null;
    }

    return data;

  } catch (error) {
    console.error('Error en getUserProfile:', error);
    return null;
  }
}

// ========== FUNCIONES PARA LA APP DE PRODUCTOS ==========
function getCurrentUserId() {
  return currentUser ? currentUser.id : null;
}

function getCurrentUserEmail() {
  return currentUser ? currentUser.email : null;
}

// ========== INICIALIZACIÓN ==========
function waitForSupabase() {
  return new Promise((resolve) => {
    // Si ya está disponible, resolver inmediatamente
    if (window.supabase && window.supabase.createClient) {
      console.log('✅ Librería de Supabase ya disponible');
      resolve();
      return;
    }

    console.log('⏳ Esperando que se cargue la librería de Supabase...');

    // Esperar hasta que esté disponible
    const checkInterval = setInterval(() => {
      if (window.supabase && window.supabase.createClient) {
        console.log('✅ Librería de Supabase cargada');
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout después de 10 segundos
    setTimeout(() => {
      clearInterval(checkInterval);
      console.error('❌ Timeout esperando la librería de Supabase');
      resolve();
    }, 10000);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando aplicación...');

  // Esperar a que Supabase esté disponible
  await waitForSupabase();

  // Intentar inicializar Supabase
  if (initSupabase()) {
    setupAuthListener();
    await checkAuthState();
  } else {
    // Mostrar pantalla de configuración
    showAuthScreen();
  }
  
  // Event listeners para formularios
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    login();
  });
  
  document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    register();
  });
  
  // Enter key listeners
  document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  
  document.getElementById('registerPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') register();
  });
});