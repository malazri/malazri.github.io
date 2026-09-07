/**
 * ============================================================================
 * data.js — Default "database" for the HSE Induction App
 * ----------------------------------------------------------------------------
 * This file defines the DEFAULT_DATA object: the starting content set that
 * ships with the app. On first load, app.js copies this object into
 * localStorage under the key HSE_DB_KEY. From that point on, the Admin
 * Dashboard reads/writes the localStorage copy — this file is never mutated
 * at runtime, it's only the seed/fallback.
 *
 * STRUCTURE
 * DEFAULT_DATA
 *   ├─ facilities   : [{ id, name, description, icon }]
 *   └─ modules      : [{
 *        id, title, icon, facilities: [facilityId, ...] | ["all"],
 *        slides: [{ id, heading, body, icon, alert? }],
 *        quiz: [{ id, question, options: [string,...], correctIndex }]
 *      }]
 *
 * To add a new facility: push an object into `facilities`.
 * To add a new module: push an object into `modules` and list which
 * facility IDs it applies to (or use "all" to show it everywhere).
 * To add/edit slides or quiz questions: edit the arrays inside a module.
 * The Admin Dashboard can also do all of this through its UI, which
 * simply edits this same JSON shape inside localStorage.
 * ============================================================================
 */

const DEFAULT_DATA = {
  // ---------------------------------------------------------------------
  // FACILITIES — the site selector on the welcome screen
  // ---------------------------------------------------------------------
  facilities: [
    {
      id: "lekhwair-camp",
      name: "Lekhwair Camp",
      description: "Accommodation & support camp facility",
      icon: "fa-campground"
    },
    {
      id: "onshore-rig",
      name: "Onshore Rig",
      description: "Active drilling & well-site operations",
      icon: "fa-oil-well"
    },
    {
      id: "corporate-office",
      name: "Corporate Office",
      description: "Administrative & office premises",
      icon: "fa-building"
    }
  ],

  // ---------------------------------------------------------------------
  // MODULES — the induction content, in the order they are presented
  // ---------------------------------------------------------------------
  modules: [
    // ------------------------------------------------------------------
    // MODULE 1 — Life-Saving Rules & Stop Work Authority
    // ------------------------------------------------------------------
    {
      id: "mod-lsr-swa",
      title: "Life-Saving Rules & Stop Work Authority",
      icon: "fa-hand",
      facilities: ["all"],
      slides: [
        {
          id: "lsr-1",
          heading: "Our Life-Saving Rules",
          icon: "fa-shield-halved",
          body:
            "Every task on this site is governed by our Life-Saving Rules — a small set of non-negotiable behaviours proven to prevent fatalities: work with a valid permit, verify isolation before work begins, obtain authorization before overriding safety controls, work at height with fall protection, never walk under a suspended load, do not smoke outside designated areas, no alcohol or drugs while working or driving, and always follow prescribed journey management for driving."
        },
        {
          id: "lsr-2",
          heading: "Stop Work Authority (SWA)",
          icon: "fa-hand-fist",
          alert: "critical",
          body:
            "Every single person on this site — regardless of role, rank, or years of experience — has the right AND the obligation to stop any work that appears unsafe. No job is so urgent that it cannot be stopped. Exercising SWA is never penalized; failing to use it when you should have is what puts everyone at risk."
        },
        {
          id: "lsr-3",
          heading: "How to Use SWA",
          icon: "fa-hand-point-up",
          body:
            "1) STOP the task calmly and clearly. 2) NOTIFY your supervisor or the person in charge immediately. 3) DISCUSS the concern and agree on a safe way forward. 4) RESUME only once everyone agrees the hazard has been controlled. There is no wrong way to raise a genuine safety concern."
        }
      ],
      quiz: [
        {
          id: "q-lsr-1",
          question: "Who has the authority to stop unsafe work on site?",
          options: [
            "Only the Site Manager",
            "Only certified HSE Officers",
            "Every single person on site, regardless of role",
            "Only supervisors and above"
          ],
          correctIndex: 2
        },
        {
          id: "q-lsr-2",
          question: "What is the first step when you observe an unsafe act?",
          options: [
            "Finish your own task first, then report it",
            "Stop the task calmly and clearly",
            "Take a photo for evidence before doing anything",
            "Wait for the shift supervisor's next round"
          ],
          correctIndex: 1
        }
      ]
    },

    // ------------------------------------------------------------------
    // MODULE 2 — Minimum PPE Requirements
    // ------------------------------------------------------------------
    {
      id: "mod-ppe",
      title: "Minimum PPE Requirements",
      icon: "fa-hard-hat",
      facilities: ["all"],
      slides: [
        {
          id: "ppe-1",
          heading: "Baseline PPE — Worn At All Times",
          icon: "fa-hard-hat",
          body:
            "In all operational areas, the minimum PPE standard is: hard hat, safety glasses, flame-resistant clothing (FRC) coveralls, and safety boots with steel/composite toe caps. This baseline applies the moment you step past the site's safety line, not just while actively working."
        },
        {
          id: "ppe-2",
          heading: "Personal H2S Monitors",
          icon: "fa-gauge-high",
          alert: "critical",
          body:
            "In any area designated as H2S-potential, a personal H2S monitor must be worn, switched on, and bump-tested at the start of every shift. If your monitor alarms, treat it as real: evacuate upwind and uphill immediately and follow your facility's H2S emergency response procedure."
        },
        {
          id: "ppe-3",
          heading: "Task-Specific PPE",
          icon: "fa-user-shield",
          body:
            "Beyond the baseline, specific tasks require additional protection: hearing protection in high-noise zones, respiratory protection for certain chemical handling, cut-resistant gloves for sharp materials, and fall arrest harnesses for work at height. Your Permit to Work will specify what's required for your specific task."
        }
      ],
      quiz: [
        {
          id: "q-ppe-1",
          question: "What should you do if your personal H2S monitor alarms?",
          options: [
            "Silence it and continue working carefully",
            "Evacuate upwind and uphill immediately",
            "Check with a coworker if they smell anything first",
            "Finish the current step, then step away"
          ],
          correctIndex: 1
        },
        {
          id: "q-ppe-2",
          question: "Which of these is part of the baseline PPE worn at all times on site?",
          options: [
            "Fall arrest harness",
            "Respiratory cartridge mask",
            "Hard hat, safety glasses, FRC coveralls, safety boots",
            "Cut-resistant gloves"
          ],
          correctIndex: 2
        }
      ]
    },

    // ------------------------------------------------------------------
    // MODULE 3 — Site Hazards
    // ------------------------------------------------------------------
    {
      id: "mod-hazards",
      title: "Site Hazards",
      icon: "fa-triangle-exclamation",
      facilities: ["all"],
      slides: [
        {
          id: "haz-1",
          heading: "H2S — Hydrogen Sulfide",
          icon: "fa-skull-crossbones",
          alert: "critical",
          body:
            "H2S is a highly toxic, flammable gas that can be present in crude oil and natural gas. At low concentrations it smells like rotten eggs — but at higher, more dangerous concentrations, it deadens your sense of smell entirely. Never rely on smell alone. Always trust your monitor."
        },
        {
          id: "haz-2",
          heading: "Extreme Heat Stress",
          icon: "fa-temperature-high",
          body:
            "In this climate, heat stress is a leading cause of medical incidents. Recognize the warning signs in yourself and others: heavy sweating, dizziness, nausea, confusion, or stopping sweating altogether. Drink water regularly before you feel thirsty, use scheduled rest breaks, and report symptoms immediately — do not push through them."
        },
        {
          id: "haz-3",
          heading: "Dropped Objects",
          icon: "fa-down-long",
          body:
            "Anything carried, lifted, or stored at height is a potential dropped object. Secure loose tools with lanyards, never walk beneath suspended loads or active lifting operations, and inspect your tools and equipment before each use. A dropped wrench from height carries enough force to be fatal."
        }
      ],
      quiz: [
        {
          id: "q-haz-1",
          question: "Why is relying on smell alone to detect H2S dangerous?",
          options: [
            "H2S has no smell at any concentration",
            "High concentrations deaden your sense of smell",
            "The smell only appears after exposure symptoms start",
            "Only some people can smell it"
          ],
          correctIndex: 1
        },
        {
          id: "q-haz-2",
          question: "What is the safest response to feeling early signs of heat stress?",
          options: [
            "Push through until the scheduled break",
            "Drink water only once you feel thirsty",
            "Report symptoms immediately and stop the task",
            "Move to a shaded area but keep working"
          ],
          correctIndex: 2
        }
      ]
    },

    // ------------------------------------------------------------------
    // MODULE 4 — Emergency Response
    // ------------------------------------------------------------------
    {
      id: "mod-emergency",
      title: "Emergency Response",
      icon: "fa-truck-medical",
      facilities: ["all"],
      slides: [
        {
          id: "emg-1",
          heading: "Muster Points",
          icon: "fa-map-location-dot",
          body:
            "Every person must know the location of their nearest muster point before starting work. On hearing any alarm, stop what you're doing, make your work area safe if it is safe to do so, and proceed calmly — never run — to your designated muster point for headcount."
        },
        {
          id: "emg-2",
          heading: "Alarm Tones",
          icon: "fa-volume-high",
          alert: "critical",
          body:
            "A CONTINUOUS alarm tone means evacuate immediately to your muster point. An INTERMITTENT (pulsing) alarm tone means a gas release — go to your designated safe refuge or upwind assembly area, not the standard muster point. Know the difference; using the wrong response can put you directly in harm's way."
        },
        {
          id: "emg-3",
          heading: "Evacuation Conduct",
          icon: "fa-person-walking-arrow-right",
          body:
            "Leave equipment and belongings behind. Assist anyone who needs help if you can do so safely. Do not re-enter the area for any reason until the All Clear is given by the emergency response team. Report to your headcount marshal so you can be accounted for."
        }
      ],
      quiz: [
        {
          id: "q-emg-1",
          question: "What does a CONTINUOUS alarm tone mean?",
          options: [
            "A gas release — go to safe refuge",
            "Evacuate immediately to your muster point",
            "A drill is starting soon",
            "All clear has been given"
          ],
          correctIndex: 1
        },
        {
          id: "q-emg-2",
          question: "What does an INTERMITTENT (pulsing) alarm tone signal?",
          options: [
            "Fire evacuation to the main muster point",
            "End of shift signal",
            "A gas release — proceed to safe refuge / upwind area",
            "Equipment test, no action needed"
          ],
          correctIndex: 2
        }
      ]
    },

    // ------------------------------------------------------------------
    // MODULE 5 — Permit to Work (PTW) & LOTO
    // ------------------------------------------------------------------
    {
      id: "mod-ptw-loto",
      title: "Permit to Work & LOTO",
      icon: "fa-lock",
      facilities: ["onshore-rig", "corporate-office"],
      slides: [
        {
          id: "ptw-1",
          heading: "Permit to Work (PTW)",
          icon: "fa-clipboard-check",
          body:
            "No task classified as higher-risk (hot work, confined space entry, excavation, work at height, electrical work) may begin without a valid, signed Permit to Work. The permit defines the hazards, controls, and the people authorized to perform the task — if the conditions on site change, the permit is no longer valid."
        },
        {
          id: "ptw-2",
          heading: "Lockout/Tagout (LOTO) Basics",
          icon: "fa-lock",
          alert: "critical",
          body:
            "Before working on any equipment that could unexpectedly start up or release stored energy, it must be isolated, locked out with your own personal lock, and tagged with your name. Never work on equipment isolated by someone else's lock alone, and never remove another person's lock."
        },
        {
          id: "ptw-3",
          heading: "Verifying Isolation",
          icon: "fa-magnifying-glass",
          body:
            "A lock on a switch is not proof of isolation — always verify isolation directly at the point of work using a try-before-you-touch approach and, where applicable, a calibrated test instrument. Isolation must be confirmed by a competent, authorized person before work starts."
        }
      ],
      quiz: [
        {
          id: "q-ptw-1",
          question: "What must happen before higher-risk work such as hot work or confined space entry begins?",
          options: [
            "A verbal go-ahead from any supervisor",
            "A valid, signed Permit to Work",
            "Nothing, if the crew is experienced",
            "A note in the shift logbook"
          ],
          correctIndex: 1
        },
        {
          id: "q-ptw-2",
          question: "Under LOTO, whose lock should you rely on before working on isolated equipment?",
          options: [
            "Any lock already on the isolation point",
            "Your supervisor's lock only",
            "Your own personal lock, applied by you",
            "No lock is needed if the equipment looks off"
          ],
          correctIndex: 2
        }
      ]
    }
  ]
};

// Expose globally for app.js (no ES module bundler is used in this project)
window.DEFAULT_DATA = DEFAULT_DATA;