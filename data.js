/**
 * ============================================================================
 * data.js — Default "database" for the Site & HSE Induction App
 * ----------------------------------------------------------------------------
 * DEFAULT_DATA is the seed content. On first load, app.js copies it into
 * localStorage (key HSE_DB_KEY). After that, the Admin Dashboard reads and
 * writes the localStorage copy — this file itself is never mutated at
 * runtime, it's only the fallback/reset source.
 *
 * STRUCTURE
 * DEFAULT_DATA
 *   ├─ facilities : [{ id, name, description, icon, type: "camp"|"operational" }]
 *   └─ modules    : [{
 *        id, title, icon, category: "orientation" | "hse",
 *        facilities: [facilityId, ...] | ["all"],   <-- MODULE-level filter
 *        slides: [ SLIDE, ... ]
 *      }]
 *
 * A SLIDE is one of three shapes, distinguished by its `type` field. Any
 * slide MAY also carry its own optional `facilities` array — when present,
 * that single slide is only shown for those facility IDs even though the
 * rest of the module is shared. This is how one "Location & Map" module
 * can hold a different map for Lekhwair vs. Yibal without duplicating the
 * whole module.
 *
 *   INFO slide  { type:"info", id, heading, icon, body, alert?, facilities?,
 *                 image?: { url, position:"above"|"below", caption? } }
 *     alert: "critical" (red, Life-Saving-Rule style) or "reference"
 *     (blue, for quick-reference content like phone numbers) — both optional.
 *
 *   MAP slide   { type:"map", id, heading, body, facilities?,
 *                 mapType: "satellite" | "layout",
 *                 // mapType "satellite" (real map, no API key required):
 *                 center: [lat, lng], zoom,
 *                 highlights: [{ id, label, icon, lat, lng, description }]
 *                 // mapType "layout" (a drawn/photographed 2D floor plan):
 *                 imageUrl,
 *                 highlights: [{ id, label, icon, top, left, description }]
 *                 //   ("top"/"left" are CSS percentage strings positioning
 *                 //    a pin over imageUrl, e.g. "32%")
 *               }
 *
 *   QUIZ slide  { type:"quiz", id, question, options:[string,...],
 *                 correctIndex, facilities? }
 *
 * To extend the app: add a new module object, or add/edit slides inside
 * an existing module's `slides` array. The Admin Dashboard edits this same
 * JSON shape via a per-module JSON textarea.
 * ============================================================================
 */

const DEFAULT_DATA = {
  // ---------------------------------------------------------------------
  // FACILITIES — shown on the welcome screen's site selector.
  // "type" is just a small display badge (Camp / Operational Site) —
  // it plays no role in content filtering, which uses facility "id".
  // ---------------------------------------------------------------------
  facilities: [
    {
      id: "lekhwair-pdo-camp",
      name: "Lekhwair PDO Camp",
      description: "Residential camp & support facility",
      icon: "fa-campground",
      type: "camp"
    },
    {
      id: "yibal-camp",
      name: "Yibal Camp",
      description: "Residential camp & support facility",
      icon: "fa-campground",
      type: "camp"
    },
    {
      id: "onshore-rig",
      name: "Onshore Rig",
      description: "Active drilling & well-site operations",
      icon: "fa-oil-well",
      type: "operational"
    },
    {
      id: "main-office",
      name: "Main Office",
      description: "Administrative & office premises",
      icon: "fa-building",
      type: "operational"
    }
  ],

  // ---------------------------------------------------------------------
  // MODULES — presented in this array order. "category" only groups
  // modules in the Admin sidebar (Part A / Part B).
  // ---------------------------------------------------------------------
  modules: [
    // ==================================================================
    // PART A — SITE ORIENTATION  (camp-specific, shown at camps only)
    // ==================================================================
    {
      id: "mod-location-map",
      title: "Location & Site Map",
      icon: "fa-map-location-dot",
      category: "orientation",
      // This module applies to BOTH camps — the individual map slides
      // below are what actually differ per camp, via their own
      // slide-level "facilities" tag.
      facilities: ["lekhwair-pdo-camp", "yibal-camp"],
      slides: [
        {
          type: "info",
          id: "loc-1",
          heading: "Welcome to Camp",
          icon: "fa-campground",
          body:
            "This module orients you to your camp's layout before you explore it in person. Familiarize yourself with the key locations on the map below — you'll be expected to find your way to the clinic, mess hall, and your accommodation block without assistance by the end of your first day.",
          image: {
            url: "https://placehold.co/800x400/0f1b2b/f2b705?text=Camp+Entrance",
            position: "below",
            caption: "Main camp entrance and security gate"
          }
        },
        // ---- Lekhwair-specific satellite map ----
        {
          type: "map",
          id: "loc-map-lekhwair",
          facilities: ["lekhwair-pdo-camp"],
          heading: "Lekhwair Camp — Site Map",
          body: "Tap a marker, or an item in the list below, to see what's there.",
          mapType: "satellite",
          // NOTE: adjust to the camp's exact surveyed coordinates in Admin.
          center: [20.95, 56.42],
          zoom: 16,
          highlights: [
            {
              id: "hl-lek-clinic",
              label: "Camp Clinic",
              icon: "fa-briefcase-medical",
              lat: 20.9508,
              lng: 56.4206,
              description: "24-hour medical clinic. A qualified nurse is on-site at all times; the camp doctor holds clinic hours 8:00 AM–4:00 PM daily."
            },
            {
              id: "hl-lek-admin",
              label: "Admin Office",
              icon: "fa-building",
              lat: 20.9494,
              lng: 56.4188,
              description: "Camp administration — badge issues, leave requests, and general enquiries. Open Sunday–Thursday, 7:30 AM–3:30 PM."
            },
            {
              id: "hl-lek-accom",
              label: "Accommodation Blocks",
              icon: "fa-bed",
              lat: 20.9488,
              lng: 56.4215,
              description: "Blocks A through F. Your room number is printed on your camp induction card issued at check-in."
            },
            {
              id: "hl-lek-mess",
              label: "Mess Hall",
              icon: "fa-utensils",
              lat: 20.9502,
              lng: 56.4222,
              description: "Main dining facility — see the Mess & Timings module for meal hours and hygiene rules."
            },
            {
              id: "hl-lek-muster",
              label: "Muster Point A",
              icon: "fa-people-group",
              lat: 20.9515,
              lng: 56.4192,
              description: "Primary emergency assembly point for the accommodation and admin area. Know this location — see the Emergency Response module."
            }
          ]
        },
        // ---- Yibal-specific satellite map ----
        {
          type: "map",
          id: "loc-map-yibal",
          facilities: ["yibal-camp"],
          heading: "Yibal Camp — Site Map",
          body: "Tap a marker, or an item in the list below, to see what's there.",
          mapType: "satellite",
          // NOTE: adjust to the camp's exact surveyed coordinates in Admin.
          center: [22.45, 56.53],
          zoom: 16,
          highlights: [
            {
              id: "hl-yib-clinic",
              label: "Yibal Camp Clinic",
              icon: "fa-briefcase-medical",
              lat: 22.4508,
              lng: 56.5306,
              description: "24-hour medical clinic. A qualified nurse is on-site at all times; the camp doctor holds clinic hours 8:00 AM–4:00 PM daily."
            },
            {
              id: "hl-yib-admin",
              label: "Admin Office",
              icon: "fa-building",
              lat: 22.4494,
              lng: 56.5288,
              description: "Camp administration — badge issues, leave requests, and general enquiries. Open Sunday–Thursday, 7:30 AM–3:30 PM."
            },
            {
              id: "hl-yib-accom",
              label: "Accommodation Blocks",
              icon: "fa-bed",
              lat: 22.4488,
              lng: 56.5315,
              description: "Blocks A through D. Your room number is printed on your camp induction card issued at check-in."
            },
            {
              id: "hl-yib-mess",
              label: "Mess Hall",
              icon: "fa-utensils",
              lat: 22.4502,
              lng: 56.5322,
              description: "Main dining facility — see the Mess & Timings module for meal hours and hygiene rules."
            },
            {
              id: "hl-yib-muster",
              label: "Muster Point A",
              icon: "fa-people-group",
              lat: 22.4515,
              lng: 56.5292,
              description: "Primary emergency assembly point for the accommodation and admin area. Know this location — see the Emergency Response module."
            }
          ]
        }
      ]
    },

    {
      id: "mod-mess-timings",
      title: "Mess (Dining) & Timings",
      icon: "fa-utensils",
      category: "orientation",
      facilities: ["lekhwair-pdo-camp", "yibal-camp"],
      slides: [
        {
          type: "info",
          id: "mess-1",
          heading: "Meal Timings",
          icon: "fa-clock",
          body:
            "Breakfast: 5:30 AM – 7:30 AM. Lunch: 12:00 PM – 2:00 PM. Dinner: 6:30 PM – 9:00 PM. Meals outside these windows are not served except for personnel on approved night-shift rosters, who should collect a packed meal from the mess supervisor in advance."
        },
        {
          type: "info",
          id: "mess-2",
          heading: "Hygiene Rules",
          icon: "fa-hand-sparkles",
          image: {
            url: "https://placehold.co/800x400/f2b705/0f1b2b?text=Wash+Hands+Before+Entry",
            position: "above",
            caption: "Hand-sanitizing stations are located at every mess hall entrance"
          },
          body:
            "Wash or sanitize your hands at the stations provided before entering the mess hall. Coveralls and PPE should be removed or covered before dining — no oil-stained workwear at the tables. Food is not to be removed from the mess hall except for approved packed meals."
        },
        {
          type: "info",
          id: "mess-3",
          heading: "Dress Code & Conduct",
          icon: "fa-shirt",
          body:
            "Safety boots or closed footwear are required at all times in the mess hall — no sandals. Please queue in an orderly manner, keep noise to a considerate level, and return trays and plates to the designated collection point after eating."
        }
      ]
    },

    {
      id: "mod-recreation",
      title: "Recreation & Office Facilities",
      icon: "fa-basketball",
      category: "orientation",
      facilities: ["lekhwair-pdo-camp", "yibal-camp"],
      slides: [
        {
          type: "info",
          id: "rec-1",
          heading: "Gym & Sports Courts",
          icon: "fa-dumbbell",
          body:
            "The gym is open 5:00 AM – 10:00 PM daily. Please wipe down equipment after use and rack weights when finished. The outdoor sports court (basketball/volleyball) is available on a first-come basis; floodlights operate until 10:30 PM.",
          image: {
            url: "https://placehold.co/800x400/0f1b2b/f2b705?text=Camp+Gym",
            position: "below"
          }
        },
        {
          type: "info",
          id: "rec-2",
          heading: "Smoking Shelters",
          icon: "fa-ban-smoking",
          alert: "critical",
          body:
            "Smoking is strictly prohibited except within the designated, clearly marked smoking shelters. This is a Life-Saving Rule on an oil and gas site — smoking outside these shelters, including near accommodation blocks or process areas, is a serious safety violation."
        },
        {
          type: "info",
          id: "rec-3",
          heading: "Laundry Services",
          icon: "fa-shirt",
          body:
            "Laundry bags are collected each morning from your accommodation block and returned within 24 hours. Label your bag with your name and room number. A self-service laundrette is also available near Block C for urgent needs."
        }
      ]
    },

    {
      id: "mod-camp-rules",
      title: "Camp Rules & Conduct",
      icon: "fa-house-circle-check",
      category: "orientation",
      facilities: ["lekhwair-pdo-camp", "yibal-camp"],
      slides: [
        {
          type: "info",
          id: "rule-1",
          heading: "Quiet Hours",
          icon: "fa-volume-xmark",
          body:
            "Quiet hours run from 10:00 PM to 6:00 AM to protect the rest of colleagues working different shift patterns. Please keep televisions, music, and conversations at a low volume in accommodation blocks during this window."
        },
        {
          type: "info",
          id: "rule-2",
          heading: "Room Housekeeping",
          icon: "fa-broom",
          body:
            "Keep your room tidy and free of fire hazards — no cooking appliances, candles, or unauthorized electrical heaters in rooms. Housekeeping staff service rooms daily; please secure valuables and be respectful of their work."
        },
        {
          type: "info",
          id: "rule-3",
          heading: "Respect for Site Personnel",
          icon: "fa-people-arrows",
          body:
            "Camp and catering staff are colleagues, not service providers to be treated dismissively. Harassment, discrimination, or abusive behaviour toward any site personnel — regardless of role or company — will not be tolerated and may result in removal from site."
        }
      ]
    },

    // ==================================================================
    // PART B — HEALTH, SAFETY & ENVIRONMENT  (applies to every facility)
    // ==================================================================
    {
      id: "mod-lsr-swa",
      title: "Life-Saving Rules & Stop Work Authority",
      icon: "fa-hand",
      category: "hse",
      facilities: ["all"],
      slides: [
        {
          type: "info",
          id: "lsr-1",
          heading: "Our Life-Saving Rules",
          icon: "fa-shield-halved",
          body:
            "A small set of non-negotiable behaviours prevent the majority of fatalities on site: work with a valid permit, verify isolation before work begins, get authorization before overriding safety controls, use fall protection at height, never walk under a suspended load, smoke only in designated shelters, never work under the influence of alcohol or drugs, and follow journey management when driving."
        },
        {
          type: "info",
          id: "lsr-2",
          heading: "Stop Work Authority (SWA)",
          icon: "fa-hand-fist",
          alert: "critical",
          body:
            "Every single person on this site — regardless of role, rank, or years of experience — has the right AND the obligation to stop any work that appears unsafe. No job is so urgent it cannot be stopped. Using SWA is never penalized; failing to use it when you should have is what puts people at risk."
        },
        {
          type: "info",
          id: "lsr-3",
          heading: "How to Use SWA",
          icon: "fa-hand-point-up",
          body:
            "1) STOP the task calmly and clearly. 2) NOTIFY your supervisor or the person in charge immediately. 3) DISCUSS the concern and agree a safe way forward. 4) RESUME only once everyone agrees the hazard is controlled."
        },
        {
          type: "quiz",
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
          type: "quiz",
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

    {
      id: "mod-ppe",
      title: "Minimum PPE Requirements",
      icon: "fa-hard-hat",
      category: "hse",
      facilities: ["all"],
      slides: [
        {
          type: "info",
          id: "ppe-1",
          heading: "Baseline PPE — Worn At All Times",
          icon: "fa-hard-hat",
          body:
            "In all operational areas, the minimum PPE standard is: hard hat, safety glasses, flame-resistant clothing (FRC) coveralls, and safety boots with protective toe caps. This baseline applies from the moment you cross the site's safety line, not only while actively working."
        },
        {
          type: "info",
          id: "ppe-2",
          heading: "Task-Specific PPE",
          icon: "fa-user-shield",
          body:
            "Beyond the baseline: hearing protection in high-noise zones, respiratory protection for certain chemical handling, cut-resistant gloves for sharp materials, and fall arrest harnesses for work at height. Your Permit to Work specifies what your task requires."
        },
        {
          type: "quiz",
          id: "q-ppe-1",
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

    {
      id: "mod-hazards-env",
      title: "Site Hazards & Environment",
      icon: "fa-triangle-exclamation",
      category: "hse",
      facilities: ["all"],
      slides: [
        {
          type: "info",
          id: "haz-1",
          heading: "H2S — Hydrogen Sulfide",
          icon: "fa-skull-crossbones",
          alert: "critical",
          body:
            "H2S is a highly toxic, flammable gas that can be present in crude oil and natural gas. At low concentrations it smells like rotten eggs — but at higher, more dangerous concentrations it deadens your sense of smell entirely. Never rely on smell alone; always trust your personal monitor."
        },
        {
          type: "info",
          id: "haz-2",
          heading: "Heat Stress Management",
          icon: "fa-temperature-high",
          body:
            "In this climate, heat stress is a leading cause of medical incidents. Recognize the warning signs: heavy sweating, dizziness, nausea, confusion, or a sudden stop in sweating. Drink water regularly before you feel thirsty, use scheduled rest breaks, and report symptoms immediately rather than pushing through them."
        },
        {
          type: "info",
          id: "haz-3",
          heading: "Waste Segregation",
          icon: "fa-recycle",
          body:
            "Camp waste and industrial waste are never mixed. Camp recycling bins (paper, plastic, cans) are located outside each accommodation block for domestic waste only. Industrial waste — oily rags, chemical containers, contaminated materials — goes exclusively into the marked industrial waste skips near the workshop, never into camp bins."
        },
        {
          type: "quiz",
          id: "q-haz-1",
          question: "Why is relying on smell alone to detect H2S dangerous?",
          options: [
            "H2S has no smell at any concentration",
            "High concentrations deaden your sense of smell",
            "The smell only appears after symptoms start",
            "Only some people can smell it"
          ],
          correctIndex: 1
        },
        {
          type: "quiz",
          id: "q-haz-2",
          question: "Where should oily rags and chemical containers be disposed of?",
          options: [
            "Camp recycling bins outside accommodation blocks",
            "Marked industrial waste skips near the workshop",
            "General kitchen waste bins",
            "Any nearby bin, as long as it's covered"
          ],
          correctIndex: 1
        }
      ]
    },

    {
      id: "mod-emergency",
      title: "Emergency Response",
      icon: "fa-truck-medical",
      category: "hse",
      facilities: ["all"],
      slides: [
        {
          type: "info",
          id: "emg-1",
          heading: "Muster Points",
          icon: "fa-map-location-dot",
          body:
            "Every person must know the location of their nearest muster point before starting work or moving into accommodation. On hearing any alarm, stop what you're doing, make your area safe if it's safe to do so, and proceed calmly — never run — to your designated muster point for headcount."
        },
        {
          type: "info",
          id: "emg-2",
          heading: "Alarm Tone Recognition",
          icon: "fa-volume-high",
          alert: "critical",
          body:
            "A CONTINUOUS alarm tone means evacuate immediately to your muster point. An INTERMITTENT (pulsing) alarm tone means a gas release — proceed to your designated safe refuge or upwind assembly area instead. Know the difference; the wrong response can put you directly in harm's way."
        },
        {
          type: "info",
          id: "emg-3",
          heading: "Emergency Contact Numbers",
          icon: "fa-phone",
          alert: "reference",
          body:
            "Site Control Room: Ext. 2222. Camp Clinic (24hr): Ext. 2255. Fire & Emergency: Ext. 2200. HSE Duty Officer: Ext. 2211. Save these numbers in your phone on your first day — Admin can update these at any time from the Admin Dashboard."
        },
        {
          type: "quiz",
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
          type: "quiz",
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
    }
  ]
};

// Expose globally for app.js (no ES module bundler is used in this project)
window.DEFAULT_DATA = DEFAULT_DATA;