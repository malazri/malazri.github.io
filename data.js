/**
 * data.js - Default HSE Induction Content (Oil & Gas)
 * This object is used as the initial "database".
 * All edits made in the Admin panel are saved to localStorage.
 */

const DEFAULT_DATA = {
  // ---------- Facilities ----------
  facilities: [
    { id: 'lekwhair', name: 'Lekhwair Camp' },
    { id: 'onshore-rig', name: 'Onshore Rig #7' },
    { id: 'corporate', name: 'Corporate Office' }
  ],

  // ---------- Induction Modules ----------
  modules: [
    {
      id: 'lifesaving-rules',
      title: 'Life‑Saving Rules & SWA',
      icon: 'fa-shield-halved',
      slides: [
        {
          type: 'text',
          content: '<p><strong>Stop Work Authority (SWA)</strong> — Everyone has the right and obligation to stop unsafe work. No reprisals.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Life‑Saving Rules</strong>:</p><ul><li>Work with a valid Permit</li><li>Isolate energy sources</li><li>Use fall protection above 1.8 m</li><li>No mobile devices while driving</li></ul>'
        },
        {
          type: 'text',
          content: '<p><strong>SWA in practice:</strong> If you see a hazard, stop the job, talk to the supervisor, and correct it.</p>'
        }
      ],
      quiz: {
        question: 'What is the primary purpose of Stop Work Authority?',
        options: [
          'To assign blame',
          'To stop unsafe work immediately',
          'To delay production',
          'To test the supervisor'
        ],
        correct: 1 // zero‑based index
      }
    },

    {
      id: 'ppe',
      title: 'Minimum PPE',
      icon: 'fa-vest',
      slides: [
        {
          type: 'text',
          content: '<p><strong>Required PPE at all sites:</strong></p><ul><li>Hard hat (Class G or E)</li><li>Safety glasses with side shields</li><li>FRC coveralls (flame‑resistant)</li><li>Safety boots with steel toe</li><li>Personal H₂S monitor</li></ul>'
        },
        {
          type: 'text',
          content: '<p>Always inspect your PPE before use. Replace damaged items immediately.</p>'
        }
      ],
      quiz: {
        question: 'Which of the following is NOT part of minimum PPE?',
        options: [
          'Hard hat',
          'Safety glasses',
          'Leather gloves',
          'H₂S monitor'
        ],
        correct: 2
      }
    },

    {
      id: 'site-hazards',
      title: 'Site Hazards',
      icon: 'fa-triangle-exclamation',
      slides: [
        {
          type: 'text',
          content: '<p><strong>H₂S (Hydrogen Sulfide):</strong> Colorless, toxic gas. Odor of rotten eggs at low levels, but deadens smell at high concentrations. Always carry a personal monitor.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Heat Stress:</strong> Temperatures can exceed 50°C. Stay hydrated, take breaks in shade, and watch for symptoms like dizziness or nausea.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Dropped Objects:</strong> Secure all tools and equipment when working at height. Use tool lanyards and toe‑boards.</p>'
        }
      ],
      quiz: {
        question: 'What should you do if your H₂S monitor alarms?',
        options: [
          'Ignore it and continue working',
          'Immediately evacuate upwind',
          'Remove the monitor and check it',
          'Call your supervisor on the radio'
        ],
        correct: 1
      }
    },

    {
      id: 'emergency-response',
      title: 'Emergency Response',
      icon: 'fa-bell-exclamation',
      slides: [
        {
          type: 'text',
          content: '<p><strong>Alarm Tones:</strong></p><ul><li><strong>Intermittent</strong> — Prepare to evacuate / watch for instructions</li><li><strong>Continuous</strong> — Immediate evacuation to the nearest muster point</li></ul>'
        },
        {
          type: 'text',
          content: '<p><strong>Muster Points:</strong> Know the primary and secondary assembly areas for your location. Always sign in at the roll‑call.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Evacuation:</strong> Follow the marked routes. Do not use elevators. Assist injured personnel if safe.</p>'
        }
      ],
      quiz: {
        question: 'A continuous alarm tone means:',
        options: [
          'All clear, resume work',
          'Immediate evacuation',
          'Stand by for further orders',
          'Fire drill in progress'
        ],
        correct: 1
      }
    },

    {
      id: 'ptw-loto',
      title: 'PTW & LOTO',
      icon: 'fa-file-pen',
      slides: [
        {
          type: 'text',
          content: '<p><strong>Permit to Work (PTW):</strong> A formal document that authorises specific work in a defined area. It identifies hazards and control measures.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Lock‑Out / Tag‑Out (LOTO):</strong> Ensure all energy sources are isolated, locked, and tagged before maintenance. Only the person who applied the lock may remove it.</p>'
        },
        {
          type: 'text',
          content: '<p><strong>Key rule:</strong> Never bypass a PTW or LOTO procedure — even for “quick” jobs.</p>'
        }
      ],
      quiz: {
        question: 'Who is authorised to remove a LOTO lock?',
        options: [
          'Any supervisor',
          'The person who installed it',
          'The safety officer',
          'Anyone with a key'
        ],
        correct: 1
      }
    }
  ]
};

// Export for use in app.js
// (In a pure Vanilla JS environment, we attach to window)
window.DEFAULT_DATA = DEFAULT_DATA;