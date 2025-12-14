// --- Global state & storage ---
let currentUser = null;
let currentUserType = null;
let currentTest = null;
let testTimer = null;
let timeRemaining = 0;
let timeExpired = false;
let editingQuestionId = null;
let editingStudentId = null;
let editingStudentOriginalId = null;
let overviewChart = null;
let studentLineChart = null;
let studentBarChart = null;

// Category chip selection ('' means All)
let selectedCategoryChip = '';

let data = {
  tests: [],
  students: [],
  questions: [],
  submissions: [],
  reviews: [],
  categories: []
};
const STORAGE_KEY = 'tms_demo_data_v2';

// --- Remote store bridge ---
const rs = () => window.remoteStore;
const isRemote = () => !!(rs() && rs().isEnabled && rs().isEnabled());

async function syncFromRemote(){
  if(!isRemote()) return false;
  try {
    data.categories  = await rs().loadCategories();
    data.questions   = await rs().loadQuestions();
    data.students    = await rs().loadStudents();
    data.tests       = await rs().loadTests();
    data.submissions = await rs().loadSubmissions();
    return true;
  } catch(e){
    console.error('Remote sync failed', e);
    return false;
  }
}

// --- Persistence helpers (local cache) ---
function saveData(){
  try {
    const clone = JSON.parse(JSON.stringify(data, (k, v) => v instanceof Date ? v.toISOString() : v));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clone));
  } catch (e) { console.error('saveData failed', e); }
}
function loadData(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const parsed = JSON.parse(raw);
    data.tests = parsed.tests || [];
    data.students = parsed.students || [];
    data.questions = parsed.questions || [];
    data.submissions = (parsed.submissions || []).map(s => {
      if(s && s.submittedAt && typeof s.submittedAt === 'string') s.submittedAt = new Date(s.submittedAt);
      return s;
    });
    data.reviews = parsed.reviews || [];
    data.categories = parsed.categories || [];
    return true;
  } catch(e){ console.error('loadData failed', e); return false; }
}
function seedData(){
  data.categories = ['Database','Networking','Programming','Spreadsheet','Computer Organization'];
  data.questions = [
    {
      id: 1,
      type: 'multiple-choice',
      text: 'What does SQL stand for?',
      options: ['Structured Query Language','Simple Query Language','Standard Query Language','System Query Language'],
      correctAnswer: 'A',
      categories: ['Database'],
      difficulty: 'easy',
      reference: 'DB101',
      imageUrl: '',
      code: ''
    },
    {
      id: 2,
      type: 'multiple-choice',
      text: 'Which protocol is used for secure web communication?',
      options: ['HTTP','HTTPS','FTP','SMTP'],
      correctAnswer: 'B',
      categories: ['Networking'],
      difficulty: 'easy',
      reference: 'NET100',
      imageUrl: '',
      code: ''
    },
    {
      id: 3,
      type: 'long-answer',
      text: 'Explain the concept of normalization in databases and its benefits.',
      categories: ['Database'],
      difficulty: 'difficult',
      reference: 'DBA201',
      imageUrl: '',
      code: '-- Example:\n-- 1NF -> No repeating groups\n-- 2NF -> No partial dependency\n-- 3NF -> No transitive dependency'
    },
    {
      id: 4,
      type: 'multiple-choice',
      text: 'What is the time complexity of binary search?',
      options: ['O(n)','O(log n)','O(n²)','O(1)'],
      correctAnswer: 'B',
      categories: ['Programming'],
      difficulty: 'easy',
      reference: 'ALG100',
      imageUrl: '',
      code: ''
    },
    {
      id: 5,
      type: 'long-answer',
      text: 'Describe the OSI model and explain each layer briefly.',
      categories: ['Networking'],
      difficulty: 'medium',
      reference: 'OSI-REF',
      imageUrl: '',
      code: ''
    }
  ];
  data.students = [
    {id:'student1',name:'John Smith',password:'pass123'},
    {id:'student2',name:'Jane Doe',password:'pass123'},
    {id:'student3',name:'Mike Johnson',password:'pass123'}
  ];
  data.tests = [];
  data.submissions = [];
  data.reviews = [];
}

// --- Utilities ---
function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function escapeJs(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function getDifficultyStars(diff){ const d = String(diff || '').toLowerCase(); if(d==='easy') return '⭐'; if(d==='medium') return '⭐⭐'; if(d==='difficult') return '⭐⭐⭐'; return ''; }

// --- UI helpers ---
function hideAllScreens(){ ['loginScreen','adminDashboard','studentDashboard','testInterface','reviewInterface'].forEach(id=>document.getElementById(id)?.classList.add('hidden')); }
function showLoginScreen(){ hideAllScreens(); document.getElementById('loginScreen').classList.remove('hidden'); }
function showStudentDashboard(){
  hideAllScreens();
  const dash = document.getElementById('studentDashboard');
  dash.classList.remove('hidden');
  document.getElementById('studentWelcome').textContent = `Welcome, ${currentUser.name}`;
  setStudentActiveTab('studentTests');
  renderStudentTestsTable();
  updateDashboardStats();
}
function showAdminDashboard(){
  hideAllScreens();
  document.getElementById('adminDashboard').classList.remove('hidden');
  setAdminActiveTab('overview');
  renderTestsTable();
  renderStudentsTable();
  renderQuestionsTable();
  renderReviewsContainer();
  renderCategoriesPanel();
  renderCategoryOptions();
  renderCategoryChips();
  updateDashboardStats();
  setTimeout(renderOverview, 120);
}

// Show test & review screens for students
function showTestInterface(){
  hideAllScreens();
  document.getElementById('testInterface')?.classList.remove('hidden');
}
function showReviewInterface(){
  hideAllScreens();
  document.getElementById('reviewInterface')?.classList.remove('hidden');
}
function backToStudentDashboard(){
  showStudentDashboard();
}

// Admin tabs
function setAdminActiveTab(tab){
  const tabButtons = document.querySelectorAll('#adminDashboard .tabs .tab');
  tabButtons.forEach(btn => btn.dataset.tab===tab ? btn.classList.add('active') : btn.classList.remove('active'));
  const contents = document.querySelectorAll('#adminDashboard .tab-content');
  contents.forEach(c => c.classList.remove('active'));
  document.getElementById(`${tab}Tab`)?.classList.add('active');
  if(tab === 'overview') renderOverview();
  if(tab === 'tests') renderTestsTable();
  if(tab === 'students') renderStudentsTable();
  if(tab === 'questions'){ renderQuestionsTable(); renderCategoryChips(); }
  if(tab === 'reviews') renderReviewsContainer();
}
function switchAdminTab(tab){ setAdminActiveTab(tab); }

// Student tabs
function setStudentActiveTab(tab){
  const btns = document.querySelectorAll('#studentDashboard .tabs .tab');
  btns.forEach(b => b.dataset.tab===tab ? b.classList.add('active') : b.classList.remove('active'));
  const contents = document.querySelectorAll('#studentDashboard .tab-content');
  contents.forEach(c => c.classList.remove('active'));
  if(tab==='studentTests') document.getElementById('studentTestsTab')?.classList.add('active');
  if(tab==='studentOverview'){
    document.getElementById('studentOverviewTab')?.classList.add('active');
    renderStudentOverview();
  }
}
function switchStudentTab(tab){ setStudentActiveTab(tab); }

// Authentication
function login(type,event){
  event.preventDefault();
  if(type === 'admin'){
    const username = document.getElementById('adminUsernameInput')?.value || '';
    const password = document.getElementById('adminPasswordInput')?.value || '';
    if(username === 'admin' && password === 'admin123'){
      currentUser = { id:'admin', name:'Administrator' };
      currentUserType = 'admin';
      showAdminDashboard();
    } else alert('Invalid admin credentials');
  } else {
    const username = document.getElementById('studentIdInput')?.value || '';
    const password = document.getElementById('studentPasswordInput')?.value || '';
    const student = data.students.find(s => s.id === username && s.password === password);
    if(student){
      currentUser = student;
      currentUserType = 'student';
      showStudentDashboard();
    } else alert('Invalid student credentials');
  }
}
function logout(){
  currentUser = null; currentUserType = null; currentTest = null;
  if(testTimer){ clearInterval(testTimer); testTimer = null; }
  showLoginScreen();
}

// Dashboard stats & overview
function updateDashboardStats(){
  const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  setText('totalTests', data.tests.length);
  setText('totalStudents', data.students.length);
  setText('totalQuestions', data.questions.length);
  const pendingReviews = data.submissions.filter(s => s.answers && s.answers.some(a => a.type === 'long-answer' && !a.reviewed)).length;
  setText('pendingReviews', pendingReviews);
  setText('ov-totalTests', data.tests.length);
  setText('ov-totalStudents', data.students.length);
  setText('ov-totalQuestions', data.questions.length);
  setText('ov-pendingReviews', pendingReviews);
}
function renderOverview(){
  updateDashboardStats();
  const canvas = document.getElementById('overviewChartCanvas');
  if(!canvas) return;
  const labels = data.tests.map(t => t.name || `Test ${t.id}`);
  const values = data.tests.map(t => {
    const subs = data.submissions.filter(s => s.testId === t.id);
    return new Set(subs.map(s => s.studentId)).size;
  });
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="padding:1rem;background:var(--surface);border-radius:.5rem;border:1px solid var(--border)">${labels.length ? labels.map((l,i)=>`${escapeHtml(l)}: ${values[i]}`).join('<br>') : 'No tests to show.'}</div>`;
    return;
  }
  try{ overviewChart?.destroy(); }catch{}
  const palette = ['#6b8dfb','#10b981','#f59e0b','#ef4444','#7c3aed','#06b6d4','#f97316'];
  const bgColors = values.map((_,i)=> palette[i%palette.length]);
  overviewChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets:[{ label:'Unique students attempted', data: values, backgroundColor: bgColors, borderRadius:8 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true }, x:{ grid:{ display:false } } } }
  });
}

// Student Overview
function renderStudentOverview(){
  if(!currentUser || currentUserType!=='student') return;
  const mySubs = (data.submissions||[]).filter(s => s.studentId === currentUser.id).sort((a,b)=> (a.submittedAt||0) - (b.submittedAt||0));
  const labels = mySubs.map(s => {
    const t = data.tests.find(tt=>tt.id===s.testId);
    const date = s.submittedAt ? new Date(s.submittedAt) : null;
    const d = date ? ` (${date.toISOString().slice(0,10)})` : '';
    return `${escapeHtml(t?.name || `Test ${s.testId}`)}${d}`;
  });
  const mcScores = mySubs.map(s => {
    const mc = s.answers.filter(a=>a.type==='multiple-choice');
    const corr = mc.filter(a=>a.correct).length;
    return mc.length ? Math.round((corr/mc.length)*100) : 0;
  });
  const longScores = mySubs.map(s => {
    const long = s.answers.filter(a=>a.type==='long-answer');
    const corr = long.filter(a=>a.reviewed && a.correct).length;
    return long.length ? Math.round((corr/long.length)*100) : 0;
  });
  const totalScores = mySubs.map((s,i) => {
    const hasLong = s.answers.some(a=>a.type==='long-answer');
    const denom = hasLong ? 2 : 1;
    return Math.round(((mcScores[i] + (hasLong ? longScores[i] : 0)) / denom));
  });

  const avgTotal = totalScores.length ? Math.round(totalScores.reduce((a,b)=>a+b,0)/totalScores.length) : 0;
  const pendingLong = mySubs.reduce((sum,s)=> sum + s.answers.filter(a=>a.type==='long-answer' && !a.reviewed).length, 0);
  const statsEl = document.getElementById('studentOverviewStats');
  if(statsEl){
    statsEl.textContent = mySubs.length
      ? `Average score across ${mySubs.length} submission(s): ${avgTotal}%. Pending long-answer reviews: ${pendingLong}.`
      : 'No submissions yet. Complete a test to see your performance.';
  }

  const lineCanvas = document.getElementById('studentLineChart');
  if(lineCanvas){
    try{ studentLineChart?.destroy(); }catch{}
    studentLineChart = new Chart(lineCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Total score (%)', data: totalScores, borderColor:'#6b8dfb', backgroundColor:'rgba(107,141,251,.18)', tension:.25, fill:true, pointRadius:3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true, max:100 } },
        plugins:{ legend:{ display:true } }
      }
    });
  }

  const barCanvas = document.getElementById('studentBarChart');
  if(barCanvas){
    try{ studentBarChart?.destroy(); }catch{}
    studentBarChart = new Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'MC (%)', data: mcScores, backgroundColor:'#10b981' },
          { label:'Long (%)', data: longScores, backgroundColor:'#f59e0b' }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true, max:100 }, x:{ grid:{ display:false } } },
        plugins:{ legend:{ display:true } }
      }
    });
  }
}

// Category UI
function renderCategoryOptions(){
  const modalCatFilter = document.getElementById('modalCategoryFilter');
  if(modalCatFilter){
    modalCatFilter.innerHTML = `<option value="">All Categories</option>` + (data.categories||[]).map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }
}
function renderCategoryChips(){
  const container = document.getElementById('categoryChips');
  if(!container) return;
  const cats = ['All', ...(data.categories||[])];
  container.innerHTML = cats.map(c=>{
    const val = c === 'All' ? '' : c;
    const active = selectedCategoryChip === val ? 'active' : '';
    const isAll = c === 'All';
    const closeBtn = isAll ? '' : `<button class="chip-close" title="Delete ${escapeHtml(c)}" onclick="deleteCategoryFromChip(event,'${escapeJs(c)}')" aria-label="Delete">×</button>`;
    return `<button type="button" class="cat-chip ${active}" onclick="selectCategoryChip('${escapeJs(val)}')">${escapeHtml(c)}${closeBtn}</button>`;
  }).join('');
}
function selectCategoryChip(val){
  selectedCategoryChip = val; // '' means All
  renderCategoryChips();
  filterQuestions();
}
function deleteCategoryFromChip(e, cat){
  e.stopPropagation();
  deleteCategory(cat);
}
function renderCategoriesPanel(){
  const container = document.getElementById('categoriesList'); if(!container) return;
  container.innerHTML = (data.categories||[]).map(c=>`
    <span class="category-pill" title="${escapeHtml(c)}">
      <span>${escapeHtml(c)}</span>
      <button class="btn btn-outline btn-sm" onclick="deleteCategory('${escapeJs(c)}')" style="padding:.15rem .4rem;margin-left:.25rem">Delete</button>
    </span>
  `).join('');
  renderQuestionModalCategories();
}
function openAddCategoryModal(){
  document.getElementById('addCategoryForm')?.reset();
  // Prepare pretty inputs: set maxlength and live counter
  openModal('addCategoryModal');
  const input = document.getElementById('newCategoryInputModal');
  const counter = document.getElementById('catCharCount');
  if(input && counter){
    input.maxLength = 40;
    const update = () => {
      const len = (input.value || '').trim().length;
      counter.textContent = `${len}/${input.maxLength}`;
      const isUnique = !!input.value.trim() && !data.categories.includes(input.value.trim());
      input.classList.toggle('valid', isUnique);
    };
    input.oninput = update;
    setTimeout(()=>{ input.focus(); update(); }, 10);
  }
}
async function submitAddCategory(e){
  if(e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('newCategoryInputModal');
  const val = input?.value?.trim();
  if(!val){
    input?.classList.add('input-error');
    setTimeout(()=> input?.classList.remove('input-error'), 600);
    alert('Enter a category name');
    return;
  }
  if(data.categories.includes(val)){
    input?.classList.add('input-error');
    setTimeout(()=> input?.classList.remove('input-error'), 600);
    alert('Category already exists');
    return;
  }
  data.categories.push(val);
  if(isRemote()){
    try{ await rs().upsertCategory(val); }catch(err){ console.error(err); alert('Failed to add category remotely'); }
  }
  closeModal('addCategoryModal');
  renderCategoryOptions();
  renderCategoriesPanel();
  renderCategoryChips();
  saveData();
}
async function deleteCategory(cat){
  if(!confirm(`Delete category "${cat}"?`)) return;
  data.categories = data.categories.filter(c=>c!==cat);
  data.questions.forEach(q=>{ if(Array.isArray(q.categories)) q.categories = q.categories.filter(c=>c!==cat); });
  if(selectedCategoryChip && selectedCategoryChip === cat) selectedCategoryChip = '';
  if(isRemote()){
    try{ await rs().deleteCategory(cat); }catch(err){ console.error(err); alert('Failed to delete category remotely'); }
  }
  renderCategoryOptions(); renderCategoriesPanel(); renderCategoryChips(); renderQuestionsTable(); saveData();
}
function renderQuestionModalCategories(){
  const container=document.getElementById('categoriesContainer'); if(!container) return;
  container.innerHTML = (data.categories||[]).map(c=>`<label class="checkbox-item" style="margin-bottom:.25rem"><input type="checkbox" name="questionCategory" value="${escapeHtml(c)}" /> <span>${escapeHtml(c)}</span></label>`).join('');
}

// Tests
function openTestModal(){
  document.getElementById('testForm')?.reset();
  renderQuestionModalCategories();
  renderQuestionSelection();
  const selCount=document.getElementById('selectedCount');
  if(selCount) selCount.textContent='0';
  openModal('testModal');
}
function renderTestsTable(){
  const container=document.getElementById('testsTable'); if(!container) return;
  if(!data.tests.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No tests created yet. Create your first test!</p>`; return; }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Test Name</th><th>Duration</th><th>Questions</th><th>Assigned Students</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.tests.map(test=>`
          <tr>
            <td>${escapeHtml(test.name)}</td>
            <td>${test.duration} minutes</td>
            <td>${(test.questions||[]).length}</td>
            <td>${(test.assignedStudents||[]).length}</td>
            <td>
              <span class="action-group">
                <button class="btn btn-primary btn-sm" onclick="openAssignTestModal(${test.id})">Assign</button>
                <button class="btn btn-outline btn-sm" onclick="openResultsModal(${test.id})">View Results</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTest(${test.id})">Delete</button>
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
function openAssignTestModal(testId){ currentTest = data.tests.find(t=>t.id===testId); renderStudentSelection(); openModal('assignTestModal'); }
function renderStudentSelection(){
  const container=document.getElementById('studentSelection'); if(!container) return;
  const assigned = new Set((currentTest?.assignedStudents)||[]);
  container.innerHTML = (data.students||[]).map(s=>`<label class="checkbox-item" style="display:flex;align-items:center;gap:.35rem;margin-bottom:.35rem">
    <input type="checkbox" value="${escapeHtml(s.id)}" ${assigned.has(s.id)?'checked':''} />
    <span>${escapeHtml(s.name)} (${escapeHtml(s.id)})</span>
  </label>`).join('');
}
async function assignTestToStudents(){
  const selected=Array.from(document.querySelectorAll('#studentSelection input[type="checkbox"]:checked')).map(cb=>cb.value);
  if(currentTest) {
    currentTest.assignedStudents = selected;
    if(isRemote()){
      try{ await rs().setTestAssignments(currentTest.id, selected); }catch(err){ console.error(err); alert('Failed to assign students remotely'); }
      try{ data.tests = await rs().loadTests(); }catch{}
    }
  }
  closeModal('assignTestModal'); renderTestsTable(); saveData();
}
async function deleteTest(testId){
  if(!confirm('Are you sure you want to delete this test?')) return;
  data.tests = data.tests.filter(t=>t.id!==testId);
  data.submissions = data.submissions.filter(s=>s.testId!==testId);
  if(isRemote()){
    try{ await rs().deleteTest(testId); }catch(err){ console.error(err); alert('Failed to delete test remotely'); }
  }
  renderTestsTable(); updateDashboardStats(); saveData(); renderOverview();
}

// Students
function renderStudentsTable(){
  const container=document.getElementById('studentsTable'); if(!container) return;
  if(!data.students.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No students added yet. Add your first student!</p>`; return; }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Student ID</th><th>Name</th><th>Assigned Tests</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.students.map(s=>{
          const assigned=(data.tests||[]).filter(t=> (t.assignedStudents||[]).includes(s.id)).length;
          return `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.name)}</td><td>${assigned}</td><td>
            <span class="action-group">
              <button class="btn btn-primary btn-sm" onclick="openStudentModal('${escapeJs(s.id)}')">Modify</button>
              <button class="btn btn-outline btn-sm" onclick="resetStudent('${escapeJs(s.id)}')">Reset</button>
              <button class="btn btn-danger btn-sm" onclick="deleteStudent('${escapeJs(s.id)}')">Delete</button>
            </span>
          </td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}
function openStudentModal(studentId){
  document.getElementById('studentForm')?.reset();
  const idInput=document.getElementById('studentId');
  const nameInput=document.getElementById('studentName');
  const passInput=document.getElementById('studentPassword');
  const titleEl=document.getElementById('studentModalTitle');
  const saveBtn=document.getElementById('studentModalSaveBtn');
  if(studentId){
    const student=data.students.find(s=>s.id===studentId);
    if(!student){ alert('Student not found'); return; }
    editingStudentId=student.id; editingStudentOriginalId=student.id;
    idInput.value=student.id; nameInput.value=student.name; passInput.value=student.password;
    titleEl.textContent='Edit Student'; saveBtn.textContent='Save Changes';
    idInput.readOnly = false;
  } else {
    editingStudentId=null; editingStudentOriginalId=null;
    idInput.readOnly=false; titleEl.textContent='Add Student'; saveBtn.textContent='Add Student';
  }
  openModal('studentModal');
}
async function saveStudent(){
  const id=document.getElementById('studentId')?.value?.trim();
  const name=document.getElementById('studentName')?.value?.trim();
  const password=document.getElementById('studentPassword')?.value || '';
  if(!id || !name || !password){ alert('Please fill all fields'); return; }
  if(editingStudentId){
    const student=data.students.find(s=>s.id===editingStudentOriginalId);
    if(!student) { alert('Student not found'); return; }
    if(editingStudentOriginalId !== id){
      if(data.students.find(s=>s.id===id)){ alert('Student ID already exists'); return; }
      student.id = id;
      data.submissions.forEach(sub=>{ if(sub.studentId === editingStudentOriginalId) sub.studentId = id; });
      data.tests.forEach(t=> t.assignedStudents = (t.assignedStudents||[]).map(sid=> sid === editingStudentOriginalId ? id : sid));
    }
    student.name = name; student.password = password;
  } else {
    if(data.students.find(s=>s.id===id)){ alert('Student ID already exists'); return; }
    data.students.push({ id, name, password });
  }

  // Persist remotely
  if(isRemote()){
    try { await rs().upsertStudent({ id, name, password }); }
    catch(err){ console.error(err); alert('Failed to save student remotely'); }
    try { data.students = await rs().loadStudents(); } catch {}
  }

  editingStudentId = null; editingStudentOriginalId = null;
  closeModal('studentModal'); renderStudentsTable(); updateDashboardStats(); saveData();
}
async function resetStudent(studentId){
  if(confirm('Reset all test submissions for this student?')){
    data.submissions = data.submissions.filter(s=>s.studentId!==studentId);
    if(isRemote()){
      try{ await rs().deleteSubmissionsByStudent(studentId); }catch(err){ console.error(err); alert('Failed to reset submissions remotely'); }
    }
    saveData();
    alert('Student submissions reset.');
    updateDashboardStats();
    renderOverview();
  }
}
async function deleteStudent(studentId){
  if(!confirm('Are you sure you want to delete this student?')) return;
  data.students = data.students.filter(s=>s.id!==studentId);
  data.submissions = data.submissions.filter(s=>s.studentId!==studentId);
  data.tests.forEach(t=> t.assignedStudents = (t.assignedStudents||[]).filter(sid=>sid!==studentId));
  if(isRemote()){
    try{ await rs().deleteStudent(studentId); }catch(err){ console.error(err); alert('Failed to delete student remotely'); }
  }
  renderStudentsTable(); updateDashboardStats(); saveData();
}

// Questions
function openQuestionModal(questionId){
  editingQuestionId=null;
  document.getElementById('questionForm')?.reset();
  const img=document.getElementById('imagePreview'); if(img){ img.src=''; img.classList.add('hidden'); }
  renderQuestionModalCategories();
  document.getElementById('questionModalTitle').textContent = questionId ? 'Edit Question' : 'Add Question';
  if(questionId){
    const q=data.questions.find(x=>x.id===questionId);
    if(!q) return;
    editingQuestionId=q.id;
    document.getElementById('questionType').value=q.type||'multiple-choice';
    document.getElementById('questionText').value=q.text||'';
    if(q.type==='multiple-choice'){
      document.getElementById('optionA').value=q.options?.[0]||'';
      document.getElementById('optionB').value=q.options?.[1]||'';
      document.getElementById('optionC').value=q.options?.[2]||'';
      document.getElementById('optionD').value=q.options?.[3]||'';
      document.getElementById('correctAnswer').value=q.correctAnswer||'A';
    }
    document.getElementById('questionDifficulty').value=q.difficulty||'medium';
    document.getElementById('questionReference').value=q.reference||'';
    document.getElementById('questionImageUrl').value=q.imageUrl||'';
    if(q.imageUrl){ img.src=q.imageUrl; img.classList.remove('hidden'); }
    document.getElementById('questionCode').value=q.code||'';
    setQuestionModalCategories(q.categories||[]);
  } else setQuestionModalCategories([]);
  toggleQuestionType();
  openModal('questionModal');
}
function toggleQuestionType(){ const type=document.getElementById('questionType').value; document.getElementById('mcOptions').style.display=(type==='multiple-choice')?'block':'none'; }
function setQuestionModalCategories(selected){ document.querySelectorAll('#categoriesContainer input[type="checkbox"]').forEach(cb=> cb.checked = selected.includes(cb.value)); }
async function saveQuestion(){
  const type=document.getElementById('questionType').value;
  const text=document.getElementById('questionText').value.trim();
  const categories=Array.from(document.querySelectorAll('#categoriesContainer input[type="checkbox"]:checked')).map(cb=>cb.value);
  const difficulty=document.getElementById('questionDifficulty').value||'medium';
  const reference=document.getElementById('questionReference').value.trim();
  const imageUrl=(document.getElementById('questionImageUrl')?.value||'').trim();
  const code=(document.getElementById('questionCode')?.value||'').trim();
  if(!text){ alert('Please fill the question text'); return; }
  let question;
  if(editingQuestionId){
    question=data.questions.find(q=>q.id===editingQuestionId);
    if(!question){ alert('Question not found'); return; }
    question.type=type; question.text=text; question.categories=categories; question.difficulty=difficulty; question.reference=reference;
    question.imageUrl=imageUrl||''; question.code=code||'';
  } else {
    question={ id:Date.now(), type, text, categories, difficulty, reference, imageUrl, code };
    data.questions.push(question);
  }
  if(type==='multiple-choice'){
    const a=document.getElementById('optionA').value.trim();
    const b=document.getElementById('optionB').value.trim();
    const c=document.getElementById('optionC').value.trim();
    const d=document.getElementById('optionD').value.trim();
    const correct=document.getElementById('correctAnswer').value;
    if(!a||!b||!c||!d){ alert('Fill all options'); return; }
    question.options=[a,b,c,d]; question.correctAnswer=correct;
  } else { delete question.options; delete question.correctAnswer; }

  // Persist remotely
  if(isRemote()){
    try{
      const newId = await rs().upsertQuestion(question);
      if(editingQuestionId == null) question.id = newId;
      data.questions = await rs().loadQuestions();
    }catch(err){ console.error(err); alert('Failed to save question remotely'); }
  }

  closeModal('questionModal'); renderQuestionsTable(); renderQuestionSelection(); renderCategoriesPanel(); renderCategoryOptions(); renderCategoryChips(); updateDashboardStats(); saveData();
}
function renderRichContent(q){
  const parts=[];
  if(q.imageUrl){ parts.push(`<div class="rich-block"><img src="${escapeHtml(q.imageUrl)}" alt="Question image" class="question-image" onerror="this.style.display='none'" /></div>`); }
  if(q.code){ parts.push(`<div class="rich-block"><pre class="code-block"><code>${escapeHtml(q.code)}</code></pre></div>`); }
  return parts.join('');
}
function renderQuestionsTable(){
  const container=document.getElementById('questionsTable'); if(!container) return;
  const filtered=getFilteredQuestions('main');
  if(!filtered.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No questions found. Add your first question!</p>`; return; }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Type</th><th>Question</th><th>Difficulty</th><th>Reference</th><th>Attachments</th><th>Categories</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${filtered.map(q=>`<tr>
          <td><span class="badge ${q.type==='multiple-choice'?'badge-success':'badge-warning'}">${q.type==='multiple-choice'?'MC':'Long'}</span></td>
          <td>${escapeHtml(q.text)}</td>
          <td>${getDifficultyStars(q.difficulty)}</td>
          <td>${escapeHtml(q.reference||'')}</td>
          <td>${q.imageUrl || q.code ? `<span class="badge badge-success">Yes</span>` : `<span class="small-muted">None</span>`}</td>
          <td>${escapeHtml((q.categories||[]).join(', '))}</td>
          <td class="actions-cell">
            <span class="action-group">
              <button class="btn btn-primary btn-sm" onclick="openQuestionModal(${q.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">Delete</button>
            </span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}
function getFilteredQuestions(context){
  const categoryFilter = context==='modal'
    ? (document.getElementById('modalCategoryFilter')?.value || '')
    : selectedCategoryChip;
  const search = ((document.getElementById(context==='modal'?'modalQuestionSearch':'questionSearch')||{}).value||'').toLowerCase();
  return (data.questions||[]).filter(q=>{
    const matchCat = !categoryFilter || (q.categories||[]).includes(categoryFilter);
    const matchSearch = !search || (q.text||'').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });
}
function filterQuestions(){ renderQuestionsTable(); }
async function deleteQuestion(qid){
  if(!confirm('Delete this question?')) return;
  data.questions = data.questions.filter(q=>q.id!==qid);
  data.tests.forEach(t=> t.questions = (t.questions||[]).filter(q=>q.id!==qid));
  if(isRemote()){
    try{ await rs().deleteQuestion(qid); }catch(err){ console.error(err); alert('Failed to delete question remotely'); }
  }
  renderQuestionsTable(); renderQuestionSelection(); updateDashboardStats(); saveData();
}

// Modal question selection
function renderQuestionSelection(){
  const container=document.getElementById('questionSelection'); if(!container) return;
  const list=getFilteredQuestions('modal')||[];
  container.innerHTML = list.map(q=>`<label class="checkbox-item" style="margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border);border-radius:.25rem">
    <input type="checkbox" id="q${q.id}" value="${q.id}" onchange="updateSelectedCount()" />
    <span>
      <strong>[${q.type==='multiple-choice'?'MC':'Long'}]</strong> ${escapeHtml(q.text)}
      ${q.imageUrl || q.code ? `<span class="badge badge-success" style="margin-left:.35rem">Attachment</span>` : ''}
      <br>
      <small class="small-muted">
        Difficulty: ${getDifficultyStars(q.difficulty || 'medium')}
        ${q.reference?` — Ref: ${escapeHtml(q.reference)}`:''}
        ${(q.categories||[]).length?` — Categories: ${escapeHtml((q.categories||[]).join(', '))}`:''}
      </small>
    </span>
  </label>`).join('');
  updateSelectedCount();
}
function updateSelectedCount(){ const el=document.getElementById('selectedCount'); if(el) el.textContent = document.querySelectorAll('#questionSelection input[type="checkbox"]:checked').length; }
function filterModalQuestions(){ renderQuestionSelection(); }

async function saveTest(){
  const name=document.getElementById('testName')?.value?.trim();
  const duration=parseInt(document.getElementById('testDuration')?.value);
  const selectedQuestions=Array.from(document.querySelectorAll('#questionSelection input[type="checkbox"]:checked')).map(cb=>parseInt(cb.value));
  if(!name || !duration || selectedQuestions.length===0){ alert('Please fill all fields and select at least one question'); return; }
  const snapshotQuestions = selectedQuestions
    .map(id=>JSON.parse(JSON.stringify(data.questions.find(q=>q.id===id))))
    .filter(Boolean);

  const test={ name, duration, questions:snapshotQuestions, assignedStudents:[], createdAt:new Date() };

  if(isRemote()){
    try{
      const newId = await rs().createTest(test);
      test.id = newId;
      data.tests = await rs().loadTests();
    }catch(err){ console.error(err); alert('Failed to create test remotely'); return; }
  } else {
    test.id = Date.now();
    data.tests.push(test);
  }

  closeModal('testModal'); renderTestsTable(); updateDashboardStats(); saveData(); renderOverview();
}

// Reviews
function renderReviewsContainer(){
  const container=document.getElementById('reviewsContainer'); if(!container) return;
  const pending=(data.submissions||[]).filter(s=> (s.answers||[]).some(a=> a.type==='long-answer' && !a.reviewed));
  if(!pending.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No pending long answer reviews.</p>`; return; }
  container.innerHTML = pending.map(sub=>{
    const student=data.students.find(s=>s.id===sub.studentId);
    const test=data.tests.find(t=>t.id===sub.testId);
    const longAnswers=(sub.answers||[]).filter(a=>a.type==='long-answer' && !a.reviewed);
    return `<div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <div class="card-title">${escapeHtml(test?.name||`Test ${sub.testId}`)} - ${escapeHtml(student?.name||sub.studentId)}</div>
      </div>
      <div class="card-body">
        ${longAnswers.map(ans=>`
          <div class="question-container">
            <div class="question-number">Question ${ans.questionIndex+1}</div>
            <div class="question-text">${escapeHtml(ans.question)}</div>
            ${renderRichContent(test.questions[ans.questionIndex] || {})}
            <div style="background:rgba(148,163,184,.12);padding:1rem;border-radius:.25rem;margin:1rem 0">
              <strong>Student Answer:</strong><br>${escapeHtml(ans.answer||'<em>No answer provided</em>')}
            </div>
            <div class="comment-group">
              <textarea placeholder="Add a constructive comment for the student..." id="comment-${sub.id}-${ans.questionIndex}" class="comment-input"></textarea>
              <button class="btn btn-success btn-sm" onclick="gradeAnswer(${sub.id}, ${ans.questionIndex}, true)">Mark Correct</button>
              <button class="btn btn-danger btn-sm" onclick="gradeAnswer(${sub.id}, ${ans.questionIndex}, false)">Mark Wrong</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}
async function gradeAnswer(submissionId, questionIndex, isCorrect){
  const comment=document.getElementById(`comment-${submissionId}-${questionIndex}`)?.value || '';
  const submission=data.submissions.find(s=>s.id===submissionId); if(!submission){ alert('Submission not found'); return; }
  const answer=(submission.answers||[]).find(a=>a.questionIndex===questionIndex); if(!answer){ alert('Answer not found'); return; }
  answer.reviewed=true; answer.correct=isCorrect; answer.comment=comment;

  if(isRemote()){
    try{ await rs().gradeAnswer(submissionId, questionIndex, isCorrect, comment); }
    catch(err){ console.error(err); alert('Failed to grade remotely'); }
  }

  saveData(); renderReviewsContainer(); updateDashboardStats();
}

// Student dashboard
function renderStudentTestsTable(){
  const container=document.getElementById('studentTestsTable'); if(!container) return;
  const assigned=(data.tests||[]).filter(t=> (t.assignedStudents||[]).includes(currentUser.id));
  if(!assigned.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No tests assigned to you yet.</p>`; return; }
  container.innerHTML = `<table class="table"><thead><tr><th>Test Name</th><th>Duration</th><th>Questions</th><th>Pending Reviews</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    assigned.map(test=>{
      const submission=(data.submissions||[]).find(s=>s.testId===test.id && s.studentId===currentUser.id);
      const status=submission ? 'Completed' : 'Not Started';
      const pending=submission ? (submission.answers||[]).filter(a=> a.type==='long-answer' && !a.reviewed).length : 0;
      return `<tr>
        <td>${escapeHtml(test.name)}</td>
        <td>${test.duration} minutes</td>
        <td>${test.questions.length}</td>
        <td>${pending>0?`<span class="badge badge-warning">${pending} pending</span>`:`<span class="badge badge-success">None</span>`}</td>
        <td>${status==='Completed'?`<span class="badge badge-success">Completed</span>`:`<span class="badge badge-warning">Not Started</span>`}</td>
        <td>
          <span class="action-group">
            ${status==='Completed'
              ? `<button class="btn btn-outline btn-sm" onclick="reviewTest(${test.id})">Review</button>`
              : `<button class="btn btn-primary btn-sm" onclick="startTest(${test.id})">Start</button>`
            }
            <button class="btn btn-outline btn-sm" onclick="openStudentResultModal(${test.id}, '${escapeJs(currentUser.id)}')">Result</button>
          </span>
        </td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
}
function startTest(testId){
  currentTest=data.tests.find(t=>t.id===testId); if(!currentTest){ alert('Test not found'); return; }
  timeRemaining=(currentTest.duration||0)*60; timeExpired=false;
  document.getElementById('testTitle').textContent=currentTest.name;
  document.getElementById('timeExpiredNote').style.display='none';
  renderTestQuestions(); updateTimerUI(); startTimer(); showTestInterface();
}
function renderTestQuestions(){
  const container=document.getElementById('testQuestions'); if(!container || !currentTest) return;
  const withIndex=currentTest.questions.map((q,idx)=>({ q, origIndex:idx }));
  const mc=withIndex.filter(x=>x.q.type==='multiple-choice');
  const long=withIndex.filter(x=>x.q.type==='long-answer');
  let html='';
  if(mc.length){ html+=`<div style="margin-bottom:.6rem"><strong>Section A — Multiple Choice</strong></div>`;
    mc.forEach(({q,origIndex},displayIdx)=>{
      html+=`<div class="question-container" id="qc-${origIndex}">
        <div class="question-number">Question ${displayIdx+1}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        ${renderRichContent(q)}
        <div class="options" id="options-${origIndex}">
          ${(q.options||[]).map((opt,i)=>`<div class="option" id="option-${origIndex}-${i}" onclick="selectRadio('q${origIndex}','q${origIndex}o${i}')"><input type="radio" name="q${origIndex}" value="${'ABCD'[i]||String.fromCharCode(65+i)}" id="q${origIndex}o${i}" /> ${'ABCD'[i]||String.fromCharCode(65+i)}. ${escapeHtml(opt)}</div>`).join('')}
        </div>
      </div>`;
    });
  }
  if(long.length){ html+=`<div style="margin:.8rem 0;"><strong>Section B — Long Answers</strong></div>`;
    long.forEach(({q,origIndex},displayIdx)=>{
      html+=`<div class="question-container" id="qc-${origIndex}">
        <div class="question-number">Question ${displayIdx+1}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        ${renderRichContent(q)}
        <textarea class="form-control input-pill" rows="5" placeholder="Enter your answer here..." id="longAnswer${origIndex}"></textarea>
      </div>`;
    });
  }
  container.innerHTML=html;
  document.getElementById('submitTestBtn')?.removeAttribute('disabled');
}
function selectRadio(groupName, radioId){ const r=document.getElementById(radioId); if(r) r.checked=true; }
function setTestInputsDisabled(disabled){
  document.querySelectorAll('#testQuestions input, #testQuestions textarea').forEach(el=>{ el.disabled=disabled; if(el.tagName==='TEXTAREA') el.readOnly=disabled; });
  const optionDivs=document.querySelectorAll('#testQuestions .option'); optionDivs.forEach(d=> disabled ? d.classList.add('disabled') : d.classList.remove('disabled'));
  const submitBtn=document.getElementById('submitTestBtn'); if(submitBtn) submitBtn.disabled=disabled;
}
function startTimer(){
  const timerElement=document.getElementById('testTimer'); const timerTime=document.getElementById('testTimerTime');
  if(testTimer) clearInterval(testTimer);
  testTimer=setInterval(()=>{
    timeRemaining--;
    if(timeRemaining<=0){
      clearInterval(testTimer); testTimer=null; timeRemaining=0; timeExpired=true;
      timerElement.classList.remove('warning'); timerElement.classList.add('expired');
      timerTime.textContent=`Time's up`;
      setTestInputsDisabled(true);
      submitTest(true);
      return;
    }
    updateTimerUI();
  },1000);
}
function updateTimerUI(){
  const timerElement=document.getElementById('testTimer'); const timerTime=document.getElementById('testTimerTime');
  const minutes=Math.floor(timeRemaining/60); const seconds=timeRemaining%60;
  if(timerTime) timerTime.textContent=`${minutes}:${String(seconds).padStart(2,'0')}`;
  if(timeRemaining<=60) timerElement.classList.add('warning'); else timerElement.classList.remove('warning');
}
async function submitTest(autoSubmit=false){
  if(!autoSubmit){ if(!confirm('Are you sure you want to submit the test? Once submitted you cannot change your answers.')) return; }
  if(testTimer){ clearInterval(testTimer); testTimer=null; }
  const answers=(currentTest.questions||[]).map((question,index)=>{
    const a={ questionIndex:index, question:question.text, type:question.type };
    if(question.type==='multiple-choice'){
      const sel=document.querySelector(`#testQuestions input[name="q${index}"]:checked`);
      a.answer=sel ? sel.value : null; a.correct=a.answer===question.correctAnswer;
    } else {
      const ta=document.getElementById(`longAnswer${index}`); a.answer=ta ? ta.value : ''; a.reviewed=false;
    }
    return a;
  });
  const submission={ id:Date.now(), testId:currentTest.id, studentId:currentUser.id, answers, submittedAt:new Date() };

  // Local uniqueness
  data.submissions = (data.submissions||[]).filter(s=> !(s.testId===submission.testId && s.studentId===submission.studentId));
  data.submissions.push(submission);

  if(isRemote()){
    try{
      const subId = await rs().upsertSubmission(submission);
      submission.id = subId;
      data.submissions = await rs().loadSubmissions();
    }catch(err){ console.error(err); alert('Failed to submit test remotely'); }
  }

  saveData();
  if(autoSubmit){ document.getElementById('timeExpiredNote').style.display='block'; alert('Time is up. Your answers were automatically submitted.'); }
  else alert('Test submitted successfully!');
  setTestInputsDisabled(true);
  showStudentDashboard();
  updateDashboardStats();
  renderOverview();
}
function reviewBeforeSubmit(){ window.scrollTo({ top:0, behavior:'smooth' }); alert('Scroll through your answers. When you are ready click "Submit Test".'); }
function reviewTest(testId){
  const test=data.tests.find(t=>t.id===testId);
  const submission=data.submissions.find(s=>s.testId===testId && s.studentId===currentUser.id);
  if(!submission){ alert('No submission found for this test.'); return; }
  document.getElementById('reviewTitle').textContent=`${test.name} - Review`;
  document.getElementById('reviewTestTitle').textContent=test.name;
  const mcAnswers=submission.answers.filter(a=>a.type==='multiple-choice');
  const longAnswers=submission.answers.filter(a=>a.type==='long-answer');
  const mcCorrect=mcAnswers.filter(a=>a.correct).length;
  const longCorrect=longAnswers.filter(a=>a.reviewed && a.correct).length;
  const longPending=longAnswers.filter(a=>!a.reviewed).length;
  let scoreText=`MC Score: ${mcCorrect}/${mcAnswers.length}`;
  if(longAnswers.length>0){ scoreText+=` | Long Answer: ${longCorrect}/${longAnswers.length}`; if(longPending>0) scoreText+=` (${longPending} pending review)`; }
  document.getElementById('reviewScore').textContent=scoreText;
  renderReviewQuestions(submission,test);
  showReviewInterface();
}
function renderReviewQuestions(submission,test){
  const container=document.getElementById('reviewQuestions'); if(!container) return;
  const mcAnswers=submission.answers.filter(a=>a.type==='multiple-choice');
  const longAnswers=submission.answers.filter(a=>a.type==='long-answer');
  const parts=[];
  if(mcAnswers.length){ parts.push(`<div style="margin-bottom:.5rem"><strong>Section A — Multiple Choice</strong></div>`);
    mcAnswers.forEach(answer=>{
      const q=test.questions[answer.questionIndex]||{};
      const optionsHtml=(q.options||[]).map((opt,i)=>{
        const letter='ABCD'[i]||String.fromCharCode(65+i);
        const isCorrect=q.correctAnswer===letter; const isSelected=answer.answer===letter;
        const selectedBadge=isSelected ? `<span class="badge ${isCorrect?'badge-success':'badge-warning'}" style="margin-left:.5rem">${isCorrect?'Selected & Correct':'Selected'}</span>` : '';
        const correctBadge=(isCorrect && !isSelected) ? `<span class="badge badge-success" style="margin-left:.5rem">Correct</span>` : '';
        const bg=isSelected ? 'rgba(99,102,241,.10)' : 'transparent';
        return `<div style="padding:.5rem;border:1px solid var(--border);border-radius:.25rem;margin-bottom:.25rem;background:${bg}">${letter}. ${escapeHtml(opt)} ${selectedBadge}${correctBadge}</div>`;
      }).join('');
      const studentAnswerText = answer.answer ? `${answer.answer}. ${escapeHtml((q.options||[])[ 'ABCD'.indexOf(answer.answer) ] || '')}` : '<em>No answer</em>';
      const correctnessBadge = (answer.answer == null) ? `<span class="badge badge-warning">No Answer</span>` : (answer.correct ? `<span class="badge badge-success">Correct</span>` : `<span class="badge badge-danger">Wrong</span>`);
      parts.push(`
        <div class="question-container">
          <div class="question-number">Question ${answer.questionIndex+1}</div>
          <div class="question-text">${escapeHtml(q.text||answer.question)}</div>
          ${renderRichContent(q)}
          <div style="margin:1rem 0">${optionsHtml}</div>
          <div style="margin-top:.5rem"><strong>Student selection:</strong> ${studentAnswerText} ${correctnessBadge}</div>
        </div>`);
    });
  }
  if(longAnswers.length){ parts.push(`<div style="margin:1rem 0;"><strong>Section B — Long Answers</strong></div>`);
    longAnswers.forEach(answer=>{
      const q=test.questions[answer.questionIndex]||{};
      const status=answer.reviewed ? (answer.correct ? `<span class="badge badge-success">Checked: Correct</span>` : `<span class="badge badge-danger">Checked: Wrong</span>`) : `<span class="badge badge-warning">Pending Review</span>`;
      const comment=answer.comment ? `<br><small><strong>Teacher:</strong> ${escapeHtml(answer.comment)}</small>` : '';
      parts.push(`
        <div class="question-container">
          <div class="question-number">Question ${answer.questionIndex+1}</div>
          <div class="question-text">${escapeHtml(q.text||answer.question)}</div>
          ${renderRichContent(q)}
          <div style="background:rgba(148,163,184,.12);padding:1rem;border-radius:.25rem;margin:1rem 0"><strong>Your Answer:</strong><br>${escapeHtml(answer.answer||'<em>No answer provided</em>')}</div>
          <div>${status}${comment}</div>
        </div>`);
    });
  }
  container.innerHTML=parts.join('');
}

// Results modal
function openResultsModal(testId){
  const test=data.tests.find(t=>t.id===testId); if(!test) return;
  currentTest=test;
  const assigned=test.assignedStudents||[];
  const rows=assigned.map(studentId=>{
    const student=data.students.find(s=>s.id===studentId)||{ name:'' };
    const submission=data.submissions.find(s=>s.testId===test.id && s.studentId===studentId);
    if(!submission) return { studentId, name:student.name, status:'Not Started', mcCorrect:0, mcTotal:test.questions.filter(q=>q.type==='multiple-choice').length, longCorrect:0, longTotal:test.questions.filter(q=>q.type==='long-answer').length, longPending:0 };
    const mcQuestions=submission.answers.filter(a=>a.type==='multiple-choice'); const mcCorrect=mcQuestions.filter(a=>a.correct).length;
    const longQuestions=submission.answers.filter(a=>a.type==='long-answer'); const longCorrect=longQuestions.filter(a=>a.reviewed && a.correct).length; const longPending=longQuestions.filter(a=>!a.reviewed).length;
    return { studentId, name:student.name, status:'Completed', mcCorrect, mcTotal:mcQuestions.length, longCorrect, longTotal:longQuestions.length, longPending };
  });
  const tbody=rows.map(r=>`<tr>
    <td>${escapeHtml(r.studentId)}</td>
    <td>${escapeHtml(r.name)}</td>
    <td>${r.status==='Completed'?`<span class="badge badge-success">Completed</span>`:`<span class="badge badge-warning">Not Started</span>`}</td>
    <td>${r.mcCorrect}/${r.mcTotal}</td>
    <td>${r.longCorrect}/${r.longTotal} ${r.longPending>0?`(<span class="badge badge-warning">${r.longPending} pending</span>)`:''}</td>
    <td>
      <span class="action-group">
        <button class="btn btn-outline btn-sm" onclick="openStudentResultModal(${test.id}, '${escapeJs(r.studentId)}')">View</button>
      </span>
    </td>
  </tr>`).join('');
  const bodyHtml=`<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div><strong>${escapeHtml(test.name)}</strong><br><span class="small-muted">${test.questions.length} questions • ${test.duration} minutes</span></div>
      <div>
        <button class="btn btn-outline btn-sm" onclick="exportResults(${test.id})">Export CSV</button>
      </div>
    </div>
    <table class="table">
      <thead><tr><th>Student ID</th><th>Name</th><th>Status</th><th>MC</th><th>Long</th><th>Actions</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>`;
  document.getElementById('resultsModalBody').innerHTML=bodyHtml;
  openModal('resultsModal');
}
function exportResults(testId){
  const test=data.tests.find(t=>t.id===testId); if(!test) return;
  const header=['studentId','name','status','mcCorrect','mcTotal','longCorrect','longTotal','longPending'];
  const rows=(test.assignedStudents||[]).map(studentId=>{
    const student=data.students.find(s=>s.id===studentId)||{ name:'' };
    const submission=data.submissions.find(s=>s.testId===test.id && s.studentId===studentId);
    if(!submission) return [studentId, student.name, 'Not Started', 0, test.questions.filter(q=>q.type==='multiple-choice').length, 0, test.questions.filter(q=>q.type==='long-answer').length, 0];
    const mcQuestions=submission.answers.filter(a=>a.type==='multiple-choice'); const mcCorrect=mcQuestions.filter(a=>a.correct).length;
    const longQuestions=submission.answers.filter(a=>a.type==='long-answer'); const longCorrect=longQuestions.filter(a=>a.reviewed && a.correct).length; const longPending=longQuestions.filter(a=>!a.reviewed).length;
    return [studentId, student.name, 'Completed', mcCorrect, mcQuestions.length, longCorrect, longQuestions.length, longPending];
  });
  const csv=[header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`${test.name.replace(/\s+/g,'_')}_results.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function openStudentResultModal(testId, studentId){
  const test=data.tests.find(t=>t.id===testId);
  const student=data.students.find(s=>s.id===studentId)||{ name:'' };
  const submission=data.submissions.find(s=>s.testId===testId && s.studentId===studentId);
  let content=`<div><strong>${escapeHtml(student.name)} (${escapeHtml(studentId)})</strong><br><span class="small-muted">${escapeHtml(test?test.name:'')}</span></div><div style="margin-top:1rem">`;
  if(!submission) content+=`<p class="small-muted">Student has not started the test.</p>`;
  else {
    const mcAnswers=submission.answers.filter(a=>a.type==='multiple-choice');
    const longAnswers=submission.answers.filter(a=>a.type==='long-answer');
    if(mcAnswers.length){
      content+=`<div style="margin-bottom:.5rem"><strong>Section A — Multiple Choice</strong></div>`;
      mcAnswers.forEach(answer=>{
        const q=test.questions[answer.questionIndex]||{};
        const optionsHtml=(q.options||[]).map((opt,i)=>{ const letter='ABCD'[i]||String.fromCharCode(65+i); const isCorrect=q.correctAnswer===letter; const isSelected=answer.answer===letter; const selBadge=isSelected?`<span class="badge ${isCorrect?'badge-success':'badge-warning'}" style="margin-left:.5rem">${isCorrect?'Selected & Correct':'Selected'}</span>`:''; const corrBadge=(isCorrect&&!isSelected)?`<span class="badge badge-success" style="margin-left:.5rem">Correct</span>`:''; const bg=isSelected?'rgba(99,102,241,.10)':'transparent'; return `<div style="padding:.5rem;border:1px solid var(--border);border-radius:.25rem;margin-bottom:.25rem;background:${bg}">${letter}. ${escapeHtml(opt)} ${selBadge}${corrBadge}</div>`; }).join('');
        const studentAnswerText=answer.answer ? `${answer.answer}. ${ escapeHtml((q.options||[])[ 'ABCD'.indexOf(answer.answer) ] || '' )}` : '<em>No answer</em>';
        content+=`<div class="question-container"><div class="question-number">Question ${answer.questionIndex+1}</div><div class="question-text">${escapeHtml(q.text||answer.question)}</div>${renderRichContent(q)}<div style="margin:1rem 0">${optionsHtml}</div><div style="margin-top:.5rem"><strong>Student selection:</strong> ${studentAnswerText} ${answer.answer==null?`<span class="badge badge-warning">No Answer</span>`:(answer.correct?`<span class="badge badge-success">Correct</span>`:`<span class="badge badge-danger">Wrong</span>`)}</div></div>`;
      });
    }
    if(longAnswers.length){
      content+=`<div style="margin:1rem 0;"><strong>Section B — Long Answers</strong></div>`;
      longAnswers.forEach(answer=>{
        const q=test.questions[answer.questionIndex]||{};
        const status=answer.reviewed ? (answer.correct ? `<span class="badge badge-success">Checked: Correct</span>` : `<span class="badge badge-danger">Checked: Wrong</span>`) : `<span class="badge badge-warning">Pending Review</span>`;
        const comment=answer.comment ? `<br><small><strong>Teacher:</strong> ${escapeHtml(answer.comment)}</small>` : '';
        content+=`<div class="question-container"><div class="question-number">Question ${answer.questionIndex+1}</div><div class="question-text">${escapeHtml(q.text||answer.question)}</div>${renderRichContent(q)}<div style="background:rgba(148,163,184,.12);padding:1rem;border-radius:.25rem;margin:1rem 0"><strong>Your Answer:</strong><br>${escapeHtml(answer.answer||'<em>No answer provided</em>')}</div><div>${status}${comment}</div></div>`;
      });
    }
  }
  content+=`</div>`;
  document.getElementById('studentResultModalTitle').textContent=`Result — ${student.name}`;
  document.getElementById('studentResultModalBody').innerHTML=content;
  openModal('studentResultModal');
}

// Export / Import and backup
function exportQuestionsCSV(){
  if(!data.questions.length){ alert('No questions to export'); return; }
  const header=['id','type','text','options_json','correctAnswer','difficulty','reference','categories','imageUrl','code'];
  const rows=data.questions.map(q=> [q.id,q.type,q.text,q.options?JSON.stringify(q.options):'',q.correctAnswer||'',q.difficulty||'',q.reference||'',(q.categories||[]).join('|'),q.imageUrl||'',q.code||'']);
  const csv=[header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`questions_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('Questions exported as CSV.');
}
function downloadDataBackup(){
  const payload=JSON.parse(JSON.stringify(data,(k,v)=> v instanceof Date ? v.toISOString() : v ));
  const blob=new Blob([JSON.stringify(payload, null, 2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`tms_backup_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function importDataBackup(event){
  const file = event.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const parsed = JSON.parse(e.target.result || '{}');
      if(typeof parsed !== 'object'){ alert('Invalid backup file.'); return; }
      data.tests = Array.isArray(parsed.tests) ? parsed.tests : [];
      data.students = Array.isArray(parsed.students) ? parsed.students : [];
      data.questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      data.submissions = Array.isArray(parsed.submissions) ? parsed.submissions.map(s=>{
        if(s && s.submittedAt && typeof s.submittedAt === 'string') s.submittedAt = new Date(s.submittedAt);
        return s;
      }) : [];
      data.reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
      data.categories = Array.isArray(parsed.categories) ? parsed.categories : [];

      saveData();
      renderAll();
      updateDashboardStats();
      alert('Backup imported successfully.');
    } catch(err){
      console.error(err);
      alert('Failed to import backup. Ensure it is a valid JSON file.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}
function parseCSV(text){
  const lines=text.split(/\r\n|\n/).filter(l=>l.trim()!==''); if(!lines.length) return [];
  const rows=[];
  for(const line of lines){
    const row=[]; let i=0,cur='',inQ=false;
    while(i<line.length){
      const ch=line[i];
      if(inQ){
        if(ch==='"'){
          if(i+1<line.length && line[i+1]==='"'){ cur+='"'; i+=2; continue; }
          inQ=false; i++;
        } else { cur+=ch; i++; }
      } else {
        if(ch==='"'){ inQ=true; i++; }
        else if(ch===','){ row.push(cur); cur=''; i++; }
        else { cur+=ch; i++; }
      }
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}
function importQuestionsCSV(event){
  const file=event.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const rows=parseCSV(e.target.result||''); if(rows.length<1){ alert('CSV appears empty'); event.target.value=''; return; }
      const header=rows[0].map(h=>(h||'').trim()); const idx={}; header.forEach((h,i)=> idx[h.toLowerCase()] = i);
      let added=0,updated=0,skipped=0;
      for(let r=1;r<rows.length;r++){
        const row=rows[r]; const obj={}; for(const key in idx){ obj[key]=(row[idx[key]]||'').trim(); }
        if(!obj['type'] || !obj['text']){ skipped++; continue; }
        const type=obj['type'].toLowerCase();
        const textField=obj['text'];
        const difficulty=obj['difficulty']||'medium';
        const reference=obj['reference']||'';
        const categories=obj['categories']?obj['categories'].split('|').map(s=>s.trim()).filter(Boolean):[];
        const imageUrl=obj['imageurl']||obj['image_url']||'';
        const code=obj['code']||'';
        let options=null; if(obj['options_json']){ try{ options=JSON.parse(obj['options_json']); if(!Array.isArray(options)) options=null; }catch{} }
        const correctAnswer=obj['correctanswer']||obj['correct_answer']||'';
        const idStr=obj['id']||'';
        const existing=idStr ? data.questions.find(q=>String(q.id)===String(idStr)) : null;
        if(existing){
          existing.type=type; existing.text=textField; existing.difficulty=difficulty; existing.reference=reference; existing.categories=categories; existing.imageUrl=imageUrl; existing.code=code;
          if(type==='multiple-choice'){
            if(options && options.length>=4) existing.options=options;
            if(correctAnswer) existing.correctAnswer=correctAnswer;
          } else { delete existing.options; delete existing.correctAnswer; }
          updated++;
        } else {
          const newId = idStr ? (isNaN(Number(idStr)) ? Date.now()+Math.floor(Math.random()*1000) : Number(idStr)) : Date.now()+Math.floor(Math.random()*1000);
          const newQ={ id:newId, type, text:textField, difficulty, reference, categories, imageUrl, code };
          if(type==='multiple-choice'){
            if(options && options.length>=4) newQ.options=options;
            else {
              const maybeA=obj['a']||obj['optiona']||'', maybeB=obj['b']||obj['optionb']||'', maybeC=obj['c']||obj['optionc']||'', maybeD=obj['d']||obj['optiond']||'';
              if(maybeA&&maybeB&&maybeC&&maybeD) newQ.options=[maybeA,maybeB,maybeC,maybeD]; else { skipped++; continue; }
            }
            if(correctAnswer) newQ.correctAnswer=correctAnswer; else { skipped++; continue; }
          }
          data.questions.push(newQ); added++;
        }
        categories.forEach(c=>{ if(c && !data.categories.includes(c)) data.categories.push(c); });
      }
      saveData(); renderAll(); updateDashboardStats();
      alert(`CSV import completed: ${added} added, ${updated} updated, ${skipped} skipped.`);
    } catch(err){ console.error(err); alert('Failed to import CSV. Check format and try again.'); } finally { event.target.value=''; }
  };
  reader.readAsText(file);
}
function exportStudentsCSV(){
  if(!data.students.length){ alert('No students to export'); return; }
  const header=['id','name','password'];
  const rows=data.students.map(s=>[s.id,s.name,s.password]);
  const csv=[header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`students_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('Students exported as CSV.');
}
function importStudentsCSV(event){
  const file=event.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const rows=parseCSV(e.target.result||''); if(rows.length<2){ alert('CSV appears empty or missing header'); event.target.value=''; return; }
      const header=rows[0].map(h=>(h||'').trim().toLowerCase()); const idx={}; header.forEach((h,i)=> idx[h]=i);
      if(idx['id']===undefined || idx['name']===undefined){ alert('CSV must include id and name columns'); event.target.value=''; return; }
      let added=0,updated=0,skipped=0;
      for(let r=1;r<rows.length;r++){
        const row=rows[r];
        const id=(row[idx['id']]||'').trim();
        const name=(row[idx['name']]||'').trim();
        const password=idx['password']!==undefined ? (row[idx['password']]||'').trim() : 'pass123';
        if(!id || !name){ skipped++; continue; }
        const existing=data.students.find(s=>String(s.id)===id);
        if(existing){ existing.name=name; existing.password=password||existing.password||'pass123'; updated++; }
        else { data.students.push({ id, name, password: password||'pass123' }); added++; }
      }
      saveData(); renderStudentsTable(); updateDashboardStats();
      alert(`Students CSV import: ${added} added, ${updated} updated, ${skipped} skipped.`);
    } catch(err){ console.error(err); alert('Failed to import Students CSV. Check format and try again.'); } finally { event.target.value=''; }
  };
  reader.readAsText(file);
}

// Misc
function renderAll(){ renderCategoryOptions(); renderCategoriesPanel(); renderTestsTable(); renderStudentsTable(); renderQuestionsTable(); renderReviewsContainer(); renderOverview(); }
function clearAllData(){ if(!confirm('This will reset demo data to factory seed. Continue?')) return; seedData(); saveData(); renderAll(); updateDashboardStats(); alert('Demo data reset.'); }
function openModal(id){ document.getElementById(id)?.classList.add('show'); }
function closeModal(id){
  document.getElementById(id)?.classList.remove('show');
  if(id==='studentModal'){
    const idInput=document.getElementById('studentId'); if(idInput) idInput.readOnly=false;
    document.getElementById('studentModalTitle').textContent='Add Student';
    document.getElementById('studentModalSaveBtn').textContent='Add Student';
    editingStudentId=null; editingStudentOriginalId=null;
  }
}
function handleDropZoneDragOver(e){ e.preventDefault(); document.getElementById('imageDropZone')?.classList.add('dragover'); }
function handleDropZoneDragLeave(e){ document.getElementById('imageDropZone')?.classList.remove('dragover'); }
function handleDropZoneDrop(e){ e.preventDefault(); document.getElementById('imageDropZone')?.classList.remove('dragover'); const file=e.dataTransfer?.files?.[0]; if(file) processImageFile(file); }
function handleImageFileInput(e){ const file=e.target.files?.[0]; if(file) processImageFile(file); }
function processImageFile(file){
  if(!file.type.startsWith('image/')){ alert('Please drop an image file'); return; }
  const reader=new FileReader();
  reader.onload=function(ev){
    const dataUrl=ev.target.result;
    const img=document.getElementById('imagePreview');
    const urlInput=document.getElementById('questionImageUrl');
    if(img){ img.src=dataUrl; img.classList.remove('hidden'); }
    if(urlInput){ urlInput.value=dataUrl; }
  };
  reader.readAsDataURL(file);
}

// Login tab helpers
function switchLoginTab(which){
  const admin = document.getElementById('adminLogin');
  const student = document.getElementById('studentLogin');
  const buttons = document.querySelectorAll('.login-tabs .tab');
  if(which === 'admin'){
    admin.classList.add('active'); admin.removeAttribute('aria-hidden');
    student.classList.remove('active'); student.setAttribute('aria-hidden','true');
    buttons[0]?.classList.add('active'); buttons[0]?.setAttribute('aria-selected','true');
    buttons[1]?.classList.remove('active'); buttons[1]?.setAttribute('aria-selected','false');
  } else {
    student.classList.add('active'); student.removeAttribute('aria-hidden');
    admin.classList.remove('active'); admin.setAttribute('aria-hidden','true');
    buttons[1]?.classList.add('active'); buttons[1]?.setAttribute('aria-selected','true');
    buttons[0]?.classList.remove('active'); buttons[0]?.setAttribute('aria-selected','false');
  }
}
function toggleLoginPassword(which){
  const inputId = which === 'admin' ? 'adminPasswordInput' : 'studentPasswordInput';
  const btnId = which === 'admin' ? 'adminPwToggle' : 'studentPwToggle';
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if(!input || !btn) return;
  const showing = input.getAttribute('data-show') === '1';
  input.type = showing ? 'password' : 'text';
  input.setAttribute('data-show', showing ? '0' : '1');
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

// Init
window.addEventListener('load', async ()=>{
  const synced = await syncFromRemote();
  if(!synced && !loadData()){ seedData(); saveData(); }
  renderCategoryOptions(); renderCategoriesPanel(); renderCategoryChips();
  updateDashboardStats();
  showLoginScreen();
});
document.addEventListener('DOMContentLoaded', ()=>{
  const adminTabs=document.querySelectorAll('#adminDashboard .tabs .tab');
  adminTabs.forEach(btn=>btn.addEventListener('click',()=>{ adminTabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }));
  const studentTabs=document.querySelectorAll('#studentDashboard .tabs .tab');
  studentTabs.forEach(btn=>btn.addEventListener('click',()=>{ studentTabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }));
  const dz=document.getElementById('imageDropZone'); const fileInput=document.getElementById('questionImageFile');
  if(dz && fileInput){ dz.addEventListener('click',(e)=>{ if(e.target && e.target.id==='imagePreview') return; fileInput.click(); }); }
});


function updateRemoteStatusBadge() {
  const el = document.getElementById('remoteStatus');
  if (!el) return;
  if (isRemote()) {
    el.textContent = 'Remote: Supabase ✓';
    el.style.color = '#10b981'; // green
  } else {
    el.textContent = 'Remote: OFF (localStorage)';
    el.style.color = '#ef4444'; // red
  }
}

async function forceRemoteSync() {
  if (!isRemote()) { alert('Remote store is disabled. Check Supabase URL/key.'); return; }
  try {
    const ok = await syncFromRemote();
    if (!ok) { alert('Remote sync failed. Check console for errors.'); }
    renderAll();
    updateDashboardStats();
    updateRemoteStatusBadge();
    alert('Data refreshed from Supabase.');
  } catch (e) {
    console.error(e);
    alert('Failed to sync from Supabase.');
  }
}


window.addEventListener('load', async ()=>{
  const synced = await syncFromRemote();
  if(!synced && !loadData()){ seedData(); saveData(); }
  renderCategoryOptions(); renderCategoriesPanel(); renderCategoryChips();
  updateDashboardStats();
  updateRemoteStatusBadge();
  showLoginScreen();
});