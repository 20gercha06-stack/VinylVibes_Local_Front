// ══════════════════════════════════════════════════════════
//  VinylVibes — login.js (versión localStorage)
//
//  Sin base de datos. Los usuarios se guardan en
//  localStorage bajo la clave 'vv_usuarios'.
//
//  Flujo de REGISTRO:
//    1. Verificar que el usuario no exista en localStorage.
//    2. Pedir al backend que hashee la contraseña (/registro).
//    3. Guardar { nombre_usuario, password_hash, rol } en localStorage.
//
//  Flujo de LOGIN:
//    1. Buscar al usuario en localStorage.
//    2. Enviar su password_hash al backend (/login) para verificar.
//    3. Guardar el JWT devuelto en localStorage.
// ══════════════════════════════════════════════════════════

const API = 'https://api-tienda-vinilos.onrender.com';

// ── Helpers de almacenamiento local ──────────────────────

/** Devuelve la lista de usuarios guardada en localStorage. */
function obtenerUsuarios() {
    try {
        return JSON.parse(localStorage.getItem('vv_usuarios') || '[]');
    } catch {
        return [];
    }
}

/** Guarda la lista de usuarios en localStorage. */
function guardarUsuarios(lista) {
    localStorage.setItem('vv_usuarios', JSON.stringify(lista));
}

/** Busca un usuario por nombre (case-insensitive). */
function buscarUsuario(nombre) {
    return obtenerUsuarios().find(
        u => u.nombre_usuario.toLowerCase() === nombre.trim().toLowerCase()
    ) || null;
}

// ── Init ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

    // ── LOGIN ─────────────────────────────────────────────
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const usuarioInput  = document.getElementById('username').value.trim();
            const passwordInput = document.getElementById('password').value;
            const mensajeError  = document.getElementById('mensaje-error-login');

            if (!usuarioInput || !passwordInput) {
                mostrarError(mensajeError, 'Por favor completa todos los campos.');
                return;
            }

            const submitBtn = loginForm.querySelector('[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Entrando…'; }

            try {
                // 1. Buscar al usuario en localStorage
                const usuarioGuardado = buscarUsuario(usuarioInput);
                if (!usuarioGuardado) {
                    mostrarError(mensajeError, 'Credenciales inválidas.');
                    return;
                }

                // 2. Verificar contraseña en el backend (bcrypt compare)
                const respuesta = await fetch(`${API}/login`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        nombre_usuario: usuarioInput,
                        password:       passwordInput,
                        password_hash:  usuarioGuardado.password_hash,
                        rol:            usuarioGuardado.rol || 'cliente',
                    }),
                });

                const data = await respuesta.json();

                if (respuesta.ok) {
                    // 3. Guardar sesión
                    localStorage.setItem('vv_token',        data.token);
                    localStorage.setItem('usuarioLogueado', data.nombre);
                    localStorage.setItem('esAdmin',         data.es_admin  ? 'true' : 'false');
                    localStorage.setItem('esDemo',          data.es_demo   ? 'true' : 'false');

                    const base = window.location.pathname.replace('/login.html', '');
                    window.location.href = base + '/index.html';
                } else {
                    mostrarError(mensajeError, data.error || 'Error al iniciar sesión.');
                }
            } catch (error) {
                console.error('Error conectando con el servidor:', error);
                mostrarError(mensajeError, 'No se pudo conectar con el servidor.');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar'; }
            }
        });
    }

    // ── REGISTRO ──────────────────────────────────────────
    const registroForm = document.getElementById('registro-form');
    if (registroForm) {
        registroForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const nuevoUsuario = document.getElementById('new-username').value.trim();
            const nuevaPass    = document.getElementById('new-password').value;
            const mensajeReg   = document.getElementById('mensaje-registro')
                              || document.getElementById('mensaje-error-login');

            if (!nuevoUsuario || !nuevaPass) {
                mostrarError(mensajeReg, 'Por favor completa todos los campos.');
                return;
            }
            if (nuevaPass.length < 6) {
                mostrarError(mensajeReg, 'La contraseña debe tener al menos 6 caracteres.');
                return;
            }

            // 1. Verificar que el nombre no esté ya en uso
            if (buscarUsuario(nuevoUsuario)) {
                mostrarError(mensajeReg, 'El nombre de usuario ya está en uso.');
                return;
            }

            const submitBtn = registroForm.querySelector('[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Registrando…'; }

            try {
                // 2. Pedir al backend que hashee la contraseña
                const respuesta = await fetch(`${API}/registro`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        nombre_usuario: nuevoUsuario,
                        password:       nuevaPass,
                    }),
                });

                const data = await respuesta.json();

                if (respuesta.ok) {
                    // 3. Guardar usuario en localStorage
                    const usuarios = obtenerUsuarios();
                    usuarios.push({
                        nombre_usuario: nuevoUsuario,
                        password_hash:  data.password_hash,
                        rol:            'cliente',
                        creado_en:      new Date().toISOString(),
                    });
                    guardarUsuarios(usuarios);

                    mostrarExito(mensajeReg, '¡Cuenta creada! Ahora puedes iniciar sesión.');
                    registroForm.reset();
                    setTimeout(() => cambiarVista('login'), 1500);
                } else {
                    mostrarError(mensajeReg, data.error || 'No se pudo crear la cuenta.');
                }
            } catch (error) {
                console.error('Error en registro:', error);
                mostrarError(mensajeReg, 'Error de conexión con el servidor.');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Crear Cuenta'; }
            }
        });
    }
});

// ── Helpers de mensajes ───────────────────────────────────
function mostrarError(el, texto) {
    if (!el) return;
    el.innerText   = '' + texto;
    el.style.color = '#fca5a5';
}

function mostrarExito(el, texto) {
    if (!el) return;
    el.innerText   = texto;
    el.style.color = '#6ee7b7';
}
