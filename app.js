/**
 * ============================================================================
 * app.js — Site & HSE Induction App logic
 * ----------------------------------------------------------------------------
 * Pure vanilla ES6 — no framework, no build step. The app is a single-page
 * app (SPA): #app-root is repeatedly cleared and re-rendered based on
 * state.view, and never navigates to a different HTML file.
 *
 * SECTIONS IN THIS FILE
 *   1. Constants & Storage helpers
 *   2. Global state
 *   3. Boot / init
 *   4. Router
 *   5. User App views: welcome (+ camp picker modal), induction flow
 *      (info/map/quiz slides), digital pass
 *   6. Admin views: PIN gate, dashboard, FORM-BASED module/slide editor
 *   7. Utility / DOM helpers
 * ============================================================================
 */

/* ---------------------------------------------------------------------- *
 * 1. CONSTANTS & SUPABASE CLIENT / DATA-ACCESS HELPERS
 * ---------------------------------------------------------------------- */

const ADMIN_PIN = "1234"; // Prototype-only hardcoded PIN. Replace with real auth before production use.
const PASS_THRESHOLD = 0.8; // 80% correct across all quiz slides required to earn a Pass

// Content (facilities, modules) and completion records now live in a shared
// Supabase project instead of per-browser localStorage — every admin edit
// and every completed induction is visible to everyone, from any device.
// See supabase-schema.sql for the table definitions these calls rely on.
const SUPABASE_URL = "https://umauawrovapmavjwfgye.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtYXVhd3JvdmFwbWF2andmZ3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODY3NzAsImV4cCI6MjA4OTY2Mjc3MH0.15Ss6KsnUx9eAEnw0EVhw8whzZBHOEqjZWVjQgTlquU";
// `persistSession: false` because this app has no Supabase Auth session to
// keep — without it, the client would still try to use localStorage for an
// auth session that's never created, which we don't need.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function fetchFacilities() {
  const { data, error } = await sbClient.from("facilities").select("*").order("name");
  if (error) throw error;
  return data;
}

async function fetchModules() {
  const { data, error } = await sbClient.from("modules").select("*").order("sort_order");
  if (error) throw error;
  // Supabase already parses jsonb columns into real JS arrays/objects, so
  // `facilities` and `slides` arrive ready to use — no JSON.parse needed.
  return data;
}

async function fetchRecords(limit) {
  const { data, error } = await sbClient
    .from("induction_records")
    .select("*")
    .order("completed_at", { ascending: false })
    .limit(limit || 100);
  if (error) throw error;
  return data.map(r => ({
    name: r.name,
    facility: r.facility,
    date: r.completed_at,
    score: r.score,
    total: r.total,
    percent: r.percent,
    passed: r.passed
  }));
}

async function insertFacilityRemote(f) {
  const { error } = await sbClient.from("facilities").insert({
    id: f.id, name: f.name, description: f.description, icon: f.icon, type: f.type
  });
  if (error) throw error;
}

async function deleteFacilityRemote(id) {
  const { error } = await sbClient.from("facilities").delete().eq("id", id);
  if (error) throw error;
}

async function upsertModuleRemote(m) {
  const { error } = await sbClient.from("modules").upsert({
    id: m.id,
    title: m.title,
    icon: m.icon,
    category: m.category,
    facilities: m.facilities,
    slides: m.slides,
    sort_order: m.sort_order != null ? m.sort_order : 0
  });
  if (error) throw error;
}

async function deleteModuleRemote(id) {
  const { error } = await sbClient.from("modules").delete().eq("id", id);
  if (error) throw error;
}

async function insertRecordRemote(r) {
  const { error } = await sbClient.from("induction_records").insert({
    name: r.name,
    facility: r.facility,
    score: r.score,
    total: r.total,
    percent: r.percent,
    passed: r.passed
    // completed_at is set by the database (default now())
  });
  if (error) throw error;
}

/* ---------------------------------------------------------------------- *
 * 2. GLOBAL STATE
 * ---------------------------------------------------------------------- */

const state = {
  db: null,              // { facilities: [...], modules: [...] } — loaded from Supabase on boot
  records: [],           // cached completed-induction records, for the Admin dashboard
  dbError: null,         // set if Supabase couldn't be reached (see bootLoadData)
  view: "welcome",
  isAdmin: false,

  // --- induction-in-progress state ---
  user: { name: "", facilityId: null },
  activeModules: [],     // modules filtered for the chosen facility, in presented order
  moduleIndex: 0,
  slideIndex: 0,         // index into getVisibleSlides(activeModules[moduleIndex])
  answers: {},           // { [quizSlideId]: selectedIndex }
  score: { correct: 0, total: 0 },

  // --- admin editor state ---
  adminSelectedModuleId: null
};

// Tracks the currently-mounted Leaflet map instance (if any) so we can tear
// it down cleanly before the next render — Leaflet maps can't be silently
// re-initialized on a DOM node that vanilla re-rendering has replaced.
let activeLeafletMap = null;

/* ---------------------------------------------------------------------- *
 * 3. BOOT / INIT
 * ---------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // These two buttons live in the static header (outside #app-root), so
  // they can be wired immediately — they don't depend on data being loaded.
  document.getElementById("admin-entry-btn").addEventListener("click", () => {
    state.view = state.isAdmin ? "admin-dashboard" : "admin-login";
    render();
  });

  document.getElementById("app-title-btn").addEventListener("click", () => {
    resetInductionState();
    state.view = "welcome";
    render();
  });

  bootLoadData();
});

/**
 * Loads facilities, modules, and completion records from Supabase. Shown
 * as a loading screen while in flight (see render()'s `!state.db` guard).
 * If Supabase can't be reached (network issue, or the tables haven't been
 * created yet — see supabase-schema.sql), the app falls back to the
 * bundled DEFAULT_DATA so it's still usable, and shows a persistent
 * banner warning that Admin changes won't be saved until this is fixed.
 * Also called by the banner's and the error screen's "Retry" buttons.
 */
async function bootLoadData() {
  try {
    const [facilities, modules, records] = await Promise.all([
      fetchFacilities(),
      fetchModules(),
      fetchRecords()
    ]);
    state.db = { facilities, modules };
    state.records = records;
    state.dbError = null;
  } catch (e) {
    console.error("Supabase load failed:", e);
    // Only overwrite with bundled defaults on a genuinely first load — if a
    // Retry attempt fails, keep whatever's already on screen rather than
    // clobbering it with sample content.
    if (!state.db) {
      state.db = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
      state.records = [];
    }
    state.dbError = (e && e.message) ? e.message : "Could not connect to the database.";
  }
  render();
}

function resetInductionState() {
  state.user = { name: "", facilityId: null };
  state.activeModules = [];
  state.moduleIndex = 0;
  state.slideIndex = 0;
  state.answers = {};
  state.score = { correct: 0, total: 0 };
}

/**
 * A module's `slides` array may contain slides tagged with their OWN
 * `facilities` list (e.g. two different camp maps living in one shared
 * "Location & Map" module). This returns only the slides that apply to
 * the currently-selected facility — slides with no `facilities` field
 * are shown for every facility the module itself is visible to.
 */
function getVisibleSlides(module) {
  return module.slides.filter(
    s => !s.facilities || s.facilities.includes("all") || s.facilities.includes(state.user.facilityId)
  );
}

/** Generates a reasonably-unique id for new slides/markers created in Admin. */
function uid(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

/* ---------------------------------------------------------------------- *
 * 4. ROUTER
 * ---------------------------------------------------------------------- */

function render() {
  const root = document.getElementById("app-root");
  root.innerHTML = "";
  document.body.classList.toggle("admin-mode", state.view.startsWith("admin"));

  // Tear down any previously-mounted satellite map before wiping the DOM,
  // so we never leak a Leaflet instance pointed at a removed container.
  if (activeLeafletMap) {
    activeLeafletMap.remove();
    activeLeafletMap = null;
  }

  // Data hasn't arrived from Supabase yet (first load only) — show a
  // spinner instead of any view until bootLoadData() finishes.
  if (!state.db) {
    root.appendChild(renderLoadingScreen());
    return;
  }

  // If Supabase couldn't be reached, keep the app usable with fallback
  // content but show a persistent warning above whatever view is active.
  if (state.dbError) {
    root.appendChild(renderConnectionBanner());
  }

  switch (state.view) {
    case "welcome": root.appendChild(renderWelcome()); break;
    case "flow": root.appendChild(renderFlow()); break;
    case "pass": root.appendChild(renderPass()); break;
    case "admin-login": root.appendChild(renderAdminLogin()); break;
    case "admin-dashboard": root.appendChild(renderAdminDashboard()); break;
    default: root.appendChild(renderWelcome());
  }

  // A satellite map needs its container attached to the live DOM (with a
  // real pixel size) before Leaflet can measure it — so we initialize it
  // AFTER the view has been appended to #app-root above.
  if (state.view === "flow") {
    const module = state.activeModules[state.moduleIndex];
    const slide = module ? getVisibleSlides(module)[state.slideIndex] : null;
    if (slide && slide.type === "map" && slide.mapType === "satellite") {
      initSatelliteMap(slide);
    }
  }
}

function renderLoadingScreen() {
  const wrap = el("div", "view-loading fade-in px-5 pt-24 text-center");
  wrap.innerHTML = `
    <i class="fa-solid fa-hard-hat text-4xl text-hse-yellow"></i>
    <p class="text-slate-500 text-sm mt-4"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading induction content…</p>
  `;
  return wrap;
}

function renderConnectionBanner() {
  const banner = el("div", "connection-banner");
  banner.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <span>Offline sample content — couldn't reach the database. Admin changes won't be saved.</span>
    <button type="button" id="retry-connection-btn"><i class="fa-solid fa-arrows-rotate"></i> Retry</button>
  `;
  const retryBtn = banner.querySelector("#retry-connection-btn");
  retryBtn.addEventListener("click", () => {
    // bootLoadData() calls render() itself once the fetch settles — that
    // rebuilds this whole banner (removing it on success, or rebuilding a
    // fresh non-spinning Retry button on failure) — so there's nothing to
    // reset manually here, we only need to show the in-flight state now.
    retryBtn.disabled = true;
    retryBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Retrying…`;
    bootLoadData();
  });
  return banner;
}

/* ---------------------------------------------------------------------- *
 * 5a. USER APP — Welcome / facility selector (with grouped camp picker)
 * ---------------------------------------------------------------------- */

function renderWelcome() {
  const wrap = el("div", "view-welcome fade-in");

  wrap.innerHTML = `
    <div class="hazard-strip"></div>
    <div class="px-5 pt-8 pb-6 text-center">
      <i class="fa-solid fa-hard-hat text-5xl text-hse-yellow drop-shadow"></i>
      <h1 class="font-display text-2xl mt-3 text-slate-900">Site &amp; HSE Induction</h1>
      <p class="text-slate-500 mt-1 text-sm">Complete this induction before entering site</p>
    </div>

    <div class="px-5">
      <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Your full name</label>
      <input id="input-name" type="text" placeholder="e.g. Ahmed Al-Balushi"
        class="w-full border border-slate-300 rounded-lg px-4 py-3 mb-5 text-base focus:outline-none focus:ring-2 focus:ring-hse-yellow" />

      <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Select your facility</label>
      <div id="facility-list" class="space-y-3 mb-6"></div>

      <button id="start-btn" disabled
        class="w-full bg-slate-300 text-white font-semibold py-3 rounded-lg transition-colors text-base">
        Start Induction
      </button>
    </div>
  `;

  const facilityList = wrap.querySelector("#facility-list");
  // Facilities are split into two groups for display:
  //  - "camp"        → collapsed into ONE button that opens a picker modal
  //  - anything else → shown as its own direct-tap card, same as before
  const camps = state.db.facilities.filter(f => f.type === "camp");
  const otherFacilities = state.db.facilities.filter(f => f.type !== "camp");

  function markSelected(node) {
    facilityList.querySelectorAll(".facility-card").forEach(c => c.classList.remove("selected"));
    node.classList.add("selected");
  }

  let campSelectorBtn = null;
  function refreshCampSelectorLabel() {
    if (!campSelectorBtn) return;
    const selectedCamp = camps.find(c => c.id === state.user.facilityId);
    campSelectorBtn.innerHTML = `
      <i class="fa-solid fa-campground text-xl text-slate-700 w-8"></i>
      <div class="text-left flex-1">
        <div class="font-semibold text-slate-900">${selectedCamp ? escapeHTML(selectedCamp.name) : "Select a Camp"}</div>
        <div class="text-xs text-slate-500">${
          selectedCamp
            ? escapeHTML(selectedCamp.description)
            : "Choose from " + camps.length + " camp" + (camps.length !== 1 ? "s" : "")
        }</div>
      </div>
      <i class="fa-solid fa-chevron-down text-slate-400"></i>
    `;
  }

  if (camps.length > 0) {
    campSelectorBtn = el("button", "facility-card facility-card-camp-selector");
    campSelectorBtn.type = "button";
    refreshCampSelectorLabel();
    campSelectorBtn.addEventListener("click", () => {
      openCampPicker(camps, state.user.facilityId, chosenCamp => {
        state.user.facilityId = chosenCamp.id;
        refreshCampSelectorLabel();
        markSelected(campSelectorBtn);
        validateWelcomeForm();
      });
    });
    facilityList.appendChild(campSelectorBtn);
  }

  otherFacilities.forEach(facility => {
    const card = el("button", "facility-card");
    card.type = "button";
    card.dataset.facilityId = facility.id;
    card.innerHTML = `
      <i class="fa-solid ${facility.icon} text-xl text-slate-700 w-8"></i>
      <div class="text-left flex-1">
        <div class="font-semibold text-slate-900">${escapeHTML(facility.name)}</div>
        <div class="text-xs text-slate-500">${escapeHTML(facility.description)}</div>
      </div>
      <i class="fa-solid fa-circle-check check-icon"></i>
    `;
    card.addEventListener("click", () => {
      state.user.facilityId = facility.id;
      markSelected(card);
      refreshCampSelectorLabel(); // resets the camp button back to its unselected label
      validateWelcomeForm();
    });
    facilityList.appendChild(card);
  });

  const nameInput = wrap.querySelector("#input-name");
  nameInput.addEventListener("input", () => {
    state.user.name = nameInput.value.trim();
    validateWelcomeForm();
  });

  function validateWelcomeForm() {
    const startBtn = wrap.querySelector("#start-btn");
    const ready = state.user.name.length > 1 && !!state.user.facilityId;
    startBtn.disabled = !ready;
    startBtn.classList.toggle("bg-slate-300", !ready);
    startBtn.classList.toggle("bg-hse-yellow", ready);
    startBtn.classList.toggle("text-slate-900", ready);
    startBtn.classList.toggle("shadow-lg", ready);
  }

  wrap.querySelector("#start-btn").addEventListener("click", beginInduction);
  return wrap;
}

/**
 * A bottom-sheet modal listing the individual camps, appended directly to
 * <body> (so it overlays the whole viewport regardless of where the
 * welcome screen's DOM sits). Calls onSelect(camp) and closes itself once
 * a camp is tapped; can also be dismissed via the backdrop, the close
 * button, or the Escape key.
 */
function openCampPicker(camps, currentSelectedId, onSelect) {
  const overlay = el("div", "modal-overlay fade-in");
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet-header">
        <h3 class="font-display text-lg text-slate-900">Select a Camp</h3>
        <button type="button" class="modal-close-btn" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-sheet-body space-y-3"></div>
    </div>
  `;

  const body = overlay.querySelector(".modal-sheet-body");
  camps.forEach(camp => {
    const row = el("button", "facility-card" + (camp.id === currentSelectedId ? " selected" : ""));
    row.type = "button";
    row.innerHTML = `
      <i class="fa-solid ${camp.icon} text-xl text-slate-700 w-8"></i>
      <div class="text-left flex-1">
        <div class="font-semibold text-slate-900">${escapeHTML(camp.name)}</div>
        <div class="text-xs text-slate-500">${escapeHTML(camp.description)}</div>
      </div>
      <i class="fa-solid fa-circle-check check-icon"></i>
    `;
    row.addEventListener("click", () => {
      onSelect(camp);
      closeModal();
    });
    body.appendChild(row);
  });

  function closeModal() {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key === "Escape") closeModal();
  }

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal(); // backdrop click (not the sheet itself)
  });
  overlay.querySelector(".modal-close-btn").addEventListener("click", closeModal);
  document.addEventListener("keydown", onKeydown);

  document.body.appendChild(overlay);
}

/** Build the ordered list of modules that apply to the chosen facility, then start the flow. */
function beginInduction() {
  state.activeModules = state.db.modules
    .filter(m => m.facilities.includes("all") || m.facilities.includes(state.user.facilityId))
    // Defensive: drop a module entirely if, after slide-level facility
    // filtering, it would have zero applicable slides for this facility.
    .filter(m => getVisibleSlides(m).length > 0);

  state.moduleIndex = 0;
  state.slideIndex = 0;
  state.answers = {};
  state.score = { correct: 0, total: 0 };
  state.view = "flow";
  render();
}

/* ---------------------------------------------------------------------- *
 * 5b. USER APP — Induction flow (info / map / quiz slides, module by module)
 * ---------------------------------------------------------------------- */

function renderFlow() {
  const module = state.activeModules[state.moduleIndex];
  const slides = getVisibleSlides(module);
  const slide = slides[state.slideIndex];
  const totalSlides = slides.length;
  const totalModuleCount = state.activeModules.length;
  const overallProgress =
    ((state.moduleIndex + (state.slideIndex + 1) / totalSlides) / totalModuleCount) * 100;

  const wrap = el("div", "view-flow fade-in");
  wrap.innerHTML = `
    <div class="progress-track"><div class="progress-fill" style="width:${overallProgress}%"></div></div>
    <div class="px-5 pt-4 pb-1 flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Module ${state.moduleIndex + 1} of ${totalModuleCount}
      </span>
      <span class="text-xs font-semibold text-slate-400">${escapeHTML(module.title)}</span>
    </div>
    <div class="px-5 pb-2">
      <span class="slide-progress-badge"><i class="fa-solid fa-list-ol"></i> Slide ${state.slideIndex + 1} of ${totalSlides}</span>
    </div>
    <div id="card-slot" class="px-5 pb-28"></div>
    <div id="flow-nav" class="flow-nav">
      <button id="nav-back" class="nav-btn-secondary">Back</button>
      <button id="nav-next" class="nav-btn-primary">Continue</button>
    </div>
  `;

  const cardSlot = wrap.querySelector("#card-slot");

  if (slide.type === "info") {
    cardSlot.appendChild(renderInfoSlide(slide));
  } else if (slide.type === "map") {
    cardSlot.appendChild(renderMapSlide(slide));
  } else if (slide.type === "quiz") {
    cardSlot.appendChild(renderQuizSlide(slide));
    const nextBtn = wrap.querySelector("#nav-next");
    nextBtn.disabled = state.answers[slide.id] === undefined;
  }

  wrap.querySelector("#nav-back").addEventListener("click", () => moveSlide(-1));
  wrap.querySelector("#nav-next").addEventListener("click", () => moveSlide(1));

  if (state.moduleIndex === 0 && state.slideIndex === 0) {
    const backBtn = wrap.querySelector("#nav-back");
    backBtn.disabled = true;
    backBtn.classList.add("invisible");
  }

  return wrap;
}

/** Build the optional <img> (+ caption) block used by info slides. */
function buildSlideImageBlock(image) {
  if (!image || !image.url) return "";
  return `
    <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.caption || "")}" class="slide-image" loading="lazy" />
    ${image.caption ? `<p class="slide-image-caption">${escapeHTML(image.caption)}</p>` : ""}
  `;
}

function renderInfoSlide(slide) {
  const alertClass =
    slide.alert === "critical" ? "content-card-critical" :
    slide.alert === "reference" ? "content-card-reference" : "";
  const card = el("div", `content-card ${alertClass}`);

  const tagBlock =
    slide.alert === "critical"
      ? `<div class="critical-tag"><i class="fa-solid fa-triangle-exclamation"></i> Critical</div>`
      : slide.alert === "reference"
      ? `<div class="critical-tag reference-tag"><i class="fa-solid fa-circle-info"></i> Quick Reference</div>`
      : "";

  const imageBlock = buildSlideImageBlock(slide.image);
  const imageAbove = slide.image && slide.image.position === "above";

  card.innerHTML = `
    <div class="content-card-icon"><i class="fa-solid ${slide.icon}"></i></div>
    ${tagBlock}
    <h2 class="font-display text-xl mt-3 mb-2 text-slate-900">${escapeHTML(slide.heading)}</h2>
    ${imageAbove ? imageBlock : ""}
    <p class="text-slate-600 leading-relaxed text-[15px]">${escapeHTML(slide.body)}</p>
    ${!imageAbove ? imageBlock : ""}
  `;
  return card;
}

/**
 * Renders a map slide in one of two modes:
 *   mapType "satellite" — a real interactive map (see initSatelliteMap,
 *     called separately once this card is attached to the live DOM).
 *   mapType "layout" (or unset, for backward compatibility) — a static
 *     image with pixel-positioned pin buttons overlaid on top of it.
 * Both modes share the same legend + detail-panel UI below the map.
 */
function renderMapSlide(slide) {
  const card = el("div", "content-card map-card");
  const isSatellite = slide.mapType === "satellite";

  card.innerHTML = `
    <div class="content-card-icon"><i class="fa-solid fa-map-location-dot"></i></div>
    <h2 class="font-display text-xl mt-3 mb-1 text-slate-900">${escapeHTML(slide.heading)}</h2>
    <p class="text-slate-500 text-sm mb-3">${escapeHTML(slide.body || "")}</p>
    ${
      isSatellite
        ? `<div id="leaflet-${escapeAttr(slide.id)}" class="leaflet-map-frame"></div>`
        : `<div class="map-frame">
             <img src="${escapeAttr(slide.imageUrl)}" alt="${escapeAttr(slide.heading)}" class="map-image" />
             <div class="map-pins"></div>
           </div>`
    }
    <div id="map-detail" class="map-detail"><i class="fa-solid fa-hand-pointer"></i> Tap a marker or a location below to see details.</div>
    <div class="map-legend" data-map-legend-for="${escapeAttr(slide.id)}"></div>
  `;

  const legend = card.querySelector(".map-legend");
  const detail = card.querySelector("#map-detail");

  function showHighlight(h) {
    card.querySelectorAll(".map-pin, .map-legend-item, .leaflet-pin-icon").forEach(node => {
      node.classList.toggle("active", node.dataset.highlightId === h.id);
    });
    detail.innerHTML = `<strong>${escapeHTML(h.label)}</strong><br>${escapeHTML(h.description)}`;
  }
  // Exposed so initSatelliteMap() — called separately, once this card is
  // attached to the live DOM — can reuse this exact same "show info in
  // ONE place" logic when an actual on-map marker is clicked.
  card._showHighlight = showHighlight;

  (slide.highlights || []).forEach(h => {
    if (!isSatellite) {
      const pinsLayer = card.querySelector(".map-pins");
      const pin = el("button", "map-pin");
      pin.type = "button";
      pin.dataset.highlightId = h.id;
      pin.style.top = h.top;
      pin.style.left = h.left;
      pin.innerHTML = `<i class="fa-solid ${h.icon}"></i>`;
      pin.addEventListener("click", () => showHighlight(h));
      pinsLayer.appendChild(pin);
    }

    // The legend list is shared by both map modes. For satellite maps,
    // initSatelliteMap() (called after this card is in the live DOM)
    // additionally wires these same legend buttons to pan/open the
    // matching Leaflet marker popup.
    const legendItem = el("button", "map-legend-item");
    legendItem.type = "button";
    legendItem.dataset.highlightId = h.id;
    legendItem.innerHTML = `<i class="fa-solid ${h.icon}"></i> <span>${escapeHTML(h.label)}</span>`;
    legendItem.addEventListener("click", () => showHighlight(h));
    legend.appendChild(legendItem);
  });

  return card;
}

/**
 * Initializes a real, interactive satellite/aerial map for the given slide
 * using Leaflet + Esri World Imagery tiles (no API key required). Must be
 * called AFTER the slide's container div is attached to the live DOM
 * (see render()), since Leaflet needs to measure the container's pixel size.
 */
function initSatelliteMap(slide) {
  const container = document.getElementById(`leaflet-${slide.id}`);
  if (!container || typeof L === "undefined") return;

  const map = L.map(container, { attributionControl: true }).setView(slide.center, slide.zoom || 16);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
  }).addTo(map);

  const mapCard = container.closest(".map-card");
  const markersById = {};
  (slide.highlights || []).forEach(h => {
    const icon = L.divIcon({
      className: "leaflet-pin-icon",
      html: `<i class="fa-solid ${h.icon}"></i>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });
    const marker = L.marker([h.lat, h.lng], { icon }).addTo(map);

    // Clicking an actual marker on the map shows its details in the SAME
    // single place as clicking its legend entry below (the detail panel
    // under the map), AND pans/centers the map to it — matching exactly
    // what clicking the legend button does, so both trigger the same
    // "move to place" behavior instead of only one of them.
    marker.on("click", () => {
      map.panTo(marker.getLatLng());
      if (mapCard && mapCard._showHighlight) mapCard._showHighlight(h);
    });

    // Tag the marker's rendered DOM element so showHighlight() (defined in
    // renderMapSlide) can recolor it the same way it recolors the legend
    // entry and layout-mode pins — this is what shows WHICH marker is
    // currently selected, directly on the map.
    const markerEl = marker.getElement();
    if (markerEl) markerEl.dataset.highlightId = h.id;

    markersById[h.id] = marker;
  });

  // Legend clicks already trigger showHighlight() via the listener wired
  // in renderMapSlide (updating the detail panel + recoloring markers) —
  // here we only add the courtesy of panning the camera to that marker.
  if (mapCard) {
    mapCard
      .querySelectorAll(`[data-map-legend-for="${CSS.escape(slide.id)}"] .map-legend-item`)
      .forEach(item => {
        item.addEventListener("click", () => {
          const marker = markersById[item.dataset.highlightId];
          if (marker) map.panTo(marker.getLatLng());
        });
      });
  }

  activeLeafletMap = map;
  setTimeout(() => map.invalidateSize(), 150);
}

function renderQuizSlide(slide) {
  const card = el("div", "content-card");
  const selected = state.answers[slide.id];

  card.innerHTML = `
    <div class="content-card-icon quiz-icon"><i class="fa-solid fa-circle-question"></i></div>
    <div class="critical-tag quiz-tag"><i class="fa-solid fa-clipboard-list"></i> Knowledge Check</div>
    <h2 class="font-display text-lg mt-3 mb-4 text-slate-900">${escapeHTML(slide.question)}</h2>
    <div class="space-y-2" id="option-list"></div>
    <p id="answer-feedback" class="text-sm mt-3 font-medium hidden"></p>
  `;

  const optionList = card.querySelector("#option-list");
  slide.options.forEach((optionText, idx) => {
    const btn = el("button", "quiz-option");
    btn.type = "button";
    btn.innerHTML = `<span class="quiz-option-letter">${String.fromCharCode(65 + idx)}</span><span>${escapeHTML(optionText)}</span>`;

    if (selected !== undefined) {
      btn.disabled = true;
      if (idx === slide.correctIndex) btn.classList.add("correct");
      else if (idx === selected) btn.classList.add("incorrect");
    }

    btn.addEventListener("click", () => submitAnswer(slide, idx, card));
    optionList.appendChild(btn);
  });

  if (selected !== undefined) showAnswerFeedback(card, selected === slide.correctIndex);
  return card;
}

function submitAnswer(slide, chosenIndex, card) {
  const alreadyAnswered = state.answers[slide.id] !== undefined;
  state.answers[slide.id] = chosenIndex;

  if (!alreadyAnswered) {
    state.score.total += 1;
    if (chosenIndex === slide.correctIndex) state.score.correct += 1;
  }

  card.querySelectorAll(".quiz-option").forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === slide.correctIndex) btn.classList.add("correct");
    else if (idx === chosenIndex) btn.classList.add("incorrect");
  });

  showAnswerFeedback(card, chosenIndex === slide.correctIndex);

  const nextBtn = document.getElementById("nav-next");
  if (nextBtn) nextBtn.disabled = false;
}

function showAnswerFeedback(card, isCorrect) {
  const feedback = card.querySelector("#answer-feedback");
  feedback.classList.remove("hidden");
  feedback.textContent = isCorrect ? "Correct — well noted." : "Not quite — the correct answer is highlighted above.";
  feedback.classList.add(isCorrect ? "text-green-700" : "text-red-700");
}

/** Move forward/back through slides, crossing module boundaries and finishing to the Pass screen. */
function moveSlide(direction) {
  const module = state.activeModules[state.moduleIndex];
  const slides = getVisibleSlides(module);
  const totalSlides = slides.length;
  const nextIndex = state.slideIndex + direction;

  if (nextIndex < 0) {
    if (state.moduleIndex === 0) return;
    state.moduleIndex -= 1;
    const prevSlides = getVisibleSlides(state.activeModules[state.moduleIndex]);
    state.slideIndex = prevSlides.length - 1;
  } else if (nextIndex >= totalSlides) {
    if (state.moduleIndex + 1 >= state.activeModules.length) {
      finishInduction();
      return;
    }
    state.moduleIndex += 1;
    state.slideIndex = 0;
  } else {
    state.slideIndex = nextIndex;
  }
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function finishInduction() {
  const pct = state.score.total ? state.score.correct / state.score.total : 1;
  const passed = pct >= PASS_THRESHOLD;
  const facility = state.db.facilities.find(f => f.id === state.user.facilityId);

  const record = {
    name: state.user.name,
    facility: facility ? facility.name : state.user.facilityId,
    date: new Date().toISOString(),
    score: state.score.correct,
    total: state.score.total,
    percent: Math.round(pct * 100),
    passed
  };

  // Show the pass immediately — don't make the user wait on a network
  // round trip to see their result. Update the local records cache right
  // away (so it shows in Admin instantly too), then save to Supabase in
  // the background; a failure here is logged but never blocks the user.
  state.records.unshift(record);
  state.view = "pass";
  render();

  insertRecordRemote(record).catch(e => {
    console.warn("Could not save completion record to the database:", e);
  });
}

/* ---------------------------------------------------------------------- *
 * 5c. USER APP — Digital Pass
 * ---------------------------------------------------------------------- */

function renderPass() {
  const facility = state.db.facilities.find(f => f.id === state.user.facilityId);
  const pct = state.score.total ? Math.round((state.score.correct / state.score.total) * 100) : 100;
  const passed = pct / 100 >= PASS_THRESHOLD;
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const wrap = el("div", "view-pass fade-in px-5 pt-8 pb-10");
  wrap.innerHTML = `
    <div class="text-center mb-6">
      <i class="fa-solid ${passed ? "fa-circle-check text-green-600" : "fa-circle-xmark text-red-600"} text-5xl"></i>
      <h1 class="font-display text-2xl mt-3 text-slate-900">${passed ? "Induction Complete" : "Induction Not Passed"}</h1>
      <p class="text-slate-500 text-sm mt-1">
        ${passed
          ? "You've met the minimum standard required for site access."
          : `A score of ${Math.round(PASS_THRESHOLD * 100)}% or higher is required. Please retake the induction.`}
      </p>
    </div>

    <div class="hse-pass-card ${passed ? "" : "hse-pass-card-fail"}">
      <div class="hse-pass-header"><span>INDUCTION PASS</span><i class="fa-solid fa-hard-hat"></i></div>
      <div class="hse-pass-body">
        <div class="hse-pass-row"><span>Name</span><strong>${escapeHTML(state.user.name)}</strong></div>
        <div class="hse-pass-row"><span>Facility</span><strong>${escapeHTML(facility ? facility.name : "—")}</strong></div>
        <div class="hse-pass-row"><span>Date issued</span><strong>${dateStr}</strong></div>
        <div class="hse-pass-row"><span>Score</span><strong>${state.score.correct}/${state.score.total} (${pct}%)</strong></div>
        <div class="hse-pass-row"><span>Status</span><strong class="${passed ? "text-green-700" : "text-red-700"}">${passed ? "PASSED" : "NOT PASSED"}</strong></div>
      </div>
      <div class="hse-pass-footer">Valid for site access · Present on request</div>
    </div>

    <div class="flex gap-3 mt-6">
      <button id="print-pass-btn" class="nav-btn-secondary flex-1"><i class="fa-solid fa-print mr-2"></i>Print</button>
      <button id="restart-btn" class="nav-btn-primary flex-1">${passed ? "Done" : "Retake Induction"}</button>
    </div>
  `;

  wrap.querySelector("#print-pass-btn").addEventListener("click", () => window.print());
  wrap.querySelector("#restart-btn").addEventListener("click", () => {
    if (passed) {
      resetInductionState();
      state.view = "welcome";
    } else {
      state.moduleIndex = 0;
      state.slideIndex = 0;
      state.answers = {};
      state.score = { correct: 0, total: 0 };
      state.view = "flow";
    }
    render();
  });

  return wrap;
}

/* ---------------------------------------------------------------------- *
 * 6a. ADMIN — PIN gate
 * ---------------------------------------------------------------------- */

function renderAdminLogin() {
  const wrap = el("div", "view-admin-login fade-in px-5 pt-16 text-center");
  wrap.innerHTML = `
    <i class="fa-solid fa-lock text-4xl text-slate-400"></i>
    <h1 class="font-display text-xl mt-4 text-slate-900">Admin Access</h1>
    <p class="text-slate-500 text-sm mt-1 mb-6">Enter the PIN to manage induction content</p>
    <input id="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"
      class="w-40 mx-auto block text-center tracking-[0.5em] text-xl border border-slate-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-hse-yellow" />
    <p id="pin-error" class="text-red-600 text-sm mb-4 hidden">Incorrect PIN. Try again.</p>
    <button id="pin-submit" class="nav-btn-primary px-8">Unlock</button>
    <p class="text-xs text-slate-400 mt-8">Prototype PIN: ${ADMIN_PIN} &nbsp;(replace with real auth before production)</p>
  `;

  const submit = () => {
    const val = wrap.querySelector("#pin-input").value;
    if (val === ADMIN_PIN) {
      state.isAdmin = true;
      state.view = "admin-dashboard";
      render();
    } else {
      wrap.querySelector("#pin-error").classList.remove("hidden");
    }
  };

  wrap.querySelector("#pin-submit").addEventListener("click", submit);
  wrap.querySelector("#pin-input").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  return wrap;
}

/* ---------------------------------------------------------------------- *
 * 6b. ADMIN — Dashboard (module list + editor + facilities + records)
 * ---------------------------------------------------------------------- */

function renderAdminDashboard() {
  const wrap = el("div", "view-admin fade-in");

  wrap.innerHTML = `
    <div class="admin-header">
      <div>
        <h1 class="font-display text-xl text-slate-900">Admin Dashboard</h1>
        <p class="text-slate-500 text-sm">Edit induction content — changes save to the shared database instantly</p>
      </div>
      <button id="admin-logout" class="nav-btn-secondary">Log out</button>
    </div>

    <div class="admin-layout">
      <div class="admin-sidebar">
        <h3 class="admin-section-title">Part A — Site Orientation</h3>
        <div id="module-nav-orientation" class="space-y-1"></div>

        <h3 class="admin-section-title mt-4">Part B — HSE</h3>
        <div id="module-nav-hse" class="space-y-1"></div>

        <button id="add-module-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add module</button>

        <h3 class="admin-section-title mt-6">Facilities</h3>
        <div id="facility-nav-list" class="space-y-1"></div>
        <button id="add-facility-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add facility</button>

        <h3 class="admin-section-title mt-6 admin-section-title-row">
          <span>Recent Completions</span>
          <button type="button" id="refresh-records-btn" class="icon-btn" title="Refresh from database"><i class="fa-solid fa-arrows-rotate"></i></button>
        </h3>
        <div id="records-list" class="text-xs text-slate-500 space-y-2 max-h-48 overflow-y-auto"></div>
      </div>

      <div id="admin-main" class="admin-main"></div>
    </div>
  `;

  wrap.querySelector("#admin-logout").addEventListener("click", () => {
    state.isAdmin = false;
    state.view = "welcome";
    render();
  });

  // --- Module nav lists, split by category ---
  const orientationNav = wrap.querySelector("#module-nav-orientation");
  const hseNav = wrap.querySelector("#module-nav-hse");
  state.db.modules.forEach(m => {
    const item = el("button", "admin-nav-item" + (state.adminSelectedModuleId === m.id ? " active" : ""));
    item.innerHTML = `<i class="fa-solid ${m.icon}"></i> <span class="flex-1">${escapeHTML(m.title)}</span><span class="module-slide-count">${m.slides.length}</span>`;
    item.addEventListener("click", () => { state.adminSelectedModuleId = m.id; render(); });
    (m.category === "hse" ? hseNav : orientationNav).appendChild(item);
  });

  wrap.querySelector("#add-module-btn").addEventListener("click", () => {
    const maxOrder = state.db.modules.reduce((max, m) => Math.max(max, m.sort_order || 0), 0);
    const newModule = {
      id: uid("mod"),
      title: "New Module",
      icon: "fa-file-circle-plus",
      category: "orientation",
      facilities: ["all"],
      slides: [defaultSlide("info")],
      sort_order: maxOrder + 10
    };
    state.db.modules.push(newModule); // optimistic — shows instantly
    state.adminSelectedModuleId = newModule.id;
    render();
    upsertModuleRemote(newModule).catch(e => {
      alert("Could not save the new module to the database: " + e.message);
    });
  });

  // --- Facilities nav list ---
  const facilityNavList = wrap.querySelector("#facility-nav-list");
  state.db.facilities.forEach(f => {
    const item = el("div", "admin-nav-item admin-nav-item-static");
    item.innerHTML = `
      <i class="fa-solid ${f.icon}"></i>
      <span class="flex-1">${escapeHTML(f.name)}</span>
      <button class="admin-delete-icon" title="Remove facility"><i class="fa-solid fa-trash"></i></button>
    `;
    item.querySelector(".admin-delete-icon").addEventListener("click", () => {
      if (!confirm(`Remove facility "${f.name}"? This does not delete modules.`)) return;
      state.db.facilities = state.db.facilities.filter(x => x.id !== f.id); // optimistic
      render();
      deleteFacilityRemote(f.id).catch(e => {
        alert("Could not remove the facility from the database: " + e.message);
      });
    });
    facilityNavList.appendChild(item);
  });
  wrap.querySelector("#add-facility-btn").addEventListener("click", () => {
    const name = prompt("New facility name:");
    if (!name) return;
    const type = confirm("Is this a residential camp? (OK = Camp, Cancel = Operational Site)") ? "camp" : "operational";
    const newFacility = {
      id: uid("facility"),
      name,
      description: type === "camp" ? "Residential camp & support facility" : "Operational site",
      icon: type === "camp" ? "fa-campground" : "fa-location-dot",
      type
    };
    state.db.facilities.push(newFacility); // optimistic
    render();
    insertFacilityRemote(newFacility).catch(e => {
      alert("Could not save the new facility to the database: " + e.message);
    });
  });

  wrap.querySelector("#refresh-records-btn").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    // The button's rebuilt fresh (spinner gone) by the render() call below
    // regardless of outcome, so there's no separate "reset" step needed.
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
    try {
      state.records = await fetchRecords();
    } catch (err) {
      alert("Could not refresh completions from the database: " + err.message);
    }
    render();
  });

  // --- Records list (from the in-memory cache — see bootLoadData / the
  // refresh button above / finishInduction's optimistic update) ---
  const recordsList = wrap.querySelector("#records-list");
  const records = state.records;
  if (records.length === 0) {
    recordsList.innerHTML = `<p class="italic text-slate-400">No completions recorded yet.</p>`;
  } else {
    records.slice(0, 15).forEach(r => {
      const row = el("div", "admin-record-row");
      row.innerHTML = `
        <div class="font-semibold text-slate-700">${escapeHTML(r.name)}</div>
        <div>${escapeHTML(r.facility)} · ${r.percent}% · <span class="${r.passed ? "text-green-600" : "text-red-600"}">${r.passed ? "Passed" : "Failed"}</span></div>
        <div class="text-slate-400">${new Date(r.date).toLocaleString()}</div>
      `;
      recordsList.appendChild(row);
    });
  }

  // --- Main editor panel ---
  const mainPanel = wrap.querySelector("#admin-main");
  const selectedModule = state.db.modules.find(m => m.id === state.adminSelectedModuleId) || state.db.modules[0];
  if (selectedModule) {
    state.adminSelectedModuleId = selectedModule.id;
    mainPanel.appendChild(renderModuleEditor(selectedModule));
  } else {
    mainPanel.innerHTML = `<p class="text-slate-400 italic">No modules yet — add one from the sidebar.</p>`;
  }

  return wrap;
}

/* ---------------------------------------------------------------------- *
 * 6c. ADMIN — FORM-BASED module & slide editor (no raw JSON required)
 * ---------------------------------------------------------------------- */

/**
 * Curated set of Font Awesome icons offered by the icon picker below.
 * Covers everything used in the default content plus common extras an
 * admin is likely to want when adding new modules/slides/markers. Any
 * icon class already saved in the data but NOT in this list still shows
 * correctly (buildIconPicker falls back to displaying the raw class name)
 * — it just won't appear as a pickable option until re-chosen.
 */
const ICON_LIBRARY = [
  // Safety / PPE / hazards
  { value: "fa-hard-hat", label: "Hard Hat" },
  { value: "fa-user-shield", label: "PPE / Protection" },
  { value: "fa-shield-halved", label: "Shield" },
  { value: "fa-hand-fist", label: "Stop Work / Fist" },
  { value: "fa-hand", label: "Hand / Rule" },
  { value: "fa-hand-point-up", label: "Point Up" },
  { value: "fa-skull-crossbones", label: "Toxic / Hazard" },
  { value: "fa-triangle-exclamation", label: "Warning" },
  { value: "fa-temperature-high", label: "Heat" },
  { value: "fa-recycle", label: "Recycle / Waste" },
  { value: "fa-lock", label: "Lock / LOTO" },
  { value: "fa-fire-extinguisher", label: "Fire Extinguisher" },
  { value: "fa-truck-medical", label: "Ambulance / Emergency" },
  { value: "fa-briefcase-medical", label: "Medical / Clinic" },
  { value: "fa-volume-high", label: "Alarm / Loud" },
  { value: "fa-volume-xmark", label: "Quiet" },
  { value: "fa-phone", label: "Phone" },
  { value: "fa-people-group", label: "Muster / Group" },
  { value: "fa-ban-smoking", label: "No Smoking" },
  { value: "fa-gauge-high", label: "Gauge / Monitor" },
  { value: "fa-down-long", label: "Dropped Object" },
  // Camp / facility
  { value: "fa-campground", label: "Camp" },
  { value: "fa-building", label: "Building / Office" },
  { value: "fa-bed", label: "Accommodation" },
  { value: "fa-utensils", label: "Mess / Dining" },
  { value: "fa-dumbbell", label: "Gym" },
  { value: "fa-basketball", label: "Sports" },
  { value: "fa-shirt", label: "Laundry / Dress Code" },
  { value: "fa-broom", label: "Housekeeping" },
  { value: "fa-hand-sparkles", label: "Hygiene" },
  { value: "fa-people-arrows", label: "Respect / Conduct" },
  { value: "fa-house-circle-check", label: "Camp Rules" },
  { value: "fa-clock", label: "Timings" },
  // Map / location
  { value: "fa-map-location-dot", label: "Map" },
  { value: "fa-location-dot", label: "Location Pin" },
  { value: "fa-oil-well", label: "Oil Well / Rig" },
  // General / quiz
  { value: "fa-circle-question", label: "Question" },
  { value: "fa-circle-info", label: "Info" },
  { value: "fa-clipboard-list", label: "Checklist" },
  { value: "fa-circle-check", label: "Check" },
  { value: "fa-file-lines", label: "Document" },
  { value: "fa-file-circle-plus", label: "New Module" }
];

/**
 * A dropdown icon picker with a live preview, replacing free-text Font
 * Awesome class entry. Renders a trigger button (current icon + label)
 * that opens a searchable grid of choices; picking one updates the
 * trigger and calls onChange(newIconClass). Works as a drop-in widget —
 * mount it into any container via `.appendChild(buildIconPicker(...))`.
 */
function buildIconPicker(currentValue, onChange) {
  const wrap = el("div", "icon-picker");
  let value = currentValue || "fa-circle";

  function findLabel(v) {
    const match = ICON_LIBRARY.find(i => i.value === v);
    return match ? match.label : v;
  }

  wrap.innerHTML = `
    <button type="button" class="icon-picker-trigger">
      <i class="fa-solid ${escapeAttr(value)} icon-picker-preview"></i>
      <span class="icon-picker-label">${escapeHTML(findLabel(value))}</span>
      <i class="fa-solid fa-chevron-down icon-picker-chevron"></i>
    </button>
    <div class="icon-picker-panel hidden">
      <input type="text" class="icon-picker-search" placeholder="Search icons..." />
      <div class="icon-picker-grid"></div>
    </div>
  `;

  const trigger = wrap.querySelector(".icon-picker-trigger");
  const panel = wrap.querySelector(".icon-picker-panel");
  const searchInput = wrap.querySelector(".icon-picker-search");
  const grid = wrap.querySelector(".icon-picker-grid");

  function renderGrid(filterText) {
    grid.innerHTML = "";
    const term = (filterText || "").toLowerCase();
    const list = ICON_LIBRARY.filter(
      i => !term || i.label.toLowerCase().includes(term) || i.value.includes(term)
    );
    if (list.length === 0) {
      grid.innerHTML = `<p class="icon-picker-empty">No matching icons.</p>`;
      return;
    }
    list.forEach(i => {
      const btn = el("button", "icon-picker-option" + (i.value === value ? " selected" : ""));
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid ${i.value}"></i><span>${escapeHTML(i.label)}</span>`;
      btn.addEventListener("click", () => {
        value = i.value;
        trigger.querySelector(".icon-picker-preview").className = `fa-solid ${value} icon-picker-preview`;
        trigger.querySelector(".icon-picker-label").textContent = i.label;
        closePanel();
        onChange(value);
      });
      grid.appendChild(btn);
    });
  }

  function onOutsideClick(e) {
    if (!wrap.contains(e.target)) closePanel();
  }
  function openPanel() {
    panel.classList.remove("hidden");
    searchInput.value = "";
    renderGrid("");
    searchInput.focus();
    document.addEventListener("click", onOutsideClick);
  }
  function closePanel() {
    panel.classList.add("hidden");
    document.removeEventListener("click", onOutsideClick);
  }

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    if (panel.classList.contains("hidden")) openPanel();
    else closePanel();
  });
  searchInput.addEventListener("input", () => renderGrid(searchInput.value));

  return wrap;
}

/**
 * Renders an interactive Leaflet mini-map inside a satellite map slide's
 * editor so an admin can PICK coordinates by dragging pins, instead of
 * typing latitude/longitude by hand. Shows one draggable crosshair marker
 * for the slide's center point, plus one draggable pin per existing
 * highlight/marker. Dragging updates the underlying data directly and
 * refreshes the small read-only coordinate readouts next to each field.
 *
 * Must be called AFTER `containerId` is attached to the live DOM (Leaflet
 * needs to measure real pixel dimensions) — callers schedule this via
 * `setTimeout(..., 0)` right after building the surrounding form markup,
 * the same pattern used by the main app's initSatelliteMap().
 */
function initPositionMiniMap(slide, containerId, miniMapsRegistry) {
  const container = document.getElementById(containerId);
  if (!container || typeof L === "undefined") return;

  const center = slide.center || [0, 0];
  const map = L.map(container, { attributionControl: false }).setView(center, slide.zoom || 16);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Esri"
  }).addTo(map);

  // Center marker — a distinct crosshair icon, draggable to set slide.center.
  const centerIcon = L.divIcon({
    className: "admin-map-center-icon",
    html: `<i class="fa-solid fa-crosshairs"></i>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  const centerMarker = L.marker(center, { icon: centerIcon, draggable: true }).addTo(map);
  const centerReadout = document.getElementById(`center-readout-${slide.id}`);
  centerMarker.on("drag", () => {
    const pos = centerMarker.getLatLng();
    if (centerReadout) centerReadout.textContent = `Center: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  });
  centerMarker.on("dragend", () => {
    const pos = centerMarker.getLatLng();
    slide.center = [pos.lat, pos.lng];
  });

  // One draggable pin per existing marker, so every location can be
  // positioned visually rather than by typing coordinates.
  (slide.highlights || []).forEach(h => {
    const icon = L.divIcon({
      className: "leaflet-pin-icon",
      html: `<i class="fa-solid ${h.icon || "fa-location-dot"}"></i>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });
    const marker = L.marker([h.lat || center[0], h.lng || center[1]], { icon, draggable: true }).addTo(map);
    marker.bindTooltip(h.label || "Marker", { direction: "top", offset: [0, -28] });

    const readoutEl = document.getElementById(`marker-coord-${h.id}`);
    marker.on("drag", () => {
      const pos = marker.getLatLng();
      if (readoutEl) readoutEl.textContent = `Lat: ${pos.lat.toFixed(5)} · Lng: ${pos.lng.toFixed(5)}`;
    });
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      h.lat = pos.lat;
      h.lng = pos.lng;
    });
  });

  // Keep the zoom number field (still manually editable — zoom level isn't
  // really a "coordinate") in sync with the mini-map's own zoom controls.
  map.on("zoomend", () => {
    slide.zoom = map.getZoom();
    const zoomInput = document.getElementById(`zoom-input-${slide.id}`);
    if (zoomInput) zoomInput.value = slide.zoom;
  });

  setTimeout(() => map.invalidateSize(), 150);
  if (miniMapsRegistry) miniMapsRegistry.push(map);
}

/**
 * Renders an interactive Leaflet mini-map for a "layout" (2D floor-plan
 * image) map slide, using Leaflet's Simple CRS mode to treat the image as
 * its own flat coordinate space instead of real-world geography. Lets an
 * admin drag pins directly onto the image to set each marker's top/left
 * percentage — the same drag-to-place workflow used for satellite maps,
 * instead of typing percentages by hand.
 *
 * Must be called AFTER `containerId` is attached to the live DOM, same
 * requirement as initPositionMiniMap (see its doc comment) — plus this
 * one also waits for the image itself to load, since it needs the image's
 * real pixel dimensions to define the map's coordinate bounds.
 */
function initLayoutPositionMap(slide, containerId, miniMapsRegistry) {
  const container = document.getElementById(containerId);
  if (!container || typeof L === "undefined" || !slide.imageUrl) return;

  const img = new Image();
  img.onload = () => {
    // The admin may have navigated away (or the slides list re-rendered)
    // before a slow/broken image URL finished loading.
    if (!document.getElementById(containerId)) return;

    const w = img.naturalWidth || 1000;
    const h = img.naturalHeight || 1000;
    const bounds = [[0, 0], [h, w]]; // [y, x] — matches plain image pixel coordinates, y measured from the top

    const map = L.map(container, { crs: L.CRS.Simple, attributionControl: false, minZoom: -5 });
    L.imageOverlay(slide.imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);

    (slide.highlights || []).forEach(h2 => {
      const topPct = parseFloat(h2.top) || 0;
      const leftPct = parseFloat(h2.left) || 0;
      const icon = L.divIcon({
        className: "leaflet-pin-icon",
        html: `<i class="fa-solid ${h2.icon || "fa-location-dot"}"></i>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      });
      const marker = L.marker([(topPct / 100) * h, (leftPct / 100) * w], { icon, draggable: true }).addTo(map);
      marker.bindTooltip(h2.label || "Marker", { direction: "top", offset: [0, -28] });

      const readoutEl = document.getElementById(`marker-coord-${h2.id}`);
      marker.on("drag", () => {
        const pos = marker.getLatLng();
        const t = ((pos.lat / h) * 100).toFixed(1) + "%";
        const l = ((pos.lng / w) * 100).toFixed(1) + "%";
        if (readoutEl) readoutEl.textContent = `Top: ${t} · Left: ${l}`;
      });
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        h2.top = ((pos.lat / h) * 100).toFixed(1) + "%";
        h2.left = ((pos.lng / w) * 100).toFixed(1) + "%";
      });
    });

    setTimeout(() => map.invalidateSize(), 150);
    if (miniMapsRegistry) miniMapsRegistry.push(map);
  };
  img.onerror = () => {
    const target = document.getElementById(containerId);
    if (target) target.innerHTML = `<p class="field-hint" style="padding:1rem;">Couldn't load that image URL.</p>`;
  };
  img.src = slide.imageUrl;
}

/** A fresh, blank slide object of the given type, used by the "Add slide" buttons. */
function defaultSlide(type) {
  if (type === "info") {
    return { type: "info", id: uid("slide"), heading: "New Info Slide", icon: "fa-circle-info", body: "" };
  }
  if (type === "map") {
    return { type: "map", id: uid("slide"), heading: "New Map", body: "", mapType: "satellite", center: [0, 0], zoom: 16, highlights: [] };
  }
  return { type: "quiz", id: uid("slide"), question: "", options: ["", ""], correctIndex: 0 };
}

function renderModuleEditor(module) {
  const panel = el("div", "module-editor");

  // Edits happen on a deep-cloned working copy of the slides so nothing
  // touches the live data (or localStorage) until "Save changes" is clicked.
  const workingSlides = JSON.parse(JSON.stringify(module.slides));

  panel.innerHTML = `
    <div class="editor-row">
      <label>Module title</label>
      <input id="edit-title" type="text" value="${escapeAttr(module.title)}" />
    </div>
    <div class="editor-row-inline">
      <div class="flex-1">
        <label>Icon</label>
        <div id="edit-icon-slot"></div>
      </div>
      <div class="flex-1">
        <label>Category</label>
        <select id="edit-category">
          <option value="orientation" ${module.category === "orientation" ? "selected" : ""}>Site Orientation (Part A)</option>
          <option value="hse" ${module.category === "hse" ? "selected" : ""}>HSE (Part B)</option>
        </select>
      </div>
    </div>
    <div class="editor-row">
      <label>Applies to facilities (module default)</label>
      <div id="edit-facilities" class="flex flex-wrap gap-3"></div>
    </div>

    <div class="editor-row">
      <label id="slides-count-label">Slides</label>
      <div id="slides-editor-list" class="space-y-4"></div>
      <div class="add-slide-row">
        <span class="add-slide-label">Add slide:</span>
        <button type="button" class="add-slide-btn" data-add-type="info"><i class="fa-solid fa-file-lines"></i> Info</button>
        <button type="button" class="add-slide-btn" data-add-type="map"><i class="fa-solid fa-map-location-dot"></i> Map</button>
        <button type="button" class="add-slide-btn" data-add-type="quiz"><i class="fa-solid fa-circle-question"></i> Quiz</button>
      </div>
    </div>

    <p id="editor-error" class="text-red-600 text-sm hidden mb-3"></p>

    <div class="flex gap-3">
      <button id="save-module-btn" class="nav-btn-primary"><i class="fa-solid fa-floppy-disk mr-2"></i>Save changes</button>
      <button id="delete-module-btn" class="nav-btn-danger"><i class="fa-solid fa-trash mr-2"></i>Delete module</button>
    </div>
  `;

  // Module-level icon: a dropdown picker with live preview (see buildIconPicker)
  // instead of a raw text field. The picked value is held here and only
  // committed to `module.icon` when "Save changes" is clicked, matching how
  // the title/category/facilities fields already behave.
  let workingModuleIcon = module.icon;
  panel.querySelector("#edit-icon-slot").appendChild(
    buildIconPicker(workingModuleIcon, v => { workingModuleIcon = v; })
  );

  // Module-level facilities checkboxes (unchanged behaviour)
  const facilitiesWrap = panel.querySelector("#edit-facilities");
  const allOptions = [{ id: "all", name: "All facilities" }, ...window.__hseAdminFacilityOptions()];
  allOptions.forEach(opt => {
    const checked = module.facilities.includes(opt.id);
    const label = el("label", "facility-checkbox");
    label.innerHTML = `<input type="checkbox" value="${escapeAttr(opt.id)}" ${checked ? "checked" : ""} /> ${escapeHTML(opt.name)}`;
    facilitiesWrap.appendChild(label);
  });

  // Tracks any interactive position-picker mini-maps (see initPositionMiniMap)
  // created while this module's slides are on screen, so they can be torn
  // down cleanly whenever the slides list is rebuilt (add/delete/reorder).
  let adminMiniMaps = [];
  function destroyAdminMiniMaps() {
    adminMiniMaps.forEach(m => { try { m.remove(); } catch (e) { /* already gone */ } });
    adminMiniMaps = [];
  }

  const slidesListEl = panel.querySelector("#slides-editor-list");
  const slidesCountLabel = panel.querySelector("#slides-count-label");
  function rerenderSlidesList() {
    destroyAdminMiniMaps();
    slidesListEl.innerHTML = "";
    workingSlides.forEach((slide, index) => {
      slidesListEl.appendChild(renderSlideCardEditor(slide, index, workingSlides, rerenderSlidesList, adminMiniMaps));
    });
    slidesCountLabel.textContent = `Slides (${workingSlides.length} total)`;
  }
  rerenderSlidesList();

  panel.querySelectorAll(".add-slide-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      workingSlides.push(defaultSlide(btn.dataset.addType));
      rerenderSlidesList();
    });
  });

  panel.querySelector("#save-module-btn").addEventListener("click", async () => {
    const errorEl = panel.querySelector("#editor-error");
    const saveBtn = panel.querySelector("#save-module-btn");
    errorEl.classList.add("hidden");
    try {
      if (workingSlides.length === 0) throw new Error("A module needs at least one slide.");

      workingSlides.forEach((s, i) => {
        const n = i + 1;
        if (s.type === "info" && !(s.heading || "").trim()) {
          throw new Error(`Slide ${n} (info) needs a heading.`);
        }
        if (s.type === "map") {
          if (!(s.heading || "").trim()) throw new Error(`Slide ${n} (map) needs a heading.`);
          if (s.mapType === "satellite") {
            if (!Array.isArray(s.center) || s.center.some(v => typeof v !== "number" || Number.isNaN(v))) {
              throw new Error(`Slide ${n} (map) needs a valid center latitude/longitude.`);
            }
          } else if (!(s.imageUrl || "").trim()) {
            throw new Error(`Slide ${n} (map) needs a layout image URL.`);
          }
        }
        if (s.type === "quiz") {
          if (!(s.question || "").trim()) throw new Error(`Slide ${n} (quiz) needs a question.`);
          if (!Array.isArray(s.options) || s.options.length < 2 || s.options.some(o => !(o || "").trim())) {
            throw new Error(`Slide ${n} (quiz) needs at least 2 non-empty options.`);
          }
          if (s.correctIndex === undefined || s.correctIndex < 0 || s.correctIndex >= s.options.length) {
            throw new Error(`Slide ${n} (quiz) needs a correct answer selected.`);
          }
        }
      });

      const selectedFacilities = Array.from(facilitiesWrap.querySelectorAll("input:checked")).map(cb => cb.value);

      module.title = panel.querySelector("#edit-title").value.trim() || module.title;
      module.icon = workingModuleIcon || module.icon;
      module.category = panel.querySelector("#edit-category").value;
      module.facilities = selectedFacilities.length ? selectedFacilities : ["all"];
      module.slides = JSON.parse(JSON.stringify(workingSlides)); // commit the working copy

      // Only now — once validation has passed and we're actually about to
      // make the network call — show the in-flight "Saving…" state.
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Saving...`;

      await upsertModuleRemote(module);
      flashSaved(saveBtn);
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove("hidden");
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i>Save changes`;
    }
  });

  panel.querySelector("#delete-module-btn").addEventListener("click", () => {
    if (!confirm(`Delete module "${module.title}"? This cannot be undone.`)) return;
    state.db.modules = state.db.modules.filter(m => m.id !== module.id); // optimistic
    state.adminSelectedModuleId = state.db.modules.length ? state.db.modules[0].id : null;
    render();
    deleteModuleRemote(module.id).catch(e => {
      alert("Could not delete the module from the database: " + e.message);
    });
  });

  return panel;
}

/** One slide's editor card: header (type badge + reorder/delete) + type-specific form + facility override. */
function renderSlideCardEditor(slide, index, workingSlides, rerenderList, adminMiniMaps) {
  const card = el("div", "slide-editor-card");

  const header = el("div", "slide-editor-header");
  header.innerHTML = `
    <span class="slide-type-badge slide-type-${slide.type}">${slide.type}</span>
    <span class="slide-editor-index">Slide ${index + 1}</span>
    <div class="slide-editor-actions">
      <button type="button" class="icon-btn" data-action="up" title="Move up"><i class="fa-solid fa-arrow-up"></i></button>
      <button type="button" class="icon-btn" data-action="down" title="Move down"><i class="fa-solid fa-arrow-down"></i></button>
      <button type="button" class="icon-btn" data-action="duplicate" title="Duplicate slide"><i class="fa-solid fa-copy"></i></button>
      <button type="button" class="icon-btn icon-btn-danger" data-action="delete" title="Delete slide"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  header.querySelector('[data-action="up"]').addEventListener("click", () => {
    if (index === 0) return;
    const tmp = workingSlides[index - 1];
    workingSlides[index - 1] = workingSlides[index];
    workingSlides[index] = tmp;
    rerenderList();
  });
  header.querySelector('[data-action="down"]').addEventListener("click", () => {
    if (index === workingSlides.length - 1) return;
    const tmp = workingSlides[index + 1];
    workingSlides[index + 1] = workingSlides[index];
    workingSlides[index] = tmp;
    rerenderList();
  });
  header.querySelector('[data-action="duplicate"]').addEventListener("click", () => {
    // Deep-clone the slide (e.g. a camp's map, with all its markers) so it
    // can be reused for another location by only editing what's different
    // — the facility restriction, marker positions, a few labels — rather
    // than rebuilding it field by field. Fresh IDs prevent the clone from
    // colliding with the original's DOM ids (mini-map, coordinate
    // readouts, quiz radio-button groups, etc).
    const clone = JSON.parse(JSON.stringify(slide));
    clone.id = uid("slide");
    if (clone.type === "map" && Array.isArray(clone.highlights)) {
      clone.highlights.forEach(h => { h.id = uid("marker"); });
    }
    workingSlides.splice(index + 1, 0, clone);
    rerenderList();
  });
  header.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (!confirm("Delete this slide?")) return;
    workingSlides.splice(index, 1);
    rerenderList();
  });
  card.appendChild(header);

  const body = el("div", "slide-editor-body");
  if (slide.type === "info") body.appendChild(buildInfoSlideForm(slide));
  else if (slide.type === "map") body.appendChild(buildMapSlideForm(slide, rerenderList, adminMiniMaps));
  else if (slide.type === "quiz") body.appendChild(buildQuizSlideForm(slide, rerenderList));
  card.appendChild(body);

  // A control shared by every slide type: optionally restrict this ONE
  // slide to specific facilities (e.g. a camp-specific map slide living
  // inside a module that's otherwise shared by every camp).
  card.appendChild(buildSlideFacilitiesOverride(slide));

  return card;
}

function buildInfoSlideForm(slide) {
  const wrap = el("div", "slide-form");
  const hasImage = !!slide.image;
  const imageUrl = slide.image ? slide.image.url || "" : "";
  const imagePosition = slide.image ? slide.image.position || "below" : "below";
  const imageCaption = slide.image ? slide.image.caption || "" : "";

  wrap.innerHTML = `
    <div class="slide-field-row">
      <label>Heading</label>
      <input data-f="heading" type="text" value="${escapeAttr(slide.heading || "")}" />
    </div>
    <div class="slide-field-row-inline">
      <div class="flex-1"><label>Icon</label><div class="icon-picker-slot" data-slot="icon"></div></div>
      <div class="flex-1">
        <label>Alert style</label>
        <select data-f="alert">
          <option value="" ${!slide.alert ? "selected" : ""}>None</option>
          <option value="critical" ${slide.alert === "critical" ? "selected" : ""}>Critical (red)</option>
          <option value="reference" ${slide.alert === "reference" ? "selected" : ""}>Quick Reference (blue)</option>
        </select>
      </div>
    </div>
    <div class="slide-field-row">
      <label>Body text</label>
      <textarea data-f="body" rows="4">${escapeHTML(slide.body || "")}</textarea>
    </div>
    <div class="slide-field-row">
      <label class="checkbox-label"><input type="checkbox" id="has-image-${slide.id}" ${hasImage ? "checked" : ""} /> Include an image</label>
      <div class="image-subfields" style="display:${hasImage ? "block" : "none"}">
        <input data-f="image-url" type="text" placeholder="Image URL" value="${escapeAttr(imageUrl)}" />
        <div class="slide-field-row-inline mt-2">
          <select data-f="image-position" class="flex-1">
            <option value="above" ${imagePosition === "above" ? "selected" : ""}>Show above text</option>
            <option value="below" ${imagePosition === "below" ? "selected" : ""}>Show below text</option>
          </select>
          <input data-f="image-caption" type="text" placeholder="Caption (optional)" value="${escapeAttr(imageCaption)}" class="flex-1" />
        </div>
      </div>
    </div>
  `;

  wrap.querySelector('[data-f="heading"]').addEventListener("input", e => { slide.heading = e.target.value; });
  wrap.querySelector('[data-slot="icon"]').appendChild(
    buildIconPicker(slide.icon, v => { slide.icon = v; })
  );
  wrap.querySelector('[data-f="alert"]').addEventListener("change", e => {
    if (e.target.value) slide.alert = e.target.value;
    else delete slide.alert;
  });
  wrap.querySelector('[data-f="body"]').addEventListener("input", e => { slide.body = e.target.value; });

  const imageCheckbox = wrap.querySelector(`#has-image-${slide.id}`);
  const imageSubfields = wrap.querySelector(".image-subfields");
  imageCheckbox.addEventListener("change", e => {
    if (e.target.checked) {
      slide.image = slide.image || { url: "", position: "below", caption: "" };
      imageSubfields.style.display = "block";
    } else {
      delete slide.image;
      imageSubfields.style.display = "none";
    }
  });
  wrap.querySelector('[data-f="image-url"]').addEventListener("input", e => {
    slide.image = slide.image || { position: "below" };
    slide.image.url = e.target.value;
  });
  wrap.querySelector('[data-f="image-position"]').addEventListener("change", e => {
    slide.image = slide.image || {};
    slide.image.position = e.target.value;
  });
  wrap.querySelector('[data-f="image-caption"]').addEventListener("input", e => {
    slide.image = slide.image || {};
    slide.image.caption = e.target.value;
  });

  return wrap;
}

/**
 * Exports a map slide's heading/center/zoom (or image URL) and all its
 * markers to a two-sheet Excel workbook — "Map Info" (key/value settings)
 * and "Markers" (one row per location). This is both an export tool for
 * bulk-editing an existing camp's map in a spreadsheet, and — used on a
 * brand-new, empty map slide — a ready-to-fill blank template, since the
 * same two sheets and column headers come out either way.
 */
function exportMapSlideToExcel(slide) {
  const isSatellite = slide.mapType === "satellite";
  const infoRows = [
    ["Field", "Value"],
    ["Heading", slide.heading || ""],
    ["Intro text", slide.body || ""],
    ["Map type (satellite or layout)", slide.mapType || "satellite"],
    ["Center latitude (satellite only)", isSatellite && slide.center ? slide.center[0] : ""],
    ["Center longitude (satellite only)", isSatellite && slide.center ? slide.center[1] : ""],
    ["Zoom 1-19 (satellite only)", isSatellite ? (slide.zoom || 16) : ""],
    ["Layout image URL (layout only)", !isSatellite ? (slide.imageUrl || "") : ""]
  ];

  const markerRows = [["Label", "Icon", "Latitude", "Longitude", "Top %", "Left %", "Description"]];
  (slide.highlights || []).forEach(h => {
    markerRows.push([
      h.label || "",
      h.icon || "",
      h.lat !== undefined ? h.lat : "",
      h.lng !== undefined ? h.lng : "",
      h.top !== undefined ? h.top : "",
      h.left !== undefined ? h.left : "",
      h.description || ""
    ]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), "Map Info");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(markerRows), "Markers");

  const safeTitle = (slide.heading || "map-slide").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  XLSX.writeFile(wb, `${safeTitle}.xlsx`);
}

/**
 * Reads a two-sheet Excel workbook (see exportMapSlideToExcel — either a
 * previously-exported file, or the same template filled in from scratch)
 * and REPLACES the given slide's heading/center/zoom/imageUrl/markers
 * with its contents. Calls onDone(error) — error is null on success.
 * Fresh internal ids are generated for every imported marker, since a
 * spreadsheet has no concept of the app's internal id scheme.
 */
function importMapSlideFromExcel(file, slide, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const infoSheet = wb.Sheets["Map Info"];
      const markersSheet = wb.Sheets["Markers"];
      if (!infoSheet || !markersSheet) {
        throw new Error('Expected two sheets named "Map Info" and "Markers" — did the sheet names get changed?');
      }

      const infoRows = XLSX.utils.sheet_to_json(infoSheet, { header: 1 });
      const infoMap = {};
      infoRows.slice(1).forEach(row => { if (row && row[0]) infoMap[row[0]] = row[1]; });

      const mapType = String(infoMap["Map type (satellite or layout)"] || "satellite").trim().toLowerCase();
      if (mapType !== "satellite" && mapType !== "layout") {
        throw new Error('The "Map type" field must be exactly "satellite" or "layout".');
      }

      slide.heading = String(infoMap["Heading"] || slide.heading || "Untitled map");
      slide.body = String(infoMap["Intro text"] || "");
      slide.mapType = mapType;

      if (mapType === "satellite") {
        const lat = parseFloat(infoMap["Center latitude (satellite only)"]);
        const lng = parseFloat(infoMap["Center longitude (satellite only)"]);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          throw new Error("Center latitude/longitude must be numbers for a satellite map.");
        }
        slide.center = [lat, lng];
        slide.zoom = parseInt(infoMap["Zoom 1-19 (satellite only)"], 10) || 16;
        delete slide.imageUrl;
      } else {
        slide.imageUrl = String(infoMap["Layout image URL (layout only)"] || "");
        delete slide.center;
        delete slide.zoom;
      }

      const markerRows = XLSX.utils.sheet_to_json(markersSheet);
      slide.highlights = markerRows.map(row => {
        const marker = {
          id: uid("marker"),
          label: String(row["Label"] || "Location"),
          icon: String(row["Icon"] || "fa-location-dot"),
          description: String(row["Description"] || "")
        };
        if (mapType === "satellite") {
          marker.lat = parseFloat(row["Latitude"]) || 0;
          marker.lng = parseFloat(row["Longitude"]) || 0;
        } else {
          let top = row["Top %"] !== undefined && row["Top %"] !== "" ? String(row["Top %"]).trim() : "50%";
          let left = row["Left %"] !== undefined && row["Left %"] !== "" ? String(row["Left %"]).trim() : "50%";
          if (!top.includes("%")) top += "%";
          if (!left.includes("%")) left += "%";
          marker.top = top;
          marker.left = left;
        }
        return marker;
      });

      onDone(null);
    } catch (err) {
      onDone(err);
    }
  };
  reader.onerror = () => onDone(new Error("Could not read the file."));
  reader.readAsArrayBuffer(file);
}

function buildMapSlideForm(slide, rerenderList, adminMiniMaps) {
  const wrap = el("div", "slide-form");
  const isSatellite = slide.mapType === "satellite";

  wrap.innerHTML = `
    <div class="slide-field-row">
      <label>Heading</label>
      <input data-f="heading" type="text" value="${escapeAttr(slide.heading || "")}" />
    </div>
    <div class="slide-field-row">
      <label>Intro text (shown above the map)</label>
      <textarea data-f="body" rows="2">${escapeHTML(slide.body || "")}</textarea>
    </div>
    <div class="slide-field-row">
      <label>Map type</label>
      <select data-f="mapType">
        <option value="satellite" ${isSatellite ? "selected" : ""}>Satellite / aerial map (real coordinates)</option>
        <option value="layout" ${!isSatellite ? "selected" : ""}>2D layout image (floor plan / drawn map)</option>
      </select>
    </div>
    <div id="map-type-fields"></div>
    <div class="slide-field-row">
      <label>Markers</label>
      <div class="excel-io-row">
        <button type="button" id="export-excel-btn" class="admin-add-btn"><i class="fa-solid fa-file-arrow-down"></i> Export to Excel</button>
        <label class="admin-add-btn admin-file-btn">
          <i class="fa-solid fa-file-arrow-up"></i> Import from Excel
          <input type="file" id="import-excel-input" accept=".xlsx,.xls" class="hidden" />
        </label>
      </div>
      <div id="markers-list" class="space-y-3"></div>
      <button type="button" id="add-marker-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add marker</button>
    </div>
  `;

  wrap.querySelector("#export-excel-btn").addEventListener("click", () => {
    exportMapSlideToExcel(slide);
  });
  wrap.querySelector("#import-excel-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = confirm(
      "Importing will REPLACE this slide's heading, map center/zoom (or image URL), and ALL markers with what's in the spreadsheet. Continue?"
    );
    if (!ok) { e.target.value = ""; return; }
    importMapSlideFromExcel(file, slide, err => {
      e.target.value = "";
      if (err) { alert("Could not import: " + err.message); return; }
      rerenderList();
    });
  });

  wrap.querySelector('[data-f="heading"]').addEventListener("input", e => { slide.heading = e.target.value; });
  wrap.querySelector('[data-f="body"]').addEventListener("input", e => { slide.body = e.target.value; });
  wrap.querySelector('[data-f="mapType"]').addEventListener("change", e => {
    slide.mapType = e.target.value;
    // lat/lng and top/left aren't interchangeable, so switching map type
    // resets each marker's coordinate fields to sensible blanks rather
    // than trying to convert between them.
    if (slide.mapType === "satellite") {
      slide.center = slide.center || [0, 0];
      slide.zoom = slide.zoom || 16;
      delete slide.imageUrl;
      (slide.highlights || []).forEach(h => { delete h.top; delete h.left; h.lat = h.lat || 0; h.lng = h.lng || 0; });
    } else {
      slide.imageUrl = slide.imageUrl || "";
      delete slide.center;
      delete slide.zoom;
      (slide.highlights || []).forEach(h => { delete h.lat; delete h.lng; h.top = h.top || "50%"; h.left = h.left || "50%"; });
    }
    rerenderList();
  });

  const typeFieldsEl = wrap.querySelector("#map-type-fields");
  if (isSatellite) {
    const center = slide.center || [0, 0];
    const mapContainerId = `position-map-${slide.id}`;
    typeFieldsEl.innerHTML = `
      <div class="slide-field-row" style="max-width:140px">
        <label>Zoom (1–19)</label>
        <input data-f="zoom" id="zoom-input-${slide.id}" type="number" min="1" max="19" value="${slide.zoom || 16}" />
      </div>
      <div class="slide-field-row">
        <label>Position on map <span class="field-hint-inline">(drag the crosshair to set the center; drag pins below to place each marker)</span></label>
        <div id="${mapContainerId}" class="admin-position-map"></div>
        <p class="field-hint" id="center-readout-${slide.id}">Center: ${center[0].toFixed(5)}, ${center[1].toFixed(5)}</p>
      </div>
    `;
    typeFieldsEl.querySelector('[data-f="zoom"]').addEventListener("input", e => {
      slide.zoom = parseInt(e.target.value, 10) || 16;
    });
    // Deferred until after this form is attached to the live DOM (see
    // initPositionMiniMap's doc comment) — Leaflet needs real pixel
    // dimensions to lay out its tiles correctly.
    setTimeout(() => initPositionMiniMap(slide, mapContainerId, adminMiniMaps), 0);
  } else {
    const mapContainerId = `position-map-${slide.id}`;
    typeFieldsEl.innerHTML = `
      <div class="slide-field-row">
        <label>Layout image URL</label>
        <input data-f="imageUrl" type="text" value="${escapeAttr(slide.imageUrl || "")}" placeholder="https://..." />
      </div>
      <div class="slide-field-row">
        <label>Position on layout image <span class="field-hint-inline">(drag pins below to place each marker)</span></label>
        ${
          slide.imageUrl
            ? `<div id="${mapContainerId}" class="admin-position-map"></div>`
            : `<p class="field-hint">Enter an image URL above, then click away from the field to load the position picker.</p>`
        }
      </div>
    `;
    const imageUrlInput = typeFieldsEl.querySelector('[data-f="imageUrl"]');
    imageUrlInput.addEventListener("input", e => { slide.imageUrl = e.target.value; });
    // Only rebuild the position picker once they're done typing/pasting a
    // URL (on blur/change) — refreshing on every keystroke would reload
    // the image constantly and steal focus from the field.
    imageUrlInput.addEventListener("change", () => rerenderList());
    if (slide.imageUrl) {
      setTimeout(() => initLayoutPositionMap(slide, mapContainerId, adminMiniMaps), 0);
    }
  }

  slide.highlights = slide.highlights || [];
  const markersListEl = wrap.querySelector("#markers-list");
  slide.highlights.forEach((h, hIndex) => {
    markersListEl.appendChild(buildMarkerForm(h, hIndex, slide, isSatellite, rerenderList));
  });
  wrap.querySelector("#add-marker-btn").addEventListener("click", () => {
    const newMarker = { id: uid("marker"), label: "New location", icon: "fa-location-dot", description: "" };
    if (isSatellite) {
      newMarker.lat = slide.center ? slide.center[0] : 0;
      newMarker.lng = slide.center ? slide.center[1] : 0;
    } else {
      newMarker.top = "50%";
      newMarker.left = "50%";
    }
    slide.highlights.push(newMarker);
    rerenderList();
  });

  return wrap;
}

function buildMarkerForm(marker, index, slide, isSatellite, rerenderList) {
  const row = el("div", "marker-form-row");
  const coordFields = isSatellite
    ? `<p class="marker-coord-readout" id="marker-coord-${marker.id}">Lat: ${(marker.lat || 0).toFixed(5)} · Lng: ${(marker.lng || 0).toFixed(5)}</p>
       <p class="field-hint">Drag this marker's pin on the map above to reposition it.</p>`
    : `<p class="marker-coord-readout" id="marker-coord-${marker.id}">Top: ${marker.top || "50%"} · Left: ${marker.left || "50%"}</p>
       <p class="field-hint">Drag this marker's pin on the layout image above to reposition it.</p>`;

  row.innerHTML = `
    <div class="marker-form-header">
      <span class="marker-form-index">Marker ${index + 1}</span>
      <button type="button" class="icon-btn icon-btn-danger" title="Remove marker"><i class="fa-solid fa-trash"></i></button>
    </div>
    <div class="slide-field-row-inline">
      <div class="flex-1"><label>Label</label><input data-f="label" type="text" value="${escapeAttr(marker.label || "")}" /></div>
      <div class="flex-1"><label>Icon</label><div class="icon-picker-slot" data-slot="icon"></div></div>
    </div>
    ${coordFields}
    <div class="slide-field-row">
      <label>Description</label>
      <textarea data-f="description" rows="2">${escapeHTML(marker.description || "")}</textarea>
    </div>
  `;

  row.querySelector('[data-f="label"]').addEventListener("input", e => { marker.label = e.target.value; });
  row.querySelector('[data-slot="icon"]').appendChild(
    buildIconPicker(marker.icon, v => { marker.icon = v; })
  );
  row.querySelector('[data-f="description"]').addEventListener("input", e => { marker.description = e.target.value; });
  row.querySelector(".icon-btn-danger").addEventListener("click", () => {
    slide.highlights.splice(index, 1);
    rerenderList();
  });

  return row;
}

function buildQuizSlideForm(slide, rerenderList) {
  const wrap = el("div", "slide-form");
  slide.options = slide.options && slide.options.length ? slide.options : ["", ""];
  if (slide.correctIndex === undefined) slide.correctIndex = 0;

  wrap.innerHTML = `
    <div class="slide-field-row">
      <label>Question</label>
      <textarea data-f="question" rows="2">${escapeHTML(slide.question || "")}</textarea>
    </div>
    <div class="slide-field-row">
      <label>Answer options (select the radio button for the correct one)</label>
      <div id="options-list" class="space-y-2"></div>
      <button type="button" id="add-option-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add option</button>
    </div>
  `;

  wrap.querySelector('[data-f="question"]').addEventListener("input", e => { slide.question = e.target.value; });

  const optionsListEl = wrap.querySelector("#options-list");
  slide.options.forEach((optionText, oIndex) => {
    const row = el("div", "option-form-row");
    row.innerHTML = `
      <input type="radio" name="correct-${slide.id}" ${slide.correctIndex === oIndex ? "checked" : ""} title="Mark as correct answer" />
      <input data-f="option-text" type="text" value="${escapeAttr(optionText)}" class="flex-1" placeholder="Option ${oIndex + 1}" />
      <button type="button" class="icon-btn icon-btn-danger" title="Remove option"><i class="fa-solid fa-trash"></i></button>
    `;
    row.querySelector('input[type="radio"]').addEventListener("change", () => { slide.correctIndex = oIndex; });
    row.querySelector('[data-f="option-text"]').addEventListener("input", e => { slide.options[oIndex] = e.target.value; });
    row.querySelector(".icon-btn-danger").addEventListener("click", () => {
      if (slide.options.length <= 2) { alert("A quiz question needs at least 2 options."); return; }
      slide.options.splice(oIndex, 1);
      if (slide.correctIndex >= slide.options.length) slide.correctIndex = 0;
      rerenderList();
    });
    optionsListEl.appendChild(row);
  });

  wrap.querySelector("#add-option-btn").addEventListener("click", () => {
    slide.options.push("");
    rerenderList();
  });

  return wrap;
}

/** Compact chip row letting Admin restrict ONE slide to specific facilities, overriding the module default. */
function buildSlideFacilitiesOverride(slide) {
  const wrap = el("div", "slide-facilities-override");
  const facilities = window.__hseAdminFacilityOptions();
  wrap.innerHTML = `
    <label>Restrict this slide to specific facilities <span class="field-hint-inline">(optional — leave all unchecked to use the module's facilities)</span></label>
    <div class="flex flex-wrap gap-2" id="slide-fac-chips"></div>
  `;
  const chipsWrap = wrap.querySelector("#slide-fac-chips");
  facilities.forEach(f => {
    const checked = Array.isArray(slide.facilities) && slide.facilities.includes(f.id);
    const chip = el("label", "facility-checkbox facility-checkbox-compact");
    chip.innerHTML = `<input type="checkbox" value="${escapeAttr(f.id)}" ${checked ? "checked" : ""} /> ${escapeHTML(f.name)}`;
    chip.querySelector("input").addEventListener("change", () => {
      const checkedBoxes = Array.from(chipsWrap.querySelectorAll("input:checked")).map(cb => cb.value);
      if (checkedBoxes.length > 0) slide.facilities = checkedBoxes;
      else delete slide.facilities;
    });
    chipsWrap.appendChild(chip);
  });
  return wrap;
}

// Small helper so slide/module editors can read the current facility list without a circular import
window.__hseAdminFacilityOptions = () => state.db.facilities.map(f => ({ id: f.id, name: f.name }));

function flashSaved(btn) {
  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i>Saved`;
  btn.classList.add("save-flash");
  setTimeout(() => {
    // Restore a fixed, known-correct label rather than whatever HTML was
    // captured before this call — that would otherwise be the transient
    // "Saving..." spinner state, not the button's normal resting label.
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i>Save changes`;
    btn.classList.remove("save-flash");
  }, 1400);
}

/* ---------------------------------------------------------------------- *
 * 7. UTILITY / DOM HELPERS
 * ---------------------------------------------------------------------- */

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** Escape text for safe insertion into innerHTML (prevents admin-entered content from injecting markup). */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = String(str == null ? "" : str);
  return div.innerHTML;
}

/** Escape text for safe insertion into an HTML attribute value. */
function escapeAttr(str) {
  return String(str == null ? "" : str).replace(/"/g, "&quot;");
}
