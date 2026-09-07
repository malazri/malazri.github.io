/**
 * app.js - HSE Induction SPA
 * Handles:
 *  - View switching (User App / Admin Dashboard)
 *  - Rendering slides & quizzes
 *  - Scoring & Digital Pass generation
 *  - localStorage read/write for data & progress
 */

(function() {
  'use strict';

  // ---------- DOM refs ----------
  const mainView = document.getElementById('mainView');
  const adminPanel = document.getElementById('adminPanel');
  const adminToggleBtn = document.getElementById('adminToggleBtn');
  const adminCloseBtn = document.getElementById('adminCloseBtn');
  const adminLoginGate = document.getElementById('adminLoginGate');
  const adminContent = document.getElementById('adminContent');
  const adminPinInput = document.getElementById('adminPinInput');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminLoginError = document.getElementById('adminLoginError');
  const adminSaveBtn = document.getElementById('adminSaveBtn');
  const adminResetBtn = document.getElementById('adminResetBtn');
  const adminSaveStatus = document.getElementById('adminSaveStatus');
  const headerFacility = document.getElementById('headerFacility');

  const PIN = '1234'; // Hardcoded for prototype

  // ---------- State ----------
  let appData = null;          // Will hold merged data (default + localStorage)
  let currentFacility = null;  // { id, name }
  let currentModuleIndex = 0;  // Which module the user is viewing
  let currentSlideIndex = 0;   // Slide within module
  let quizAnswers = {};        // { moduleId: selectedOptionIndex }
  let userName = '';           // Stored for the final pass
  let inductionComplete = false;

  // ---------- Utility: Load/Save data ----------
  function loadData() {
    const stored = localStorage.getItem('hseInductionData');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all fields exist
        appData = mergeDeep(clone(DEFAULT_DATA), parsed);
      } catch (e) {
        appData = clone(DEFAULT_DATA);
      }
    } else {
      appData = clone(DEFAULT_DATA);
    }
    // Ensure we have at least one facility
    if (!appData.facilities || appData.facilities.length === 0) {
      appData.facilities = clone(DEFAULT_DATA.facilities);
    }
    // Ensure modules exist
    if (!appData.modules || appData.modules.length === 0) {
      appData.modules = clone(DEFAULT_DATA.modules);
    }
    saveData();
  }

  function saveData() {
    localStorage.setItem('hseInductionData', JSON.stringify(appData));
  }

  // Deep clone helper
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Simple deep merge (overwrites arrays)
  function mergeDeep(target, source) {
    const result = clone(target);
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = clone(source[key]);
      }
    }
    return result;
  }

  // ---------- Load progress from localStorage ----------
  function loadProgress() {
    const prog = localStorage.getItem('hseProgress');
    if (prog) {
      try {
        const p = JSON.parse(prog);
        currentFacility = p.facility || null;
        currentModuleIndex = p.moduleIndex || 0;
        currentSlideIndex = p.slideIndex || 0;
        quizAnswers = p.quizAnswers || {};
        userName = p.userName || '';
        inductionComplete = p.complete || false;
        return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  function saveProgress() {
    const prog = {
      facility: currentFacility,
      moduleIndex: currentModuleIndex,
      slideIndex: currentSlideIndex,
      quizAnswers: quizAnswers,
      userName: userName,
      complete: inductionComplete
    };
    localStorage.setItem('hseProgress', JSON.stringify(prog));
  }

  // ---------- Render: User App ----------
  function renderApp() {
    if (!currentFacility) {
      renderFacilitySelector();
      return;
    }

    if (inductionComplete) {
      renderPass();
      return;
    }

    const modules = appData.modules;
    if (!modules || modules.length === 0) {
      mainView.innerHTML = '<p class="text-red-500">No modules found.</p>';
      return;
    }

    // Clamp index
    if (currentModuleIndex >= modules.length) currentModuleIndex = modules.length - 1;
    if (currentModuleIndex < 0) currentModuleIndex = 0;

    const module = modules[currentModuleIndex];
    const slides = module.slides || [];
    if (currentSlideIndex >= slides.length) currentSlideIndex = slides.length - 1;
    if (currentSlideIndex < 0) currentSlideIndex = 0;

    // Build the view
    let html = `
      <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
        <!-- Module header -->
        <div class="bg-blue-800 text-white px-5 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <i class="fas ${module.icon || 'fa-book'} text-amber-400 text-xl"></i>
            <span class="font-semibold">${module.title}</span>
          </div>
          <span class="text-xs bg-blue-700 px-3 py-1 rounded-full">${currentModuleIndex+1} / ${modules.length}</span>
        </div>

        <!-- Slide content -->
        <div class="p-5 min-h-[240px]">
          ${slides[currentSlideIndex]?.content || '<p class="text-gray-500">No content</p>'}
        </div>

        <!-- Navigation & Quiz -->
        <div class="px-5 pb-5 flex flex-wrap items-center justify-between gap-3">
          <div class="flex gap-2">
            <button class="prev-slide-btn bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg transition text-sm font-medium" ${currentSlideIndex === 0 ? 'disabled' : ''}>
              <i class="fas fa-chevron-left"></i> Prev
            </button>
            <button class="next-slide-btn bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg transition text-sm font-medium" ${currentSlideIndex === slides.length - 1 ? 'disabled' : ''}>
              Next <i class="fas fa-chevron-right"></i>
            </button>
          </div>
          <div>
            <span class="text-xs text-gray-400">Slide ${currentSlideIndex+1}/${slides.length}</span>
          </div>
        </div>

        <!-- Quiz (shown only after last slide) -->
        ${currentSlideIndex === slides.length - 1 ? renderQuiz(module) : ''}

        <!-- Module navigation (prev/next module) -->
        <div class="px-5 pb-5 flex flex-wrap gap-3 border-t pt-4">
          <button class="prev-module-btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition text-sm font-medium" ${currentModuleIndex === 0 ? 'disabled' : ''}>
            <i class="fas fa-arrow-left"></i> Previous Module
          </button>
          <button class="next-module-btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition text-sm font-medium" ${currentModuleIndex === modules.length - 1 ? 'disabled' : ''}>
            ${currentModuleIndex === modules.length - 1 ? 'Finish & Get Pass' : 'Next Module'} <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;

    mainView.innerHTML = html;

    // Attach event listeners
    attachSlideNav(module);
    attachModuleNav(module);
    attachQuizListeners(module);

    // Update header
    headerFacility.textContent = currentFacility.name || '';
  }

  // ---------- Render: Facility Selector ----------
  function renderFacilitySelector() {
    const facilities = appData.facilities || [];
    let html = `
      <div class="text-center py-6">
        <i class="fas fa-map-pin text-5xl text-blue-700 mb-4"></i>
        <h1 class="text-2xl font-bold text-blue-900">Select Your Site</h1>
        <p class="text-gray-500 mt-1 mb-6">Choose your facility to begin the HSE Induction</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
    `;
    facilities.forEach(fac => {
      html += `
        <button class="facility-btn bg-white hover:bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm transition text-center">
          <i class="fas fa-building text-blue-600 text-2xl mb-2"></i>
          <div class="font-medium text-gray-800">${fac.name}</div>
          <div class="text-xs text-gray-400 mt-1">Click to start</div>
        </button>
      `;
    });
    html += `</div></div>`;
    mainView.innerHTML = html;

    // Attach facility listeners
    document.querySelectorAll('.facility-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const fac = facilities[idx];
        if (!fac) return;
        currentFacility = { id: fac.id, name: fac.name };
        currentModuleIndex = 0;
        currentSlideIndex = 0;
        quizAnswers = {};
        inductionComplete = false;
        userName = prompt('Enter your full name for the induction pass:', userName || '');
        if (userName === null) userName = '';
        saveProgress();
        renderApp();
      });
    });
  }

  // ---------- Render Quiz ----------
  function renderQuiz(module) {
    const quiz = module.quiz;
    if (!quiz) return '';
    const selected = quizAnswers[module.id] !== undefined ? quizAnswers[module.id] : -1;
    let html = `
      <div class="border-t border-gray-200 px-5 pt-4 pb-2">
        <p class="font-semibold text-gray-800 mb-2"><i class="fas fa-question-circle text-amber-500 mr-2"></i>${quiz.question}</p>
        <div class="space-y-2">
    `;
    quiz.options.forEach((opt, idx) => {
      const checked = selected === idx ? 'checked' : '';
      html += `
        <label class="flex items-start gap-3 bg-gray-50 hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition">
          <input type="radio" name="quiz_${module.id}" value="${idx}" ${checked} class="mt-1 quiz-radio" data-module="${module.id}" data-opt="${idx}" />
          <span class="text-sm">${opt}</span>
        </label>
      `;
    });
    html += `</div></div>`;
    return html;
  }

  // ---------- Attach Slide Navigation ----------
  function attachSlideNav(module) {
    const prevBtn = mainView.querySelector('.prev-slide-btn');
    const nextBtn = mainView.querySelector('.next-slide-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentSlideIndex > 0) {
          currentSlideIndex--;
          saveProgress();
          renderApp();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const slides = module.slides || [];
        if (currentSlideIndex < slides.length - 1) {
          currentSlideIndex++;
          saveProgress();
          renderApp();
        }
      });
    }
  }

  // ---------- Attach Module Navigation ----------
  function attachModuleNav(module) {
    const prevMod = mainView.querySelector('.prev-module-btn');
    const nextMod = mainView.querySelector('.next-module-btn');
    const modules = appData.modules;

    if (prevMod) {
      prevMod.addEventListener('click', () => {
        if (currentModuleIndex > 0) {
          currentModuleIndex--;
          currentSlideIndex = 0;
          saveProgress();
          renderApp();
        }
      });
    }

    if (nextMod) {
      nextMod.addEventListener('click', () => {
        // Check if quiz is answered for current module
        const quiz = module.quiz;
        if (quiz && quizAnswers[module.id] === undefined) {
          alert('Please answer the quiz question before moving to the next module.');
          return;
        }
        if (currentModuleIndex < modules.length - 1) {
          currentModuleIndex++;
          currentSlideIndex = 0;
          saveProgress();
          renderApp();
        } else {
          // All modules done
          inductionComplete = true;
          saveProgress();
          renderApp();
        }
      });
    }
  }

  // ---------- Attach Quiz Listeners ----------
  function attachQuizListeners(module) {
    const radios = mainView.querySelectorAll('.quiz-radio');
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const modId = radio.dataset.module;
        const opt = parseInt(radio.dataset.opt, 10);
        quizAnswers[modId] = opt;
        saveProgress();
        // re-render to show selection (optional)
        // We'll just update state, but we could re-render to reflect checked state
      });
    });
  }

  // ---------- Render Digital Pass ----------
  function renderPass() {
    // Calculate score
    let total = 0;
    let correct = 0;
    appData.modules.forEach(mod => {
      if (mod.quiz) {
        total++;
        const userAns = quizAnswers[mod.id];
        if (userAns !== undefined && userAns === mod.quiz.correct) {
          correct++;
        }
      }
    });
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= 70;

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const facilityName = currentFacility?.name || 'Unknown';

    let html = `
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-blue-100">
        <div class="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-6 py-8 text-center">
          <i class="fas fa-certificate text-5xl text-amber-400 mb-2"></i>
          <h2 class="text-2xl font-bold">HSE Induction Pass</h2>
          <p class="text-sm opacity-80">Oil & Gas Division</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="flex justify-between border-b pb-2">
            <span class="text-gray-500">Name</span>
            <span class="font-medium">${userName || '—'}</span>
          </div>
          <div class="flex justify-between border-b pb-2">
            <span class="text-gray-500">Facility</span>
            <span class="font-medium">${facilityName}</span>
          </div>
          <div class="flex justify-between border-b pb-2">
            <span class="text-gray-500">Date</span>
            <span class="font-medium">${date}</span>
          </div>
          <div class="flex justify-between border-b pb-2">
            <span class="text-gray-500">Score</span>
            <span class="font-bold ${passed ? 'text-green-600' : 'text-red-600'}">${score}% (${correct}/${total})</span>
          </div>
          <div class="text-center mt-4">
            <span class="inline-block px-6 py-2 rounded-full text-sm font-bold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
              ${passed ? '✅ PASSED' : '❌ NOT PASSED — Please review'}
            </span>
          </div>
        </div>
        <div class="px-6 pb-6 flex flex-wrap gap-3">
          <button id="resetInductionBtn" class="bg-gray-200 hover:bg-gray-300 px-5 py-2 rounded-lg transition text-sm font-medium">
            <i class="fas fa-rotate-left"></i> Restart Induction
          </button>
          <button id="printPassBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition text-sm font-medium">
            <i class="fas fa-print"></i> Print / Save PDF
          </button>
        </div>
      </div>
    `;
    mainView.innerHTML = html;

    document.getElementById('resetInductionBtn')?.addEventListener('click', () => {
      inductionComplete = false;
      currentModuleIndex = 0;
      currentSlideIndex = 0;
      quizAnswers = {};
      saveProgress();
      renderApp();
    });

    document.getElementById('printPassBtn')?.addEventListener('click', () => {
      window.print();
    });
  }

  // ---------- Admin: Render Dashboard ----------
  function renderAdmin() {
    const container = document.getElementById('adminModulesContainer');
    if (!container) return;
    let html = '';
    appData.modules.forEach((mod, idx) => {
      html += `
        <div class="border border-gray-200 rounded-xl mb-4 overflow-hidden">
          <div class="bg-gray-50 px-4 py-3 flex items-center justify-between cursor-pointer admin-toggle" data-target="mod-${idx}">
            <div class="flex items-center gap-3">
              <i class="fas ${mod.icon || 'fa-book'} text-blue-600"></i>
              <span class="font-medium">${mod.title}</span>
            </div>
            <i class="fas fa-chevron-down text-gray-400"></i>
          </div>
          <div id="mod-${idx}" class="admin-module-content px-4 py-3 hidden border-t">
            <div class="mb-3">
              <label class="block text-sm font-medium text-gray-700">Module Title</label>
              <input type="text" class="admin-mod-title w-full border rounded-lg px-3 py-2 text-sm" value="${mod.title}" data-idx="${idx}" />
            </div>
            <div class="mb-3">
              <label class="block text-sm font-medium text-gray-700">Slides (JSON array)</label>
              <textarea class="admin-slides w-full border rounded-lg px-3 py-2 text-sm font-mono h-32" data-idx="${idx}">${JSON.stringify(mod.slides, null, 2)}</textarea>
            </div>
            <div class="mb-3">
              <label class="block text-sm font-medium text-gray-700">Quiz</label>
              <textarea class="admin-quiz w-full border rounded-lg px-3 py-2 text-sm font-mono h-24" data-idx="${idx}">${JSON.stringify(mod.quiz, null, 2)}</textarea>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;

    // Toggle accordion
    document.querySelectorAll('.admin-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          content.classList.toggle('hidden');
        }
      });
    });

    // Show first module expanded
    const firstContent = document.getElementById('mod-0');
    if (firstContent) firstContent.classList.remove('hidden');
  }

  // ---------- Admin: Save changes ----------
  function saveAdminChanges() {
    try {
      const modTitles = document.querySelectorAll('.admin-mod-title');
      const modSlides = document.querySelectorAll('.admin-slides');
      const modQuizzes = document.querySelectorAll('.admin-quiz');

      modTitles.forEach((input, idx) => {
        if (appData.modules[idx]) {
          appData.modules[idx].title = input.value.trim() || appData.modules[idx].title;
        }
      });

      modSlides.forEach((textarea, idx) => {
        if (appData.modules[idx]) {
          try {
            const parsed = JSON.parse(textarea.value);
            appData.modules[idx].slides = parsed;
          } catch (e) {
            // keep existing
          }
        }
      });

      modQuizzes.forEach((textarea, idx) => {
        if (appData.modules[idx]) {
          try {
            const parsed = JSON.parse(textarea.value);
            appData.modules[idx].quiz = parsed;
          } catch (e) {
            // keep existing
          }
        }
      });

      saveData();
      adminSaveStatus.textContent = '✅ Saved successfully!';
      setTimeout(() => { adminSaveStatus.textContent = ''; }, 3000);
      // Re-render user app to reflect changes
      renderApp();
    } catch (e) {
      adminSaveStatus.textContent = '❌ Error saving. Check JSON syntax.';
      console.error(e);
    }
  }

  // ---------- Admin: Reset to defaults ----------
  function resetToDefaults() {
    if (confirm('Reset all content to factory defaults? Your current progress will be kept.')) {
      appData = clone(DEFAULT_DATA);
      saveData();
      renderAdmin();
      renderApp();
      adminSaveStatus.textContent = '↩️ Reset to default content.';
      setTimeout(() => { adminSaveStatus.textContent = ''; }, 3000);
    }
  }

  // ---------- Admin Login ----------
  function adminLogin() {
    const entered = adminPinInput.value.trim();
    if (entered === PIN) {
      adminLoginGate.classList.add('hidden');
      adminContent.classList.remove('hidden');
      renderAdmin();
      adminPinInput.value = '';
      adminLoginError.classList.add('hidden');
    } else {
      adminLoginError.classList.remove('hidden');
    }
  }

  // ---------- Admin Panel open/close ----------
  function openAdmin() {
    adminPanel.classList.remove('hidden');
    // If already logged in, show content
    if (adminContent.classList.contains('hidden') === false) {
      renderAdmin();
    }
  }

  function closeAdmin() {
    adminPanel.classList.add('hidden');
    adminLoginGate.classList.remove('hidden');
    adminContent.classList.add('hidden');
    adminLoginError.classList.add('hidden');
    adminPinInput.value = '';
  }

  // ---------- Init ----------
  function init() {
    loadData();
    const hasProgress = loadProgress();

    // If we have a facility and progress, render app, else show selector
    if (hasProgress && currentFacility) {
      renderApp();
    } else {
      // Ensure we start fresh
      currentFacility = null;
      currentModuleIndex = 0;
      currentSlideIndex = 0;
      quizAnswers = {};
      inductionComplete = false;
      saveProgress();
      renderFacilitySelector();
    }

    // ----- Admin event listeners -----
    adminToggleBtn.addEventListener('click', openAdmin);
    adminCloseBtn.addEventListener('click', closeAdmin);
    adminLoginBtn.addEventListener('click', adminLogin);
    adminPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') adminLogin(); });
    adminSaveBtn.addEventListener('click', saveAdminChanges);
    adminResetBtn.addEventListener('click', resetToDefaults);

    // Click outside panel to close (optional)
    adminPanel.addEventListener('click', (e) => {
      if (e.target === adminPanel) closeAdmin();
    });
  }

  // Run
  document.addEventListener('DOMContentLoaded', init);
})();