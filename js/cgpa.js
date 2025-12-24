// CGPA Calculator
const gradePoints = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.67,
  'B+': 3.33, 'B': 3.0, 'B-': 2.67,
  'C+': 2.33, 'C': 2.0, 'F': 0.0
};
const marksToGrade = (m)=>{
  if (m==null || isNaN(m)) return null;
  if (m>=90) return 'A+';
  if (m>=80) return 'A';
  if (m>=75) return 'A-';
  if (m>=70) return 'B+';
  if (m>=65) return 'B';
  if (m>=60) return 'B-';
  if (m>=55) return 'C+';
  if (m>=50) return 'C';
  return 'F';
};

let programme = {};
let readableNames = { software_engineering: 'Software Engineering', security: 'Security' };

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function loadProgramme(){
  // Try a few likely paths (absolute and relative) so the page works when opened from a server or file://
  const candidates = ['/data/programme_structure.json', 'data/programme_structure.json', '../data/programme_structure.json'];
  let lastErr = null;
  function tryFetch(i){
    if (i >= candidates.length) return Promise.reject(lastErr || new Error('Not found'));
    const url = candidates[i];
    return fetch(url, {cache:'no-store'})
      .then(r=>{
        if (!r.ok) { lastErr = new Error(`HTTP ${r.status} (${url})`); return tryFetch(i+1); }
        return r.json();
      })
      .then(j=>{ programme = j; return j; })
      .catch(err=>{ lastErr = err; return tryFetch(i+1); });
  }

  return tryFetch(0).catch(err=>{
    console.error('Failed to load programme_structure.json', err);
    const alert = document.getElementById('cgpaAlert');
    if (alert) alert.innerHTML = `<div class="alert alert-warning small mb-3">Unable to load programme data. Ensure <code>data/programme_structure.json</code> is reachable (tried: ${candidates.join(', ')}). (${err.message})</div>`;
    // disable controls
    const disableAll = () => {
      ['#courseSel','#yearSel','#semSel','#saveBtn','#clearBtn','#exportBtn'].forEach(sel => { const el=document.querySelector(sel); if (el) el.disabled = true; });
    };
    disableAll();
    // leave programme empty
    programme = {};
    return {};
  });
}

function populateCourseSelect(){
  const sel = $('#courseSel'); sel.innerHTML='';
  const keys = Object.keys(programme);
  if (!keys.length){
    showCgpaAlert('No courses available in programme data.', 'warning');
    return;
  }
  keys.forEach(k=>{
    const opt = document.createElement('option'); opt.value=k; opt.textContent = readableNames[k]||k; sel.appendChild(opt);
  });
}

function enableCgpaControls(enable=true){
  ['#courseSel','#yearSel','#semSel','#saveBtn','#clearBtn'].forEach(sel => { const el=document.querySelector(sel); if (el) el.disabled = !enable; });
}
function uniqueYearsForCourse(course){
  const arr = programme[course]||[];
  const years = [...new Set(arr.map(x=>x.Year))].sort((a,b)=>a-b);
  return years;
}
function uniqueSemestersForCourseAndYear(course, year){
  const arr = (programme[course]||[]).filter(x=>x.Year==year);
  const sems = [...new Set(arr.map(x=>x.Semester))].sort((a,b)=>a-b);
  return sems;
}

function subjectsFor(course, year, semester){
  return (programme[course]||[]).filter(x=>x.Year==year && x.Semester==semester);
}

// Persistence
function storageKey(course, year, sem){ return `cgpa:${course}:${year}:${sem}` }
function saveSemester(course, year, sem, data){ localStorage.setItem(storageKey(course,year,sem), JSON.stringify(data)) }
function loadSemester(course, year, sem){ try{ const s=localStorage.getItem(storageKey(course,year,sem)); return s?JSON.parse(s):null }catch(e){return null} }
function clearSemester(course, year, sem){ localStorage.removeItem(storageKey(course,year,sem)); }

// Render subjects table
function renderSubjects(course, year, sem){
  const rows = subjectsFor(course, year, sem);
  const tbody = $('#subjectsTable tbody'); tbody.innerHTML='';
  const saved = loadSemester(course,year,sem) || {};

  if (!rows || rows.length === 0){
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted small">No subjects found for the selected term.</td></tr>';
    updateSummary();
    return;
  }

  rows.forEach(sub=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="code">${sub.Code}</td>
      <td>${sub.Title}</td>
      <td class="text-center credits">${sub.Credits}</td>
      <td class="text-center">
        <select class="form-select form-select-sm grade-select" aria-label="grade">
          <option value="">—</option>
          <option>A+</option><option>A</option><option>A-</option>
          <option>B+</option><option>B</option><option>B-</option>
          <option>C+</option><option>C</option><option>F</option>
        </select>
      </td>
      <td class="text-center">
        <input type="number" min="0" max="100" step="1" class="form-control form-control-sm marks-input" placeholder="0-100" />
      </td>
    `;

    // Pre-fill from saved
    const gradeSel = tr.querySelector('.grade-select');
    const markInput = tr.querySelector('.marks-input');
    const key = sub.Code;
    if (saved[key]){
      if (saved[key].grade) gradeSel.value = saved[key].grade;
      if (saved[key].marks != null && saved[key].marks !== '') markInput.value = saved[key].marks;
    }

    tbody.appendChild(tr);
  });

  // compute once after all rows inserted
  updateSummary();
}

function computeGPA(){
  const rows = $$('#subjectsTable tbody tr');
  let totalCredits = 0; let gradedCredits = 0; let pointsSum = 0;
  rows.forEach(tr=>{
    const credits = parseFloat(tr.querySelector('.credits').textContent) || 0;
    const grade = tr.querySelector('.grade-select').value;
    const marksVal = tr.querySelector('.marks-input').value;
    let gp = null;
    if (grade) gp = gradePoints[grade];
    else if (marksVal) {
      const g = marksToGrade(parseFloat(marksVal)); gp = gradePoints[g];
    }
    totalCredits += credits;
    if (gp != null && !isNaN(gp)) { gradedCredits += credits; pointsSum += gp * credits; }
  });
  const gpa = gradedCredits ? (pointsSum / gradedCredits) : null;
  $('#totalCredits').textContent = totalCredits;
  $('#gradedCredits').textContent = gradedCredits;
  $('#gpaDisplay').textContent = gpa==null ? '—' : gpa.toFixed(2);
  $('#gpaNote').textContent = gpa==null ? 'Enter grades or marks to compute semester GPA.' : 'Semester GPA — calculated from graded subjects.';
  return { gpa, totalCredits, gradedCredits, pointsSum };
}

// compute CGPA across saved semesters and optionally include current editing semester (passed as `current`)
function computeCGPA(course, current){
  const curCourse = course || $('#courseSel')?.value;
  if (!curCourse){ $('#cgpaDisplay').textContent = '—'; $('#cgpaNote').textContent = 'Select a course to compute CGPA.'; return null; }
  let totalPoints = 0; let totalGradedCredits = 0;
  for (let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`cgpa:${curCourse}:`)) continue;
    const parts = key.split(':'); if (parts.length < 4) continue;
    const year = Number(parts[2]); const sem = Number(parts[3]);
    const saved = loadSemester(curCourse, year, sem);
    const subs = subjectsFor(curCourse, year, sem);
    if (!saved || !subs) continue;
    subs.forEach(sub=>{
      const entry = saved[sub.Code];
      if (!entry) return;
      let gp = null;
      if (entry.grade) gp = gradePoints[entry.grade];
      else if (entry.marks != null) { const g = marksToGrade(Number(entry.marks)); gp = gradePoints[g]; }
      if (gp != null && !isNaN(gp)){ totalPoints += gp * sub.Credits; totalGradedCredits += sub.Credits; }
    });
  }
  // include current editing semester if provided (or compute it)
  if (!current) current = computeGPA();
  if (current && current.pointsSum && current.gradedCredits){ totalPoints += current.pointsSum; totalGradedCredits += current.gradedCredits; }
  const cgpa = totalGradedCredits ? (totalPoints / totalGradedCredits) : null;
  $('#cgpaDisplay').textContent = cgpa==null ? '—' : cgpa.toFixed(2);
  $('#cgpaNote').textContent = cgpa==null ? 'No graded subjects saved or entered for this course.' : `CGPA — calculated from ${totalGradedCredits} graded credits (saved semesters + current).`;
  return { cgpa, totalPoints, totalGradedCredits };
}

// update both semester summary and cumulative CGPA
function updateSummary(){
  const current = computeGPA();
  computeCGPA($('#courseSel')?.value, current);
  return { current };
}

function showCgpaAlert(html, type='warning'){
  const el = document.getElementById('cgpaAlert');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} small mb-3">${html}</div>`;
  setTimeout(()=>{ if (el) el.innerHTML = ''; }, 3500);
}

function saveCurrent(){
  const course = $('#courseSel')?.value; const year = $('#yearSel')?.value; const sem = $('#semSel')?.value;
  if (!course || !year || !sem){ showCgpaAlert('Select course, year and semester before saving.', 'danger'); return; }
  const rows = $$('#subjectsTable tbody tr');
  const data = {};
  rows.forEach(tr=>{
    const code = tr.querySelector('.code')?.textContent;
    const grade = tr.querySelector('.grade-select')?.value;
    const marks = tr.querySelector('.marks-input')?.value;
    if (code && (grade || (marks && marks !== ''))) data[code] = { grade: grade || null, marks: marks !== '' ? Number(marks) : null };
  });
  saveSemester(course,year,sem,data);
  // small feedback
  const saveBtn = $('#saveBtn'); if (saveBtn) { saveBtn.textContent = 'Saved'; setTimeout(()=>saveBtn.textContent='Save Semester',900); }
  showCgpaAlert('Semester saved.', 'success');
  updateSummary();
}
function clearCurrent(){
  const course = $('#courseSel')?.value; const year = $('#yearSel')?.value; const sem = $('#semSel')?.value;
  if (!course || !year || !sem){ showCgpaAlert('Select course, year and semester before clearing.', 'danger'); return; }
  const rows = $$('#subjectsTable tbody tr');
  rows.forEach(tr=>{ const g = tr.querySelector('.grade-select'); const m = tr.querySelector('.marks-input'); if (g) g.value=''; if (m) m.value=''; });
  clearSemester(course,year,sem); updateSummary();
  showCgpaAlert('Semester cleared.', 'info');
}



// Bind controls
function bindControls(){
  $('#courseSel').addEventListener('change', ()=>{
    const course = $('#courseSel').value;
    const years = uniqueYearsForCourse(course);
    const yearSel = $('#yearSel'); yearSel.innerHTML=''; years.forEach(y=>{ const opt=document.createElement('option'); opt.value=y; opt.textContent=y; yearSel.appendChild(opt); });
    yearSel.dispatchEvent(new Event('change'));
  });
  $('#yearSel').addEventListener('change', ()=>{
    const course = $('#courseSel').value; const year = Number($('#yearSel').value);
    const sems = uniqueSemestersForCourseAndYear(course, year);
    const semSel = $('#semSel'); semSel.innerHTML=''; sems.forEach(s=>{ const opt=document.createElement('option'); opt.value=s; opt.textContent=s; semSel.appendChild(opt); });
    semSel.dispatchEvent(new Event('change'));
  });
  $('#semSel').addEventListener('change', ()=>{
    const course = $('#courseSel').value; const year = Number($('#yearSel').value); const sem = Number($('#semSel').value);
    renderSubjects(course, year, sem);
    // load saved (renderSubjects already pre-fills from storage)
  });

  const saveBtn = $('#saveBtn'); if (saveBtn) saveBtn.addEventListener('click', saveCurrent);
  const clearBtn = $('#clearBtn'); if (clearBtn) clearBtn.addEventListener('click', clearCurrent);
  // enable live compute via event delegation for robustness
  const tbody = document.querySelector('#subjectsTable tbody');
  if (tbody){
    tbody.addEventListener('input', (e)=>{
      const tgt = e.target;
      if (tgt && tgt.classList.contains('marks-input')){
        const tr = tgt.closest('tr');
        const gradeSel = tr.querySelector('.grade-select');
        const v = parseFloat(tgt.value);
        if (isNaN(v)) gradeSel.value = '';
        else gradeSel.value = marksToGrade(v);
        updateSummary();
      }
    });
    tbody.addEventListener('change', (e)=>{
      const tgt = e.target;
      if (tgt && tgt.classList.contains('grade-select')){
        const tr = tgt.closest('tr');
        if (tgt.value !== '') tr.querySelector('.marks-input').value = '';
        updateSummary();
      }
    });
  }
}

// Init
window.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await loadProgramme();
    populateCourseSelect();
    enableCgpaControls(true);
    bindControls();
    // set first course selected
    const firstCourse = Object.keys(programme)[0]; if (firstCourse) { $('#courseSel').value = firstCourse; $('#courseSel').dispatchEvent(new Event('change')); }
  }catch(e){ console.error('Failed to load programme structure',e); }

});