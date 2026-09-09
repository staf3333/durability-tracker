import type { Template } from '../types';

/* Ported verbatim from the vanilla build. Session content lives here and nowhere else. */
export const TEMPLATES: Record<string, Template> = {
  mon: {
    name: "Lower A — Strength + Tendon Capacity",
    sub: "Prep → plyos → WOTW → strength · ~115–128 min",
    note: "Your one genuinely heavy day. If time runs out, cut accessories — never the squat.",
    blocks: [
      {
        title: "Block 1 · Prep circuit — 15–18 min",
        mode: "circuit",
        exercises: [
          { id: "nasal", name: "Nasal Breathing Cardio Warm Up", slug: "nasal-breathing-cardio-warm-up", sets: 1, target: "3:00", seconds: 180 },
          { id: "sslhr", name: "Split Stance Loaded Hip Rotations", slug: "split-stance-loaded-hip-rotations", sets: 1, target: "5 ea", note: "5–15 lb · all 4 configs = 1 set" },
          { id: "hhar", name: "Hip Hinge Ankle Rocker", slug: "hip-hinge-ankle-rocker", sets: 1, target: "8 ea", note: "No pinch at end range" },
          { id: "ccgb", name: "Cross Connect Glute Bridge", slug: "cross-connect-glute-bridge", sets: 1, target: "5 ea" },
          { id: "hkhfs", name: "Half Kneeling Hip Flexor Stretch", slug: "half-kneeling-hip-flexor-stretch-paulfabritz", sets: 1, target: "6 ea" },
          { id: "hklo", name: "Half Kneeling Lift Off", slug: "half-kneeling-lift-off-paulfabritz", sets: 1, target: "5 ea" },
          { id: "clls", name: "Loaded Lateral Line Stretch", slug: "loaded-lateral-line-stretch", sets: 1, target: "6 ea" },
        ],
      },
      {
        title: "Block 2 · Locomotion & elasticity — 8–10 min",
        mode: "straight",
        exercises: [
          { id: "erir", name: "Hip Mobility ER/IR Skips", slug: "hip-mobility-er-ir-skips", sets: 2, target: "20 yds", rest: 30 },
          { id: "metro2", name: "2 Leg Metronome Plyo Progressions", slug: "2-leg-metronome-plyo-progressions", sets: 2, target: "0:10", note: "110–120 bpm · regressed from Dot Drill", rest: 60, seconds: 10 },
          { id: "ekdj", name: "Extensive Knee Dominant Jump", slug: "extensive-knee-dominant-jump", sets: 2, target: "6", note: "50–60% effort · ~50 contacts total today", rest: 60 },
        ],
      },
      {
        title: "Block 3 · Shooting — 50–55 min",
        mode: "straight",
        exercises: [
          { id: "wotw", name: "Current WOTW (108 makes)", sets: 1, target: "108", note: "Sprint/decel drills at ~70–80%. Not a conditioning day." },
        ],
      },
      {
        title: "Block 4 · Strength & capacity — 40–45 min",
        mode: "straight",
        exercises: [
          { id: "hens", name: "Heels Elevated Narrow Squat", slug: "heels-elevated-narrow-squat", sets: 4, target: "6", weight: true, note: "RPE 7–8 · main tendon driver", priority: true, rest: 150 },
          { id: "slfrsd", name: "Single Leg Full Range Step Downs", slug: "single-leg-full-range-step-downs-or-leg-press", sets: 2, target: "6 ea", weight: true, note: "RPE 7 · 80–90% of range, never forced", rest: 90 },
          { id: "slrdl", name: "Single Leg RDL", sets: 3, target: "8 ea", weight: true, note: "RPE 7 · progress past 63 lb toward heavy 6–8s", rest: 90 },
        ],
      },
      {
        title: "Superset A",
        mode: "superset",
        exercises: [
          { id: "razor", name: "Razor Curl Progressions", slug: "razor-curl-progressions", sets: 2, target: "4", note: "Start Lvl 1 (shortened ROM)" },
          { id: "soleus", name: "Soleus Raise", slug: "soleus-raise-paulfabritz", sets: 3, target: "8–12 ea", weight: true, note: "Do not skip — your #1 gap for pop", priority: true, rest: 60 },
        ],
      },
      {
        title: "Superset B",
        mode: "superset",
        exercises: [
          { id: "cooker", name: "Lateral Ankle Slant Board Cooker", slug: "lateral-ankle-slant-board-cooker", sets: 2, target: "8 ea", note: "Pre-fatigue to 8/10 burn, then rotate", rest: 30 },
          { id: "aac", name: "Anti Ankle Collapse Progressions", slug: "anti-ankle-collapse-progressions", sets: 3, target: "8", note: "2 sets RIGHT, 1 set left", side: "R", rest: 30 },
        ],
      },
    ],
  },
  tue: {
    name: "Shooting + Upper Body",
    sub: "WOTW game pace · microdose · upper after work",
    note: "Full-intent shooting day. Microdose is input, not fatigue — if sore, do mobility only.",
    blocks: [
      {
        title: "Morning",
        mode: "straight",
        exercises: [
          { id: "wotw", name: "Current WOTW — game pace", sets: 1, target: "108" },
        ],
      },
      {
        title: "Daily microdose — 8–12 min",
        mode: "circuit",
        exercises: [
          { id: "ktw", name: "Knee-to-wall check", sets: 1, target: "3 ea", note: "Log it on the Check-in tab" },
          { id: "banddf", name: "Band-distraction dorsiflexion", sets: 2, target: "8", side: "R", note: "Gentle — stop before pinch" },
          { id: "circles", name: "Resisted Ankle Circles", slug: "resisted-ankle-circles", sets: 1, target: "0:20 ea dir", seconds: 20 },
          { id: "bands", name: "Band walks + marches", sets: 1, target: "5 yds", note: "Neutral and externally rotated" },
        ],
      },
      {
        title: "After work",
        mode: "straight",
        exercises: [
          { id: "upper", name: "Upper body", sets: 1, target: "—", note: "Your existing session" },
        ],
      },
    ],
  },
  wed: {
    name: "Lower B — Reactive + Ankle",
    sub: "Primer → basketball → finish",
    note: "Basketball IS the workout. Do not add jumps or conditioning on top of the run.",
    blocks: [
      {
        title: "Primer · before basketball — 15–20 min",
        mode: "straight",
        exercises: [
          { id: "hhar", name: "Hip Hinge Ankle Rocker", slug: "hip-hinge-ankle-rocker", sets: 2, target: "8 ea", rest: 30 },
          { id: "mdecel", name: "Metronome Decels", slug: "metronome-decels", sets: 2, target: "0:15", note: "Slow cadence · quiet, balanced stops", rest: 60, seconds: 15 },
          { id: "sss", name: "Split Stance Switch & Stick", slug: "split-stance-switch-stick", sets: 2, target: "3 ea", note: "Hold each landing 2 sec", rest: 45 },
          { id: "pogo", name: "Bilateral pogos", slug: "scalable-impact-durability", sets: 2, target: "10", note: "Only if ankle AND tendon are Green", optional: true, rest: 60 },
        ],
      },
      {
        title: "Basketball",
        mode: "straight",
        exercises: [
          { id: "bball", name: "Morning run", sets: 1, target: "—", note: "Log minutes + RPE in notes" },
        ],
      },
      {
        title: "Finish · after basketball — 15–25 min",
        mode: "straight",
        exercises: [
          { id: "slfrsd", name: "Single Leg Full Range Step Downs", slug: "single-leg-full-range-step-downs-or-leg-press", sets: 3, target: "6–8 ea", weight: true, note: "RPE 6–7 — lighter than Monday by design", rest: 90 },
          { id: "soleus", name: "Soleus Raise", slug: "soleus-raise-paulfabritz", sets: 3, target: "8–12 ea", weight: true, note: "2nd soleus exposure of the week", priority: true, rest: 60 },
          { id: "calf", name: "Straight-knee calf raise", sets: 2, target: "8–12 ea", weight: true, note: "Full height, 2-sec lower", rest: 60 },
          { id: "circles", name: "Resisted Ankle Circles", slug: "resisted-ankle-circles", sets: 2, target: "0:20–0:30 ea dir", note: "Very light — 2.5–5 lb", rest: 30, seconds: 30 },
          { id: "cope", name: "Copenhagen Side Plank", slug: "copenhagen-side-plank-paulfabritz", sets: 2, target: "0:20–0:25 ea", rest: 45, seconds: 25 },
        ],
      },
    ],
  },
  thu: {
    name: "Joint Juice + PT Microdose",
    sub: "WOTW moderate · 15–20 min microdose · upper after work",
    note: "Recovery session, not a third leg day. Start the inversion and toe work light — irritated sheaths flare.",
    blocks: [
      {
        title: "Microdose",
        mode: "circuit",
        exercises: [
          { id: "roll", name: "Optional Foam Roll Circuit", slug: "optional-foam-roll-circuit", sets: 1, target: "0:20–0:30 ea", optional: true, seconds: 30 },
          { id: "bandf", name: "Band-distraction dorsiflexion", sets: 2, target: "8", side: "R" },
          { id: "slantiso", name: "Slant Board Isometric Progressions", slug: "slant-board-isometric-progressions", sets: 2, target: "0:30–0:45", note: "Tendon symptom modulation", seconds: 45 },
          { id: "inv", name: "Resisted inversion", sets: 2, target: "12–15", side: "R", note: "NEW · posterior tib · lightest band, slow" },
          { id: "toe", name: "Great-toe flexion press", sets: 2, target: "10", side: "R", note: "NEW · FHL · 3-sec holds" },
          { id: "circles", name: "Resisted Ankle Circles", slug: "resisted-ankle-circles", sets: 2, target: "0:20–0:30 ea dir", seconds: 30 },
          { id: "toemc", name: "Toe Motor Control", slug: "toe-motor-control", sets: 1, target: "0:45", seconds: 45 },
          { id: "chfd", name: "Cable Rotation Hip Flexor Drive", slug: "cable-rotation-hip-flexor-drive", sets: 2, target: "8 ea" },
          { id: "bands", name: "Band walks + marches", sets: 2, target: "5 yds / 8–10 ea" },
        ],
      },
      {
        title: "Optional",
        mode: "straight",
        exercises: [
          { id: "z2", name: "Zone 2 Workout", slug: "zone-2-workout", sets: 1, target: "10–20:00", note: "Skip if it adds fatigue", optional: true },
        ],
      },
    ],
  },
  fri: {
    name: "Basketball or Shooting",
    sub: "Variable — this is the dial you turn down",
    note: "If you play the hard noon run, that is the whole day. Friday→Saturday is the riskiest stretch of your week.",
    blocks: [
      {
        title: "Session",
        mode: "straight",
        exercises: [
          { id: "bball", name: "Basketball", sets: 1, target: "—", note: "Log minutes + RPE + hard jump attempts" },
          { id: "micro", name: "Daily microdose", sets: 1, target: "8–12:00", note: "Only on a shooting-only Friday", optional: true },
        ],
      },
    ],
  },
  sat: {
    name: "Competitive Basketball",
    sub: "Highest intensity day",
    note: "This is where the real jumping stimulus lives. Upper body only if this morning left you Green.",
    blocks: [
      {
        title: "Session",
        mode: "straight",
        exercises: [
          { id: "bball", name: "Competitive basketball", sets: 1, target: "—", note: "Log minutes · RPE · hard/max jump attempts" },
          { id: "upper", name: "Upper body", sets: 1, target: "—", note: "Green only", optional: true },
        ],
      },
    ],
  },
  sun: {
    name: "Off",
    sub: "Your only true rest day — protect it",
    note: "If you add a Sunday run this becomes a 4th exposure with no off day. Then drop Friday to shooting only and cut Wednesday to ankle work.",
    blocks: [
      {
        title: "Optional",
        mode: "straight",
        exercises: [
          { id: "walk", name: "Easy walk + mobility", sets: 1, target: "10:00", optional: true },
          { id: "form", name: "Form shooting / free throws", sets: 1, target: "30:00", note: "Low movement only", optional: true },
        ],
      },
    ],
  },
  dunk: {
    name: "Dunk Ladder Session",
    sub: "Always early, never after fatigue",
    note: "Run the penultimate-step ladder (right foot) alongside the jump ladder. If pain climbs on attempt 3–4, stop and record the threshold.",
    blocks: [
      {
        title: "Ladder A · penultimate step (right foot)",
        mode: "circuit",
        exercises: [
          { id: "p1", name: "P1 Walking penultimate → right plant, hold 2s", sets: 1, target: "6–8", side: "R", optional: true },
          { id: "p2", name: "P2 Jog-in right plant-and-stick", sets: 1, target: "4–6", side: "R", optional: true },
          { id: "p3", name: "P3 Right plant → low left takeoff 50–60%", sets: 1, target: "4–6", optional: true },
          { id: "p4", name: "P4 Progressive approach speed", sets: 1, target: "4–6", optional: true },
          { id: "p5", name: "P5 Full-speed approach", sets: 1, target: "4–6", optional: true },
        ],
      },
      {
        title: "Ladder B · the jump",
        mode: "straight",
        exercises: [
          { id: "d1", name: "1 Low approach 50–60%, low target", sets: 1, target: "4–6" },
          { id: "d2", name: "2 Submax approach jumps 60–75%", sets: 1, target: "4–6" },
          { id: "d3", name: "3 Rim touches 70–85%", sets: 1, target: "4–8" },
          { id: "d4", name: "4 Controlled dunks", sets: 1, target: "3–5" },
          { id: "d5", name: "5 Maximal dunks", sets: 1, target: "3–5" },
          { id: "d6", name: "6 Repeated maximal (2 × 3)", sets: 1, target: "6" },
        ],
      },
    ],
  },
};

export const DAY_ORDER = ["mon","tue","wed","thu","fri","sat","sun","dunk"] as const;
