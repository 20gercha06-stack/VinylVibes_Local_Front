// ══════════════════════════════════════════════════
//  VinylVibes — script.js v3
//  Catálogo dinámico desde Discogs + Redis
// ══════════════════════════════════════════════════

const API = 'https://api-tienda-vinilos.onrender.com';

// ── GLOBALS ───────────────────────────────────────
const contenedor  = document.getElementById('contenedor-discos');
const authSection = document.getElementById('auth-section');

let carruselOffset = 0;
const CARRUSEL_STEP = 220;
let _carruselData  = [];
let _generoCache   = {};
let discoActivo      = null;
let _novedadesPagina = 1;
let _novedadesQuery  = '';
let _novedadesData   = [];
let _generosPagina   = 1;
const ITEMS_POR_PAGINA = 20;
let _buscarTimeout = null;
let _paginaActual  = 1;
let _queryActual   = '';

const GENEROS_FIJOS = ['Rock', 'Jazz', 'Pop', 'Electronic', 'Hip Hop', 'Classical', 'Blues', 'Folk', 'Latin', 'Reggae'];

// Carrito — debe declararse antes de cualquier función que lo use
let carrito = JSON.parse(localStorage.getItem('vv_carrito') || '[]');

// ── SINCRONIZACIÓN ENTRE PESTAÑAS ─────────────────
window.addEventListener('storage', (e) => {
    if (e.key === 'vv_carrito') {
        carrito = JSON.parse(e.newValue || '[]');
        renderizarCarrito();
    }
    if (e.key === 'usuarioLogueado' || e.key === 'esAdmin') {
        actualizarInterfazUsuario();
    }
});

// ── INIT ──────────────────────────────────────────
actualizarInterfazUsuario();
cargarPagina();

async function cargarPagina() {
    await cargarRecientes();
    inicializarGeneros();
}

// ── CARGAR RECIENTES ──────────────────────────────
async function cargarRecientes() {
    try {
        const resp = await fetch(`${API}/recientes`);
        if (!resp.ok) throw new Error('Error al obtener recientes');
        const data = await resp.json();
        _carruselData = data;
        renderizarCarrusel(data);
        renderizarNovedades(data);
        renderizarCatalogInicial(data);
    } catch (err) {
        console.error('cargarRecientes:', err);
        mostrarErrorCatalogo();
    }
}

function renderizarCatalogInicial(lista) {
    const countEl = document.getElementById('catalog-count');
    if (countEl) countEl.textContent = `${lista.length} discos`;
    renderizarDiscos(lista);
}

function mostrarErrorCatalogo() {
    if (contenedor) contenedor.innerHTML = `
        <p style="color:var(--text-muted);text-align:center;width:100%;padding:40px 0;grid-column:1/-1;">
            Error al conectar con el servidor.
        </p>`;
}

// ── RENDERIZAR CARDS ──────────────────────────────
function renderizarDiscos(lista) {
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = `
            <p style="color:var(--text-muted);text-align:center;width:100%;padding:40px 0;grid-column:1/-1;">
                No se encontraron discos.
            </p>`;
        return;
    }

    lista.forEach(disco => {
        const imgUrl = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=500';
        const card = document.createElement('div');
        card.className = 'disco-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${disco.titulo} por ${disco.artista}`);
        card.onclick = () => abrirModalDetalle(disco.discogs_id);
        card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') abrirModalDetalle(disco.discogs_id); };

        card.innerHTML = `
            <div class="disco-card__cover">
                <img src="${imgUrl}" alt="${disco.titulo} — ${disco.artista}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=500'">
                <span class="disco-card__badge badge--in-stock">Disponible</span>
                <div class="disco-card__overlay">
                    <span class="overlay-price">$${Number(disco.precio).toFixed(2)}</span>
                    <span class="overlay-cta">Ver álbum →</span>
                </div>
            </div>
            <div class="disco-card__body">
                <h3>${disco.titulo}</h3>
                <p class="artista">${disco.artista || '—'}</p>
            </div>`;

        contenedor.appendChild(card);
    });
}

// ── CARRUSEL ──────────────────────────────────────
function renderizarCarrusel(lista) {
    const track = document.getElementById('carrusel-track');
    if (!track) return;

    if (!lista || lista.length === 0) {
        track.innerHTML = '<p style="color:var(--text-muted);padding:20px;font-size:0.85rem;">Sin discos recientes.</p>';
        return;
    }

    track.innerHTML = lista.slice(0, 8).map(disco => {
        const img = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400';
        return `
            <div class="carrusel-card" onclick="abrirModalDetalle('${disco.discogs_id}')" role="button" tabindex="0">
                <img class="carrusel-card__img" src="${img}" alt="${disco.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400'">
                <div class="carrusel-card__info">
                    <h4>${disco.titulo}</h4>
                    <p class="carrusel-card__artista">${disco.artista || '—'}</p>
                    <span class="carrusel-card__precio">$${Number(disco.precio).toFixed(2)}</span>
                </div>
            </div>`;
    }).join('');

    carruselOffset = 0;
}

function moverCarrusel(dir) {
    const track    = document.getElementById('carrusel-track');
    const viewport = track?.parentElement;
    if (!track || !viewport) return;

    const maxScroll = track.scrollWidth - viewport.clientWidth;
    carruselOffset  = Math.max(0, Math.min(carruselOffset + dir * CARRUSEL_STEP, maxScroll));
    track.style.transform = `translateX(-${carruselOffset}px)`;

    document.getElementById('carrusel-prev').style.opacity = carruselOffset <= 0      ? '0.35' : '1';
    document.getElementById('carrusel-next').style.opacity = carruselOffset >= maxScroll ? '0.35' : '1';
}

// ── BUSCADOR CON DEBOUNCE ─────────────────────────
const inputBusqueda = document.getElementById('input-busqueda');
if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        clearTimeout(_buscarTimeout);

        if (!q) {
            _queryActual = '';
            renderizarCatalogInicial(_carruselData);
            return;
        }

        _buscarTimeout = setTimeout(() => buscarDiscos(q), 500);
    });
}

async function buscarDiscos(q, pagina = 1) {
    _queryActual  = q;
    _paginaActual = pagina;

    const countEl = document.getElementById('catalog-count');
    if (countEl) countEl.textContent = 'Buscando…';

    if (contenedor) contenedor.innerHTML = `
        <div class="disco-card disco-card--skeleton" aria-hidden="true"></div>
        <div class="disco-card disco-card--skeleton" aria-hidden="true"></div>
        <div class="disco-card disco-card--skeleton" aria-hidden="true"></div>
        <div class="disco-card disco-card--skeleton" aria-hidden="true"></div>`;

    try {
        const resp = await fetch(`${API}/buscar?q=${encodeURIComponent(q)}&pagina=${pagina}`);
        if (!resp.ok) throw new Error('Error en búsqueda');
        const data = await resp.json();

        if (countEl) countEl.textContent = `${data.total} resultados`;
        renderizarDiscos(data.resultados);

        // Paginación
        _renderizarPaginacion(data.paginas, pagina, q);
    } catch (err) {
        console.error('buscarDiscos:', err);
        mostrarErrorCatalogo();
    }
}

function _renderizarPaginacion(totalPaginas, paginaActual, q) {
    const existente = document.getElementById('paginacion-container');
    if (existente) existente.remove();

    if (totalPaginas <= 1) return;

    const paginacion = document.createElement('div');
    paginacion.id = 'paginacion-container';
    paginacion.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:8px;padding:20px 0;flex-wrap:wrap;';

    const paginas = [];
    for (let i = Math.max(1, paginaActual - 2); i <= Math.min(totalPaginas, paginaActual + 2); i++) {
        paginas.push(i);
    }

    const btnAnterior = `<button class="pag-btn" onclick="buscarDiscos('${q}', ${paginaActual - 1})" ${paginaActual <= 1 ? 'disabled' : ''}>← Anterior</button>`;
    const btnSiguiente = `<button class="pag-btn" onclick="buscarDiscos('${q}', ${paginaActual + 1})" ${paginaActual >= totalPaginas ? 'disabled' : ''}>Siguiente →</button>`;

    const numeros = paginas.map(p => `
        <button
            onclick="buscarDiscos('${q}', ${p})"
            style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-dim);background:${p === paginaActual ? 'var(--amber)' : 'var(--bg-raised)'};color:${p === paginaActual ? '#000' : 'var(--text-secondary)'};cursor:pointer;font-size:0.85rem;">
            ${p}
        </button>`).join('');

    paginacion.innerHTML = btnAnterior + numeros + btnSiguiente;
    contenedor.appendChild(paginacion);
}

// ── MODAL DETALLE ─────────────────────────────────
async function abrirModalDetalle(discogsId) {
    const modal   = document.getElementById('modal-detalle');
    const content = document.querySelector('.modal-detalle__content');

    content.classList.remove('modal-detalle__content--story');

    // Loading state
    document.getElementById('detalle-titulo').textContent  = 'Cargando…';
    document.getElementById('detalle-artista').textContent = '';
    document.getElementById('detalle-imagen').src = '';
    document.getElementById('detalle-meta-bloque').style.display    = '';
    document.getElementById('detalle-acciones-bloque').style.display = '';
    document.getElementById('detalle-story-container').style.display = 'none';
    document.getElementById('detalle-recomendados').style.display    = 'none';
    _mostrarPlaceholderVideo();

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
        const resp = await fetch(`${API}/disco/${discogsId}`);
        if (!resp.ok) throw new Error('Disco no encontrado');
        const disco = await resp.json();
        discoActivo = disco;

        _rellenarModalBase(disco);

        // Cargar historia, video y recomendaciones en paralelo
        _cargarHistoriaModal(discogsId);
        _cargarVideoModal(discogsId, disco);
        _cargarRecomendacionesModal(discogsId);

        // Registrar en historial si está logueado
        if (localStorage.getItem('vv_token')) {
            _registrarHistorial(disco);
        }
    } catch (err) {
        console.error('abrirModalDetalle:', err);
        document.getElementById('detalle-titulo').textContent = 'Error al cargar el disco';
    }
}

// Abre el modal en modo STORYTELLING (desde Novedades)
async function abrirModalStorytelling(discogsId) {
    const modal   = document.getElementById('modal-detalle');
    const content = document.querySelector('.modal-detalle__content');

    content.classList.add('modal-detalle__content--story');

    document.getElementById('detalle-titulo').textContent  = 'Cargando…';
    document.getElementById('detalle-artista').textContent = '';
    document.getElementById('detalle-meta-bloque').style.display    = 'none';
    document.getElementById('detalle-acciones-bloque').style.display = 'none';
    document.getElementById('detalle-story-container').style.display = 'none';
    _mostrarPlaceholderVideo();

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
        const resp = await fetch(`${API}/disco/${discogsId}`);
        if (!resp.ok) throw new Error('Disco no encontrado');
        const disco = await resp.json();
        discoActivo = disco;

        _rellenarModalBase(disco);
        _cargarHistoriaModal(discogsId, true);
        _cargarVideoModal(discogsId, disco);

        if (localStorage.getItem('vv_token')) {
            _registrarHistorial(disco);
        }
    } catch (err) {
        console.error('abrirModalStorytelling:', err);
        document.getElementById('detalle-titulo').textContent = 'Error al cargar el disco';
    }
}

function _rellenarModalBase(disco) {
    const imgUrl = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=600';
    document.getElementById('detalle-imagen').src = imgUrl;
    document.getElementById('detalle-imagen').alt = disco.titulo;
    document.getElementById('detalle-titulo').textContent  = disco.titulo;
    document.getElementById('detalle-artista').textContent = disco.artista || '—';
    document.getElementById('detalle-precio').textContent  = `$${Number(disco.precio).toFixed(2)}`;

    // Quitar stock — ya no aplica
    const stockEl = document.getElementById('detalle-stock');
    if (stockEl) stockEl.textContent = 'Disponible';
    const estadoEl = document.getElementById('detalle-estado');
    if (estadoEl) { estadoEl.textContent = 'En stock'; estadoEl.style.color = '#6ee7b7'; }

    // Botones siempre habilitados
    const btnCarrito = document.getElementById('detalle-btn-carrito');
    const btnComprar = document.getElementById('detalle-btn-comprar');
    if (btnCarrito) btnCarrito.disabled = false;
    if (btnComprar) btnComprar.disabled = false;

    // Género
    const generoEl = document.getElementById('detalle-genero');
    if (generoEl) {
        if (disco.genero) {
            generoEl.textContent = disco.genero;
            generoEl.style.display = 'inline-block';
        } else {
            generoEl.style.display = 'none';
        }
    }
}

// Historia bajo demanda
async function _cargarHistoriaModal(discogsId, storyMode = false) {
    const storyContainer = document.getElementById('detalle-story-container');
    const storyTexto     = document.getElementById('detalle-story-texto');
    const editBlock      = document.getElementById('detalle-historia-edit');

    if (!storyMode) {
        if (storyContainer) storyContainer.style.display = 'none';
        return;
    }

    if (storyContainer) storyContainer.style.display = 'block';
    if (storyTexto)     storyTexto.textContent = 'Cargando historia…';

    try {
        const resp = await fetch(`${API}/disco/${discogsId}/historia`);
        if (resp.ok) {
            const data = await resp.json();
            if (storyTexto) {
                storyTexto.textContent = data.cuerpo;
                storyTexto.style.display = 'block';
            }
        } else {
            if (storyTexto) {
                storyTexto.textContent = 'La historia de este álbum aún no está disponible.';
                storyTexto.style.display = 'block';
            }
        }
    } catch (e) {
        if (storyTexto) storyTexto.textContent = 'No se pudo cargar la historia.';
    }

    if (editBlock) editBlock.style.display = 'none';
}

// Video bajo demanda
async function _cargarVideoModal(discogsId) {
    try {
        const resp = await fetch(`${API}/disco/${discogsId}/video`);
        if (resp.ok) {
            const data = await resp.json();
            if (data.youtube_id) {
                _mostrarIframeVideo(`https://www.youtube-nocookie.com/embed/${data.youtube_id}?rel=0&modestbranding=1`);
                return;
            }
        }
    } catch (e) {}
    _mostrarPlaceholderVideo();
}

// Recomendaciones bajo demanda
async function _cargarRecomendacionesModal(discogsId) {
    const recomendadosEl = document.getElementById('detalle-recomendados');
    const lista          = document.getElementById('recomendados-lista');
    if (!recomendadosEl || !lista) return;

    recomendadosEl.style.display = 'none';

    try {
        const token = localStorage.getItem('vv_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const resp = await fetch(`${API}/disco/${discogsId}/recomendaciones`, { headers });
        if (!resp.ok) return;
        const discos = await resp.json();
        if (!discos.length) return;

        lista.innerHTML = discos.map(d => {
            const img = d.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=200';
            return `
            <div class="recomendado-card"
                 role="button" tabindex="0"
                 aria-label="${d.titulo} por ${d.artista}"
                 onclick="abrirModalDetalle('${d.discogs_id}')"
                 onkeydown="if(event.key==='Enter')abrirModalDetalle('${d.discogs_id}')">
                <div class="recomendado-card__img-wrap">
                    <img src="${img}" alt="${d.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=200'">
                </div>
                <div class="recomendado-card__info">
                    <div class="recomendado-card__titulo">${d.titulo}</div>
                    <div class="recomendado-card__artista">${d.artista || '—'}</div>
                </div>
            </div>`;
        }).join('');

        recomendadosEl.style.display = '';
    } catch (e) {
        console.warn('Recomendaciones:', e.message);
    }
}

// Registrar historial (localStorage)
function _registrarHistorial(disco) {
    try {
        const usuario = localStorage.getItem('usuarioLogueado');
        if (!usuario) return;

        const clave = `vv_historial_${usuario}`;
        let historial = [];
        try { historial = JSON.parse(localStorage.getItem(clave) || '[]'); } catch {}

        // Upsert: si ya existe, actualizar visto_en
        const idx = historial.findIndex(h => h.discogs_id === String(disco.discogs_id));
        const entrada = {
            discogs_id: String(disco.discogs_id),
            titulo:     disco.titulo,
            artista:    disco.artista || '',
            genero:     disco.genero  || null,
            estilo:     disco.estilo  || null,
            visto_en:   new Date().toISOString(),
        };

        if (idx >= 0) {
            historial[idx] = entrada;
        } else {
            historial.unshift(entrada);
            if (historial.length > 10) historial = historial.slice(0, 10);
        }

        localStorage.setItem(clave, JSON.stringify(historial));
    } catch (e) {
        console.warn('_registrarHistorial:', e.message);
    }
}

// Helpers de video
function _mostrarIframeVideo(src) {
    const wrapper        = document.getElementById('detalle-video-wrapper');
    const iframe         = document.getElementById('detalle-video-iframe');
    const videoContainer = document.getElementById('detalle-video-container');
    const placeholder    = document.getElementById('detalle-video-placeholder');

    if (videoContainer) videoContainer.style.display = '';
    if (wrapper)     { wrapper.style.display = 'block'; }
    if (placeholder)   placeholder.style.display = 'none';
    if (iframe)        iframe.src = src;

    const clearBtn = document.getElementById('detalle-video-clear');
    if (clearBtn) clearBtn.style.display = 'none';

    const labelTxt = document.getElementById('detalle-video-label-txt');
    if (labelTxt) labelTxt.textContent = 'Escucha el álbum';
}

function _mostrarPlaceholderVideo() {
    const iframe         = document.getElementById('detalle-video-iframe');
    const wrapper        = document.getElementById('detalle-video-wrapper');
    const placeholder    = document.getElementById('detalle-video-placeholder');
    const videoContainer = document.getElementById('detalle-video-container');
    const clearBtn       = document.getElementById('detalle-video-clear');

    if (iframe)   iframe.src = '';
    if (wrapper)  wrapper.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (videoContainer) videoContainer.style.display = 'none';
    if (placeholder)    placeholder.style.display    = 'none';
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle').classList.remove('open');
    document.body.style.overflow = '';
    _mostrarPlaceholderVideo();
    discoActivo = null;
}

document.getElementById('modal-detalle').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-detalle')) cerrarModalDetalle();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalDetalle();
        cerrarModalEnvio?.();
        cerrarModalPago?.();
    }
});

// ── GÉNEROS ───────────────────────────────────────
function inicializarGeneros() {
    const filtrosEl = document.getElementById('generos-filtros');
    if (!filtrosEl) return;

    filtrosEl.innerHTML = GENEROS_FIJOS.map((g, i) =>
        `<button class="genero-btn${i === 0 ? ' genero-btn--active' : ''}" data-genero="${g}" onclick="seleccionarGenero(this,'${g}')">${g}</button>`
    ).join('');

    seleccionarGenero(filtrosEl.children[0], GENEROS_FIJOS[0]);
}

let _generoActual = '';

async function seleccionarGenero(btn, genero) {
    document.querySelectorAll('.genero-btn').forEach(b => b.classList.remove('genero-btn--active'));
    btn.classList.add('genero-btn--active');
    _generoActual  = genero;
    _generosPagina = 1;
    await _cargarGenero(genero, 1);
}

async function _cargarGenero(genero, pagina) {
    const gridEl = document.getElementById('generos-grid');
    const pagEl  = document.getElementById('generos-paginacion');
    if (!gridEl) return;

    const clave = `${genero}:${pagina}`;
    if (_generoCache[clave]) {
        _renderizarGridGenerosPag(_generoCache[clave]);
        return;
    }

    gridEl.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">Cargando…</p>';
    if (pagEl) pagEl.innerHTML = '';

    try {
        const resp = await fetch(`${API}/genero/${encodeURIComponent(genero)}?pagina=${pagina}`);
        if (!resp.ok) throw new Error('Error al cargar género');
        const data = await resp.json();
        _generoCache[clave] = data;
        _renderizarGridGenerosPag(data);
    } catch (e) {
        gridEl.innerHTML = `<p class="generos-empty">Error al cargar ${genero}.</p>`;
    }
}

function _renderizarGridGeneros(lista) {
    _generosPagina = 1;
    _renderizarGridGenerosPag(lista);
}

function _renderizarGridGenerosPag(data) {
    const gridEl = document.getElementById('generos-grid');
    if (!gridEl) return;

    // data puede ser array (legacy) u objeto {resultados, paginas, pagina}
    const lista     = Array.isArray(data) ? data : (data.resultados || []);
    const totalPags = Array.isArray(data) ? 1    : (data.paginas    || 1);
    const pagina    = Array.isArray(data) ? 1    : (data.pagina     || 1);

    if (!lista.length) {
        gridEl.innerHTML = `<p class="generos-empty">No hay discos en este género.</p>`;
        return;
    }

    gridEl.innerHTML = lista.map(disco => {
        const img    = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400';
        const genero = disco.genero ? `<span class="novedad-card__genero-tag">${disco.genero}</span>` : '';
        return `
        <article class="novedad-card"
            role="button" tabindex="0"
            aria-label="${disco.titulo} por ${disco.artista}"
            onclick="abrirModalDetalle('${disco.discogs_id}')"
            onkeydown="if(event.key==='Enter'||event.key===' ')abrirModalDetalle('${disco.discogs_id}')">
            <div class="novedad-card__img-wrap">
                <img src="${img}" alt="${disco.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400'">
                <div class="novedad-card__story-hint">
                    <span>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                        Ver disco
                    </span>
                </div>
                ${genero}
            </div>
            <div class="novedad-card__info">
                <div class="novedad-card__titulo">${disco.titulo}</div>
                <div class="novedad-card__artista">${disco.artista || '—'}</div>
            </div>
        </article>`;
    }).join('');

    _renderizarPaginacionGeneros(totalPags, pagina);
}

function _renderizarPaginacionGeneros(totalPags, actual) {
    const el = document.getElementById('generos-paginacion');
    if (!el) return;
    if (totalPags <= 1) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <button class="pag-btn" onclick="cambiarPaginaGeneros(${actual - 1})" ${actual <= 1 ? 'disabled' : ''}>
            ← Anterior
        </button>
        <span class="pag-info">${actual} / ${totalPags}</span>
        <button class="pag-btn" onclick="cambiarPaginaGeneros(${actual + 1})" ${actual >= totalPags ? 'disabled' : ''}>
            Siguiente →
        </button>`;
}

async function cambiarPaginaGeneros(pag) {
    if (!_generoActual) return;
    await _cargarGenero(_generoActual, pag);
    document.getElementById('section-generos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── NOVEDADES ─────────────────────────────────────
function renderizarNovedades(lista) {
    _novedadesData   = lista;
    _novedadesPagina = 1;
    _novedadesQuery  = '';
    _renderizarNovedadesGrid();
}

function _renderizarNovedadesGrid() {
    const grid = document.getElementById('novedades-grid');
    if (!grid) return;

    const lista    = _novedadesQuery
        ? _novedadesData.filter(d =>
            d.titulo?.toLowerCase().includes(_novedadesQuery) ||
            (d.artista || '').toLowerCase().includes(_novedadesQuery))
        : _novedadesData;

    const total   = lista.length;
    const inicio  = (_novedadesPagina - 1) * ITEMS_POR_PAGINA;
    const pagina  = lista.slice(inicio, inicio + ITEMS_POR_PAGINA);
    const totalPags = Math.ceil(total / ITEMS_POR_PAGINA);

    if (!pagina.length) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px 0;">No hay discos disponibles.</p>';
        _renderizarPaginacionNovedades(0, 1);
        return;
    }

    grid.innerHTML = pagina.map(disco => {
        const img = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400';
        return `
        <article class="novedad-card"
            role="button" tabindex="0"
            aria-label="${disco.titulo} por ${disco.artista} — leer historia"
            onclick="abrirModalStorytelling('${disco.discogs_id}')"
            onkeydown="if(event.key==='Enter'||event.key===' ')abrirModalStorytelling('${disco.discogs_id}')">
            <div class="novedad-card__img-wrap">
                <img src="${img}" alt="${disco.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400'">
                <div class="novedad-card__story-hint">
                    <span>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                        Leer historia
                    </span>
                </div>
            </div>
            <div class="novedad-card__info">
                <div class="novedad-card__titulo">${disco.titulo}</div>
                <div class="novedad-card__artista">${disco.artista || '—'}</div>
            </div>
        </article>`;
    }).join('');

    _renderizarPaginacionNovedades(totalPags, _novedadesPagina);
}

function _renderizarPaginacionNovedades(totalPags, actual) {
    const el = document.getElementById('novedades-paginacion');
    if (!el) return;
    if (totalPags <= 1) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <button class="pag-btn" onclick="cambiarPaginaNovedades(${actual - 1})" ${actual <= 1 ? 'disabled' : ''}>
            ← Anterior
        </button>
        <span class="pag-info">${actual} / ${totalPags}</span>
        <button class="pag-btn" onclick="cambiarPaginaNovedades(${actual + 1})" ${actual >= totalPags ? 'disabled' : ''}>
            Siguiente →
        </button>`;
}

function cambiarPaginaNovedades(pag) {
    const lista = _novedadesQuery
        ? _novedadesData.filter(d =>
            d.titulo?.toLowerCase().includes(_novedadesQuery) ||
            (d.artista || '').toLowerCase().includes(_novedadesQuery))
        : _novedadesData;
    const totalPags = Math.ceil(lista.length / ITEMS_POR_PAGINA);
    if (pag < 1 || pag > totalPags) return;
    _novedadesPagina = pag;
    _renderizarNovedadesGrid();
    document.getElementById('section-novedades')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let _novedadesBusquedaTimeout = null;
let _novedadesBusquedaActiva  = false;

function buscarEnNovedades(q) {
    clearTimeout(_novedadesBusquedaTimeout);
    const query = q.trim();

    if (!query) {
        // Volver a los recientes
        _novedadesBusquedaActiva = false;
        _novedadesQuery  = '';
        _novedadesPagina = 1;
        _renderizarNovedadesGrid();
        return;
    }

    _novedadesBusquedaTimeout = setTimeout(() => _buscarEnDiscogsModoStory(query), 500);
}

async function _buscarEnDiscogsModoStory(q, pagina = 1) {
    _novedadesBusquedaActiva = true;
    _novedadesPagina         = pagina;

    const grid  = document.getElementById('novedades-grid');
    const pagEl = document.getElementById('novedades-paginacion');
    if (grid) grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;grid-column:1/-1;">Buscando...</p>';
    if (pagEl) pagEl.innerHTML = '';

    try {
        const resp = await fetch(`${API}/buscar?q=${encodeURIComponent(q)}&pagina=${pagina}`);
        if (!resp.ok) throw new Error('Error');
        const data = await resp.json();

        if (!data.resultados.length) {
            if (grid) grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;grid-column:1/-1;">No se encontraron discos.</p>';
            return;
        }

        // Render como novedades (storytelling mode)
        if (grid) {
            grid.innerHTML = data.resultados.map(disco => {
                const img = disco.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400';
                return `
                <article class="novedad-card"
                    role="button" tabindex="0"
                    aria-label="${disco.titulo} por ${disco.artista} — leer historia"
                    onclick="abrirModalStorytelling('${disco.discogs_id}')"
                    onkeydown="if(event.key==='Enter'||event.key===' ')abrirModalStorytelling('${disco.discogs_id}')">
                    <div class="novedad-card__img-wrap">
                        <img src="${img}" alt="${disco.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=400'">
                        <div class="novedad-card__story-hint">
                            <span>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                                Leer historia
                            </span>
                        </div>
                    </div>
                    <div class="novedad-card__info">
                        <div class="novedad-card__titulo">${disco.titulo}</div>
                        <div class="novedad-card__artista">${disco.artista || '—'}</div>
                    </div>
                </article>`;
            }).join('');
        }

        // Paginación con Anterior/Siguiente
        if (pagEl && data.paginas > 1) {
            pagEl.innerHTML = `
                <button class="pag-btn" onclick="_buscarEnDiscogsModoStory('${q}', ${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
                <span class="pag-info">${pagina} / ${data.paginas}</span>
                <button class="pag-btn" onclick="_buscarEnDiscogsModoStory('${q}', ${pagina + 1})" ${pagina >= data.paginas ? 'disabled' : ''}>Siguiente →</button>`;
        }

    } catch (e) {
        if (grid) grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;grid-column:1/-1;">Error al buscar. Intenta de nuevo.</p>';
    }
}

// ── SCROLL HELPERS ────────────────────────────────
function scrollToGeneros(e) {
    e.preventDefault();
    document.getElementById('section-generos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToNovedades(e) {
    e.preventDefault();
    document.getElementById('section-novedades')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── CARRITO ───────────────────────────────────────

function guardarCarrito() {
    localStorage.setItem('vv_carrito', JSON.stringify(carrito));
}

function renderizarCarrito() {
    const itemsEl = document.getElementById('carrito-items');
    const totalEl = document.getElementById('carrito-total');
    const countEl = document.getElementById('carrito-count');

    const totalUds    = carrito.reduce((s, i) => s + i.cantidad, 0);
    const totalPrecio = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

    if (countEl) {
        countEl.textContent   = totalUds;
        countEl.style.display = totalUds > 0 ? 'flex' : 'none';
    }
    if (totalEl) totalEl.textContent = `$${totalPrecio.toFixed(2)}`;

    if (!itemsEl) return;

    if (carrito.length === 0) {
        itemsEl.innerHTML = `
            <div class="cart-empty-msg">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px;opacity:0.3;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <p>Tu carrito está vacío.</p>
                <p style="margin-top:4px;font-size:0.78rem;color:var(--text-muted);">Agrega vinilos para empezar.</p>
            </div>`;
        return;
    }

    itemsEl.innerHTML = carrito.map(item => {
        const img = item.imagen_url || 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=100';
        return `
            <div class="cart-item">
                <img class="cart-item__img" src="${img}" alt="${item.titulo}" onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?q=80&w=100'">
                <div class="cart-item__info">
                    <div class="cart-item__titulo">${item.titulo}</div>
                    <div class="cart-item__artista">${item.artista || '—'}</div>
                    <div class="cart-item__precio">$${(item.precio * item.cantidad).toFixed(2)}</div>
                </div>
                <div class="cart-item__controls">
                    <button class="qty-btn" onclick="cambiarCantidad('${item.discogs_id}', -1)">−</button>
                    <span class="cart-item__qty">${item.cantidad}</span>
                    <button class="qty-btn" onclick="cambiarCantidad('${item.discogs_id}', 1)">+</button>
                </div>
                <button class="cart-item__remove" onclick="eliminarDelCarrito('${item.discogs_id}')" aria-label="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;
    }).join('');
}

function agregarAlCarrito(disco) {
    const existente = carrito.find(i => i.discogs_id === disco.discogs_id);
    if (existente) {
        existente.cantidad++;
    } else {
        carrito.push({
            discogs_id: disco.discogs_id,
            titulo:     disco.titulo,
            artista:    disco.artista || '',
            imagen_url: disco.imagen_url || null,
            precio:     Number(disco.precio),
            cantidad:   1,
        });
    }
    guardarCarrito();
    renderizarCarrito();
    abrirCarrito();
}

function agregarAlCarritoDesdeModal() {
    if (!discoActivo) return;
    agregarAlCarrito(discoActivo);
    cerrarModalDetalle();
}

function cambiarCantidad(discogsId, delta) {
    const item = carrito.find(i => i.discogs_id === discogsId);
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) carrito = carrito.filter(i => i.discogs_id !== discogsId);
    guardarCarrito();
    renderizarCarrito();
}

function eliminarDelCarrito(discogsId) {
    carrito = carrito.filter(i => i.discogs_id !== discogsId);
    guardarCarrito();
    renderizarCarrito();
}

function vaciarCarrito() {
    if (!carrito.length) return;
    mostrarConfirm('¿Vaciar el carrito? Se eliminarán todos los vinilos.', () => {
        carrito = [];
        guardarCarrito();
        renderizarCarrito();
    });
}

// ── CART PANEL ────────────────────────────────────
function toggleCarrito() {
    const panel   = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    const isOpen  = panel.classList.contains('open');
    if (isOpen) {
        panel.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    } else {
        abrirCarrito();
    }
}

function abrirCarrito() {
    document.getElementById('cart-panel').classList.add('open');
    document.getElementById('cart-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

// ── COMPRA INDIVIDUAL DESDE MODAL ─────────────────
function comprarDesdeModal() {
    if (!discoActivo) return;
    abrirModalEnvio(discoActivo);
}

// ── AUTH ──────────────────────────────────────────
function authHeaders() {
    return {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${localStorage.getItem('vv_token') || ''}`,
    };
}

function actualizarInterfazUsuario() {
    const usuario  = localStorage.getItem('usuarioLogueado');
    const esAdmin  = localStorage.getItem('esAdmin') === 'true';
    const section  = document.getElementById('auth-section');
    if (!section) return;

    if (usuario) {
        section.innerHTML = `
            <button class="cart-btn btn-sm" onclick="toggleCarrito()" aria-label="Abrir carrito">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Carrito
                <span class="cart-badge" id="carrito-count">0</span>
            </button>
            <button class="cart-btn btn-sm" onclick="toggleHistorial()" aria-label="Ver historial de compras">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                Mis Compras
            </button>
            ${(esAdmin || localStorage.getItem('esDemo') === 'true') ? `<button class="cart-btn btn-sm" onclick="window.location.href='admin.html'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> Admin</button>` : ''}
            <span style="font-size:0.8rem;color:var(--text-muted);padding:0 4px;">${usuario}</span>
            <button class="btn-ghost btn-sm" onclick="cerrarSesion()">Salir</button>`;
    } else {
        section.innerHTML = `
            <button class="cart-btn btn-sm" onclick="toggleCarrito()" aria-label="Abrir carrito">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Carrito
                <span class="cart-badge" id="carrito-count">0</span>
            </button>
            <button class="btn-ghost btn-sm" onclick="window.location.href='login.html'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Entrar
            </button>`;
    }
    renderizarCarrito();
}

function cerrarSesion() {
    localStorage.removeItem('vv_token');
    localStorage.removeItem('usuarioLogueado');
    localStorage.removeItem('esAdmin');
    actualizarInterfazUsuario();
    mostrarToast('Sesión cerrada.', 'info');
}

// ── TOAST ─────────────────────────────────────────
function mostrarToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconos = {
        success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warning: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${tipo}`;
    toast.innerHTML = `<span class="toast__icon">${iconos[tipo] || iconos.info}</span><span>${mensaje}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast--visible')));

    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 350);
    }, tipo === 'error' ? 5000 : 3500);
}

// ── CONFIRM ───────────────────────────────────────
function mostrarConfirm(mensaje, callbackSi, callbackNo) {
    const modal  = document.getElementById('modal-confirm');
    const msgEl  = document.getElementById('confirm-msg');
    const btnSi  = document.getElementById('confirm-yes');
    const btnNo  = document.getElementById('confirm-no');

    msgEl.textContent = mensaje;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const limpiar = () => {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        btnSi.onclick = null;
        btnNo.onclick = null;
    };

    btnSi.onclick = () => { limpiar(); callbackSi?.(); };
    btnNo.onclick = () => { limpiar(); callbackNo?.(); };
}

// ── MODAL DE ENVÍO ────────────────────────────────
let _datosEnvio = null;
let _discoEnvioActivo = null;

function abrirModalEnvio(disco) {
    _discoEnvioActivo = disco;
    const subtitulo = document.getElementById('envio-subtitulo');
    if (subtitulo) subtitulo.textContent = disco.titulo ? `Para: ${disco.titulo}` : 'Resumen del pedido';

    document.getElementById('form-envio')?.reset();
    document.getElementById('modal-envio').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarModalEnvio() {
    document.getElementById('modal-envio')?.classList.remove('open');
    document.body.style.overflow = '';
}

function _bindEnvioForm() {
    const form = document.getElementById('form-envio');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const get = (id) => document.getElementById(id)?.value.trim() || '';
        const nombre = get('envio-nombre');
        const calle  = get('envio-calle');
        const numExt = get('envio-num-ext');
        const colonia = get('envio-colonia');
        const cp     = get('envio-cp');
        const ciudad = get('envio-ciudad');
        const estado = get('envio-estado');

        if (!nombre || !calle || !numExt || !colonia || !cp || !ciudad || !estado) {
            mostrarToast('Por favor completa todos los campos obligatorios.', 'error');
            return;
        }

        _datosEnvio = {
            nombre_receptor: nombre,
            calle,
            numero_ext:  numExt,
            numero_int:  get('envio-num-int') || null,
            colonia,
            codigo_postal: cp,
            ciudad,
            estado,
            referencias: get('envio-referencias') || null,
        };

        cerrarModalEnvio();
        // Determine if it's cart or single disco
        if (_discoEnvioActivo?._esCarrito) {
            abrirModalPago(_discoEnvioActivo);
        } else {
            abrirModalPago(_discoEnvioActivo);
        }
    });
}

// ── MODAL DE PAGO ─────────────────────────────────
let _discoPagoActivo = null;

function abrirModalPago(disco) {
    _discoPagoActivo = disco;

    const precio = Number(disco.precio).toFixed(2);
    const subtitulo = document.getElementById('pago-subtitulo');
    const submitTxt = document.getElementById('pago-submit-txt');
    if (subtitulo) subtitulo.textContent = `${disco.titulo} — $${precio}`;
    if (submitTxt) submitTxt.textContent = `Pagar $${precio}`;

    ['pago-nombre','pago-numero','pago-expiry','pago-cvv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const prevNum = document.getElementById('preview-numero');
    const prevNom = document.getElementById('preview-nombre');
    const prevExp = document.getElementById('preview-expiry');
    if (prevNum) prevNum.textContent = '•••• •••• •••• ••••';
    if (prevNom) prevNom.textContent = 'TU NOMBRE';
    if (prevExp) prevExp.textContent = 'MM/YY';

    const submitBtn = document.getElementById('pago-submit-btn');
    if (submitBtn) { submitBtn.classList.remove('loading'); submitBtn.disabled = false; }

    document.getElementById('modal-pago').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('pago-nombre')?.focus(), 100);
}

function cerrarModalPago() {
    document.getElementById('modal-pago')?.classList.remove('open');
    document.body.style.overflow = '';
    _discoPagoActivo = null;
}

function _bindPagoInputs() {
    const numEl    = document.getElementById('pago-numero');
    const nameEl   = document.getElementById('pago-nombre');
    const expiryEl = document.getElementById('pago-expiry');
    const cvvEl    = document.getElementById('pago-cvv');
    if (!numEl) return;

    numEl.addEventListener('input', e => {
        let val = e.target.value.replace(/\D/g, '').slice(0, 16);
        e.target.value = val.match(/.{1,4}/g)?.join(' ') || val;
        const disp = val.padEnd(16, '•').match(/.{1,4}/g).join(' ');
        const el = document.getElementById('preview-numero');
        if (el) el.textContent = disp;
    });

    nameEl.addEventListener('input', e => {
        const v  = e.target.value.toUpperCase().slice(0, 26);
        const el = document.getElementById('preview-nombre');
        if (el) el.textContent = v || 'TU NOMBRE';
    });

    expiryEl.addEventListener('input', e => {
        let val = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (val.length >= 3) val = val.slice(0,2) + '/' + val.slice(2);
        e.target.value = val;
        const el = document.getElementById('preview-expiry');
        if (el) el.textContent = val || 'MM/YY';
    });

    cvvEl.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });

    const formPago = document.getElementById('form-pago');
    if (formPago) {
        formPago.addEventListener('submit', async (e) => {
            e.preventDefault();
            await procesarPago();
        });
    }
}

// ── CHECKOUT DESDE CARRITO ────────────────────────
function abrirCheckoutDesdeCarrito() {
    if (!carrito.length) {
        mostrarToast('Tu carrito está vacío.', 'warning');
        return;
    }
    if (!localStorage.getItem('usuarioLogueado')) {
        mostrarToast('Debes iniciar sesión para comprar.', 'warning');
        window.location.href = 'login.html';
        return;
    }

    const totalPrecio = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const totalUds    = carrito.reduce((s, i) => s + i.cantidad, 0);
    const resumen     = totalUds === 1 ? carrito[0].titulo : `${totalUds} artículos`;

    _discoEnvioActivo = { titulo: resumen, precio: totalPrecio, _esCarrito: true };

    // Cerrar carrito
    document.getElementById('cart-panel')?.classList.remove('open');
    document.getElementById('cart-overlay')?.classList.remove('open');

    abrirModalEnvio(_discoEnvioActivo);
}

// ── PROCESAR PAGO (localStorage) ─────────────────────────
async function procesarPago() {
    if (!_discoPagoActivo) return;

    const nombre = document.getElementById('pago-nombre')?.value.trim();
    const numero = document.getElementById('pago-numero')?.value.replace(/\s/g, '');
    const expiry = document.getElementById('pago-expiry')?.value.trim();
    const cvv    = document.getElementById('pago-cvv')?.value.trim();

    if (!nombre)               { mostrarToast('Por favor ingresa el nombre del titular.', 'error'); return; }
    if (numero?.length < 16)   { mostrarToast('El número de tarjeta debe tener 16 dígitos.', 'error'); return; }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) { mostrarToast('La fecha de vencimiento debe ser MM/YY.', 'error'); return; }
    if (cvv?.length < 3)       { mostrarToast('El CVV debe tener al menos 3 dígitos.', 'error'); return; }

    const usuarioLogueado = localStorage.getItem('usuarioLogueado');
    if (!usuarioLogueado) {
        mostrarToast('Debes iniciar sesión para comprar.', 'warning');
        cerrarModalPago();
        window.location.href = 'login.html';
        return;
    }

    const submitBtn = document.getElementById('pago-submit-btn');
    if (submitBtn) { submitBtn.classList.add('loading'); submitBtn.disabled = true; }
    const submitTxt = document.getElementById('pago-submit-txt');
    if (submitTxt) submitTxt.textContent = 'Procesando…';

    try {
        // Construir lista de items
        let items;
        if (_discoPagoActivo._esCarrito) {
            items = carrito.map(item => ({
                discogs_id: item.discogs_id,
                titulo:     item.titulo,
                artista:    item.artista,
                imagen_url: item.imagen_url || null,
                cantidad:   item.cantidad,
                anio:       item.anio || null,
            }));
        } else {
            items = [{
                discogs_id: _discoPagoActivo.discogs_id,
                titulo:     _discoPagoActivo.titulo,
                artista:    _discoPagoActivo.artista || '',
                imagen_url: _discoPagoActivo.imagen_url || null,
                cantidad:   1,
                anio:       _discoPagoActivo.anio || null,
            }];
        }

        // Calcular precios reales en el backend
        const preciosResp = await fetch(`${API}/calcular-precio`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ items }),
        });

        if (!preciosResp.ok) throw new Error('Error al calcular precios');
        const preciosData = await preciosResp.json();

        const itemsConPrecio = preciosData.items;
        const total          = preciosData.total;

        // Guardar la compra en localStorage
        const claveCompras = `vv_compras_${usuarioLogueado}`;
        let compras = [];
        try { compras = JSON.parse(localStorage.getItem(claveCompras) || '[]'); } catch {}

        const nuevaVenta = {
            id_venta:  Date.now(),                       // ID único basado en timestamp
            fecha:     new Date().toISOString(),
            estado:    'pagada',
            total,
            ciudad:    _datosEnvio?.ciudad || null,
            envio:     _datosEnvio || null,
            discos:    itemsConPrecio.map(item => ({
                discogs_id: item.discogs_id,
                titulo:     item.titulo,
                artista:    item.artista || '',
                imagen_url: item.imagen_url || null,
                cantidad:   item.cantidad,
                precio:     item.precio,
                subtotal:   item.precio * item.cantidad,
            })),
        };

        compras.unshift(nuevaVenta);  // más reciente primero
        localStorage.setItem(claveCompras, JSON.stringify(compras));

        // Éxito
        const resumen = _discoPagoActivo._esCarrito
            ? `${carrito.reduce((s, i) => s + i.cantidad, 0)} artículos comprados.`
            : `"${_discoPagoActivo.titulo}" es tuyo.`;
        mostrarToast(`✨ ¡Compra exitosa! ${resumen}`, 'success');
        carrito = [];
        guardarCarrito();
        renderizarCarrito();
        cerrarModalPago();
        cerrarModalDetalle();

    } catch (err) {
        console.error('procesarPago:', err);
        mostrarToast('Error de conexión con el servidor.', 'error');
        if (submitBtn) { submitBtn.classList.remove('loading'); submitBtn.disabled = false; }
        if (submitTxt) submitTxt.textContent = `Pagar $${Number(_discoPagoActivo.precio).toFixed(2)}`;
    }
}


// ── HISTORIAL DE COMPRAS ──────────────────────────
const COMPRAS_POR_PAGINA = 10;
let _comprasData   = [];
let _comprasPagina = 1;

async function toggleHistorial() {
    const panel   = document.getElementById('historial-panel');
    const overlay = document.getElementById('historial-overlay');
    const isOpen  = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    } else {
        panel.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        await cargarHistorialCompras();
    }
}

async function cargarHistorialCompras() {
    const contenido = document.getElementById('historial-contenido');
    const pagEl     = document.getElementById('historial-paginacion');

    const usuarioLogueado = localStorage.getItem('usuarioLogueado');
    if (!usuarioLogueado) {
        contenido.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px 0;font-size:0.875rem;">Inicia sesión para ver tus compras.</p>`;
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    contenido.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px 0;font-size:0.875rem;">Cargando…</p>`;
    if (pagEl) pagEl.innerHTML = '';

    try {
        const claveCompras = `vv_compras_${usuarioLogueado}`;
        _comprasData   = JSON.parse(localStorage.getItem(claveCompras) || '[]');
        _comprasPagina = 1;
        _renderizarCompras();
    } catch (e) {
        contenido.innerHTML = `<p style="color:#fca5a5;text-align:center;padding:40px 0;font-size:0.875rem;">Error al cargar el historial.</p>`;
    }
}

function _renderizarCompras() {
    const contenido = document.getElementById('historial-contenido');
    const pagEl     = document.getElementById('historial-paginacion');

    if (!_comprasData.length) {
        contenido.innerHTML = `
            <div style="text-align:center;padding:40px 20px;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;display:block;margin:0 auto 12px;"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                <p style="color:var(--text-muted);font-size:0.875rem;">Aún no has realizado compras.</p>
            </div>`;
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    const total     = _comprasData.length;
    const totalPags = Math.ceil(total / COMPRAS_POR_PAGINA);
    const inicio    = (_comprasPagina - 1) * COMPRAS_POR_PAGINA;
    const pagina    = _comprasData.slice(inicio, inicio + COMPRAS_POR_PAGINA);

    contenido.innerHTML = pagina.map(venta => {
        const fecha  = new Date(venta.fecha).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
        const discos = venta.discos.map(d => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-dim);font-size:0.8rem;">
                <div>
                    <span style="color:var(--text-primary);">${d.titulo}</span>
                    <span style="color:var(--text-muted);margin-left:6px;">× ${d.cantidad}</span>
                    <div style="color:var(--text-muted);font-size:0.75rem;">${d.artista || '—'}</div>
                </div>
                <span style="color:var(--amber);font-weight:600;white-space:nowrap;">$${d.subtotal.toFixed(2)}</span>
            </div>`).join('');

        return `
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <div>
                        <span style="font-family:'DM Mono',monospace;font-size:0.7rem;color:var(--text-muted);">Orden #${venta.id_venta}</span>
                        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${fecha}${venta.ciudad ? ' · ' + venta.ciudad : ''}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;color:var(--amber);">$${venta.total.toFixed(2)}</div>
                        <span style="font-size:0.7rem;font-family:'DM Mono',monospace;color:var(--text-muted);">${venta.estado}</span>
                    </div>
                </div>
                ${discos}
            </div>`;
    }).join('');

    // Paginación
    if (pagEl) {
        if (totalPags <= 1) {
            pagEl.innerHTML = '';
        } else {
            pagEl.innerHTML = `
                <button class="pag-btn" onclick="_cambiarPaginaCompras(${_comprasPagina - 1})" ${_comprasPagina <= 1 ? 'disabled' : ''}>← Anterior</button>
                <span class="pag-info">${_comprasPagina} / ${totalPags}</span>
                <button class="pag-btn" onclick="_cambiarPaginaCompras(${_comprasPagina + 1})" ${_comprasPagina >= totalPags ? 'disabled' : ''}>Siguiente →</button>`;
        }
    }
}

function _cambiarPaginaCompras(pag) {
    const totalPags = Math.ceil(_comprasData.length / COMPRAS_POR_PAGINA);
    if (pag < 1 || pag > totalPags) return;
    _comprasPagina = pag;
    _renderizarCompras();
}

// ── INIT DOM ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _bindPagoInputs();
    _bindEnvioForm();
});
