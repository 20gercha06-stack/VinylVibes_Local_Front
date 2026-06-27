// ══════════════════════════════════════════════════════════
//  VinylVibes — admin.js (versión localStorage)
//
//  Sin base de datos. Los datos se leen de localStorage:
//    vv_usuarios          → lista de usuarios registrados
//    vv_compras_<nombre>  → compras por usuario
// ══════════════════════════════════════════════════════════

const API = 'https://vinylvibes-local-back.onrender.com';

function authHeaders() {
    return {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${localStorage.getItem('vv_token') || ''}`,
    };
}

// ── Helpers localStorage ──────────────────────────────────

function obtenerUsuariosLS() {
    try { return JSON.parse(localStorage.getItem('vv_usuarios') || '[]'); } catch { return []; }
}

function guardarUsuariosLS(lista) {
    localStorage.setItem('vv_usuarios', JSON.stringify(lista));
}

/** Reune todas las ventas de todos los usuarios. */
function obtenerTodasLasVentas() {
    const usuarios = obtenerUsuariosLS();
    const todas = [];
    for (const u of usuarios) {
        try {
            const compras = JSON.parse(localStorage.getItem(`vv_compras_${u.nombre_usuario}`) || '[]');
            for (const c of compras) {
                todas.push({ ...c, cliente: { nombre: u.nombre_usuario } });
            }
        } catch {}
    }
    // Ordenar por fecha más reciente
    todas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return todas;
}

/** Guarda una venta actualizada en el localStorage del usuario correspondiente. */
function actualizarVentaLS(id_venta, cambios) {
    const usuarios = obtenerUsuariosLS();
    for (const u of usuarios) {
        const clave = `vv_compras_${u.nombre_usuario}`;
        try {
            let compras = JSON.parse(localStorage.getItem(clave) || '[]');
            const idx = compras.findIndex(c => c.id_venta === id_venta);
            if (idx >= 0) {
                compras[idx] = { ...compras[idx], ...cambios };
                localStorage.setItem(clave, JSON.stringify(compras));
                return true;
            }
        } catch {}
    }
    return false;
}

// ── INIT ──────────────────────────────────────────────────
let _esDemo = false;

document.addEventListener('DOMContentLoaded', async () => {
    const token   = localStorage.getItem('vv_token');
    const esAdmin = localStorage.getItem('esAdmin') === 'true';
    const esDemo  = localStorage.getItem('esDemo')  === 'true';

    if (!token || (!esAdmin && !esDemo)) {
        mostrarToast('Acceso denegado.', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    _esDemo = esDemo && !esAdmin;

    if (_esDemo) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:rgba(245,158,11,0.12);border-bottom:1px solid rgba(245,158,11,0.3);padding:8px 32px;text-align:center;font-size:0.8rem;color:var(--amber);font-family:"DM Mono",monospace;letter-spacing:0.05em;';
        banner.textContent = '👁 Modo solo lectura — esta cuenta no puede realizar cambios';
        document.querySelector('.admin-header').after(banner);
    }

    cargarUsuarios();
    cargarVentas();
    cargarStats();
});

// ── TABS ──────────────────────────────────────────────────
function cambiarTab(tab, btn) {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// ── STATS ─────────────────────────────────────────────────
function cargarStats() {
    const usuarios = obtenerUsuariosLS();
    const ventas   = obtenerTodasLasVentas();

    document.getElementById('stat-usuarios').textContent   = usuarios.length;
    document.getElementById('stat-ventas').textContent     = ventas.length;
    document.getElementById('stat-pendientes').textContent = ventas.filter(v => v.estado === 'pendiente').length;
    const ingresos = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    document.getElementById('stat-ingresos').textContent   = `$${ingresos.toFixed(2)}`;
}

// ── USUARIOS ──────────────────────────────────────────────
let _usuarios = [];

function cargarUsuarios() {
    _usuarios = obtenerUsuariosLS().map((u, i) => ({
        id_usuario: i + 1,
        nombre:     u.nombre_usuario,
        correo:     u.correo || `${u.nombre_usuario}@local`,
        rol:        u.rol || 'cliente',
        created_at: u.creado_en || null,
    }));

    const loading = document.getElementById('tabla-loading');
    const tabla   = document.getElementById('tabla-usuarios');
    if (loading) loading.style.display = 'none';
    if (tabla)   tabla.style.display   = 'table';

    renderizarUsuarios(_usuarios);
}

function renderizarUsuarios(lista) {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">No hay usuarios registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(u => `
        <tr>
            <td style="color:var(--text-muted);font-family:'DM Mono',monospace;font-size:0.75rem;">#${u.id_usuario}</td>
            <td style="color:var(--text-primary);font-weight:500;">${u.nombre}</td>
            <td>${u.correo || '—'}</td>
            <td><span class="badge badge--${u.rol}">${u.rol}</span></td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${formatearFecha(u.created_at)}</td>
            <td>
                ${_esDemo ? `
                <select class="select-rol" disabled style="opacity:0.4;cursor:not-allowed;">
                    <option>${u.rol}</option>
                </select>
                <button class="btn-table btn-table--danger" disabled style="opacity:0.4;cursor:not-allowed;">Eliminar</button>
                ` : `
                <select class="select-rol" onchange="cambiarRol('${u.nombre}', this.value)">
                    <option value="cliente"  ${u.rol === 'cliente'  ? 'selected' : ''}>cliente</option>
                    <option value="vendedor" ${u.rol === 'vendedor' ? 'selected' : ''}>vendedor</option>
                    <option value="admin"    ${u.rol === 'admin'    ? 'selected' : ''}>admin</option>
                    <option value="demo"     ${u.rol === 'demo'     ? 'selected' : ''}>demo</option>
                </select>
                <button class="btn-table btn-table--danger" onclick="confirmarEliminarUsuario('${u.nombre}')">Eliminar</button>
                `}
            </td>
        </tr>`).join('');
}

function filtrarUsuarios(q) {
    const filtrados = q
        ? _usuarios.filter(u =>
            u.nombre.toLowerCase().includes(q.toLowerCase()) ||
            (u.correo || '').toLowerCase().includes(q.toLowerCase()))
        : _usuarios;
    renderizarUsuarios(filtrados);
}

function cambiarRol(nombreUsuario, nuevoRol) {
    // Proteger: no quitarse el admin a uno mismo
    const miNombre = localStorage.getItem('usuarioLogueado');
    if (nombreUsuario === miNombre && nuevoRol !== 'admin') {
        mostrarToast('No puedes quitarte el rol de admin.', 'error');
        cargarUsuarios();
        return;
    }

    const usuarios = obtenerUsuariosLS();
    const idx = usuarios.findIndex(u => u.nombre_usuario === nombreUsuario);
    if (idx >= 0) {
        usuarios[idx].rol = nuevoRol;
        guardarUsuariosLS(usuarios);
        mostrarToast(`Rol de "${nombreUsuario}" actualizado a "${nuevoRol}".`, 'success');
        cargarUsuarios();
        cargarStats();
    }
}

function confirmarEliminarUsuario(nombre) {
    const filas = document.querySelectorAll('#tbody-usuarios tr');
    filas.forEach(fila => {
        const celdaNombre = fila.querySelector('td:nth-child(2)');
        if (celdaNombre && celdaNombre.textContent.trim() === nombre) {
            const accionesTd = fila.querySelector('td:last-child');
            accionesTd.innerHTML = `
                <span style="font-size:0.8rem;color:var(--text-muted);margin-right:8px;">¿Eliminar a "${nombre}"?</span>
                <button class="btn-table btn-table--danger" onclick="eliminarUsuario('${nombre}')">Confirmar</button>
                <button class="btn-table" onclick="renderizarUsuarios(_usuarios)">Cancelar</button>`;
        }
    });
}

function eliminarUsuario(nombre) {
    const miNombre = localStorage.getItem('usuarioLogueado');
    if (nombre === miNombre) {
        mostrarToast('No puedes eliminarte a ti mismo.', 'error');
        return;
    }

    const usuarios = obtenerUsuariosLS().filter(u => u.nombre_usuario !== nombre);
    guardarUsuariosLS(usuarios);
    // También borrar sus compras
    localStorage.removeItem(`vv_compras_${nombre}`);
    localStorage.removeItem(`vv_historial_${nombre}`);

    mostrarToast(`Usuario "${nombre}" eliminado.`, 'success');
    cargarUsuarios();
    cargarVentas();
    cargarStats();
}

// ── VENTAS ────────────────────────────────────────────────
let _ventas = [];

function cargarVentas() {
    _ventas = obtenerTodasLasVentas();

    const loading = document.getElementById('tabla-ventas-loading');
    const tabla   = document.getElementById('tabla-ventas');
    if (loading) loading.style.display = 'none';
    if (tabla)   tabla.style.display   = 'table';

    renderizarVentas(_ventas);
}

function renderizarVentas(lista) {
    const tbody = document.getElementById('tbody-ventas');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">No hay ventas.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(v => `
        <tr>
            <td style="color:var(--text-muted);font-family:'DM Mono',monospace;font-size:0.75rem;">#${v.id_venta}</td>
            <td style="color:var(--text-primary);font-weight:500;">${v.cliente?.nombre || '—'}</td>
            <td style="color:var(--amber);font-weight:600;">$${Number(v.total).toFixed(2)}</td>
            <td><span class="badge badge--${v.estado}">${v.estado}</span></td>
            <td style="color:var(--text-muted);font-size:0.8rem;">${formatearFecha(v.fecha)}</td>
            <td>
                <button class="btn-table" onclick="verDetalleVenta(${v.id_venta})">Ver detalle</button>
                ${_esDemo ? `
                <select class="select-rol" disabled style="opacity:0.4;cursor:not-allowed;">
                    <option>${v.estado}</option>
                </select>
                ` : `
                <select class="select-rol" onchange="cambiarEstadoVenta(${v.id_venta}, this.value)">
                    <option value="pendiente"  ${v.estado === 'pendiente'  ? 'selected' : ''}>pendiente</option>
                    <option value="pagada"     ${v.estado === 'pagada'     ? 'selected' : ''}>pagada</option>
                    <option value="enviada"    ${v.estado === 'enviada'    ? 'selected' : ''}>enviada</option>
                    <option value="entregada"  ${v.estado === 'entregada'  ? 'selected' : ''}>entregada</option>
                    <option value="cancelada"  ${v.estado === 'cancelada'  ? 'selected' : ''}>cancelada</option>
                </select>
                `}
            </td>
        </tr>`).join('');
}

function filtrarVentas(q) {
    const filtrados = q
        ? _ventas.filter(v =>
            String(v.id_venta).includes(q) ||
            (v.cliente?.nombre || '').toLowerCase().includes(q.toLowerCase()))
        : _ventas;
    renderizarVentas(filtrados);
}

function cambiarEstadoVenta(id_venta, nuevoEstado) {
    const ok = actualizarVentaLS(id_venta, { estado: nuevoEstado });
    if (ok) {
        mostrarToast(`Estado actualizado a "${nuevoEstado}".`, 'success');
        cargarVentas();
        cargarStats();
    } else {
        mostrarToast('No se pudo actualizar el estado.', 'error');
    }
}

function verDetalleVenta(id_venta) {
    const venta = _ventas.find(v => v.id_venta === id_venta);
    if (!venta) return;

    const lineas = venta.discos || [];
    const envio  = venta.envio  || null;

    document.getElementById('venta-detalle-body').innerHTML = `
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">
            Venta #${venta.id_venta} · ${venta.cliente?.nombre || '—'} · <span class="badge badge--${venta.estado}">${venta.estado}</span>
        </p>
        <p style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-muted);">DISCOS</p>
        ${lineas.map(l => `
            <div class="venta-item">
                <span>${l.titulo} <span style="color:var(--text-muted);font-size:0.8rem;">x${l.cantidad}</span></span>
                <span>$${Number(l.subtotal).toFixed(2)}</span>
            </div>`).join('')}
        <div class="venta-item" style="font-weight:700;color:var(--amber);">
            <span>Total</span>
            <span>$${Number(venta.total).toFixed(2)}</span>
        </div>
        ${envio ? `
        <p style="font-size:0.85rem;font-weight:600;margin:16px 0 8px;color:var(--text-muted);">ENVÍO</p>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
            ${envio.nombre_receptor}<br>
            ${envio.calle} ${envio.numero_ext}${envio.numero_int ? ' Int. '+envio.numero_int : ''}<br>
            ${envio.colonia}, ${envio.ciudad}, ${envio.estado} ${envio.codigo_postal}
            ${envio.referencias ? `<br><span style="color:var(--text-muted);">${envio.referencias}</span>` : ''}
        </p>` : ''}`;

    document.getElementById('modal-venta').classList.add('open');
}

function cerrarModalVenta() {
    document.getElementById('modal-venta').classList.remove('open');
}

// ── HELPERS ───────────────────────────────────────────────
function formatearFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-MX', {
        day:   '2-digit',
        month: 'short',
        year:  'numeric',
    });
}

function mostrarToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colores = { success: '#6ee7b7', error: '#fca5a5', warning: '#fcd34d', info: '#93c5fd' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${tipo}`;
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 18px;font-size:0.875rem;color:${colores[tipo]};box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:9999;transition:all 0.3s;opacity:0;transform:translateY(10px);`;
    toast.textContent = mensaje;
    container.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }));

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
