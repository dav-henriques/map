/**
 * ═══════════════════════════════════════════════════════════
 *  POKÉMAP — script.js
 *  Motor principal: GPS, Leaflet, marcador animado, HUD
 *
 *  Estrutura:
 *    1. Configuração e constantes
 *    2. Inicialização do mapa
 *    3. Geolocation API
 *    4. Marcador do jogador
 *    5. HUD (coordenadas, status, botões)
 *    6. Toast / notificações
 *    7. Loading screen
 *    8. Boot
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ──────────────────────────────────────────────────────────
   1. CONFIGURAÇÃO E CONSTANTES
────────────────────────────────────────────────────────── */

const CONFIG = {
  // Posição inicial (centro do Brasil) usada antes do GPS responder
  fallbackLat:  -15.7942,
  fallbackLng:  -47.8825,

  // Nível de zoom ao centralizar no jogador
  zoomOnPlayer:  17,
  // Zoom inicial (antes de ter GPS)
  zoomInitial:   5,

  // Tile layer do mapa — CartoDB Dark Matter (visual escuro clean)
  tileUrl:       'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttr:      '© OpenStreetMap contributors © CARTO',
  tileMaxZoom:   19,

  // Opções da Geolocation API
  geoOptions: {
    enableHighAccuracy: true,   // usa GPS real, não só wifi/cell
    maximumAge:         5000,   // aceita posição de até 5s atrás
    timeout:            15000,  // desiste após 15s
  },

  // Tempo do loading screen artificial (ms)
  loadingMinDuration: 2200,
};

/* ──────────────────────────────────────────────────────────
   2. ESTADO GLOBAL
────────────────────────────────────────────────────────── */

const state = {
  map:           null,    // instância Leaflet
  playerMarker:  null,    // marcador do jogador
  watchId:       null,    // ID do watchPosition
  firstFix:      false,   // se já recebemos a primeira posição
  lat:           null,
  lng:           null,
  accuracy:      null,    // precisão em metros
};

/* ──────────────────────────────────────────────────────────
   3. INICIALIZAÇÃO DO MAPA
────────────────────────────────────────────────────────── */

function initMap() {
  // Cria o mapa Leaflet no elemento #map
  state.map = L.map('map', {
    center:         [CONFIG.fallbackLat, CONFIG.fallbackLng],
    zoom:           CONFIG.zoomInitial,
    zoomControl:    false,   // usamos nossos próprios botões
    attributionControl: true,
  });

  // Carrega o tile layer (mapa escuro CartoDB)
  L.tileLayer(CONFIG.tileUrl, {
    attribution: CONFIG.tileAttr,
    maxZoom:     CONFIG.tileMaxZoom,
    subdomains:  'abcd',
  }).addTo(state.map);

  console.log('[PokéMap] Mapa inicializado.');
}

/* ──────────────────────────────────────────────────────────
   4. MARCADOR DO JOGADOR
────────────────────────────────────────────────────────── */

/**
 * Cria um DivIcon customizado para o marcador do jogador.
 * Usa HTML/CSS puro para o efeito de pulse animado.
 */
function createPlayerIcon() {
  return L.divIcon({
    className: '',   // evita classe padrão do Leaflet
    html: `
      <div class="player-marker-wrap">
        <div class="player-range"></div>
        <div class="player-pulse-ring"></div>
        <div class="player-pulse-ring delay1"></div>
        <div class="player-pulse-ring delay2"></div>
        <div class="player-avatar">🎮</div>
      </div>
    `,
    iconSize:   [90, 90],
    iconAnchor: [45, 45],   // centro do ícone
    popupAnchor:[0, -50],
  });
}

/**
 * Cria ou atualiza o marcador do jogador no mapa.
 * @param {number} lat
 * @param {number} lng
 */
function updatePlayerMarker(lat, lng) {
  if (!state.playerMarker) {
    // Primeira vez: cria o marcador
    state.playerMarker = L.marker([lat, lng], {
      icon: createPlayerIcon(),
      zIndexOffset: 1000,  // fica na frente de outros marcadores
    }).addTo(state.map);

    // Popup ao clicar no marcador
    state.playerMarker.bindPopup(() => buildPlayerPopup());

  } else {
    // Atualiza a posição sem recriar o marcador
    state.playerMarker.setLatLng([lat, lng]);
  }
}

/**
 * Monta o HTML do popup do jogador com coordenadas atuais.
 */
function buildPlayerPopup() {
  const lat = state.lat?.toFixed(5) ?? '--';
  const lng = state.lng?.toFixed(5) ?? '--';
  const acc = state.accuracy ? `±${Math.round(state.accuracy)}m` : '--';

  return `
    <div class="popup-title">👤 Você está aqui</div>
    <div class="popup-detail">Lat: ${lat}</div>
    <div class="popup-detail">Lng: ${lng}</div>
    <div class="popup-detail">Precisão: ${acc}</div>
  `;
}

/* ──────────────────────────────────────────────────────────
   5. GEOLOCATION API
────────────────────────────────────────────────────────── */

/**
 * Inicia o rastreamento de posição usando watchPosition,
 * que chama o callback toda vez que a posição muda.
 */
function startGPS() {
  if (!navigator.geolocation) {
    showError('Seu navegador não suporta geolocalização.');
    return;
  }

  setStatus('searching', 'buscando GPS...');

  state.watchId = navigator.geolocation.watchPosition(
    onPositionSuccess,
    onPositionError,
    CONFIG.geoOptions
  );
}

/**
 * Callback chamado quando a posição é obtida/atualizada.
 * @param {GeolocationPosition} position
 */
function onPositionSuccess(position) {
  const { latitude, longitude, accuracy } = position.coords;

  state.lat      = latitude;
  state.lng      = longitude;
  state.accuracy = accuracy;

  // Atualiza marcador no mapa
  updatePlayerMarker(latitude, longitude);

  // Primeira posição: oculta loading e centraliza
  if (!state.firstFix) {
    state.firstFix = true;
    hideLoading();
    centerOnPlayer(true);  // zoom automático na primeira fix
    showToast('📍 Localização obtida!');
  }

  // Atualiza HUD
  updateHUDCoords(latitude, longitude);
  setStatus('active', `±${Math.round(accuracy)}m`);

  console.log(`[GPS] Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}, Acc: ${accuracy.toFixed(0)}m`);
}

/**
 * Callback de erro da Geolocation API.
 * @param {GeolocationPositionError} err
 */
function onPositionError(err) {
  console.error('[GPS] Erro:', err.code, err.message);

  switch (err.code) {
    case 1: // PERMISSION_DENIED
      showErrorScreen();
      break;

    case 2: // POSITION_UNAVAILABLE
      setStatus('error', 'sinal indisponível');
      showToast('⚠️ Sinal GPS fraco. Tente ao ar livre.');
      // Tenta de novo após delay
      setTimeout(startGPS, 8000);
      break;

    case 3: // TIMEOUT
      setStatus('error', 'timeout GPS');
      showToast('⏱ GPS demorou. Tentando novamente...');
      setTimeout(startGPS, 5000);
      break;
  }
}

/* ──────────────────────────────────────────────────────────
   6. HUD — CONTROLES E DISPLAY
────────────────────────────────────────────────────────── */

/**
 * Centraliza o mapa na posição do jogador.
 * @param {boolean} animate — se deve animar o voo
 */
function centerOnPlayer(animate = true) {
  if (state.lat == null) return;

  if (animate) {
    state.map.flyTo([state.lat, state.lng], CONFIG.zoomOnPlayer, {
      duration: 1.2,
      easeLinearity: 0.5,
    });
  } else {
    state.map.setView([state.lat, state.lng], CONFIG.zoomOnPlayer);
  }
}

/**
 * Atualiza o display de coordenadas no HUD superior.
 */
function updateHUDCoords(lat, lng) {
  const el = document.getElementById('hud-coords');
  const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
  el.textContent = `${latStr}  ${lngStr}`;
}

/**
 * Atualiza o indicador de status do GPS.
 * @param {'searching'|'active'|'error'} type
 * @param {string} text
 */
function setStatus(type, text) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-text');

  dot.className  = `status-dot ${type}`;
  span.textContent = text;
}

/* ──────────────────────────────────────────────────────────
   7. TOAST NOTIFICATIONS
────────────────────────────────────────────────────────── */

let toastTimeout = null;

/**
 * Exibe uma mensagem temporária na parte superior da tela.
 * @param {string} msg — texto da notificação
 * @param {number} duration — duração em ms (padrão 3000)
 */
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');

  // Força reflow para a transição funcionar
  void el.offsetWidth;
  el.classList.add('visible');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, duration);
}

/* ──────────────────────────────────────────────────────────
   8. LOADING SCREEN
────────────────────────────────────────────────────────── */

let loadingReady = false;  // true quando animação mínima passou
let gpsReady     = false;  // true quando primeira posição chegou

/**
 * Anima a barra de loading e marca como pronto após tempo mínimo.
 */
function animateLoading() {
  const fill = document.getElementById('loading-fill');
  const msg  = document.getElementById('loading-msg');

  // Sequência de mensagens enquanto espera o GPS
  const steps = [
    { pct: 20,  text: 'Carregando mapa...',     delay: 300  },
    { pct: 50,  text: 'Conectando ao GPS...',   delay: 800  },
    { pct: 75,  text: 'Buscando sinal...',       delay: 1400 },
    { pct: 90,  text: 'Quase lá...',             delay: 1900 },
  ];

  steps.forEach(s => {
    setTimeout(() => {
      fill.style.width = `${s.pct}%`;
      msg.textContent  = s.text;
    }, s.delay);
  });

  // Marca loading como pronto após duração mínima
  setTimeout(() => {
    loadingReady = true;
    tryHideLoading();
  }, CONFIG.loadingMinDuration);
}

/**
 * Oculta o loading apenas quando AMBOS estão prontos:
 * a animação mínima E o GPS já respondeu.
 */
function tryHideLoading() {
  if (loadingReady && gpsReady) {
    const fill = document.getElementById('loading-fill');
    fill.style.width = '100%';

    setTimeout(() => {
      const screen = document.getElementById('loading-screen');
      screen.style.transition = 'opacity .5s ease';
      screen.style.opacity    = '0';
      setTimeout(() => screen.classList.add('hidden'), 500);
    }, 300);
  }
}

/**
 * Sinaliza que o GPS respondeu e tenta fechar o loading.
 */
function hideLoading() {
  gpsReady = true;
  tryHideLoading();
}

/**
 * Mostra a tela de erro de permissão negada.
 */
function showErrorScreen() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('error-screen').classList.remove('hidden');
}

/**
 * Fallback: se GPS demorar muito, fecha o loading mesmo assim.
 */
function showError(msg) {
  console.warn('[PokéMap]', msg);
  hideLoading();
  setStatus('error', 'erro');
}

/* ──────────────────────────────────────────────────────────
   9. BOTÕES DO HUD
────────────────────────────────────────────────────────── */

function bindButtons() {
  // Centralizar no jogador
  document.getElementById('btn-center').addEventListener('click', () => {
    if (state.lat == null) {
      showToast('⏳ Aguardando GPS...');
      return;
    }
    centerOnPlayer(true);
  });

  // Zoom in
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    state.map.zoomIn();
  });

  // Clique longo no mapa abre popup com coordenadas
  // (útil para testes em desktop onde não há GPS)
  state.map.on('contextmenu', (e) => {
    const { lat, lng } = e.latlng;
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`
        <div class="popup-title">📍 Ponto no mapa</div>
        <div class="popup-detail">Lat: ${lat.toFixed(5)}</div>
        <div class="popup-detail">Lng: ${lng.toFixed(5)}</div>
      `)
      .openOn(state.map);
  });
}

/* ──────────────────────────────────────────────────────────
   10. PREVENÇÃO DE COMPORTAMENTOS MOBILE INDESEJADOS
────────────────────────────────────────────────────────── */

function lockMobileViewport() {
  // Impede scroll bounce no iOS
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#map')) e.preventDefault();
  }, { passive: false });

  // Impede duplo toque de dar zoom na página (deixa o mapa cuidar)
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) e.preventDefault();
    lastTap = now;
  }, { passive: false });
}

/* ──────────────────────────────────────────────────────────
   11. PONTO DE ENTRADA — BOOT
────────────────────────────────────────────────────────── */

/**
 * Inicializa o app na ordem correta.
 */
function boot() {
  console.log('[PokéMap] Iniciando...');

  // 1. Trava comportamentos mobile
  lockMobileViewport();

  // 2. Inicia animação de loading
  animateLoading();

  // 3. Cria o mapa Leaflet
  initMap();

  // 4. Registra eventos dos botões
  bindButtons();

  // 5. Inicia GPS (assíncrono — responde via callbacks)
  startGPS();

  // 6. Safety fallback: se GPS não responder em 20s,
  //    fecha o loading de qualquer jeito
  setTimeout(() => {
    if (!state.firstFix) {
      hideLoading();
      setStatus('error', 'sem sinal GPS');
      showToast('⚠️ GPS sem resposta. Verifique as permissões.');
    }
  }, 20000);
}

// Espera o DOM estar pronto antes de bootar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ──────────────────────────────────────────────────────────
   EXPORT (para fácil expansão futura)
   Ex: window.PokéMap.showToast('🐉 Pokémon selvagem!')
────────────────────────────────────────────────────────── */
window.PokeMap = {
  showToast,
  centerOnPlayer,
  getState: () => ({ ...state }),   // cópia shallow do estado
};
