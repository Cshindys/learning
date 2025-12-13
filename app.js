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

let data = {
  tests: [],
  students: [],
  questions: [],
  submissions: [],
  reviews: [],
  categories: []
};
const STORAGE_KEY = 'tms_demo_data_v2';

// --- Persistence helpers ---
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
    { id:1, type:'multiple-choice', text:'What does SQL stand for?', options:['Structured Query Language','Simple Query Language','Standard Query Language','System Query Language'], correctAnswer:'A', categories:['Database'], difficulty:'medium', reference:'DSE2025', imageUrl:'', code:'' },
    { id:2, type:'multiple-choice', text:'Which protocol is used for secure web communication?', options:['HTTP','HTTPS','FTP','SMTP'], correctAnswer:'B', categories:['Networking'], difficulty:'easy', reference:'NET101', imageUrl:'', code:'' },
    { id:3, type:'long-answer', text:'Explain the concept of normalization in databases and its benefits.', categories:['Database'], difficulty:'difficult', reference:'DBA201', imageUrl:'', code:'-- Example SQL\nCREATE TABLE users (...);' },
    { id:4, type:'multiple-choice', text:'What is the time complexity of binary search?', options:['O(n)','O(log n)','O(n²)','O(1)'], correctAnswer:'B', categories:['Programming'], difficulty:'easy', reference:'ALG100', imageUrl:'', code:'' },
    { id:5, type:'long-answer', text:'Describe the OSI model and explain each layer briefly.', categories:['Networking'], difficulty:'medium', reference:'OSI-REF', imageUrl:'', code:'' }
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
function getDifficultyStars(diff){
  const d = String(diff || '').toLowerCase();
  if(d === 'easy') return '⭐';
  if(d === 'medium') return '⭐⭐';
  if(d === 'difficult') return '⭐⭐⭐';
  return '';
}

// --- UI helpers ---
function hideAllScreens(){ ['loginScreen','adminDashboard','studentDashboard','testInterface','reviewInterface'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.add('hidden'); }); }
function showLoginScreen(){ hideAllScreens(); document.getElementById('loginScreen').classList.remove('hidden'); }
function showStudentDashboard(){ hideAllScreens(); document.getElementById('studentDashboard').classList.remove('hidden'); document.getElementById('studentWelcome').textContent = `Welcome, ${currentUser.name}`; renderStudentTestsTable(); updateDashboardStats(); }
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
  updateDashboardStats();
  setTimeout(renderOverview, 120);
}

// Login-tab switching
function switchLoginTab(tab){
  const tabs = document.querySelectorAll('#loginScreen .tab');
  const contents = document.querySelectorAll('#loginScreen .tab-content');
  tabs.forEach(t=>t.classList.remove('active'));
  contents.forEach(t=>t.classList.remove('active'));
  if(tab==='admin'){
    document.getElementById('adminLogin').classList.add('active');
    const loginTabs = Array.from(document.querySelectorAll('#loginScreen .tabs .tab'));
    if(loginTabs[0]) loginTabs[0].classList.add('active');
  } else {
    document.getElementById('studentLogin').classList.add('active');
    const loginTabs = Array.from(document.querySelectorAll('#loginScreen .tabs .tab'));
    if(loginTabs[1]) loginTabs[1].classList.add('active');
  }
}

// Toggle password inline eye
function toggleLoginPassword(type){
  const inputId = type === 'admin' ? 'adminPasswordInput' : 'studentPasswordInput';
  const btnId = type === 'admin' ? 'adminPwToggle' : 'studentPwToggle';
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if(!input || !btn) return;
  const showing = input.dataset.show === '1';
  if(showing){
    input.type = 'password';
    input.dataset.show = '0';
    btn.setAttribute('aria-label','Show password');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else {
    input.type = 'text';
    input.dataset.show = '1';
    btn.setAttribute('aria-label','Hide password');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8 1.45-2.92 3.6-5.32 6.09-6.92M3 3l18 18" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.88 9.88A3 3 0 0 0 14.12 14.12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

// Robust tab activation
function setAdminActiveTab(tab){
  const tabButtons = document.querySelectorAll('#adminDashboard .tabs .tab');
  tabButtons.forEach(btn => {
    if(btn.dataset && btn.dataset.tab === tab) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  const contents = document.querySelectorAll('#adminDashboard .tab-content');
  contents.forEach(c => c.classList.remove('active'));
  const target = document.getElementById(`${tab}Tab`);
  if(target) target.classList.add('active');
  if(tab === 'overview') renderOverview();
  if(tab === 'tests') renderTestsTable();
  if(tab === 'students') renderStudentsTable();
  if(tab === 'questions') renderQuestionsTable();
  if(tab === 'reviews') renderReviewsContainer();
}
function switchAdminTab(tab){ setAdminActiveTab(tab); }

// --- Authentication (fixed: strictly use the specific IDs for username and password) ---
function login(type,event){
  event.preventDefault();
  let username = '';
  let password = '';
  if(type === 'admin'){
    const u = document.getElementById('adminUsernameInput');
    const p = document.getElementById('adminPasswordInput');
    username = u ? u.value : '';
    password = p ? p.value : '';
    if(username === 'admin' && password === 'admin123'){
      currentUser = { id:'admin', name:'Administrator' };
      currentUserType = 'admin';
      showAdminDashboard();
    } else {
      alert('Invalid admin credentials');
    }
  } else {
    const u = document.getElementById('studentIdInput');
    const p = document.getElementById('studentPasswordInput');
    username = u ? u.value : '';
    password = p ? p.value : '';
    const student = data.students.find(s => s.id === username && s.password === password);
    if(student){
      currentUser = student;
      currentUserType = 'student';
      showStudentDashboard();
    } else {
      alert('Invalid student credentials');
    }
  }
}

function logout(){
  currentUser = null;
  currentUserType = null;
  currentTest = null;
  if(testTimer){ clearInterval(testTimer); testTimer = null; }
  showLoginScreen();
}

// --- Dashboard stats & overview ---
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

// Overview chart
function renderOverview(){
  updateDashboardStats();
  const canvas = document.getElementById('overviewChartCanvas');
  if(!canvas) return;
  const labels = data.tests.map(t => t.name || `Test ${t.id}`);
  const values = data.tests.map(t => {
    const subs = data.submissions.filter(s => s.testId === t.id);
    return Array.from(new Set(subs.map(s => s.studentId))).length;
  });
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="padding:1rem;background:var(--surface);border-radius:.5rem;border:1px solid var(--border)">${labels.length ? labels.map((l,i)=>`${escapeHtml(l)}: ${values[i]}`).join('<br>') : 'No tests yet'}</div>`;
    return;
  }
  try{ if(overviewChart) overviewChart.destroy(); } catch(e){}
  const bgColors = values.map((_,i)=> ['#2563eb','#10b981','#f59e0b','#ef4444','#7c3aed','#06b6d4','#f97316'][i%7]);
  overviewChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets:[{ label:'Unique students attempted', data: values, backgroundColor: bgColors, borderRadius:6 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(148,163,184,.3)'} }, x:{ grid:{ display:false } } } }
  });
}

// --- Category management ---
function renderCategoryOptions(){
  const catFilter = document.getElementById('categoryFilter');
  const modalCatFilter = document.getElementById('modalCategoryFilter');
  [catFilter, modalCatFilter].forEach(select => {
    if(!select) return;
    select.innerHTML = `<option value="">All Categories</option>` + (data.categories||[]).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  });
}
function renderCategoriesPanel(){
  const container = document.getElementById('categoriesList');
  if(!container) return;
  container.innerHTML = (data.categories||[]).map(c => `
    <span class="category-pill" title="${escapeHtml(c)}">
      <span>${escapeHtml(c)}</span>
      <button class="btn btn-outline btn-sm" onclick="deleteCategory('${escapeJs(c)}')" style="padding:.15rem .4rem;margin-left:.25rem">Delete</button>
    </span>
  `).join('');
  renderQuestionModalCategories();
}
function addCategory(){
  const input = document.getElementById('newCategoryInput');
  const val = input.value && input.value.trim();
  if(!val){ alert('Enter a category name'); return; }
  if(data.categories.includes(val)){ alert('Category already exists'); input.value=''; return; }
  data.categories.push(val);
  input.value='';
  renderCategoryOptions(); renderCategoriesPanel(); saveData();
}
function deleteCategory(cat){
  if(!confirm(`Delete category "${cat}"?`)) return;
  data.categories = data.categories.filter(c=>c!==cat);
  data.questions.forEach(q=>{ if(Array.isArray(q.categories)) q.categories = q.categories.filter(c=>c!==cat); });
  renderCategoryOptions(); renderCategoriesPanel(); renderQuestionsTable(); saveData();
}
function renderQuestionModalCategories(){
  const container = document.getElementById('categoriesContainer');
  if(!container) return;
  container.innerHTML = (data.categories||[]).map(c => `<label class="checkbox-item" style="margin-bottom:.25rem"><input type="checkbox" name="questionCategory" value="${escapeHtml(c)}" /> <span>${escapeHtml(c)}</span></label>`).join('');
}

// --- Modals ---
function openModal(id){ document.getElementById(id)?.classList.add('show'); }
function closeModal(id){
  document.getElementById(id)?.classList.remove('show');
  if(id === 'studentModal'){
    const idInput = document.getElementById('studentId'); if(idInput) idInput.readOnly = false;
    document.getElementById('studentModalTitle').textContent = 'Add Student';
    document.getElementById('studentModalSaveBtn').textContent = 'Add Student';
    editingStudentId = null; editingStudentOriginalId = null;
  }
}

// --- Drag & Drop image handlers ---
function handleDropZoneDragOver(e){
  e.preventDefault();
  const dz = document.getElementById('imageDropZone');
  dz.classList.add('dragover');
}
function handleDropZoneDragLeave(e){
  const dz = document.getElementById('imageDropZone');
  dz.classList.remove('dragover');
}
function handleDropZoneDrop(e){
  e.preventDefault();
  const dz = document.getElementById('imageDropZone');
  dz.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if(file) processImageFile(file);
}
function handleImageFileInput(e){
  const file = e.target.files?.[0];
  if(file) processImageFile(file);
}
function processImageFile(file){
  if(!file.type.startsWith('image/')){ alert('Please drop an image file'); return; }
  const reader = new FileReader();
  reader.onload = function(ev){
    const dataUrl = ev.target.result;
    const img = document.getElementById('imagePreview');
    img.src = dataUrl;
    img.classList.remove('hidden');
    const urlInput = document.getElementById('questionImageUrl');
    urlInput.value = dataUrl;
  };
  reader.readAsDataURL(file);
}

// --- Test creation modal ---
function openTestModal(){
  const form = document.getElementById('testForm');
  if(form) form.reset();
  renderQuestionModalCategories();
  renderQuestionSelection();
  const selCount = document.getElementById('selectedCount');
  if(selCount) selCount.textContent = '0';
  openModal('testModal');
}

// --- Tests table ---
function renderTestsTable(){
  const container = document.getElementById('testsTable');
  if(!container) return;
  if(!data.tests || data.tests.length === 0){
    container.innerHTML = `<p class="small-muted" style="text-align:center">No tests created yet. Create your first test!</p>`;
    return;
  }
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
                <button class="btn btn-secondary btn-sm" onclick="openResultsModal(${test.id})">View Results</button>
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
function renderStudentSelection(){ const container = document.getElementById('studentSelection'); if(!container) return; container.innerHTML = (data.students||[]).map(s=>`<label class="checkbox-item" style="margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border);border-radius:.25rem"><input type="checkbox" id="s${s.id}" value="${s.id}" ${(currentTest?.assignedStudents||[]).includes(s.id)?'checked':''} /><span>${escapeHtml(s.name)} (${escapeHtml(s.id)})</span></label>`).join(''); }
function assignTestToStudents(){ const selected = Array.from(document.querySelectorAll('#studentSelection input[type="checkbox"]:checked')).map(cb=>cb.value); if(currentTest) currentTest.assignedStudents = selected; closeModal('assignTestModal'); renderTestsTable(); saveData(); renderOverview(); }
function deleteTest(testId){ if(!confirm('Are you sure you want to delete this test?')) return; data.tests = data.tests.filter(t=>t.id!==testId); data.submissions = data.submissions.filter(s=>s.testId!==testId); saveData(); renderTestsTable(); updateDashboardStats(); renderOverview(); }

// --- Students table & modal ---
function renderStudentsTable(){
  const container = document.getElementById('studentsTable'); if(!container) return;
  if(!data.students || data.students.length === 0){ container.innerHTML = `<p class="small-muted" style="text-align:center">No students added yet. Add your first student!</p>`; return; }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Student ID</th><th>Name</th><th>Assigned Tests</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.students.map(s=>{
          const assigned = (data.tests||[]).filter(t=> (t.assignedStudents||[]).includes(s.id)).length;
          return `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.name)}</td><td>${assigned}</td><td>
            <span class="action-group">
              <button class="btn btn-primary btn-sm" onclick="openStudentModal('${escapeJs(s.id)}')">Modify</button>
              <button class="btn btn-secondary btn-sm" onclick="resetStudent('${escapeJs(s.id)}')">Reset</button>
              <button class="btn btn-danger btn-sm" onclick="deleteStudent('${escapeJs(s.id)}')">Delete</button>
            </span>
          </td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}
function openStudentModal(studentId){
  document.getElementById('studentForm').reset();
  const idInput = document.getElementById('studentId');
  const nameInput = document.getElementById('studentName');
  const passInput = document.getElementById('studentPassword');
  const titleEl = document.getElementById('studentModalTitle');
  const saveBtn = document.getElementById('studentModalSaveBtn');
  if(studentId){
    const student = data.students.find(s=>s.id===studentId);
    if(!student){ alert('Student not found'); return; }
    editingStudentId = student.id; editingStudentOriginalId = student.id;
    idInput.value = student.id; nameInput.value = student.name; passInput.value = student.password;
    titleEl.textContent = 'Edit Student'; saveBtn.textContent = 'Save Changes';
  } else {
    editingStudentId = null; editingStudentOriginalId = null;
    idInput.readOnly = false; titleEl.textContent = 'Add Student'; saveBtn.textContent = 'Add Student';
  }
  openModal('studentModal');
}
function saveStudent(){
  const id = (document.getElementById('studentId')||{}).value?.trim();
  const name = (document.getElementById('studentName')||{}).value?.trim();
  const password = (document.getElementById('studentPassword')||{}).value || '';
  if(!id || !name || !password){ alert('Please fill all fields'); return; }
  if(editingStudentId){
    const student = data.students.find(s=>s.id===editingStudentOriginalId);
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
  editingStudentId = null; editingStudentOriginalId = null;
  closeModal('studentModal'); renderStudentsTable(); updateDashboardStats(); saveData();
}
function resetStudent(studentId){ if(confirm('Reset all test submissions for this student?')){ data.submissions = data.submissions.filter(s=>s.studentId!==studentId); saveData(); alert('Student submissions reset.'); updateDashboardStats(); renderOverview(); } }
function deleteStudent(studentId){ if(!confirm('Are you sure you want to delete this student?')) return; data.students = data.students.filter(s=>s.id!==studentId); data.submissions = data.submissions.filter(s=>s.studentId!==studentId); data.tests.forEach(t=> t.assignedStudents = (t.assignedStudents||[]).filter(id=> id !== studentId)); saveData(); renderStudentsTable(); updateDashboardStats(); renderOverview(); }

// --- Questions ---
function openQuestionModal(questionId){
  editingQuestionId = null;
  document.getElementById('questionForm').reset();
  const img = document.getElementById('imagePreview'); if(img){ img.src=''; img.classList.add('hidden'); }
  renderQuestionModalCategories();
  document.getElementById('questionModalTitle').textContent = questionId ? 'Edit Question' : 'Add Question';
  if(questionId){
    const q = data.questions.find(x => x.id === questionId);
    if(!q) return;
    editingQuestionId = q.id;
    document.getElementById('questionType').value = q.type || 'multiple-choice';
    document.getElementById('questionText').value = q.text || '';
    if(q.type === 'multiple-choice'){
      document.getElementById('optionA').value = q.options?.[0] || '';
      document.getElementById('optionB').value = q.options?.[1] || '';
      document.getElementById('optionC').value = q.options?.[2] || '';
      document.getElementById('optionD').value = q.options?.[3] || '';
      document.getElementById('correctAnswer').value = q.correctAnswer || 'A';
    }
    document.getElementById('questionDifficulty').value = q.difficulty || 'medium';
    document.getElementById('questionReference').value = q.reference || '';
    document.getElementById('questionImageUrl').value = q.imageUrl || '';
    if(q.imageUrl){ img.src = q.imageUrl; img.classList.remove('hidden'); }
    document.getElementById('questionCode').value = q.code || '';
    setQuestionModalCategories(q.categories || []);
  } else {
    setQuestionModalCategories([]);
  }
  toggleQuestionType();
  openModal('questionModal');
}
function toggleQuestionType(){ const type = document.getElementById('questionType').value; document.getElementById('mcOptions').style.display = (type === 'multiple-choice') ? 'block' : 'none'; }
function setQuestionModalCategories(selected){ document.querySelectorAll('#categoriesContainer input[type="checkbox"]').forEach(cb=>{ cb.checked = selected.includes(cb.value); }); }

function saveQuestion(){
  const type = document.getElementById('questionType').value;
  const text = document.getElementById('questionText').value.trim();
  const categories = Array.from(document.querySelectorAll('#categoriesContainer input[type="checkbox"]:checked')).map(cb=>cb.value);
  const difficulty = document.getElementById('questionDifficulty').value || 'medium';
  const reference = document.getElementById('questionReference').value.trim();
  const imageUrl = (document.getElementById('questionImageUrl')?.value || '').trim();
  const code = (document.getElementById('questionCode')?.value || '').trim();
  if(!text){ alert('Please fill the question text'); return; }
  let question;
  if(editingQuestionId){
    question = data.questions.find(q=>q.id===editingQuestionId);
    if(!question){ alert('Question not found'); return; }
    question.type = type; question.text = text; question.categories = categories; question.difficulty = difficulty; question.reference = reference;
    question.imageUrl = imageUrl || ''; question.code = code || '';
  } else {
    question = { id: Date.now(), type, text, categories, difficulty, reference, imageUrl, code };
    data.questions.push(question);
  }
  if(type === 'multiple-choice'){
    const a = document.getElementById('optionA').value.trim();
    const b = document.getElementById('optionB').value.trim();
    const c = document.getElementById('optionC').value.trim();
    const d = document.getElementById('optionD').value.trim();
    const correct = document.getElementById('correctAnswer').value;
    if(!a||!b||!c||!d){ alert('Fill all options'); return; }
    question.options = [a,b,c,d]; question.correctAnswer = correct;
  } else {
    delete question.options; delete question.correctAnswer;
  }
  closeModal('questionModal'); renderQuestionsTable(); renderQuestionSelection(); renderCategoriesPanel(); renderCategoryOptions(); updateDashboardStats(); saveData();
}

// Rich content rendering
function renderRichContent(q){
  const parts = [];
  if(q.imageUrl){
    const safeUrl = escapeHtml(q.imageUrl);
    parts.push(`<div class="rich-block"><img src="${safeUrl}" alt="Question image" class="question-image" onerror="this.style.display='none'" /></div>`);
  }
  if(q.code){
    parts.push(`<div class="rich-block"><pre class="code-block"><code>${escapeHtml(q.code)}</code></pre></div>`);
  }
  return parts.join('');
}

// Questions table
function renderQuestionsTable(){
  const container = document.getElementById('questionsTable'); if(!container) return;
  const filtered = getFilteredQuestions('main');
  if(!filtered || filtered.length === 0){
    container.innerHTML = `<p class="small-muted" style="text-align:center">No questions found. Add your first question!</p>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Question</th>
          <th>Difficulty</th>
          <th>Reference</th>
          <th>Attachments</th>
          <th>Categories</th>
          <th class="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(q=>`<tr>
          <td><span class="badge ${q.type === 'multiple-choice' ? 'badge-success' : 'badge-warning'}">${q.type === 'multiple-choice' ? 'MC' : 'Long'}</span></td>
          <td>${escapeHtml(q.text)}</td>
          <td>${getDifficultyStars(q.difficulty)}</td>
          <td>${escapeHtml(q.reference || '')}</td>
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
    </table>
  `;
}
function getFilteredQuestions(context){
  const categoryFilter = (document.getElementById(context==='modal' ? 'modalCategoryFilter' : 'categoryFilter')||{}).value || '';
  const search = ((document.getElementById(context==='modal' ? 'modalQuestionSearch' : 'questionSearch')||{}).value||'').toLowerCase();
  return (data.questions||[]).filter(q=>{
    const matchCat = !categoryFilter || (q.categories||[]).includes(categoryFilter);
    const matchSearch = !search || (q.text||'').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });
}
function filterQuestions(){ renderQuestionsTable(); }
function deleteQuestion(qid){ if(!confirm('Delete this question?')) return; data.questions = data.questions.filter(q=>q.id!==qid); data.tests.forEach(t=> t.questions = (t.questions||[]).filter(q=>q.id !== qid)); saveData(); renderQuestionsTable(); renderQuestionSelection(); updateDashboardStats(); }

// Question selection for test creation
function renderQuestionSelection(){
  const container = document.getElementById('questionSelection'); if(!container) return;
  const list = getFilteredQuestions('modal') || [];
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
function updateSelectedCount(){ const sel = document.querySelectorAll('#questionSelection input[type="checkbox"]:checked'); const el = document.getElementById('selectedCount'); if(el) el.textContent = sel.length; }
function filterModalQuestions(){ renderQuestionSelection(); }

// Save test
function saveTest(){
  const name = (document.getElementById('testName')||{}).value?.trim();
  const duration = parseInt((document.getElementById('testDuration')||{}).value);
  const selectedQuestions = Array.from(document.querySelectorAll('#questionSelection input[type="checkbox"]:checked')).map(cb=>parseInt(cb.value));
  if(!name || !duration || selectedQuestions.length === 0){ alert('Please fill all fields and select at least one question'); return; }
  const test = { id: Date.now(), name, duration, questions: selectedQuestions.map(id => JSON.parse(JSON.stringify(data.questions.find(q=>q.id===id)))).filter(Boolean), assignedStudents: [], createdAt: new Date() };
  data.tests.push(test);
  closeModal('testModal');
  renderTestsTable(); updateDashboardStats(); saveData(); renderOverview();
}

// Reviews rendering & grading
function renderReviewsContainer(){
  const container = document.getElementById('reviewsContainer'); if(!container) return;
  const pending = (data.submissions||[]).filter(s=> (s.answers||[]).some(a=> a.type==='long-answer' && !a.reviewed));
  if(!pending.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No pending long answer reviews.</p>`; return; }
  container.innerHTML = pending.map(sub=>{
    const student = data.students.find(s=>s.id===sub.studentId);
    const test = data.tests.find(t=>t.id===sub.testId);
    const longAnswers = (sub.answers||[]).filter(a=>a.type==='long-answer' && !a.reviewed);
    return `<div class="card" style="margin-bottom:1rem"><div class="card-header"><div class="card-title">${escapeHtml(test?.name||`Test ${sub.testId}`)} - ${escapeHtml(student?.name||sub.studentId)}</div></div><div class="card-body">${longAnswers.map(ans=>`<div class="question-container"><div class="question-number">Question ${ans.questionIndex+1}</div><div class="question-text">${escapeHtml(ans.question)}</div>${renderRichContent(test.questions[ans.questionIndex] || {})}<div style="background:rgba(148,163,184,.12);padding:1rem;border-radius:.25rem;margin:1rem 0"><strong>Student Answer:</strong><br>${escapeHtml(ans.answer||'<em>No answer provided</em>')}</div><div style="display:flex;gap:.7rem;align-items:center"><button class="btn btn-success btn-sm" onclick="gradeAnswer(${sub.id}, ${ans.questionIndex}, true)">Mark Correct</button><button class="btn btn-danger btn-sm" onclick="gradeAnswer(${sub.id}, ${ans.questionIndex}, false)">Mark Wrong</button><input type="text" placeholder="Add comment..." id="comment-${sub.id}-${ans.questionIndex}" class="form-control" style="max-width:320px" /></div></div>`).join('')}</div></div>`;
  }).join('');
}
function gradeAnswer(submissionId, questionIndex, isCorrect){
  const commentEl = document.getElementById(`comment-${submissionId}-${questionIndex}`);
  const comment = commentEl ? commentEl.value : '';
  const submission = data.submissions.find(s=>s.id===submissionId);
  if(!submission){ alert('Submission not found'); return; }
  const answer = (submission.answers||[]).find(a=>a.questionIndex === questionIndex);
  if(!answer){ alert('Answer not found'); return; }
  answer.reviewed = true; answer.correct = isCorrect; answer.comment = comment;
  saveData(); renderReviewsContainer(); updateDashboardStats();
}

// Student flows
function renderStudentTestsTable(){
  const container = document.getElementById('studentTestsTable'); if(!container) return;
  const assigned = (data.tests||[]).filter(t=> (t.assignedStudents||[]).includes(currentUser.id));
  if(!assigned.length){ container.innerHTML = `<p class="small-muted" style="text-align:center">No tests assigned to you yet.</p>`; return; }
  container.innerHTML = `<table class="table"><thead><tr><th>Test Name</th><th>Duration</th><th>Questions</th><th>Pending Reviews</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    assigned.map(test=>{
      const submission = (data.submissions||[]).find(s=>s.testId === test.id && s.studentId === currentUser.id);
      const status = submission ? 'Completed' : 'Not Started';
      const pending = submission ? (submission.answers||[]).filter(a=> a.type === 'long-answer' && !a.reviewed).length : 0;
      return `<tr><td>${escapeHtml(test.name)}</td><td>${test.duration} minutes</td><td>${test.questions.length}</td><td>${pending>0?`<span class="badge badge-warning">${pending} pending</span>`:`<span class="small-muted">None</span>`}</td><td><span class="badge ${status==='Completed'?'badge-success':'badge-warning'}">${status}</span></td><td>${!submission?`<button class="btn btn-primary btn-sm" onclick="startTest(${test.id})">Start Test</button>`:`<button class="btn btn-secondary btn-sm" onclick="reviewTest(${test.id})">Review</button>`}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}
function startTest(testId){
  currentTest = data.tests.find(t=>t.id===testId); if(!currentTest){ alert('Test not found'); return; }
  timeRemaining = (currentTest.duration||0) * 60; timeExpired = false;
  document.getElementById('testTitle').textContent = currentTest.name;
  document.getElementById('timeExpiredNote').style.display = 'none';
  renderTestQuestions(); updateTimerUI(); startTimer(); showTestInterface();
}
function renderTestQuestions(){
  const container = document.getElementById('testQuestions'); if(!container || !currentTest) return;
  const withIndex = currentTest.questions.map((q, idx)=> ({ q, origIndex: idx }));
  const mc = withIndex.filter(x=> x.q.type === 'multiple-choice');
  const long = withIndex.filter(x=> x.q.type === 'long-answer');
  let html = '';
  if(mc.length>0){
    html += `<div style="margin-bottom:.6rem"><strong>Section A — Multiple Choice</strong></div>`;
    mc.forEach(({q, origIndex}, displayIdx)=> {
      html += `<div class="question-container" id="qc-${origIndex}">
        <div class="question-number">Question ${displayIdx+1}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        ${renderRichContent(q)}
        <div class="options" id="options-${origIndex}">
          ${(q.options||[]).map((opt,i)=>`<div class="option" id="option-${origIndex}-${i}" onclick="selectRadio('q${origIndex}','q${origIndex}o${i}')"><input type="radio" name="q${origIndex}" value="${String.fromCharCode(65+i)}" id="q${origIndex}o${i}" /><label for="q${origIndex}o${i}">${String.fromCharCode(65+i)}. ${escapeHtml(opt)}</label></div>`).join('')}
        </div>
      </div>`;
    });
  }
  if(long.length>0){
    html += `<div style="margin:.8rem 0;"><strong>Section B — Long Answers</strong></div>`;
    long.forEach(({q, origIndex}, displayIdx)=>{
      html += `<div class="question-container" id="qc-${origIndex}">
        <div class="question-number">Question ${displayIdx+1}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        ${renderRichContent(q)}
        <textarea class="form-control" rows="5" placeholder="Enter your answer here..." id="longAnswer${origIndex}"></textarea>
      </div>`;
    });
  }
  container.innerHTML = html;
  const submitBtn = document.getElementById('submitTestBtn'); if(submitBtn) submitBtn.disabled = false;
}
function selectRadio(groupName, radioId){ const r = document.getElementById(radioId); if(r) r.checked = true; }
function setTestInputsDisabled(disabled){
  document.querySelectorAll('#testQuestions input, #testQuestions textarea').forEach(el=>{
    el.disabled = disabled; if(el.tagName === 'TEXTAREA') el.readOnly = disabled;
  });
  document.getElementById('submitTestBtn').disabled = disabled;
  const optionDivs = document.querySelectorAll('#testQuestions .option');
  optionDivs.forEach(d => disabled ? d.classList.add('disabled') : d.classList.remove('disabled'));
}

// Timer
function startTimer(){
  const timerElement = document.getElementById('testTimer');
  const timerTime = document.getElementById('testTimerTime');
  if(testTimer) clearInterval(testTimer);
  testTimer = setInterval(()=>{
    timeRemaining--;
    if(timeRemaining <= 0){
      clearInterval(testTimer); testTimer = null; timeRemaining = 0; timeExpired = true;
      timerElement.classList.remove('warning'); timerElement.classList.add('expired');
      timerTime.textContent = `Time's up`;
      setTestInputsDisabled(true);
      submitTest(true);
      return;
    }
    updateTimerUI();
  }, 1000);
}
function updateTimerUI(){
  const timerElement = document.getElementById('testTimer');
  const timerTime = document.getElementById('testTimerTime');
  const minutes = Math.floor(timeRemaining/60);
  const seconds = timeRemaining % 60;
  if(timerTime) timerTime.textContent = `${minutes}:${String(seconds).padStart(2,'0')}`;
  if(timeRemaining <= 60) timerElement.classList.add('warning'); else timerElement.classList.remove('warning');
}

// Submit
function submitTest(autoSubmit=false){
  if(!autoSubmit){ if(!confirm('Are you sure you want to submit the test? Once submitted you cannot change your answers.')) return; }
  if(testTimer){ clearInterval(testTimer); testTimer = null; }
  const answers = (currentTest.questions||[]).map((question,index)=>{
    const a = { questionIndex: index, question: question.text, type: question.type };
    if(question.type === 'multiple-choice'){
      const sel = document.querySelector(`#testQuestions input[name="q${index}"]:checked`);
      a.answer = sel ? sel.value : null; a.correct = a.answer === question.correctAnswer;
    } else {
      const ta = document.getElementById(`longAnswer${index}`);
      a.answer = ta ? ta.value : ''; a.reviewed = false;
    }
    return a;
  });
  const submission = { id: Date.now(), testId: currentTest.id, studentId: currentUser.id, answers, submittedAt: new Date() };
  data.submissions = (data.submissions||[]).filter(s=> !(s.testId === submission.testId && s.studentId === submission.studentId));
  data.submissions.push(submission);
  saveData();
  if(autoSubmit){
    document.getElementById('timeExpiredNote').style.display = 'block';
    alert("Time is up. Your answers were automatically submitted.");
  } else {
    alert('Test submitted successfully!');
  }
  setTestInputsDisabled(true);
  showStudentDashboard();
  updateDashboardStats();
  renderOverview();
}

function reviewBeforeSubmit(){ window.scrollTo({ top:0, behavior:'smooth' }); alert('Scroll through your answers. When you are ready click "Submit Test".'); }

function reviewTest(testId){
  const test = data.tests.find(t=>t.id===testId);
  const submission = data.submissions.find(s=>s.testId===testId && s.studentId === currentUser.id);
  if(!submission){ alert('No submission found for this test.'); return; }
  document.getElementById('reviewTitle').textContent = `${test.name} - Review`;
  document.getElementById('reviewTestTitle').textContent = test.name;
  const mcAnswers = submission.answers.filter(a=>a.type==='multiple-choice');
  const longAnswers = submission.answers.filter(a=>a.type==='long-answer');
  const mcCorrect = mcAnswers.filter(a=>a.correct).length;
  const longCorrect = longAnswers.filter(a=>a.reviewed && a.correct).length;
  const longPending = longAnswers.filter(a=>!a.reviewed).length;
  let scoreText = `MC Score: ${mcCorrect}/${mcAnswers.length}`;
  if(longAnswers.length>0){
    scoreText += ` | Long Answer: ${longCorrect}/${longAnswers.length}`;
    if(longPending>0) scoreText += ` (${longPending} pending review)`;
  }
  document.getElementById('reviewScore').textContent = scoreText;
  renderReviewQuestions(submission, test);
  showReviewInterface();
}

function renderReviewQuestions(submission, test){
  const container = document.getElementById('reviewQuestions'); if(!container) return;
  const mcAnswers = submission.answers.filter(a=>a.type==='multiple-choice');
  const longAnswers = submission.answers.filter(a=>a.type==='long-answer');
  const parts = [];
  if(mcAnswers.length>0){
    parts.push(`<div style="margin-bottom:.5rem"><strong>Section A — Multiple Choice</strong></div>`);
    mcAnswers.forEach(answer=>{
      const q = test.questions[answer.questionIndex] || {};
      const optionsHtml = (q.options||[]).map((opt,i)=>{
        const letter = 'ABCD'[i] || String.fromCharCode(65+i);
        const isCorrect = q.correctAnswer === letter;
        const isSelected = answer.answer === letter;
        const selectedBadge = isSelected ? `<span class="badge ${isCorrect?'badge-success':'badge-warning'}" style="margin-left:.5rem">${isCorrect?'Selected & Correct':'Selected'}</span>` : '';
        const correctBadge = (isCorrect && !isSelected) ? `<span class="badge badge-success" style="margin-left:.5rem">Correct</span>` : '';
        const bg = isSelected ? 'rgba(99,102,241,.10)' : 'transparent';
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
  if(longAnswers.length>0){
    parts.push(`<div style="margin:1rem 0;"><strong>Section B — Long Answers</strong></div>`);
    longAnswers.forEach(answer=>{
      const q = test.questions[answer.questionIndex] || {};
      const status = answer.reviewed ? (answer.correct ? `<span class="badge badge-success">Checked: Correct</span>` : `<span class="badge badge-danger">Checked: Wrong</span>`) : `<span class="badge badge-warning">Waiting for review</span>`;
      const comment = answer.comment ? `<br><small><strong>Teacher:</strong> ${escapeHtml(answer.comment)}</small>` : '';
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
  container.innerHTML = parts.join('');
}

// Results / exports
function openResultsModal(testId){
  const test = data.tests.find(t=>t.id===testId); if(!test) return;
  currentTest = test;
  const assigned = test.assignedStudents || [];
  const rows = assigned.map(studentId=>{
    const student = data.students.find(s=>s.id===studentId) || { name:'' };
    const submission = data.submissions.find(s=>s.testId === test.id && s.studentId === studentId);
    if(!submission) return { studentId, name: student.name, status:'Not Started', mcCorrect:0, mcTotal: test.questions.filter(q=>q.type==='multiple-choice').length, longCorrect:0, longTotal: test.questions.filter(q=>q.type==='long-answer').length, longPending:0 };
    const mcQuestions = submission.answers.filter(a=>a.type==='multiple-choice'); const mcCorrect = mcQuestions.filter(a=>a.correct).length;
    const longQuestions = submission.answers.filter(a=>a.type==='long-answer'); const longCorrect = longQuestions.filter(a=>a.reviewed && a.correct).length; const longPending = longQuestions.filter(a=>!a.reviewed).length;
    return { studentId, name: student.name, status:'Completed', mcCorrect, mcTotal: mcQuestions.length, longCorrect, longTotal: longQuestions.length, longPending };
  });
  const tbody = rows.map(r=>`<tr><td>${escapeHtml(r.studentId)}</td><td>${escapeHtml(r.name)}</td><td>${r.status==='Completed'?`<span class="badge badge-success">Completed</span>`:`<span class="badge badge-warning">Not Started</span>`}</td><td>${r.mcCorrect}/${r.mcTotal}</td><td>${r.longCorrect}/${r.longTotal}${r.longPending?` <small class="small-muted">(${r.longPending} pending)</small>`:''}</td><td><button class="btn btn-primary btn-sm" onclick="openStudentResultModal(${test.id}, '${escapeJs(r.studentId)}')">Details</button></td></tr>`).join('');
  const bodyHtml = `<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><div><strong>${escapeHtml(test.name)}</strong><br><span class="small-muted">${test.questions.length} questions — ${test.duration} min</span></div><div><button class="btn btn-outline btn-sm" onclick="exportResults(${test.id})">Export CSV</button></div></div><div style="overflow:auto"><table class="table"><thead><tr><th>Student ID</th><th>Name</th><th>Status</th><th>MC Score</th><th>Long Answer Score</th><th>Actions</th></tr></thead><tbody>${tbody}</tbody></table></div></div>`;
  document.getElementById('resultsModalBody').innerHTML = bodyHtml;
  openModal('resultsModal');
}
function exportResults(testId){
  const test = data.tests.find(t=>t.id===testId); if(!test) return;
  const header = ['studentId','name','status','mcCorrect','mcTotal','longCorrect','longTotal','longPending'];
  const rows = (test.assignedStudents||[]).map(studentId=>{
    const student = data.students.find(s=>s.id===studentId) || { name: '' };
    const submission = data.submissions.find(s=>s.testId===test.id && s.studentId===studentId);
    if(!submission) return [studentId, student.name, 'Not Started', 0, test.questions.filter(q=>q.type==='multiple-choice').length, 0, test.questions.filter(q=>q.type==='long-answer').length, 0];
    const mcQuestions = submission.answers.filter(a=>a.type==='multiple-choice'); const mcCorrect = mcQuestions.filter(a=>a.correct).length;
    const longQuestions = submission.answers.filter(a=>a.type==='long-answer'); const longCorrect = longQuestions.filter(a=>a.reviewed && a.correct).length; const longPending = longQuestions.filter(a=>!a.reviewed).length;
    return [studentId, student.name, 'Completed', mcCorrect, mcQuestions.length, longCorrect, longQuestions.length, longPending];
  });
  const csv = [header, ...rows].map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${test.name.replace(/\s+/g,'_')}_results.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function openStudentResultModal(testId, studentId){
  const test = data.tests.find(t=>t.id===testId); const student = data.students.find(s=>s.id===studentId) || { name:'' }; const submission = data.submissions.find(s=>s.testId===testId && s.studentId===studentId);
  let content = `<div><strong>${escapeHtml(student.name)} (${escapeHtml(studentId)})</strong><br><span class="small-muted">${escapeHtml(test?test.name:'')}</span></div><div style="margin-top:1rem">`;
  if(!submission) content += `<p class="small-muted">Student has not started the test.</p>`;
  else {
    const mcAnswers = submission.answers.filter(a=>a.type==='multiple-choice'); const longAnswers = submission.answers.filter(a=>a.type==='long-answer');
    if(mcAnswers.length>0){
      content += `<div style="margin-bottom:.5rem"><strong>Section A — Multiple Choice</strong></div>`;
      mcAnswers.forEach(answer=>{
        const q = test.questions[answer.questionIndex] || {};
        const optionsHtml = (q.options||[]).map((opt,i)=>{ const letter='ABCD'[i]||String.fromCharCode(65+i); const isCorrect = q.correctAnswer === letter; const isSelected = answer.answer === letter; const selectedBadge = isSelected ? `<span class="badge ${isCorrect?'badge-success':'badge-warning'}" style="margin-left:.5rem">${isCorrect?'Selected & Correct':'Selected'}</span>` : ''; const correctBadge = (isCorrect && !isSelected)? `<span class="badge badge-success" style="margin-left:.5rem">Correct</span>` : ''; const bg = isSelected ? 'rgba(99,102,241,.10)' : 'transparent'; return `<div style="padding:.5rem;border:1px solid var(--border);border-radius:.25rem;margin-bottom:.25rem;background:${bg}">${letter}. ${escapeHtml(opt)} ${selectedBadge}${correctBadge}</div>`; }).join('');
        const studentAnswerText = answer.answer ? `${answer.answer}. ${ escapeHtml((q.options||[])[ 'ABCD'.indexOf(answer.answer) ] || '' )}` : '<em>No answer</em>';
        content += `<div class="question-container"><div class="question-number">Question ${answer.questionIndex+1}</div><div class="question-text">${escapeHtml(q.text||answer.question)}</div>${renderRichContent(q)}<div style="margin:1rem 0">${optionsHtml}</div><div style="margin-top:.5rem"><strong>Student selection:</strong> ${studentAnswerText}</div></div>`;
      });
    }
    if(longAnswers.length>0){
      content += `<div style="margin:1rem 0;"><strong>Section B — Long Answers</strong></div>`;
      longAnswers.forEach(answer=>{
        const q = test.questions[answer.questionIndex] || {};
        const status = answer.reviewed ? (answer.correct ? `<span class="badge badge-success">Checked: Correct</span>` : `<span class="badge badge-danger">Checked: Wrong</span>`) : `<span class="badge badge-warning">Waiting for review</span>`;
        const comment = answer.comment ? `<br><small><strong>Teacher:</strong> ${escapeHtml(answer.comment)}</small>` : '';
        content += `<div class="question-container"><div class="question-number">Question ${answer.questionIndex+1}</div><div class="question-text">${escapeHtml(q.text||answer.question)}</div>${renderRichContent(q)}<div style="background:rgba(148,163,184,.12);padding:1rem;border-radius:.25rem;margin:1rem 0"><strong>Student Answer:</strong><br>${escapeHtml(answer.answer||'<em>No answer provided</em>')}</div><div>${status}${comment}</div></div>`;
      });
    }
  }
  content += `</div>`;
  document.getElementById('studentResultModalTitle').textContent = `Result — ${student.name}`;
  document.getElementById('studentResultModalBody').innerHTML = content;
  openModal('studentResultModal');
}

// Export / Import (questions CSV + backup)
function exportQuestionsCSV(){
  if(!data.questions || data.questions.length === 0){ alert('No questions to export'); return; }
  const header = ['id','type','text','options_json','correctAnswer','difficulty','reference','categories','imageUrl','code'];
  const rows = data.questions.map(q=> [
    q.id, q.type, q.text,
    q.options ? JSON.stringify(q.options) : '', q.correctAnswer || '',
    q.difficulty || '', q.reference || '',
    (q.categories||[]).join('|'),
    q.imageUrl || '', q.code || ''
  ]);
  const csv = [header, ...rows].map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`questions_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('Questions exported as CSV.');
}
function downloadDataBackup(){
  const payload = JSON.parse(JSON.stringify(data, (k,v)=> v instanceof Date ? v.toISOString() : v ));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tms_backup_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); alert('Backup downloaded.');
}
function parseCSV(text){
  const lines = text.split(/\r\n|\n/).filter(l=>l.trim()!=='');
  if(lines.length === 0) return [];
  const rows = [];
  for(const line of lines){
    const row = [];
    let i = 0, cur = '', inQuotes = false;
    while(i < line.length){
      const ch = line[i];
      if(inQuotes){
        if(ch === '"'){
          if(i+1 < line.length && line[i+1] === '"'){ cur += '"'; i += 2; continue; }
          else { inQuotes = false; i++; continue; }
        } else { cur += ch; i++; continue; }
      } else {
        if(ch === '"'){ inQuotes = true; i++; continue; }
        if(ch === ','){ row.push(cur); cur = ''; i++; continue; }
        cur += ch; i++;
      }
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}
function importQuestionsCSV(event){
  const file = event.target.files && event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const text = e.target.result;
      const rows = parseCSV(text);
      if(rows.length < 1){ alert('CSV appears empty'); event.target.value=''; return; }
      const header = rows[0].map(h => (h||'').trim());
      const idx = {}; header.forEach((h,i)=> idx[h.toLowerCase()] = i);
      let added = 0, updated = 0, skipped = 0;
      for(let r=1; r<rows.length; r++){
        const row = rows[r]; const obj = {};
        for(const key in idx){ obj[key] = (row[idx[key]] || '').trim(); }
        if(!obj['type'] || !obj['text']){ skipped++; continue; }
        const type = obj['type'].toLowerCase();
        const textField = obj['text'];
        const difficulty = obj['difficulty'] || 'medium';
        const reference = obj['reference'] || '';
        const categories = obj['categories'] ? obj['categories'].split('|').map(s=>s.trim()).filter(Boolean) : [];
        const imageUrl = obj['imageurl'] || obj['imageUrl'] || '';
        const code = obj['code'] || '';
        let options = null;
        if(obj['options_json']){
          try{ options = JSON.parse(obj['options_json']); if(!Array.isArray(options)) options = null; } catch(e){ options = null; }
        }
        const correctAnswer = obj['correctanswer'] || obj['correctAnswer'] || obj['correct_answer'] || '';
        const idStr = obj['id'] || '';
        const existing = idStr ? data.questions.find(q => String(q.id) === String(idStr)) : null;
        if(existing){
          existing.type = type; existing.text = textField; existing.difficulty = difficulty;
          existing.reference = reference; existing.categories = categories;
          existing.imageUrl = imageUrl; existing.code = code;
          if(type === 'multiple-choice'){
            if(options && options.length >= 4) existing.options = options;
            if(correctAnswer) existing.correctAnswer = correctAnswer;
          } else { delete existing.options; delete existing.correctAnswer; }
          updated++;
        } else {
          const newQ = {
            id: idStr ? (isNaN(Number(idStr)) ? Date.now()+Math.floor(Math.random()*1000) : Number(idStr)) : Date.now()+Math.floor(Math.random()*1000),
            type, text: textField, difficulty, reference, categories, imageUrl, code
          };
          if(type === 'multiple-choice'){
            if(options && options.length >= 4){
              newQ.options = options;
            } else {
              const maybeA = obj['a'] || obj['optiona'] || '';
              const maybeB = obj['b'] || obj['optionb'] || '';
              const maybeC = obj['c'] || obj['optionc'] || '';
              const maybeD = obj['d'] || obj['optiond'] || '';
              if(maybeA && maybeB && maybeC && maybeD){ newQ.options = [maybeA, maybeB, maybeC, maybeD]; }
              else { skipped++; continue; }
            }
            if(correctAnswer) newQ.correctAnswer = correctAnswer; else { skipped++; continue; }
          }
          data.questions.push(newQ); added++;
        }
        categories.forEach(c => { if(c && !data.categories.includes(c)) data.categories.push(c); });
      }
      saveData(); renderAll(); updateDashboardStats();
      alert(`CSV import completed: ${added} added, ${updated} updated, ${skipped} skipped.`);
    } catch(err){
      console.error(err);
      alert('Failed to import CSV. Check format and try again.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// --- Students CSV export/import ---
function exportStudentsCSV(){
  if(!data.students || data.students.length === 0){ alert('No students to export'); return; }
  const header = ['id','name','password'];
  const rows = data.students.map(s => [s.id, s.name, s.password]);
  const csv = [header, ...rows].map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`students_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('Students exported as CSV.');
}
function importStudentsCSV(event){
  const file = event.target.files && event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const text = e.target.result;
      const rows = parseCSV(text);
      if(rows.length < 2){ alert('CSV appears empty or missing header'); event.target.value=''; return; }
      const header = rows[0].map(h => (h||'').trim().toLowerCase());
      const idx = {}; header.forEach((h,i)=> idx[h] = i);
      if(idx['id'] === undefined || idx['name'] === undefined){ alert('CSV must include id and name columns'); event.target.value=''; return; }
      let added = 0, updated = 0, skipped = 0;
      for(let r=1; r<rows.length; r++){
        const row = rows[r];
        const id = (row[idx['id']] || '').trim();
        const name = (row[idx['name']] || '').trim();
        const password = idx['password'] !== undefined ? (row[idx['password']] || '').trim() : 'pass123';
        if(!id || !name){ skipped++; continue; }
        const existing = data.students.find(s => String(s.id) === id);
        if(existing){
          existing.name = name;
          existing.password = password || existing.password || 'pass123';
          updated++;
        } else {
          data.students.push({ id, name, password: password || 'pass123' });
          added++;
        }
      }
      saveData(); renderStudentsTable(); updateDashboardStats();
      alert(`Students CSV import: ${added} added, ${updated} updated, ${skipped} skipped.`);
    } catch(err){
      console.error(err);
      alert('Failed to import Students CSV. Check format and try again.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// Misc
function renderAll(){ renderCategoryOptions(); renderCategoriesPanel(); renderTestsTable(); renderStudentsTable(); renderQuestionsTable(); renderReviewsContainer(); renderOverview(); }
function clearAllData(){
  if(!confirm('This will reset demo data to factory seed. Continue?')) return;
  seedData(); saveData(); renderAll(); updateDashboardStats(); alert('Demo data reset.');
}

// Init
window.addEventListener('load', ()=>{
  if(!loadData()){ seedData(); saveData(); }
  renderCategoryOptions(); renderCategoriesPanel();
  updateDashboardStats();
  showLoginScreen();
});

// Screen helpers
function showTestInterface(){ hideAllScreens(); const el=document.getElementById('testInterface'); if(el) el.classList.remove('hidden'); }
function showReviewInterface(){ hideAllScreens(); const el=document.getElementById('reviewInterface'); if(el) el.classList.remove('hidden'); }
function backToStudentDashboard(){ showStudentDashboard(); }

// Visual active tab indication + drop-zone click
document.addEventListener('DOMContentLoaded', ()=>{
  const adminTabs = document.querySelectorAll('#adminDashboard .tabs .tab');
  adminTabs.forEach(btn => {
    btn.addEventListener('click', ()=>{
      adminTabs.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const dz = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('questionImageFile');
  if(dz && fileInput){
    dz.addEventListener('click', (e)=>{
      if(e.target && e.target.id === 'imagePreview') return;
      fileInput.click();
    });
  }
});