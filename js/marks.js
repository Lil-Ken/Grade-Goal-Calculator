/* ----------------------- Utilities ----------------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const gradeScale = {
  'A+': 90, 'A': 80, 'A-': 75,
  'B+': 70, 'B': 65, 'B-': 60,
  'C+': 55, 'C': 50, 'F': 0
};

function clampOneDec(el){
  let v = (el.value ?? '').replace(',', '.').trim();
  if (v === '') { el.dataset.num = ''; return null; }
  if (v.includes('.')) {
    const [a,b] = v.split('.');
    v = a + '.' + (b ? b.substring(0,1) : '');
  }
  if (!/^\d{1,3}(\.\d)?$/.test(v)) {
    const parsed = parseFloat(v);
    if (isNaN(parsed)) { el.dataset.num = ''; el.value=''; return null; }
    v = parsed.toString();
    if (v.includes('.')) {
      const [a,b] = v.split('.');
      v = a + '.' + (b ? b.substring(0,1) : '');
    }
  }
  let num = Math.max(0, Math.min(100, parseFloat(v)));
  const one = Math.round(num*10)/10;
  const s = one.toFixed(1);
  el.value = s.endsWith('.0') ? String(parseInt(s)) : s;
  el.dataset.num = String(one);
  return one;
}
function readNum(el){
  const v = el?.dataset?.num;
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function fmt2(n){
  if (n == null || isNaN(n)) return '—';
  return (Math.round(n*100)/100).toFixed(2);
}

/* ✨ animated number tween */
function tweenNumber(el, to, opts={}){
  if (to==null || !isFinite(to)) { el.textContent = '—'; return; }
  const decimals = opts.decimals ?? 2;
  const dur = opts.duration ?? 700;
  const from = parseFloat(el.dataset.prev ?? el.textContent) || 0;
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start)/dur);
    const eased = t<.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad
    const val = from + (to - from) * eased;
    el.textContent = val.toFixed(decimals) + (opts.suffix || '');
    if (t < 1) requestAnimationFrame(step);
    else el.dataset.prev = to;
  }
  requestAnimationFrame(step);
}

function updateWeightsUI(){
  const wMid = readNum($('#wMid')) ?? 0;
  const wAss = readNum($('#wAss')) ?? 0;
  const wFin = readNum($('#wFin')) ?? 0;
  const sum = wMid + wAss + wFin;
  const progress = $('#weightProgress');
  progress.style.width = Math.min(sum, 100) + '%';
  $('#weightTotal').textContent = Math.round(sum) + '%';

  // colors + subtle wiggle when off
  const bar = progress;
  if (Math.abs(sum - 100) < 0.1) {
    bar.style.background = 'linear-gradient(90deg, var(--success), #37d67a)';
  } else if (sum > 100) {
    bar.style.background = 'linear-gradient(90deg, var(--danger), #d9534f)';
    bar.classList.remove('wiggle'); void bar.offsetWidth; bar.classList.add('wiggle');
  } else {
    bar.style.background = 'linear-gradient(90deg, var(--brand-2), var(--brand))';
  }
  return Math.abs(sum - 100) < 0.1;
}

function toggleWeightInputs(disabled) {
  ['#wMid', '#wAss', '#wFin', '#wMidSel', '#wAssSel', '#wFinSel'].forEach(sel => {
    const el = $(sel);
    if (el) el.disabled = disabled;
  });
}

function saveToStorage(){
  const data = {
    wMid: $('#wMid').value, wAss: $('#wAss').value, wFin: $('#wFin').value,
    mMid: $('#mMid')?.value, mAss: $('#mAss')?.value, mFin: $('#mFin')?.value,
    mCoursework: $('#mCoursework').value,
    useIndividualMarks: $('#marksModeToggle').checked,
    goal: $('#goalGrade').value,
    coursePreset: $('#coursePreset').value
  };
  localStorage.setItem('ggc:v2', JSON.stringify(data));
}
function loadFromStorage(){
  const s = localStorage.getItem('ggc:v2');
  if (!s) return;
  try{
    const d = JSON.parse(s);
    if (d.wMid) $('#wMid').value = d.wMid;
    if (d.wAss) $('#wAss').value = d.wAss;
    if (d.wFin) $('#wFin').value = d.wFin;
    if (d.mMid) $('#mMid').value = d.mMid;
    if (d.mAss) $('#mAss').value = d.mAss;
    if (d.mFin) $('#mFin').value = d.mFin;
    if (d.mCoursework) $('#mCoursework').value = d.mCoursework;

    if (d.goal) $('#goalGrade').value = d.goal;
    if (d.coursePreset) { $('#coursePreset').value = d.coursePreset; toggleWeightInputs(d.coursePreset !== ''); }

    ['#wMid','#wAss','#wFin','#mMid','#mAss','#mFin','#mCoursework'].forEach(sel => { const el=$(sel); if(el) clampOneDec(el); });

    $('#marksModeToggle').checked = !!d.useIndividualMarks;
    setIndividualMarksVisible($('#marksModeToggle').checked);
  }catch(e){}
}

/* ----------- Grade helpers ----------- */
function gradeFromPercent(p){
  if (p == null || isNaN(p)) return null;
  const entries = Object.entries(gradeScale).sort((a,b)=>b[1]-a[1]);
  for (const [g,th] of entries){ if (p >= th) return g; }
  return 'F';
}
function gradeClass(g){
  if (!g) return 'grade-c';
  if (g.startsWith('A')) return 'grade-a';
  if (g.startsWith('B')) return 'grade-b';
  if (g.startsWith('C')) return 'grade-c';
  return 'grade-f';
}

/* ----------------------- Calculation ----------------------- */
let pie; // chart instance
let centerLabel = '—';
let lastLetter = null;
let confettiCooldown = 0;

function compute(){
  const wMid = readNum($('#wMid')) ?? 0;
  const wAss = readNum($('#wAss')) ?? 0;
  const wFin = readNum($('#wFin')) ?? 0;

  const useIndividualMarks = $('#marksModeToggle').checked;
  let mMid, mAss;
  if (useIndividualMarks) {
    mMid = readNum($('#mMid'));
    mAss = readNum($('#mAss'));
  } else {
    const mCoursework = readNum($('#mCoursework'));
    mMid = mCoursework;
    mAss = mCoursework;
  }
  const mFin = readNum($('#mFin'));

  const okWeights = updateWeightsUI();

  const cMid = (wMid * (mMid ?? 0)) / 100;
  const cAss = (wAss * (mAss ?? 0)) / 100;
  const cFin = (wFin * (mFin ?? 0)) / 100;
  const overall = cMid + cAss + cFin;

  const grade = $('#goalGrade').value;
  const targetOverall = gradeScale[grade] ?? 0;
  let neededFinalPct = null;
  let needNote = '';
  let status = 'Start entering values';

  const hasMarks = (mMid !== null || mAss !== null || mFin !== null);
  const hasWeights = okWeights;

  if (hasWeights && hasMarks){
    if (wFin <= 0.0001){
      neededFinalPct = null;
      needNote = 'Final weight is 0%. Goal depends only on coursework.';
      status = overall >= targetOverall ? 'Goal reached' : 'Final not used';
    } else {
      const required = ((targetOverall - (cMid + cAss)) / (wFin/100));
      neededFinalPct = required;

      if (!isFinite(required)){
        neededFinalPct = null;
        needNote = 'Enter marks and valid weights.';
        status = 'Incomplete';
      } else if (required <= 0){
        neededFinalPct = 0;
        needNote = 'You\'ve already secured this grade before the final.';
        status = 'Goal reached';
      } else if (required > 100){
        const maxOverall = cMid + cAss + (wFin*100)/100;
        needNote = `Even a perfect final only gets you to ~${fmt2(maxOverall)}%`;
        status = 'Unattainable';
      } else {
        needNote = 'Final mark needed to reach your grade.';
        status = 'On track';
      }
    }
  } else if (!hasWeights) {
    needNote = 'Adjust weights so they total 100%.';
    status = 'Fix weights';
  } else {
    needNote = 'Enter your marks to see results.';
    status = 'Enter marks';
  }

  return {
    wMid,wAss,wFin, mMid,mAss,mFin,
    cMid,cAss,cFin, overall, okWeights,
    grade, targetOverall, neededFinalPct, status, needNote,
    hasValidData: hasWeights && hasMarks
  };
}

function render(state){
  $('#resultCard').classList.toggle('inactive', !state.hasValidData);

  // Required Final: number (animated), note, status, progress, and state accent
  const needFinalEl = $('#needFinal');
  if (state.neededFinalPct==null || !isFinite(state.neededFinalPct)) {
    needFinalEl.textContent = '—';
    needFinalEl.dataset.prev = 0;
  } else {
    // allow values > 100% in the display
    const val = Math.max(0, state.neededFinalPct);
    tweenNumber(needFinalEl, val, {decimals:2, duration:700, suffix:'%'});
  }
  $('#needNote').textContent = state.needNote;
  const needBar = $('#needBar');
  const needCard = $('#needCard');
  needCard.className = 'need-card'; // reset
  const needPct = (state.neededFinalPct!=null && isFinite(state.neededFinalPct)) ? Math.max(0, Math.min(100, state.neededFinalPct)) : 0;
  needBar.style.width = needPct + '%';

  // Status chip + color accents
  const chip = $('#statusChip');
  chip.textContent = state.status;
  chip.className = 'badge rounded-pill status-badge';
  needFinalEl.className = 'need-number';

  if (state.status === 'Goal reached'){
    chip.classList.add('bg-success','text-dark','pop'); setTimeout(()=>chip.classList.remove('pop'), 250);
    needFinalEl.classList.add('text-success');
    needCard.classList.add('need-ok');
    fireConfetti();
  }
  else if (state.status === 'On track'){
    chip.classList.add('bg-info','text-dark','pop'); setTimeout(()=>chip.classList.remove('pop'), 250);
    needFinalEl.classList.add('text-info');
    needCard.classList.add('need-info');
  }
  else if (state.status === 'Unattainable'){
    chip.classList.add('bg-danger','pop'); setTimeout(()=>chip.classList.remove('pop'), 250);
    needFinalEl.classList.add('text-danger');
    needCard.classList.add('need-bad');
  }
  else if (state.status === 'Fix weights' || state.status === 'Enter marks' || state.status === 'Incomplete'){
    chip.classList.add('bg-warning','text-dark');
    needFinalEl.classList.add('text-warning');
    needCard.classList.add('need-warn');
  }
  else{
    chip.classList.add('bg-secondary');
    needFinalEl.classList.add('text-info');
  }

  // Chart (current)
  if (state.hasValidData) {
    const cMid = (state.wMid * (state.mMid ?? 0)) / 100;
    const cAss = (state.wAss * (state.mAss ?? 0)) / 100;
    const cFin = (state.wFin * (state.mFin ?? 0)) / 100;
    centerLabel = 'Contribution';
    updateChart([Math.max(0,cMid), Math.max(0,cAss), Math.max(0,cFin)]);
  } else {
    centerLabel = '—';
    updateChart([0, 0, 0]);
  }

  // OVERALL UI with grade + progress
  const overallEl = $('#overallBig');
  if (state.hasValidData && isFinite(state.overall)) {
    tweenNumber(overallEl, state.overall, {decimals:2});
  } else {
    overallEl.textContent = '—'; overallEl.dataset.prev = 0;
  }
  const pct = (state.hasValidData && isFinite(state.overall)) ? Math.max(0, Math.min(100, state.overall)) : 0;
  $('#overallBar').style.width = pct + '%';

  const letter = (state.hasValidData && isFinite(state.overall)) ? gradeFromPercent(state.overall) : null;
  const gradeEl = $('#overallGrade');
  const prevLetter = lastLetter;
  gradeEl.textContent = letter ?? '—';
  gradeEl.className = 'overall-badge ' + (letter ? gradeClass(letter) : 'grade-c');
  if (letter && prevLetter && letter !== prevLetter){
    gradeEl.classList.add('sparkle');
    setTimeout(()=>gradeEl.classList.remove('sparkle'), 900);
  }
  lastLetter = letter;
}

function computeAndRender(){
  const s = compute();
  render(s);
  saveToStorage();
}

/* ----------------------- Chart (Doughnut + center label) ----------------------- */
const centerTextPlugin = {
  id:'centerText',
  afterDraw(chart, args, opts){
    const {ctx, chartArea:{width, height}} = chart;
    ctx.save();
    ctx.font = '600 14px "Segoe UI", system-ui';
    ctx.fillStyle = '#a8b5c3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerLabel, chart.getDatasetMeta(0).data[0].x, chart.getDatasetMeta(0).data[0].y - 8);

    // total points sum for quick glance
    const sum = chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
    ctx.font = '800 18px "Segoe UI", system-ui';
    ctx.fillStyle = '#e8eef6';
    ctx.fillText(sum ? sum.toFixed(1) : '0.0', chart.getDatasetMeta(0).data[0].x, chart.getDatasetMeta(0).data[0].y + 12);
    ctx.restore();
  }
};

function initChart(){
  const ctx = document.getElementById('contribChart');
  Chart.register(centerTextPlugin);
  pie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Midterm','Assignment','Final'],
      datasets: [{ 
        data: [0,0,0],
        /* ✨ nicer palette */
        backgroundColor: ['#e76f51', '#f4a261', '#2a9d8f'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      layout: { padding: 8 },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, color: '#e8eef6' } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmt2(ctx.parsed)} pts` } }
      },
      animation: {
        animateRotate: true, animateScale: true,
        duration: 650, easing: 'easeOutQuart'
      }
    }
  });
}
function updateChart(arr){
  if (!pie) return;
  pie.data.datasets[0].data = arr;
  pie.update();
}

/* ----------------------- Visibility helpers ----------------------- */
function setIndividualMarksVisible(on){
  $('#courseworkWrap').style.display = on ? 'none' : '';
  $('#midWrap').style.display = on ? '' : 'none';
  $('#assWrap').style.display = on ? '' : 'none';
}

/* ----------------------- Events ----------------------- */
function bindNumericOneDec(selector){
  $$(selector).forEach(el=>{
    el.addEventListener('input', ()=>{ clampOneDec(el); computeAndRender(); });
    el.addEventListener('change', ()=>{ clampOneDec(el); computeAndRender(); });
    el.addEventListener('blur',  ()=>{ clampOneDec(el); computeAndRender(); });
  });
}
function bindWeightPreset(selId, inputId){
  $(selId).addEventListener('change', (e)=>{
    const v = e.target.value;
    if (v !== '') {
      const input = $(inputId);
      input.value = v;
      clampOneDec(input);
      computeAndRender();
    }
  });
}
function bindCoursePresets(){
  $('#coursePreset').addEventListener('change', (e)=>{
    const v = e.target.value;
    toggleWeightInputs(v !== '');
    if (v==='SRE' || v===''){ $('#wMid').value='24'; $('#wAss').value='36'; $('#wFin').value='40'; }
    else if (v==='SDA'){ $('#wMid').value='24'; $('#wAss').value='36'; $('#wFin').value='40'; }
    else if (v==='WIS'){ $('#wMid').value='11.2'; $('#wAss').value='44.8'; $('#wFin').value='44'; }
    clampOneDec($('#wMid')); clampOneDec($('#wAss')); clampOneDec($('#wFin'));
    computeAndRender();
  });
}
function bindMarkToggle(){
  $('#marksModeToggle').addEventListener('change', (e)=>{
    const on = e.target.checked;
    setIndividualMarksVisible(on);
    if (on) {
      const coursework = readNum($('#mCoursework'));
      if (coursework !== null) {
        $('#mMid').value = $('#mCoursework').value;
        $('#mAss').value = $('#mCoursework').value;
        clampOneDec($('#mMid')); clampOneDec($('#mAss'));
      }
    }
    computeAndRender();
  });
}

/* ✨ Reveal-on-scroll */
function initReveals(){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  },{threshold:.12});
  $$('.reveal').forEach(el=>io.observe(el));
}

/* ✨ Tilt cards */
function initTilt(){
  const els = $$('.tilt');
  els.forEach(el=>{
    el.addEventListener('pointermove', (e)=>{
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const rx = (y - .5) * -6; // rotateX
      const ry = (x - .5) * 8;  // rotateY
      el.style.setProperty('--rx', rx+'deg');
      el.style.setProperty('--ry', ry+'deg');
      el.style.setProperty('--ty', '-2px');
    });
    el.addEventListener('pointerleave', ()=>{
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--ty', '0');
    });
  });
}

/* ✨ Confetti (fires on goal reached, throttled) */
function fireConfetti(){
  const now = Date.now();
  if (now - confettiCooldown < 1200) return; // throttle
  confettiCooldown = now;

  const colors = ['#37d67a','#4ba3ff','#83ffe9','#f4a261','#e76f51','#b8e1ff'];
  for (let i=0;i<80;i++){
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.background = colors[i % colors.length];
    d.style.left = (Math.random()*100)+'vw';
    d.style.setProperty('--x', (Math.random()*40 - 20)+'vw');
    d.style.setProperty('--y', (60 + Math.random()*20)+'vh');
    d.style.setProperty('--r', (Math.random()*2 + .5)+'turn');
    d.style.setProperty('--t', (800 + Math.random()*900)+'ms');
    document.body.appendChild(d);
    setTimeout(()=>d.remove(), 1800);
  }
}

/* ----------------------- Init ----------------------- */
window.addEventListener('DOMContentLoaded', ()=>{
  bindNumericOneDec('#wMid,#wAss,#wFin,#mMid,#mAss,#mFin,#mCoursework');
  bindCoursePresets();
  bindMarkToggle();

  $('#goalGrade').addEventListener('change', computeAndRender);

  loadFromStorage();

  if (!$('#wMid').value && !$('#wAss').value && !$('#wFin').value && $('#coursePreset').value === ''){
    $('#wMid').value = '24'; $('#wAss').value = '36'; $('#wFin').value = '40';
    $('#mCoursework').value = '96';
    clampOneDec($('#wMid')); clampOneDec($('#wAss')); clampOneDec($('#wFin'));
    clampOneDec($('#mCoursework'));
  }

  setIndividualMarksVisible($('#marksModeToggle').checked);

  initChart();
  initReveals();
  initTilt();
  computeAndRender();
});