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
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (error) {
    console.error('Error inicializando Supabase:', error);
    showAuthMessage('Error de conexión con Supabase', 'error');
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
    const { data, error } = await window.supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      showAuthMessage(getErrorMessage(error), 'error');
    } else {
      currentUser = data.user;
      showAuthMessage('¡Bienvenido de vuelta!', 'success');
      setTimeout(() => {
        showMainApp();
      }, 1000);
    }
  } catch (error) {
    console.error('Error en login:', error);
    showAuthMessage('Error de conexión', 'error');
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
    const { data, error } = await window.supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name,
          empresa: empresa,
          telefono: telefono
        }
      }
    });

    if (error) {
      showAuthMessage(getErrorMessage(error), 'error');
    } else {
      if (data.user) {
        currentUser = data.user;

        // Crear perfil de usuario automáticamente
        await createUserProfileOnRegister(data.user, name, empresa, telefono);

        if (!data.user.email_confirmed_at) {
          showAuthMessage('Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.', 'info');
        } else {
          showAuthMessage('¡Solicitud enviada correctamente!', 'success');
          setTimeout(async () => {
            // Verificar rol y mostrar vista correspondiente
            const userRole = await checkUserRole(data.user.email);
            showAppBasedOnRole(userRole);
          }, 1000);
        }
      }
    }
  } catch (error) {
    console.error('Error en registro:', error);
    showAuthMessage('Error de conexión', 'error');
  } finally {
    setLoading(registerBtn, false);
  }
}

async function createUserProfileOnRegister(user, name, empresa, telefono) {
  try {
    const isAdminUser = user.email === window.APP_CONFIG.ADMIN_EMAIL;

    const { data, error } = await window.supabase
      .from('user_profiles')
      .insert([{
        id: user.id,
        email: user.email,
        nombre: name,
        empresa: empresa,
        telefono: telefono,
        estado: isAdminUser ? 'autorizado' : 'pendiente',
        role: isAdminUser ? 'admin' : 'solicitante',
        puede_ver_precios: isAdminUser
      }]);

    if (error) {
      console.error('Error creando perfil en registro:', error);
    } else {
      console.log('Perfil creado correctamente:', data);
    }

  } catch (error) {
    console.error('Error en createUserProfileOnRegister:', error);
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
  if (!window.supabase) return;

  try {
    const { data: { user } } = await window.supabase.auth.getUser();

    if (user) {
      currentUser = user;

      // Verificar rol del usuario y mostrar vista correspondiente
      const userRole = await checkUserRole(user.email);
      showAppBasedOnRole(userRole);

    } else {
      showAuthScreen();
    }
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    showAuthScreen();
  }
}

// Escuchar cambios en el estado de autenticación
function setupAuthListener() {
  if (!window.supabase) return;
  
  window.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      showMainApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthScreen();
    }
  });
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
    // Admin ve todo el sistema actual + panel de administración
    showMainApp();
    if (document.getElementById('adminPanel')) {
      document.getElementById('adminPanel').style.display = 'block';
    }

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

// Funciones para el panel de administración
function toggleAdminSection(sectionId) {
  const content = document.getElementById(sectionId);
  const arrow = document.getElementById(`arrow-${sectionId}`);

  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    arrow.innerHTML = '<i class="ph ph-caret-up"></i>';
  } else {
    content.style.display = 'none';
    arrow.innerHTML = '<i class="ph ph-caret-down"></i>';
  }
}

function updateUserInfo() {
  const userInfoElement = document.getElementById('userInfo');
  if (userInfoElement && currentUser) {
    const displayName = currentUser.user_metadata?.full_name || currentUser.email;
    userInfoElement.innerHTML = `(${displayName}) <button onclick="logout()" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8em; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;" title="Cerrar sesión"><i class="ph ph-sign-out"></i></button>`;
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
document.addEventListener('DOMContentLoaded', async () => {
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