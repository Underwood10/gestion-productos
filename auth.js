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
  const password = document.getElementById('registerPassword').value;
  
  if (!name || !email || !password) {
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
          full_name: name
        }
      }
    });
    
    if (error) {
      showAuthMessage(getErrorMessage(error), 'error');
    } else {
      if (data.user && !data.user.email_confirmed_at) {
        showAuthMessage('Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.', 'info');
      } else {
        currentUser = data.user;
        showAuthMessage('¡Cuenta creada exitosamente!', 'success');
        setTimeout(() => {
          showMainApp();
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Error en registro:', error);
    showAuthMessage('Error de conexión', 'error');
  } finally {
    setLoading(registerBtn, false);
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
      showMainApp();
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