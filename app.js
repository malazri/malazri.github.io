/**
 * ============================================================================
 * app.js — HSE Induction App logic
 * ----------------------------------------------------------------------------
 * Everything here is vanilla ES6 — no framework, no build step. The whole
 * app is a single-page app (SPA): we never navigate to a new HTML file, we
 * just re-render the contents of #app-root based on the value of `state.view`.
 *
 * SECTIONS IN THIS FILE
 *   1. Constants & Storage helpers
 *   2. Global state
 *   3. Boot / init
 *   4. Router (renders whichever view state.view points to)
 *   5. User App views: welcome, induction flow (slides+quiz), pass
 *   6. Admin views: PIN gate, dashboard, module editor
 *   7. Utility / DOM helpers
 * ============================================================================
 */

/* ---------------------------------------------------------------------- *
 * 1. CONSTANTS & STORAGE HELPERS
 * ---------------------------------------------------------------------- */

const HSE_DB_KEY = "hse_induction_db_v1";        // holds the editable content (facilities+modules)
const HSE_RECORDS_KEY = "hse_induction_records"; // holds completed inductions (for a simple admin log)
const ADMIN_PIN = "1234"; // Prototype-only hardcoded PIN. Replace with real auth before production use.
const PASS_THRESHOLD = 0.8; // 80% correct required across all quiz questions to earn a Pass

/** Read the content DB from localStorage, seeding it from DEFAULT_DATA on first run. */
function loadDB() {
  const raw = localStorage.getItem(HSE_DB_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Corrupt HSE DB in localStorage, falling back to defaults.", e);
    }
  }
  // Deep-clone the default data so we never accidentally mutate the seed object
  const seeded = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
  saveDB(seeded);
  return seeded;
}

/** Persist the content DB back to localStorage. Called any time Admin saves an edit. */
function saveDB(db) {
  localStorage.setItem(HSE_DB_KEY, JSON.stringify(db));
}

/** Append a completed induction record (for the Admin "Recent Completions" list). */
function saveRecord(record) {
  const records = JSON.parse(localStorage.getItem(HSE_RECORDS_KEY) || "[]");
  records.unshift(record); // newest first
  localStorage.setItem(HSE_RECORDS_KEY, JSON.stringify(records.slice(0, 100))); // cap at 100
}

function loadRecords() {
  return JSON.parse(localStorage.getItem(HSE_RECORDS_KEY) || "[]");
}

/* ---------------------------------------------------------------------- *
 * 2. GLOBAL STATE
 * ---------------------------------------------------------------------- */

const state = {
  db: null,              // { facilities: [...], modules: [...] } — loaded on boot
  view: "welcome",       // which top-level screen is active
  isAdmin: false,        // whether the admin dashboard is unlocked this session

  // --- induction-in-progress state ---
  user: { name: "", facilityId: null },
  activeModules: [],     // modules filtered for the chosen facility, in order
  moduleIndex: 0,        // which module we're currently on
  cardIndex: 0,          // which slide *within* the current module (quiz cards come after slides)
  answers: {},           // { [questionId]: selectedIndex }
  score: { correct: 0, total: 0 },

  // --- admin editor state ---
  adminSelectedModuleId: null
};

/* ---------------------------------------------------------------------- *
 * 3. BOOT / INIT
 * ---------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  state.db = loadDB();
  render();

  // Hidden admin entry point: tapping the small gear icon in the header
  document.getElementById("admin-entry-btn").addEventListener("click", () => {
    state.view = state.isAdmin ? "admin-dashboard" : "admin-login";
    render();
  });

  document.getElementById("app-title-btn").addEventListener("click", () => {
    // Tapping the app title always returns to the User App welcome screen
    resetInductionState();
    state.view = "welcome";
    render();
  });
});

function resetInductionState() {
  state.user = { name: "", facilityId: null };
  state.activeModules = [];
  state.moduleIndex = 0;
  state.cardIndex = 0;
  state.answers = {};
  state.score = { correct: 0, total: 0 };
}

/* ---------------------------------------------------------------------- *
 * 4. ROUTER
 * ---------------------------------------------------------------------- */

function render() {
  const root = document.getElementById("app-root");
  root.innerHTML = ""; // clear previous view

  // Toggle a body class so CSS can widen the container for the desktop admin view
  document.body.classList.toggle("admin-mode", state.view.startsWith("admin"));

  switch (state.view) {
    case "welcome":
      root.appendChild(renderWelcome());
      break;
    case "flow":
      root.appendChild(renderFlow());
      break;
    case "pass":
      root.appendChild(renderPass());
      break;
    case "admin-login":
      root.appendChild(renderAdminLogin());
      break;
    case "admin-dashboard":
      root.appendChild(renderAdminDashboard());
      break;
    default:
      root.appendChild(renderWelcome());
  }
}

/* ---------------------------------------------------------------------- *
 * 5a. USER APP — Welcome / facility selector
 * ---------------------------------------------------------------------- */

function renderWelcome() {
  const wrap = el("div", "view-welcome fade-in");

  wrap.innerHTML = `
    <div class="hazard-strip"></div>
    <div class="px-5 pt-8 pb-6 text-center">
      <i class="fa-solid fa-hard-hat text-5xl text-hse-yellow drop-shadow"></i>
      <h1 class="font-display text-2xl mt-3 text-slate-900">HSE Induction</h1>
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
  state.db.facilities.forEach(facility => {
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
      wrap.querySelectorAll(".facility-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
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

  wrap.querySelector("#start-btn").addEventListener("click", () => {
    beginInduction();
  });

  return wrap;
}

/** Build the ordered list of modules that apply to the chosen facility, then start the flow. */
function beginInduction() {
  state.activeModules = state.db.modules.filter(
    m => m.facilities.includes("all") || m.facilities.includes(state.user.facilityId)
  );
  state.moduleIndex = 0;
  state.cardIndex = 0;
  state.answers = {};
  state.score = { correct: 0, total: 0 };
  state.view = "flow";
  render();
}

/* ---------------------------------------------------------------------- *
 * 5b. USER APP — Induction flow (slide cards + quiz cards, module by module)
 * ---------------------------------------------------------------------- */

/**
 * Each module is presented as: [slide, slide, ..., quizQ, quizQ, ...]
 * state.cardIndex walks through that combined list for the CURRENT module.
 * When we run off the end of a module's cards, we advance to the next module.
 * When we run off the end of the last module, we go to the Pass screen.
 */
function renderFlow() {
  const module = state.activeModules[state.moduleIndex];
  const totalCards = module.slides.length + module.quiz.length;
  const isQuizCard = state.cardIndex >= module.slides.length;

  const wrap = el("div", "view-flow fade-in");

  // --- Progress bar: overall progress across ALL modules, not just this one ---
  const totalModuleCount = state.activeModules.length;
  const overallProgress =
    ((state.moduleIndex + (state.cardIndex + 1) / totalCards) / totalModuleCount) * 100;

  wrap.innerHTML = `
    <div class="progress-track">
      <div class="progress-fill" style="width:${overallProgress}%"></div>
    </div>
    <div class="px-5 pt-4 pb-2 flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Module ${state.moduleIndex + 1} of ${totalModuleCount}
      </span>
      <span class="text-xs font-semibold text-slate-400">${escapeHTML(module.title)}</span>
    </div>
    <div id="card-slot" class="px-5 pb-28"></div>
    <div id="flow-nav" class="flow-nav"></div>
  `;

  const cardSlot = wrap.querySelector("#card-slot");
  const nav = wrap.querySelector("#flow-nav");

  if (!isQuizCard) {
    const slide = module.slides[state.cardIndex];
    cardSlot.appendChild(renderSlideCard(slide));
    nav.innerHTML = `
      <button id="nav-back" class="nav-btn-secondary">Back</button>
      <button id="nav-next" class="nav-btn-primary">Continue</button>
    `;
    wireNav(wrap, () => moveCard(-1), () => moveCard(1));
  } else {
    const question = module.quiz[state.cardIndex - module.slides.length];
    cardSlot.appendChild(renderQuizCard(question));
    nav.innerHTML = `
      <button id="nav-back" class="nav-btn-secondary">Back</button>
      <button id="nav-next" class="nav-btn-primary" disabled>Continue</button>
    `;
    wireNav(wrap, () => moveCard(-1), () => moveCard(1));

    // Enable "Continue" only once the user has answered this question
    if (state.answers[question.id] !== undefined) {
      wrap.querySelector("#nav-next").disabled = false;
    }
  }

  // Disable "Back" entirely on the very first card of the very first module
  if (state.moduleIndex === 0 && state.cardIndex === 0) {
    wrap.querySelector("#nav-back").disabled = true;
    wrap.querySelector("#nav-back").classList.add("invisible");
  }

  return wrap;
}

function wireNav(wrap, onBack, onNext) {
  wrap.querySelector("#nav-back").addEventListener("click", onBack);
  wrap.querySelector("#nav-next").addEventListener("click", onNext);
}

function renderSlideCard(slide) {
  const card = el("div", `content-card ${slide.alert === "critical" ? "content-card-critical" : ""}`);
  card.innerHTML = `
    <div class="content-card-icon">
      <i class="fa-solid ${slide.icon}"></i>
    </div>
    ${slide.alert === "critical" ? `<div class="critical-tag"><i class="fa-solid fa-triangle-exclamation"></i> Critical</div>` : ""}
    <h2 class="font-display text-xl mt-3 mb-2 text-slate-900">${escapeHTML(slide.heading)}</h2>
    <p class="text-slate-600 leading-relaxed text-[15px]">${escapeHTML(slide.body)}</p>
  `;
  return card;
}

function renderQuizCard(question) {
  const card = el("div", "content-card");
  const selected = state.answers[question.id];

  card.innerHTML = `
    <div class="content-card-icon quiz-icon"><i class="fa-solid fa-circle-question"></i></div>
    <div class="critical-tag quiz-tag"><i class="fa-solid fa-clipboard-list"></i> Knowledge Check</div>
    <h2 class="font-display text-lg mt-3 mb-4 text-slate-900">${escapeHTML(question.question)}</h2>
    <div class="space-y-2" id="option-list"></div>
    <p id="answer-feedback" class="text-sm mt-3 font-medium hidden"></p>
  `;

  const optionList = card.querySelector("#option-list");
  question.options.forEach((optionText, idx) => {
    const btn = el("button", "quiz-option");
    btn.type = "button";
    btn.innerHTML = `<span class="quiz-option-letter">${String.fromCharCode(65 + idx)}</span>
      <span>${escapeHTML(optionText)}</span>`;

    // If this question was already answered (e.g. user hit Back then forward again), show state
    if (selected !== undefined) {
      btn.disabled = true;
      if (idx === question.correctIndex) btn.classList.add("correct");
      else if (idx === selected) btn.classList.add("incorrect");
    }

    btn.addEventListener("click", () => submitAnswer(question, idx, card));
    optionList.appendChild(btn);
  });

  if (selected !== undefined) {
    showAnswerFeedback(card, selected === question.correctIndex);
  }

  return card;
}

function submitAnswer(question, chosenIndex, card) {
  // Only score a question the first time it's answered
  const alreadyAnswered = state.answers[question.id] !== undefined;
  state.answers[question.id] = chosenIndex;

  if (!alreadyAnswered) {
    state.score.total += 1;
    if (chosenIndex === question.correctIndex) state.score.correct += 1;
  }

  // Lock in the visual state of all options
  card.querySelectorAll(".quiz-option").forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === question.correctIndex) btn.classList.add("correct");
    else if (idx === chosenIndex) btn.classList.add("incorrect");
  });

  showAnswerFeedback(card, chosenIndex === question.correctIndex);

  // Unlock the Continue button now that this card has an answer
  const nextBtn = document.getElementById("nav-next");
  if (nextBtn) nextBtn.disabled = false;
}

function showAnswerFeedback(card, isCorrect) {
  const feedback = card.querySelector("#answer-feedback");
  feedback.classList.remove("hidden");
  feedback.textContent = isCorrect
    ? "Correct — well noted."
    : "Not quite — the correct answer is highlighted above.";
  feedback.classList.add(isCorrect ? "text-green-700" : "text-red-700");
}

/** Move forward/back through cards, crossing module boundaries and finishing to the Pass screen. */
function moveCard(direction) {
  const module = state.activeModules[state.moduleIndex];
  const totalCards = module.slides.length + module.quiz.length;
  const nextCardIndex = state.cardIndex + direction;

  if (nextCardIndex < 0) {
    // Move to the previous module's last card
    if (state.moduleIndex === 0) return; // already at the very start
    state.moduleIndex -= 1;
    const prevModule = state.activeModules[state.moduleIndex];
    state.cardIndex = prevModule.slides.length + prevModule.quiz.length - 1;
  } else if (nextCardIndex >= totalCards) {
    // Move to the next module, or finish the induction
    if (state.moduleIndex + 1 >= state.activeModules.length) {
      finishInduction();
      return;
    }
    state.moduleIndex += 1;
    state.cardIndex = 0;
  } else {
    state.cardIndex = nextCardIndex;
  }
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function finishInduction() {
  const pct = state.score.total ? state.score.correct / state.score.total : 0;
  const passed = pct >= PASS_THRESHOLD;
  const facility = state.db.facilities.find(f => f.id === state.user.facilityId);

  saveRecord({
    name: state.user.name,
    facility: facility ? facility.name : state.user.facilityId,
    date: new Date().toISOString(),
    score: state.score.correct,
    total: state.score.total,
    percent: Math.round(pct * 100),
    passed
  });

  state.view = "pass";
  render();
}

/* ---------------------------------------------------------------------- *
 * 5c. USER APP — Digital Pass
 * ---------------------------------------------------------------------- */

function renderPass() {
  const facility = state.db.facilities.find(f => f.id === state.user.facilityId);
  const pct = state.score.total ? Math.round((state.score.correct / state.score.total) * 100) : 0;
  const passed = pct / 100 >= PASS_THRESHOLD;
  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

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
      <div class="hse-pass-header">
        <span>HSE INDUCTION PASS</span>
        <i class="fa-solid fa-hard-hat"></i>
      </div>
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
      // Retake: keep name/facility, reset progress and score
      state.moduleIndex = 0;
      state.cardIndex = 0;
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
  wrap.querySelector("#pin-input").addEventListener("keydown", e => {
    if (e.key === "Enter") submit();
  });

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
        <p class="text-slate-500 text-sm">Edit induction content — changes save to this browser's local storage</p>
      </div>
      <button id="admin-logout" class="nav-btn-secondary">Log out</button>
    </div>

    <div class="admin-layout">
      <div class="admin-sidebar">
        <h3 class="admin-section-title">Modules</h3>
        <div id="module-nav-list" class="space-y-1"></div>
        <button id="add-module-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add module</button>

        <h3 class="admin-section-title mt-6">Facilities</h3>
        <div id="facility-nav-list" class="space-y-1"></div>
        <button id="add-facility-btn" class="admin-add-btn"><i class="fa-solid fa-plus"></i> Add facility</button>

        <h3 class="admin-section-title mt-6">Recent Completions</h3>
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

  // --- Module nav list ---
  const moduleNavList = wrap.querySelector("#module-nav-list");
  state.db.modules.forEach(m => {
    const item = el("button", "admin-nav-item" + (state.adminSelectedModuleId === m.id ? " active" : ""));
    item.innerHTML = `<i class="fa-solid ${m.icon}"></i> <span>${escapeHTML(m.title)}</span>`;
    item.addEventListener("click", () => {
      state.adminSelectedModuleId = m.id;
      render();
    });
    moduleNavList.appendChild(item);
  });
  wrap.querySelector("#add-module-btn").addEventListener("click", () => {
    const newModule = {
      id: "mod-" + Date.now(),
      title: "New Module",
      icon: "fa-file-circle-plus",
      facilities: ["all"],
      slides: [{ id: "slide-" + Date.now(), heading: "New Slide", icon: "fa-circle-info", body: "Edit this slide's content." }],
      quiz: []
    };
    state.db.modules.push(newModule);
    saveDB(state.db);
    state.adminSelectedModuleId = newModule.id;
    render();
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
      state.db.facilities = state.db.facilities.filter(x => x.id !== f.id);
      saveDB(state.db);
      render();
    });
    facilityNavList.appendChild(item);
  });
  wrap.querySelector("#add-facility-btn").addEventListener("click", () => {
    const name = prompt("New facility name:");
    if (!name) return;
    state.db.facilities.push({
      id: "facility-" + Date.now(),
      name,
      description: "New facility",
      icon: "fa-location-dot"
    });
    saveDB(state.db);
    render();
  });

  // --- Records list ---
  const recordsList = wrap.querySelector("#records-list");
  const records = loadRecords();
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

function renderModuleEditor(module) {
  const panel = el("div", "module-editor");

  panel.innerHTML = `
    <div class="editor-row">
      <label>Module title</label>
      <input id="edit-title" type="text" value="${escapeAttr(module.title)}" />
    </div>
    <div class="editor-row">
      <label>Font Awesome icon class (e.g. fa-hard-hat)</label>
      <input id="edit-icon" type="text" value="${escapeAttr(module.icon)}" />
    </div>
    <div class="editor-row">
      <label>Applies to facilities</label>
      <div id="edit-facilities" class="flex flex-wrap gap-3"></div>
    </div>

    <div class="editor-row">
      <label>Slides (JSON array — heading, body, icon, optional alert:"critical")</label>
      <textarea id="edit-slides" rows="10" class="json-textarea">${escapeHTML(JSON.stringify(module.slides, null, 2))}</textarea>
    </div>

    <div class="editor-row">
      <label>Quiz questions (JSON array — question, options[], correctIndex)</label>
      <textarea id="edit-quiz" rows="10" class="json-textarea">${escapeHTML(JSON.stringify(module.quiz, null, 2))}</textarea>
    </div>

    <p id="editor-error" class="text-red-600 text-sm hidden mb-3"></p>

    <div class="flex gap-3">
      <button id="save-module-btn" class="nav-btn-primary"><i class="fa-solid fa-floppy-disk mr-2"></i>Save changes</button>
      <button id="delete-module-btn" class="nav-btn-danger"><i class="fa-solid fa-trash mr-2"></i>Delete module</button>
    </div>
  `;

  // Facility checkboxes (plus an "all" option)
  const facilitiesWrap = panel.querySelector("#edit-facilities");
  const allOptions = [{ id: "all", name: "All facilities" }, ...window.__hseAdminFacilityOptions()];
  allOptions.forEach(opt => {
    const checked = module.facilities.includes(opt.id);
    const label = el("label", "facility-checkbox");
    label.innerHTML = `<input type="checkbox" value="${escapeAttr(opt.id)}" ${checked ? "checked" : ""} /> ${escapeHTML(opt.name)}`;
    facilitiesWrap.appendChild(label);
  });

  panel.querySelector("#save-module-btn").addEventListener("click", () => {
    const errorEl = panel.querySelector("#editor-error");
    errorEl.classList.add("hidden");
    try {
      const newSlides = JSON.parse(panel.querySelector("#edit-slides").value);
      const newQuiz = JSON.parse(panel.querySelector("#edit-quiz").value);
      const selectedFacilities = Array.from(facilitiesWrap.querySelectorAll("input:checked")).map(cb => cb.value);

      if (!Array.isArray(newSlides) || !Array.isArray(newQuiz)) {
        throw new Error("Slides and quiz must both be JSON arrays.");
      }

      module.title = panel.querySelector("#edit-title").value.trim() || module.title;
      module.icon = panel.querySelector("#edit-icon").value.trim() || module.icon;
      module.slides = newSlides;
      module.quiz = newQuiz;
      module.facilities = selectedFacilities.length ? selectedFacilities : ["all"];

      saveDB(state.db);
      flashSaved(panel);
    } catch (e) {
      errorEl.textContent = "Could not save — check your JSON syntax. (" + e.message + ")";
      errorEl.classList.remove("hidden");
    }
  });

  panel.querySelector("#delete-module-btn").addEventListener("click", () => {
    if (!confirm(`Delete module "${module.title}"? This cannot be undone.`)) return;
    state.db.modules = state.db.modules.filter(m => m.id !== module.id);
    saveDB(state.db);
    state.adminSelectedModuleId = state.db.modules.length ? state.db.modules[0].id : null;
    render();
  });

  return panel;
}

// Small helper so renderModuleEditor can read the current facility list without a circular import
window.__hseAdminFacilityOptions = () => state.db.facilities.map(f => ({ id: f.id, name: f.name }));

function flashSaved(container) {
  const btn = container.querySelector("#save-module-btn");
  const original = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i>Saved`;
  btn.classList.add("save-flash");
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove("save-flash");
  }, 1400);
}

/* ---------------------------------------------------------------------- *
 * 7. UTILITY / DOM HELPERS
 * ---------------------------------------------------------------------- */

/** Shorthand for document.createElement + className assignment. */
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** Escape text for safe insertion into innerHTML (prevents admin-entered content from injecting markup). */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

/** Escape text for safe insertion into an HTML attribute value. */
function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
