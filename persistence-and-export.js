// Persistence and export utilities for the learning app
// Drop this file in the same folder as index.html and include it via <script src="./persistence-and-export.js"></script>

(function () {
  // Exposed key for debugging; change this to migrate storage or version
  const STORAGE_KEY = 'learning_app_data_v1';

  // Default data shape
  const defaultData = {
    students: [],
    questions: [],
    tests: []
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Load data from localStorage
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(defaultData);
      return JSON.parse(raw);
    } catch (err) {
      console.error('LearningAppStorage: failed to parse data', err);
      return clone(defaultData);
    }
  }

  // Save data to localStorage (full overwrite)
  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('LearningAppStorage: failed to save data', err);
    }
  }

  // Students API
  function addStudent(student) {
    const data = loadData();
    data.students = data.students || [];
    data.students.push(student);
    saveData(data);
    return student;
  }
  function getStudents() {
    return loadData().students || [];
  }

  // Questions API
  function addQuestion(question) {
    const data = loadData();
    data.questions = data.questions || [];
    data.questions.push(question);
    saveData(data);
    return question;
  }
  function getQuestions() {
    return loadData().questions || [];
  }

  // Remove all stored data (clear storage key)
  function clearAllData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('LearningAppStorage: failed to clear data', err);
    }
  }

  // Export questions to CSV. fields is an array of keys.
  function exportQuestionsToCSV(filename = 'questions.csv', fields) {
    const data = loadData();
    const questions = data.questions || [];
    if (!fields || !fields.length) {
      if (!questions.length) fields = [];
      else fields = Object.keys(questions[0]);
    }

    const escapeCell = (str = '') => {
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const header = fields.map(escapeCell).join(',');
    const rows = questions.map(q => fields.map(f => escapeCell(q[f] ?? '')).join(','));
    const csv = [header].concat(rows).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Export to real Excel (.xlsx) using SheetJS if loaded
  function exportQuestionsToXLSX(filename = 'questions.xlsx') {
    if (typeof XLSX === 'undefined') {
      console.error('LearningAppStorage: XLSX library not found. Add SheetJS to enable .xlsx export.');
      alert('XLSX export requires SheetJS. Add <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script> to the page.');
      return;
    }
    const data = loadData();
    const questions = data.questions || [];
    // Convert to sheet and save
    const ws = XLSX.utils.json_to_sheet(questions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, filename);
  }

  // Expose API globally
  window.LearningAppStorage = {
    _STORAGE_KEY: STORAGE_KEY,
    loadData,
    saveData,
    addStudent,
    getStudents,
    addQuestion,
    getQuestions,
    clearAllData,
    exportQuestionsToCSV,
    exportQuestionsToXLSX
  };

  console.info('LearningAppStorage initialized. key=', STORAGE_KEY);
})();