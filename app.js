/* Durability Tracker — local-only. No network, no accounts, no uploads. */
(function () {
'use strict';

var P = 'https://online.pjfperformance.net/exercises/';
var KEY = 'dtrack.v1';

/* ---------- session templates (mirror the written plan) ---------- */
var T = {
  mon: {
    name: 'Lower A — Strength + Tendon Capacity',
    sub: 'Prep → plyos → WOTW → strength · ~115–128 min',
    note: 'Your one genuinely heavy day. If time runs out, cut accessories — never the squat.',
    blocks: [
      { title: 'Block 1 · Prep circuit — 15–18 min', style: 'circuit', ex: [
        { id:'nasal', n:'Nasal Breathing Cardio Warm Up', l:'nasal-breathing-cardio-warm-up', s:1, t:'3:00' },
        { id:'sslhr', n:'Split Stance Loaded Hip Rotations', l:'split-stance-loaded-hip-rotations', s:1, t:'5 ea', d:'5–15 lb · all 4 configs = 1 set' },
        { id:'hhar', n:'Hip Hinge Ankle Rocker', l:'hip-hinge-ankle-rocker', s:1, t:'8 ea', d:'No pinch at end range' },
        { id:'ccgb', n:'Cross Connect Glute Bridge', l:'cross-connect-glute-bridge', s:1, t:'5 ea' },
        { id:'hkhfs', n:'Half Kneeling Hip Flexor Stretch', l:'half-kneeling-hip-flexor-stretch-paulfabritz', s:1, t:'6 ea' },
        { id:'hklo', n:'Half Kneeling Lift Off', l:'half-kneeling-lift-off-paulfabritz', s:1, t:'5 ea' },
        { id:'clls', n:'Loaded Lateral Line Stretch', l:'loaded-lateral-line-stretch', s:1, t:'6 ea' }
      ]},
      { title: 'Block 2 · Locomotion & elasticity — 8–10 min', style:'', ex: [
        { id:'erir', n:'Hip Mobility ER/IR Skips', l:'hip-mobility-er-ir-skips', s:2, t:'20 yds', rest:30 },
        { id:'metro2', n:'2 Leg Metronome Plyo Progressions', l:'2-leg-metronome-plyo-progressions', s:2, t:'0:10', d:'110–120 bpm · regressed from Dot Drill', rest:60 },
        { id:'ekdj', n:'Extensive Knee Dominant Jump', l:'extensive-knee-dominant-jump', s:2, t:'6', d:'50–60% effort · ~50 contacts total today', rest:60 }
      ]},
      { title: 'Block 3 · Shooting — 50–55 min', style:'', ex: [
        { id:'wotw', n:'Current WOTW (108 makes)', s:1, t:'108', d:'Sprint/decel drills at ~70–80%. Not a conditioning day.' }
      ]},
      { title: 'Block 4 · Strength & capacity — 40–45 min', style:'', ex: [
        { id:'hens', n:'Heels Elevated Narrow Squat', l:'heels-elevated-narrow-squat', s:4, t:'6', w:1, d:'RPE 7–8 · main tendon driver', flag:'pri', rest:150 },
        { id:'slfrsd', n:'Single Leg Full Range Step Downs', l:'single-leg-full-range-step-downs-or-leg-press', s:2, t:'6 ea', w:1, d:'RPE 7 · 80–90% of range, never forced', rest:90 },
        { id:'slrdl', n:'Single Leg RDL', s:3, t:'8 ea', w:1, d:'RPE 7 · progress past 63 lb toward heavy 6–8s', rest:90 }
      ]},
      { title: 'Superset A', style:'superset', ex: [
        { id:'razor', n:'Razor Curl Progressions', l:'razor-curl-progressions', s:2, t:'4', d:'Start Lvl 1 (shortened ROM)' },
        { id:'soleus', n:'Soleus Raise', l:'soleus-raise-paulfabritz', s:3, t:'8–12 ea', w:1, d:'Do not skip — your #1 gap for pop', flag:'pri', rest:60 }
      ]},
      { title: 'Superset B', style:'superset', ex: [
        { id:'cooker', n:'Lateral Ankle Slant Board Cooker', l:'lateral-ankle-slant-board-cooker', s:2, t:'8 ea', d:'Pre-fatigue to 8/10 burn, then rotate', rest:30 },
        { id:'aac', n:'Anti Ankle Collapse Progressions', l:'anti-ankle-collapse-progressions', s:3, t:'8', d:'2 sets RIGHT, 1 set left', side:'R', rest:30 }
      ]}
    ]
  },

  tue: {
    name: 'Shooting + Upper Body',
    sub: 'WOTW game pace · microdose · upper after work',
    note: 'Full-intent shooting day. Microdose is input, not fatigue — if sore, do mobility only.',
    blocks: [
      { title:'Morning', style:'', ex:[
        { id:'wotw', n:'Current WOTW — game pace', s:1, t:'108' }
      ]},
      { title:'Daily microdose — 8–12 min', style:'circuit', ex:[
        { id:'ktw', n:'Knee-to-wall check', s:1, t:'3 ea', d:'Log it on the Check-in tab' },
        { id:'banddf', n:'Band-distraction dorsiflexion', s:2, t:'8', side:'R', d:'Gentle — stop before pinch' },
        { id:'circles', n:'Resisted Ankle Circles', l:'resisted-ankle-circles', s:1, t:'0:20 ea dir' },
        { id:'bands', n:'Band walks + marches', s:1, t:'5 yds', d:'Neutral and externally rotated' }
      ]},
      { title:'After work', style:'', ex:[
        { id:'upper', n:'Upper body', s:1, t:'—', d:'Your existing session' }
      ]}
    ]
  },

  wed: {
    name: 'Lower B — Reactive + Ankle',
    sub: 'Primer → basketball → finish',
    note: 'Basketball IS the workout. Do not add jumps or conditioning on top of the run.',
    blocks: [
      { title:'Primer · before basketball — 15–20 min', style:'', ex:[
        { id:'hhar', n:'Hip Hinge Ankle Rocker', l:'hip-hinge-ankle-rocker', s:2, t:'8 ea', rest:30 },
        { id:'mdecel', n:'Metronome Decels', l:'metronome-decels', s:2, t:'0:15', d:'Slow cadence · quiet, balanced stops', rest:60 },
        { id:'sss', n:'Split Stance Switch & Stick', l:'split-stance-switch-stick', s:2, t:'3 ea', d:'Hold each landing 2 sec', rest:45 },
        { id:'pogo', n:'Bilateral pogos', l:'scalable-impact-durability', s:2, t:'10', d:'Only if ankle AND tendon are Green', opt:1, rest:60 }
      ]},
      { title:'Basketball', style:'', ex:[
        { id:'bball', n:'Morning run', s:1, t:'—', d:'Log minutes + RPE in notes' }
      ]},
      { title:'Finish · after basketball — 15–25 min', style:'', ex:[
        { id:'slfrsd', n:'Single Leg Full Range Step Downs', l:'single-leg-full-range-step-downs-or-leg-press', s:3, t:'6–8 ea', w:1, d:'RPE 6–7 — lighter than Monday by design', rest:90 },
        { id:'soleus', n:'Soleus Raise', l:'soleus-raise-paulfabritz', s:3, t:'8–12 ea', w:1, d:'2nd soleus exposure of the week', flag:'pri', rest:60 },
        { id:'calf', n:'Straight-knee calf raise', s:2, t:'8–12 ea', w:1, d:'Full height, 2-sec lower', rest:60 },
        { id:'circles', n:'Resisted Ankle Circles', l:'resisted-ankle-circles', s:2, t:'0:20–0:30 ea dir', d:'Very light — 2.5–5 lb', rest:30 },
        { id:'cope', n:'Copenhagen Side Plank', l:'copenhagen-side-plank-paulfabritz', s:2, t:'0:20–0:25 ea', rest:45 }
      ]}
    ]
  },

  thu: {
    name: 'Joint Juice + PT Microdose',
    sub: 'WOTW moderate · 15–20 min microdose · upper after work',
    note: 'Recovery session, not a third leg day. Start the inversion and toe work light — irritated sheaths flare.',
    blocks: [
      { title:'Microdose', style:'circuit', ex:[
        { id:'roll', n:'Optional Foam Roll Circuit', l:'optional-foam-roll-circuit', s:1, t:'0:20–0:30 ea', opt:1 },
        { id:'bandf', n:'Band-distraction dorsiflexion', s:2, t:'8', side:'R' },
        { id:'slantiso', n:'Slant Board Isometric Progressions', l:'slant-board-isometric-progressions', s:2, t:'0:30–0:45', d:'Tendon symptom modulation' },
        { id:'inv', n:'Resisted inversion', s:2, t:'12–15', side:'R', d:'NEW · posterior tib · lightest band, slow' },
        { id:'toe', n:'Great-toe flexion press', s:2, t:'10', side:'R', d:'NEW · FHL · 3-sec holds' },
        { id:'circles', n:'Resisted Ankle Circles', l:'resisted-ankle-circles', s:2, t:'0:20–0:30 ea dir' },
        { id:'toemc', n:'Toe Motor Control', l:'toe-motor-control', s:1, t:'0:45' },
        { id:'chfd', n:'Cable Rotation Hip Flexor Drive', l:'cable-rotation-hip-flexor-drive', s:2, t:'8 ea' },
        { id:'bands', n:'Band walks + marches', s:2, t:'5 yds / 8–10 ea' }
      ]},
      { title:'Optional', style:'', ex:[
        { id:'z2', n:'Zone 2 Workout', l:'zone-2-workout', s:1, t:'10–20:00', d:'Skip if it adds fatigue', opt:1 }
      ]}
    ]
  },

  fri: {
    name: 'Basketball or Shooting',
    sub: 'Variable — this is the dial you turn down',
    note: 'If you play the hard noon run, that is the whole day. Friday→Saturday is the riskiest stretch of your week.',
    blocks: [
      { title:'Session', style:'', ex:[
        { id:'bball', n:'Basketball', s:1, t:'—', d:'Log minutes + RPE + hard jump attempts' },
        { id:'micro', n:'Daily microdose', s:1, t:'8–12:00', d:'Only on a shooting-only Friday', opt:1 }
      ]}
    ]
  },

  sat: {
    name: 'Competitive Basketball',
    sub: 'Highest intensity day',
    note: 'This is where the real jumping stimulus lives. Upper body only if this morning left you Green.',
    blocks: [
      { title:'Session', style:'', ex:[
        { id:'bball', n:'Competitive basketball', s:1, t:'—', d:'Log minutes · RPE · hard/max jump attempts' },
        { id:'upper', n:'Upper body', s:1, t:'—', d:'Green only', opt:1 }
      ]}
    ]
  },

  sun: {
    name: 'Off',
    sub: 'Your only true rest day — protect it',
    note: 'If you add a Sunday run this becomes a 4th exposure with no off day. Then drop Friday to shooting only and cut Wednesday to ankle work.',
    blocks: [
      { title:'Optional', style:'', ex:[
        { id:'walk', n:'Easy walk + mobility', s:1, t:'10:00', opt:1 },
        { id:'form', n:'Form shooting / free throws', s:1, t:'30:00', d:'Low movement only', opt:1 }
      ]}
    ]
  },

  dunk: {
    name: 'Dunk Ladder Session',
    sub: 'Always early, never after fatigue',
    note: 'Run the penultimate-step ladder (right foot) alongside the jump ladder. If pain climbs on attempt 3–4, stop and record the threshold.',
    blocks: [
      { title:'Ladder A · penultimate step (right foot)', style:'circuit', ex:[
        { id:'p1', n:'P1 Walking penultimate → right plant, hold 2s', s:1, t:'6–8', side:'R', opt:1 },
        { id:'p2', n:'P2 Jog-in right plant-and-stick', s:1, t:'4–6', side:'R', opt:1 },
        { id:'p3', n:'P3 Right plant → low left takeoff 50–60%', s:1, t:'4–6', opt:1 },
        { id:'p4', n:'P4 Progressive approach speed', s:1, t:'4–6', opt:1 },
        { id:'p5', n:'P5 Full-speed approach', s:1, t:'4–6', opt:1 }
      ]},
      { title:'Ladder B · the jump', style:'', ex:[
        { id:'d1', n:'1 Low approach 50–60%, low target', s:1, t:'4–6' },
        { id:'d2', n:'2 Submax approach jumps 60–75%', s:1, t:'4–6' },
        { id:'d3', n:'3 Rim touches 70–85%', s:1, t:'4–8' },
        { id:'d4', n:'4 Controlled dunks', s:1, t:'3–5' },
        { id:'d5', n:'5 Maximal dunks', s:1, t:'3–5' },
        { id:'d6', n:'6 Repeated maximal (2 × 3)', s:1, t:'6' }
      ]}
    ]
  }
};

var DAYS = [['mon','Mon · Lower A'],['tue','Tue · Shooting'],['wed','Wed · Lower B'],
            ['thu','Thu · Microdose'],['fri','Fri · Basketball'],['sat','Sat · Basketball'],
            ['sun','Sun · Off'],['dunk','Dunk ladder']];

/* ---------- state ---------- */
var state = load();
var curKey = todayKey();
var curDay = defaultDay();

function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { var o = JSON.parse(raw); if (o && o.sessions) return o; }
  } catch (e) {}
  return { v: 1, sessions: {} };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Storage full or blocked'); }
}
function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function defaultDay() {
  var i = new Date().getDay();               // 0 Sun … 6 Sat
  return ['sun','mon','tue','wed','thu','fri','sat'][i];
}
function sess(k, create) {
  if (!state.sessions[k] && create) state.sessions[k] = { day: curDay, ex: {}, readiness: null, notes: '' };
  return state.sessions[k];
}
function fmtDate(k) {
  var p = k.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ---------- element helpers ---------- */
function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}
function toast(msg) {
  var t = el('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 1900);
}

/* ---------- nav ---------- */
el('nav').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var v = b.dataset.v;
  [].forEach.call(document.querySelectorAll('#nav button'), function (x) { x.classList.toggle('on', x === b); });
  [].forEach.call(document.querySelectorAll('.view'), function (s) { s.classList.toggle('on', s.id === v); });
  if (v === 'history') renderHistory();
  if (v === 'export') renderPreview();
  if (v === 'check') fillCheck();
  window.scrollTo(0, 0);
});

/* ---------- day selector ---------- */
var sel = el('daysel');
DAYS.forEach(function (d) {
  var o = document.createElement('option'); o.value = d[0]; o.textContent = d[1]; sel.appendChild(o);
});
sel.value = curDay;
sel.addEventListener('change', function () {
  curDay = sel.value;
  var s = sess(curKey, false);
  if (s) { s.day = curDay; save(); }
  renderWorkout();
});

/* ---------- status ---------- */
function statusOf(k) {
  var s = state.sessions[k];
  return (s && s.readiness && s.readiness.status) || null;
}
function paintStatus() {
  var st = statusOf(curKey);
  var c = el('statuschip');
  c.className = 'chip ' + (st || 'none');
  c.textContent = st ? st.toUpperCase() : 'NO CHECK';
  el('wklab').textContent = fmtDate(curKey);
}

/* ---------- readiness gate ---------- */
function renderGate() {
  var st = statusOf(curKey), g = el('gate');
  if (!st) {
    g.innerHTML = '<div class="note warn"><b>No check-in yet.</b> Do the morning check first — it decides today\'s volume.</div>';
    return;
  }
  if (st === 'green') {
    g.innerHTML = '<div class="note"><b>Green.</b> Run the session as written. Progress one variable only.</div>';
  } else if (st === 'yellow') {
    g.innerHTML = '<div class="note warn"><b>Yellow.</b> Cut contacts 30–50%, use bilateral instead of unilateral, drop load or range 10–20%. Keep the primary lift if it feels clean. Do not progress.</div>';
  } else {
    g.innerHTML = '<div class="note stop"><b>Red.</b> No jumping, sprinting, hard cutting or loaded end-range today. Mobility and pain-free movement only.</div>';
  }
}

/* ---------- workout render ---------- */
function renderWorkout() {
  paintStatus(); renderGate();
  var tpl = T[curDay], host = el('workout');
  var h = '<h2>' + esc(tpl.name) + '</h2><p class="sub">' + esc(tpl.sub) + '</p>';
  h += '<div class="note">' + esc(tpl.note) + '</div>';

  tpl.blocks.forEach(function (b) {
    h += '<h3>' + esc(b.title) + '</h3>';
    b.ex.forEach(function (x) {
      var cls = x.opt ? 'optional' : (b.style || '');
      var name = x.l
        ? '<a href="' + P + x.l + '/" target="_blank" rel="noopener">' + esc(x.n) + '</a>'
        : esc(x.n);
      var flag = x.flag === 'pri' ? '<span class="flag pri">PRIORITY</span>' : '';
      var side = x.side ? '<span class="flag ' + x.side.toLowerCase() + '">' + x.side + '</span>' : '';
      h += '<div class="ex ' + cls + '" data-ex="' + x.id + '">';
      h += '<div class="exhead"><div class="exname"><b>' + name + flag + side + '</b>' +
           (x.d ? '<small>' + esc(x.d) + '</small>' : '') + '</div>' +
           '<div class="target"><b>' + esc(x.t) + '</b>' + (x.s > 1 ? x.s + ' sets' : '') + '</div></div>';
      h += '<div class="sets" data-sets="' + x.id + '"></div>';
      h += '<div class="exbtns"><button class="mini" data-add="' + x.id + '">+ set</button>';
      if (x.rest) h += '<button class="mini" data-rest="' + x.rest + '">rest ' + fmtSec(x.rest) + '</button>';
      h += '</div></div>';
    });
  });

  h += '<h3>Session notes</h3><textarea class="t" id="snotes" placeholder="Basketball minutes, RPE, how it felt…"></textarea>';
  host.innerHTML = h;

  var s = sess(curKey, false);
  el('snotes').value = (s && s.notes) || '';
  el('snotes').addEventListener('input', function () {
    sess(curKey, true).notes = this.value; save();
  });

  tpl.blocks.forEach(function (b) {
    b.ex.forEach(function (x) { renderSets(x); });
  });
}

function getSets(exId, def) {
  var s = sess(curKey, true);
  if (!s.ex[exId]) {
    s.ex[exId] = [];
    for (var i = 0; i < def; i++) s.ex[exId].push({ r: '', w: '', done: false });
  }
  return s.ex[exId];
}

function findEx(exId) {
  var found = null;
  T[curDay].blocks.forEach(function (b) {
    b.ex.forEach(function (x) { if (x.id === exId) found = x; });
  });
  return found;
}

function renderSets(x) {
  var host = document.querySelector('[data-sets="' + x.id + '"]');
  if (!host) return;
  var rows = getSets(x.id, x.s), h = '';
  rows.forEach(function (r, i) {
    h += '<div class="setrow" data-i="' + i + '">';
    h += '<span class="n">' + (i + 1) + '</span>';
    h += '<input inputmode="numeric" placeholder="reps/time" value="' + esc(r.r) + '" data-f="r">';
    if (x.w) h += '<input inputmode="decimal" placeholder="lb" value="' + esc(r.w) + '" data-f="w">';
    h += '<button class="tick' + (r.done ? ' on' : '') + '" data-f="done">✓</button>';
    h += '<button class="rm" data-f="rm">×</button>';
    h += '</div>';
  });
  host.innerHTML = h;
}

el('workout').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;

  if (b.dataset.add) {
    getSets(b.dataset.add, 0).push({ r:'', w:'', done:false });
    save(); renderSets(findEx(b.dataset.add)); return;
  }
  if (b.dataset.rest) { startTimer(+b.dataset.rest); return; }

  var exId = b.closest('[data-ex]') && b.closest('[data-ex]').dataset.ex;
  var row = b.closest('.setrow'); if (!exId || !row) return;
  var i = +row.dataset.i, rows = getSets(exId, 0);

  if (b.dataset.f === 'done') {
    rows[i].done = !rows[i].done; save();
    b.classList.toggle('on', rows[i].done);
    markDone(exId, rows);
    var x = findEx(exId); if (rows[i].done && x && x.rest) startTimer(x.rest);
  } else if (b.dataset.f === 'rm') {
    rows.splice(i, 1); save(); renderSets(findEx(exId)); markDone(exId, rows);
  }
});

el('workout').addEventListener('input', function (e) {
  var inp = e.target; if (inp.tagName !== 'INPUT') return;
  var exId = inp.closest('[data-ex]') && inp.closest('[data-ex]').dataset.ex;
  var row = inp.closest('.setrow'); if (!exId || !row) return;
  getSets(exId, 0)[+row.dataset.i][inp.dataset.f] = inp.value;
  save();
});

function markDone(exId, rows) {
  var card = document.querySelector('[data-ex="' + exId + '"]');
  if (card) card.classList.toggle('done', rows.length > 0 && rows.every(function (r) { return r.done; }));
}

/* ---------- rest timer ---------- */
var tHandle = null, tEnd = 0;
function fmtSec(s) { return Math.floor(s / 60) + ':' + pad(s % 60); }
function startTimer(sec) {
  tEnd = Date.now() + sec * 1000;
  el('timer').classList.add('on');
  tick();
  clearInterval(tHandle);
  tHandle = setInterval(tick, 250);
}
function tick() {
  var left = Math.round((tEnd - Date.now()) / 1000);
  if (left <= 0) {
    el('tleft').textContent = 'Go';
    clearInterval(tHandle); tHandle = null;
    if (navigator.vibrate) navigator.vibrate([200, 90, 200]);
    setTimeout(function () { el('timer').classList.remove('on'); }, 2500);
    return;
  }
  el('tleft').textContent = fmtSec(left);
}
el('tstop').addEventListener('click', function () {
  clearInterval(tHandle); tHandle = null; el('timer').classList.remove('on');
});
el('tadd').addEventListener('click', function () { tEnd += 30000; tick(); });

/* ---------- check-in ---------- */
var pendingStatus = null;
el('statusseg').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  pendingStatus = b.dataset.v;
  [].forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
});
function fillCheck() {
  el('checkdate').textContent = fmtDate(curKey);
  var r = (state.sessions[curKey] && state.sessions[curKey].readiness) || {};
  el('ktwR').value = r.ktwR != null ? r.ktwR : '';
  el('ktwL').value = r.ktwL != null ? r.ktwL : '';
  el('anklePain').value = r.anklePain != null ? r.anklePain : '';
  el('tendonPain').value = r.tendonPain != null ? r.tendonPain : '';
  el('amStiff').value = r.amStiff != null ? r.amStiff : '';
  el('swelling').value = r.swelling || 'no';
  el('cnotes').value = r.notes || '';
  pendingStatus = r.status || null;
  [].forEach.call(el('statusseg').querySelectorAll('button'), function (x) {
    x.classList.toggle('on', x.dataset.v === pendingStatus);
  });
}
el('savecheck').addEventListener('click', function () {
  if (!pendingStatus) { toast('Pick Green, Yellow or Red'); return; }
  var s = sess(curKey, true);
  s.day = curDay;
  s.readiness = {
    ktwR: numOrNull(el('ktwR').value), ktwL: numOrNull(el('ktwL').value),
    anklePain: numOrNull(el('anklePain').value), tendonPain: numOrNull(el('tendonPain').value),
    amStiff: numOrNull(el('amStiff').value), swelling: el('swelling').value,
    notes: el('cnotes').value, status: pendingStatus
  };
  save(); paintStatus(); renderGate(); toast('Check-in saved');
});
function numOrNull(v) { return v === '' || v == null ? null : +v; }

/* ---------- history ---------- */
function renderHistory() {
  var keys = Object.keys(state.sessions).sort().reverse();
  if (!keys.length) { el('histbody').innerHTML = '<div class="empty">Nothing logged yet.</div>'; return; }
  var h = '<table class="hist"><tr><th>Date</th><th>Session</th><th>Ankle</th><th>Tendon</th><th>Sets</th></tr>';
  keys.forEach(function (k) {
    var s = state.sessions[k], r = s.readiness || {}, st = r.status;
    var n = 0;
    Object.keys(s.ex || {}).forEach(function (e) {
      s.ex[e].forEach(function (x) { if (x.done) n++; });
    });
    h += '<tr><td>' + (st ? '<span class="dot ' + st + '"></span>' : '') + esc(fmtDate(k)) + '</td>' +
         '<td>' + esc((T[s.day] && T[s.day].name.split('—')[0].trim()) || s.day || '—') + '</td>' +
         '<td>' + (r.anklePain != null ? r.anklePain : '–') + '</td>' +
         '<td>' + (r.tendonPain != null ? r.tendonPain : '–') + '</td>' +
         '<td>' + n + '</td></tr>';
  });
  el('histbody').innerHTML = h + '</table>';
}

/* ---------- export ---------- */
function buildText(days) {
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  var keys = Object.keys(state.sessions).sort().filter(function (k) {
    if (days >= 9999) return true;
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]) >= cutoff;
  });
  if (!keys.length) return 'No sessions logged in this range.';

  var out = ['DURABILITY LOG', ''];
  keys.forEach(function (k) {
    var s = state.sessions[k], r = s.readiness, tpl = T[s.day];
    out.push(fmtDate(k) + ' · ' + ((tpl && tpl.name) || s.day || '?') +
             (r && r.status ? ' · ' + r.status.toUpperCase() : ' · no check-in'));
    if (r) {
      var ktw = (r.ktwR != null && r.ktwL != null)
        ? 'KTW R ' + r.ktwR + ' / L ' + r.ktwL +
          (r.ktwL ? ' (' + Math.round(r.ktwR / r.ktwL * 100) + '%)' : '')
        : 'KTW —';
      out.push('  ' + ktw + ' · ankle ' + (r.anklePain != null ? r.anklePain : '–') + '/10' +
               ' · tendon ' + (r.tendonPain != null ? r.tendonPain : '–') + '/10' +
               ' · AM stiff ' + (r.amStiff != null ? r.amStiff + 'min' : '–') +
               ' · swelling ' + (r.swelling || '–'));
      if (r.notes) out.push('  Check-in note: ' + r.notes);
    }
    Object.keys(s.ex || {}).forEach(function (id) {
      var rows = (s.ex[id] || []).filter(function (x) { return x.done || x.r || x.w; });
      if (!rows.length) return;
      var name = nameFor(s.day, id) || id;
      out.push('  ' + name + ': ' + rows.map(function (x) {
        return (x.w ? x.w + '×' : '') + (x.r || '?') + (x.done ? '' : ' (not done)');
      }).join(', '));
    });
    if (s.notes) out.push('  Notes: ' + s.notes);
    out.push('');
  });
  return out.join('\n');
}
function nameFor(day, id) {
  var found = null, tpl = T[day];
  if (!tpl) return null;
  tpl.blocks.forEach(function (b) { b.ex.forEach(function (x) { if (x.id === id) found = x.n; }); });
  return found;
}
function renderPreview() { el('preview').textContent = buildText(+el('range').value); }
el('range').addEventListener('change', renderPreview);

el('copybtn').addEventListener('click', function () {
  var txt = buildText(+el('range').value);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () { toast('Copied — paste it to your coach'); },
                                            function () { fallbackCopy(txt); });
  } else fallbackCopy(txt);
});
function fallbackCopy(txt) {
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Copied'); }
  catch (e) { toast('Select the preview text and copy manually'); }
  document.body.removeChild(ta);
}

el('jsonbtn').addEventListener('click', function () {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'durability-' + todayKey() + '.json';
  a.click(); URL.revokeObjectURL(a.href); toast('JSON downloaded');
});

el('importbtn').addEventListener('click', function () { el('importfile').click(); });
el('importfile').addEventListener('change', function (e) {
  var f = e.target.files[0]; if (!f) return;
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var o = JSON.parse(fr.result);
      if (!o || !o.sessions) throw new Error('bad');
      if (!confirm('Replace all data on this device with the file contents?')) return;
      state = o; save(); paintStatus(); renderWorkout(); renderHistory(); renderPreview();
      toast('Restored');
    } catch (err) { toast('That file is not a valid backup'); }
  };
  fr.readAsText(f);
});

el('wipe').addEventListener('click', function () {
  if (!confirm('Erase every logged session on this device? This cannot be undone.')) return;
  state = { v: 1, sessions: {} }; save();
  paintStatus(); renderWorkout(); renderHistory(); renderPreview(); toast('Erased');
});

/* ---------- boot ---------- */
renderWorkout();
})();
