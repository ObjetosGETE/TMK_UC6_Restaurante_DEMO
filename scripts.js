// scripts.js

let unityInstance = null;
let isSoundEnabled = true;
let currentPosition, controlsOffset, separationSpace;
let ttsConfig = null;
let isAccessibilityLayerActive = false;
let accessibilityDebugMode = false;    // ⭐ Controle visual debug
let accessibilityPointerEvents = true; // ⭐ NOVA VARIÁVEL: Controle pointer-events

const controlsContainer = document.querySelector(".controls-container");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const soundBtn = document.getElementById("sound-btn");
const menuButton = document.getElementById("menu");
const menuPanel = document.getElementById("menu-panel");
const accessibilityOverlay = document.getElementById("accessibility-overlay");

let panelWidth, focusableEls, firstFocusableEl, lastFocusableEl;

document.addEventListener("DOMContentLoaded", async () => {
  // 1) Carrega config.json
  try {
    const res = await fetch("config.json");
    const cfg = await res.json();

    // VLibras
    if (cfg.enableVLibras) setupVLibras();

    // TTS (Text-to-Speech)
    if (cfg.tts?.enable) {
      ttsConfig = cfg.tts.defaults;
      setupTTS();
    }

    // Controles
    currentPosition = cfg.controls?.position ?? "SD";
    controlsOffset = cfg.controls?.offset ?? 16;
    separationSpace = cfg.controls?.separation_space_button ?? 12;

    // Cores via variáveis CSS
    const cols = cfg.controls?.colors || {};
    if (cols.fullscreen)
      document.documentElement.style.setProperty("--color-fullscreen", cols.fullscreen);
    if (cols.sound)
      document.documentElement.style.setProperty("--color-sound", cols.sound);
    if (cols.menu)
      document.documentElement.style.setProperty("--color-menu", cols.menu);
    if (cols.panel)
      document.documentElement.style.setProperty("--color-panel", cols.panel);
    
    // ⭐ SEÇÃO ATUALIZADA: Configuração da Camada de Acessibilidade
    if (cfg.accessibilityLayer?.enable) {
      // Lê as configurações de debug e pointer-events
      accessibilityDebugMode = cfg.accessibilityLayer?.debug || false;
      accessibilityPointerEvents = cfg.accessibilityLayer?.["pointer-events"] ?? true;
      
      // Aplica os estilos CSS baseados nas configurações
      applyAccessibilityStyles(accessibilityDebugMode, accessibilityPointerEvents);
      
      setupAccessibilityLayer();
      
      // Log informativo sobre a configuração
      console.log(`🔧 Camada de Acessibilidade configurada:
        📊 Status: ATIVADA
        🐛 Debug Visual: ${accessibilityDebugMode ? 'ATIVADO' : 'DESATIVADO'}  
        🎯 Pointer Events: ${accessibilityPointerEvents ? 'AUTO (JS + Unity)' : 'NONE (Unity Direto)'}
        🔄 Arquitetura: ${accessibilityPointerEvents ? 'Dual Layer' : 'Híbrida'}
      `);
    } else {
      console.log("♿ Camada de Acessibilidade: DESATIVADA");
    }
  } catch (err) {
    console.warn("Erro ao ler config.json:", err);
    // Define valores padrão em caso de falha
    currentPosition = "SD";
    controlsOffset = 16;
    separationSpace = 12;
  }

  // 2) Posiciona controles
  positionControls({
    position: currentPosition,
    offset: controlsOffset,
    separation_space_button: separationSpace,
  });

  // 3) Inicializa menu e filtros
  initMenu();
  initFilters();

  // 4) Pré-carrega ativos críticos
  preloadAssets();

  // 5) Som de clique em botões (exceto sound-btn)
  attachClickSound();

  // 6) Ícones iniciais
  updateSoundIcon();
  updateFullscreenIcon();

  // 7) Desabilita F11
  document.addEventListener("keydown", disableF11);

  // 8) Atualiza ícone fullscreen ao mudar
  document.addEventListener("fullscreenchange", updateFullscreenIcon);

  // 9) Resize do canvas com debounce
  window.addEventListener("resize", debounce(resizeCanvas, 100));

  // A "API" para a Unity é publicada no escopo global.
  window.UpdateAccessibilityLayer = UpdateAccessibilityLayer;
  
  // 10) Carrega Unity WebGL
  loadUnity();
});

// ===============================================
// ⭐ FUNÇÃO RENOMEADA E EXPANDIDA: Controle Completo de Estilos CSS
// ===============================================
function applyAccessibilityStyles(debugMode, pointerEvents) {
  // Remove qualquer estilo anterior
  const existingStyle = document.getElementById('accessibility-debug-style');
  if (existingStyle) {
    existingStyle.remove();
  }

  // Cria novo elemento <style> para injetar CSS dinamicamente
  const style = document.createElement('style');
  style.id = 'accessibility-debug-style';
  
  // ⚡ CONFIGURAÇÃO BASE: pointer-events
  const pointerEventsValue = pointerEvents ? 'auto' : 'none';
  
  if (debugMode) {
    // 🐛 MODO DEBUG: Elementos visíveis
    style.textContent = `
      .proxy-element {
        background-color: rgba(255, 0, 255, 0.4) !important; /* Magenta semi-transparente */
        border: 2px solid #00FF00 !important;                 /* Borda verde brilhante */
        opacity: 1 !important;
        pointer-events: ${pointerEventsValue} !important;     /* ⭐ Controlado dinamicamente */
      }
      
      /* Label visual para debug */
      .proxy-element::after {
        content: attr(aria-label);
        position: absolute;
        top: -20px;
        left: 0;
        background: #000;
        color: #fff;
        font-size: 10px;
        padding: 2px 4px;
        border-radius: 2px;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
      }
    `;
    
    console.log(`🐛 Modo DEBUG ativado:
      🎨 Visual: Magenta + Verde + Labels
      🎯 Pointer Events: ${pointerEventsValue}
      🔄 Arquitetura: ${pointerEvents ? 'Dual Layer (JS + Unity)' : 'Híbrida (HTML + Unity)'}
    `);
    
  } else {
    // 👻 MODO PRODUÇÃO: Elementos transparentes
    style.textContent = `
      .proxy-element {
        background-color: transparent !important;
        border: none !important;
        opacity: 0 !important;
        pointer-events: ${pointerEventsValue} !important;     /* ⭐ Controlado dinamicamente */
      }
      
      .proxy-element::after {
        display: none !important;
      }
    `;
    
    console.log(`👻 Modo PRODUÇÃO ativado:
      🎨 Visual: Totalmente Transparente
      🎯 Pointer Events: ${pointerEventsValue}
      🔄 Arquitetura: ${pointerEvents ? 'Dual Layer (JS + Unity)' : 'Híbrida (HTML + Unity)'}
    `);
  }
  
  // Adiciona o estilo ao <head>
  document.head.appendChild(style);
}

// ——— Detecta Mobile e Ajusta VLibras ———
const detectMob = () => {
  const toMatch = [ /Android/i, /webOS/i, /iPhone/i, /iPad/i, /iPod/i, /BlackBerry/i, /Windows Phone/i ];
  return toMatch.some((toMatchItem) => navigator.userAgent.match(toMatchItem));
};

const vlibrasAjust = () => {
  if (detectMob()) {
    const vlibrasVW = document.getElementById("vlibras-container");
    if (vlibrasVW) {
      vlibrasVW.classList.add("mobile-ajust");
    }
  }
};
vlibrasAjust();
window.addEventListener("resize", vlibrasAjust);

// ——— VLibras ———
function setupVLibras() {
  const container = document.getElementById("vlibras-container");
  container.setAttribute("vw", "");
  container.classList.add("enabled");

  const accessBtn = document.createElement("div");
  accessBtn.setAttribute("vw-access-button", "");
  accessBtn.classList.add("active");
  container.appendChild(accessBtn);

  const pluginWrap = document.createElement("div");
  pluginWrap.setAttribute("vw-plugin-wrapper", "");
  const topWrap = document.createElement("div");
  topWrap.classList.add("vw-plugin-top-wrapper");
  pluginWrap.appendChild(topWrap);
  container.appendChild(pluginWrap);

  const vlScript = document.createElement("script");
  vlScript.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
  vlScript.onload = () => new window.VLibras.Widget("https://vlibras.gov.br/app");
  document.body.appendChild(vlScript);
}

// ——— Text-to-Speech (TTS) ———
function setupTTS() {
  const ttsScript = document.createElement("script");
  ttsScript.src = "TextToSpeech.js";
  ttsScript.async = true;
  ttsScript.onload = () => {
    console.log("TTS script loaded.");
    if (ttsConfig) {
      if (typeof AdjustRate === 'function') AdjustRate(ttsConfig.rate || 1.0);
      if (typeof AdjustVolume === 'function') AdjustVolume(ttsConfig.volume || 1.0);
      if (typeof AdjustPitch === 'function') AdjustPitch(ttsConfig.pitch || 1.0);
    }
  };
  document.body.appendChild(ttsScript);
}

// ——— Função Global para Receber Textos da Unity (VLibras) ———
function registerVLibrasText(id, text) {
  const container = document.getElementById("vlibras-ui-texts");
  if (!container) return;

  let el = document.getElementById(`vlibras-text-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `vlibras-text-${id}`;
    container.appendChild(el);
  }
  el.textContent = text;
  
  setTimeout(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })), 50);
}

// ——— Funções de UI e Controles ———
function preloadAssets() {
  ["image/rotate-device.gif", "image/fullscreen-enter.svg", "image/fullscreen-exit.svg", "image/sound-on.svg", "image/sound-off.svg"].forEach(src => {
    const img = new Image();
    img.src = src;
  });
}

function attachClickSound() {
  const clickSound = document.getElementById("click-sound");
  document.querySelectorAll("button:not(.sound-btn)").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isSoundEnabled) {
        clickSound.currentTime = 0;
        clickSound.play();
      }
    });
  });
}

function positionControls({ position, offset, separation_space_button }) {
  const ctr = controlsContainer;
  ctr.style.position = "fixed";
  ctr.style.margin = "0";
  ctr.style.display = "flex";
  ctr.style.flexDirection = "column";
  ctr.style.gap = `${separation_space_button}px`;
  ctr.style.top = `${offset}px`;
  ctr.style[position === "SD" ? "right" : "left"] = `${offset}px`;
  ctr.style[position === "SD" ? "left" : "right"] = "auto";
}

function initMenu() {
  menuPanel.classList.remove("panel-right", "open-left", "open-right");
  menuButton.classList.remove("open-left", "open-right");
  if (currentPosition === "SD") {
    menuPanel.classList.add("panel-right");
  }
  menuPanel.setAttribute("aria-hidden", "true");
  menuButton.addEventListener("click", () => (isPanelOpen() ? closeMenu() : openMenu()));
}

function isPanelOpen() {
  return menuPanel.classList.contains(currentPosition === "SD" ? "open-right" : "open-left");
}

function openMenu() {
  menuPanel.classList.add(currentPosition === "SD" ? "open-right" : "open-left");
  menuButton.classList.add(currentPosition === "SD" ? "open-right" : "open-left");
  menuPanel.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  trapFocus();
}

function closeMenu() {
  menuPanel.classList.remove("open-right", "open-left");
  menuButton.classList.remove("open-right", "open-left");
  menuPanel.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  releaseFocus();
  menuButton.focus();
}

function trapFocus() {
  focusableEls = Array.from(menuPanel.querySelectorAll('button, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  firstFocusableEl = focusableEls[0];
  lastFocusableEl = focusableEls[focusableEls.length - 1];
  firstFocusableEl.focus();
  document.addEventListener("keydown", handleMenuKeydown);
}

function releaseFocus() {
  document.removeEventListener("keydown", handleMenuKeydown);
}

function handleMenuKeydown(e) {
  if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
  if (e.key === "Tab") {
    if (e.shiftKey && document.activeElement === firstFocusableEl) { e.preventDefault(); lastFocusableEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastFocusableEl) { e.preventDefault(); firstFocusableEl.focus(); }
  }
}

function initFilters() {
  const map = { acromatopsia: "grayscale", protanomalia: "protanopia", deuteranomalia: "deuteranopia", tritanomalia: "tritanopia", normal: "normal" };
  Object.keys(map).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => {
        applyFilter(map[id]);
        closeMenu();
      });
    }
  });
}

function applyFilter(filterType) {
  document.body.className = document.body.className.replace(/\b(grayscale|deuteranopia|protanopia|tritanopia)\b/g, '').trim();
  if (filterType !== "normal") {
    document.body.classList.add(filterType);
  }
}

function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  updateSoundIcon();
  if (unityInstance) {
    unityInstance.SendMessage("AudioManager", "SetMute", isSoundEnabled ? 0 : 1);
  }
}

function updateSoundIcon() {
  const isMuted = !isSoundEnabled;
  soundBtn.style.maskImage = `url('image/sound-${isMuted ? 'on' : 'off'}.svg')`;
  soundBtn.style.webkitMaskImage = `url('image/sound-${isMuted ? 'on' : 'off'}.svg')`;
  soundBtn.setAttribute("aria-label", isMuted ? "Ativar som" : "Mutar som");
  soundBtn.setAttribute("aria-pressed", isMuted ? "false" : "true");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

function updateFullscreenIcon() {
  const isFullscreen = !!document.fullscreenElement;
  fullscreenBtn.style.maskImage = `url('image/fullscreen-${isFullscreen ? 'exit' : 'enter'}.svg')`;
  fullscreenBtn.style.webkitMaskImage = `url('image/fullscreen-${isFullscreen ? 'exit' : 'enter'}.svg')`;
  fullscreenBtn.setAttribute("aria-label", isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia");
  fullscreenBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
}

function disableF11(event) {
  if (event.key === "F11") {
    event.preventDefault();
    alert("Use o botão de ZOOM para zoom in e zoom out");
  }
}

function updateProgressBar(value) {
  const filler = document.getElementById("progressFiller");
  filler.style.width = `${Math.min(value * 100, 100)}%`;
  if (value >= 1) {
    filler.style.animation = "none";
    filler.style.backgroundColor = "#00ff00";
  }
}

// =================================================================
// LÓGICA DA CAMADA DE ACESSIBILIDADE - VERSÃO FINAL
// =================================================================

/**
 * Prepara um listener para a primeira interação do usuário,
 * que ativará a camada de acessibilidade.
 */
function setupAccessibilityLayer() {
  document.body.addEventListener('mousedown', activateAccessibilityLayer, { once: true, passive: true });
  document.body.addEventListener('touchstart', activateAccessibilityLayer, { once: true, passive: true });
}

/**
 * Ativa a camada de acessibilidade e solicita a primeira sincronização.
 * Chamada na primeira interação do usuário (clique ou toque).
 */
function activateAccessibilityLayer() {
  if (isAccessibilityLayerActive) return;
  
  console.log("Primeira interação detectada. Ativando camada de acessibilidade.");
  isAccessibilityLayerActive = true;
  
  const trap = document.getElementById('screen-reader-trap');
  if (trap) trap.remove();

  requestFullSyncFromUnity();
}

/**
 * Solicita que a Unity envie os dados completos da UI acessível.
 */
function requestFullSyncFromUnity() {
  if (!unityInstance) {
    console.log("Aguardando instância da Unity para sincronizar...");
    setTimeout(requestFullSyncFromUnity, 500); // Tenta novamente
    return;
  }
  
  if (isAccessibilityLayerActive) {
    console.log("Enviando mensagem 'RequestFullSyncFromJS' para a Unity.");
    unityInstance.SendMessage('AccessibilityManager', 'RequestFullSyncFromJS');
  }
}

/**
 * ⭐ FUNÇÃO ATUALIZADA: Esta função é chamada PELA UNITY para atualizar a camada HTML.
 * jsonString - Uma string JSON contendo a lista de elementos acessíveis.
 */
function UpdateAccessibilityLayer(jsonString) {
  if (!isAccessibilityLayerActive) return;

  // Limpa a camada anterior
  accessibilityOverlay.innerHTML = '';

  try {
    const data = JSON.parse(jsonString);
    const elements = data.elements || [];

    // Pega o elemento canvas e suas coordenadas na página (em pixels de CSS)
    const canvas = document.getElementById('unityCanvas');
    if (!canvas) {
        console.error("Elemento canvas da Unity não encontrado!");
        return;
    }
    const canvasRect = canvas.getBoundingClientRect();

    // Pega o pixel ratio do dispositivo. Este é o fator de conversão
    // entre os pixels físicos da Unity e os pixels de CSS do navegador.
    const dpr = window.devicePixelRatio || 1;

    elements.forEach(elementData => {
      const proxyEl = document.createElement('button');
      proxyEl.className = 'proxy-element'; // ⭐ Classe CSS controlada dinamicamente
      proxyEl.setAttribute('aria-label', elementData.label);
      
      // Converte as coordenadas e dimensões de pixels físicos (da Unity)
      // para pixels de CSS, dividindo pelo devicePixelRatio.
      const cssX = elementData.x / dpr;
      const cssY = elementData.y / dpr;
      const cssWidth = elementData.width / dpr;
      const cssHeight = elementData.height / dpr;

      // Aplica as coordenadas convertidas.
      // O offset do canvas (canvasRect.left/top) já está em pixels de CSS,
      // então podemos somar diretamente os valores convertidos.
      proxyEl.style.left = `${canvasRect.left + cssX}px`;
      proxyEl.style.top = `${canvasRect.top + cssY}px`;

      // Aplica as dimensões convertidas
      proxyEl.style.width = `${cssWidth}px`;
      proxyEl.style.height = `${cssHeight}px`;

      // Always allow keyboard/screen-reader click activation on proxy elements
      proxyEl.addEventListener('click', () => {
        if (unityInstance) {
          unityInstance.SendMessage(
            'AccessibilityManager',
            'OnProxyElementClicked',
            elementData.id
          );
        }
      });

      accessibilityOverlay.appendChild(proxyEl);
    });

    // ⭐ Log informativo baseado na configuração
    if (accessibilityDebugMode) {
      const architecture = accessibilityPointerEvents ? 'Dual Layer (JS + Unity)' : 'Híbrida (HTML + Unity)';
      console.log(`🐛 [DEBUG] ${elements.length} elementos proxy criados - ${architecture}`);
    } else {
      const architecture = accessibilityPointerEvents ? 'Dual Layer' : 'Híbrida';
      console.log(`👻 [PRODUÇÃO] ${elements.length} elementos proxy criados - ${architecture}`);
    }

  } catch (e) {
    console.error("Erro ao processar dados da camada de acessibilidade:", e);
    console.error("JSON Recebido:", jsonString);
  }
}

// --- Redimensiona Canvas ---
function resizeCanvas() {
  const canvas = document.getElementById("unityCanvas");
  const container = document.getElementById("unityContainer");
  const cAR = container.clientWidth / container.clientHeight;
  const pAR = 16 / 9;

  if (cAR > pAR) {
    canvas.style.width = `${container.clientHeight * pAR}px`;
    canvas.style.height = `${container.clientHeight}px`;
  } else {
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientWidth / pAR}px`;
  }

  if (unityInstance && isAccessibilityLayerActive) {
    unityInstance.SendMessage('AccessibilityManager', 'OnCanvasResized', `${canvas.clientWidth},${canvas.clientHeight}`);
  }
}

// ——— Debounce ———
function debounce(func, wait = 100) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ——— Carrega Unity WebGL ———
function loadUnity() {
  const buildCfg = window.UNITY_WEBGL_CONFIG || {};
  const loaderUrl = (buildCfg.loaderUrl && !buildCfg.loaderUrl.includes("{{{")) ? buildCfg.loaderUrl : "Build/Build.loader.js";
  const loaderScript = document.createElement("script");
  loaderScript.src = loaderUrl;
  loaderScript.async = true;
  loaderScript.onload = () => {
    createUnityInstance(
      document.querySelector("#unityCanvas"),
      {
        dataUrl: (buildCfg.dataUrl && !buildCfg.dataUrl.includes("{{{")) ? buildCfg.dataUrl : "Build/Build.data.unityweb",
        frameworkUrl: (buildCfg.frameworkUrl && !buildCfg.frameworkUrl.includes("{{{")) ? buildCfg.frameworkUrl : "Build/Build.framework.js.unityweb",
        codeUrl: (buildCfg.codeUrl && !buildCfg.codeUrl.includes("{{{")) ? buildCfg.codeUrl : "Build/Build.wasm.unityweb",
        streamingAssetsUrl: buildCfg.streamingAssetsUrl || "StreamingAssets",
        companyName: (buildCfg.companyName && !buildCfg.companyName.includes("{{{")) ? buildCfg.companyName : "SENAC",
        productName: (buildCfg.productName && !buildCfg.productName.includes("{{{")) ? buildCfg.productName : "Simulador de Concorrencia Local",
        productVersion: (buildCfg.productVersion && !buildCfg.productVersion.includes("{{{")) ? buildCfg.productVersion : "1.0",
      },
      (progress) => updateProgressBar(progress)
    )
    .then((instance) => {
      unityInstance = instance;
      window.unityInstance = instance; // Expõe globalmente se necessário

      if (!isSoundEnabled) {
        unityInstance.SendMessage("AudioManager", "SetMute", 1);
      }
      const loadingBar = document.getElementById("loadingBar");
      if (loadingBar) loadingBar.style.display = "none";
      
      resizeCanvas(); // Chama o resize inicial após o carregamento
    })
    .catch((error) => {
      console.error("Erro ao carregar a instância da Unity:", error);
      alert("Ocorreu um erro ao carregar a aplicação. Verifique o console para mais detalhes.");
    });
  };
  document.body.appendChild(loaderScript);
}

// ===============================================
// 🛠️ FUNÇÕES AUXILIARES DE DEBUG - ATUALIZADAS
// ===============================================

/**
 * ⭐ FUNÇÃO ATUALIZADA: Alterna debug visual em runtime
 */
function toggleAccessibilityDebug() {
  accessibilityDebugMode = !accessibilityDebugMode;
  applyAccessibilityStyles(accessibilityDebugMode, accessibilityPointerEvents);
  
  // Força uma nova sincronização para aplicar os estilos imediatamente
  if (isAccessibilityLayerActive && unityInstance) {
    unityInstance.SendMessage('AccessibilityManager', 'RequestFullSyncFromJS');
  }
  
  return `🔧 Debug Visual: ${accessibilityDebugMode ? 'ATIVADO' : 'DESATIVADO'}`;
}

/**
 * ⭐ NOVA FUNÇÃO: Alterna pointer-events em runtime
 */
function toggleAccessibilityPointerEvents() {
  accessibilityPointerEvents = !accessibilityPointerEvents;
  applyAccessibilityStyles(accessibilityDebugMode, accessibilityPointerEvents);
  
  // Força uma nova sincronização para aplicar os estilos imediatamente
  if (isAccessibilityLayerActive && unityInstance) {
    unityInstance.SendMessage('AccessibilityManager', 'RequestFullSyncFromJS');
  }
  
  const mode = accessibilityPointerEvents ? 'DUAL LAYER (JS + Unity)' : 'HÍBRIDA (HTML + Unity)';
  return `🎯 Pointer Events: ${accessibilityPointerEvents ? 'AUTO' : 'NONE'} - Arquitetura: ${mode}`;
}

/**
 * ⭐ FUNÇÃO ATUALIZADA: Mostra informações completas
 */
function showAccessibilityInfo() {
  const overlay = document.getElementById('accessibility-overlay');
  const proxyElements = overlay.querySelectorAll('.proxy-element');
  
  console.log(`
🔍 INFORMAÇÕES DA CAMADA DE ACESSIBILIDADE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Status: ${isAccessibilityLayerActive ? 'ATIVA' : 'INATIVA'}
🐛 Debug Visual: ${accessibilityDebugMode ? 'ATIVADO' : 'DESATIVADO'}
🎯 Pointer Events: ${accessibilityPointerEvents ? 'AUTO' : 'NONE'}
🔄 Arquitetura: ${accessibilityPointerEvents ? 'Dual Layer (JS + Unity)' : 'Híbrida (HTML + Unity)'}
📱 Device Pixel Ratio: ${window.devicePixelRatio || 1}
🎪 Elementos Proxy: ${proxyElements.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 Comandos Disponíveis:
  toggleAccessibilityDebug()         - Liga/desliga visual debug
  toggleAccessibilityPointerEvents() - Alterna pointer-events (auto/none)
  listAccessibilityElements()        - Lista todos elementos
  `);
  
  return {
    active: isAccessibilityLayerActive,
    debugMode: accessibilityDebugMode,
    pointerEvents: accessibilityPointerEvents,
    architecture: accessibilityPointerEvents ? 'dual-layer' : 'hybrid-layer',
    proxyCount: proxyElements.length,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

/**
 * ⭐ FUNÇÃO MANTIDA: Lista todos os elementos acessíveis
 */
function listAccessibilityElements() {
  const overlay = document.getElementById('accessibility-overlay');
  const proxyElements = overlay.querySelectorAll('.proxy-element');
  
  console.log('📋 ELEMENTOS DA CAMADA DE ACESSIBILIDADE:');
  proxyElements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    console.log(`${index + 1}. "${element.getAttribute('aria-label')}" - ${rect.width.toFixed(0)}x${rect.height.toFixed(0)} px`);
  });
  
  return Array.from(proxyElements).map(el => ({
    label: el.getAttribute('aria-label'),
    position: el.getBoundingClientRect()
  }));
}

// ===============================================
// 🌐 EXPOSIÇÃO GLOBAL ATUALIZADA
// ===============================================

// Torna as funções acessíveis via console do navegador
window.toggleAccessibilityDebug = toggleAccessibilityDebug;
window.toggleAccessibilityPointerEvents = toggleAccessibilityPointerEvents; // ⭐ NOVA FUNÇÃO
window.showAccessibilityInfo = showAccessibilityInfo;
window.listAccessibilityElements = listAccessibilityElements;
