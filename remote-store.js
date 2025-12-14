import { supabase } from './supabaseClient.js';

// Helper: unwrap or throw
function check(res) {
  if (res.error) throw res.error;
  return res.data;
}

export const remoteStore = {
  isEnabled() { return !!supabase; },

  // Categories
  async loadCategories() {
    const { data, error } = await supabase.from('categories').select('name').order('name');
    if (error) throw error;
    return (data || []).map(r => r.name);
  },
  async upsertCategory(name) {
    const { error } = await supabase.from('categories').upsert({ name });
    if (error) throw error;
  },
  async deleteCategory(name) {
    const { error } = await supabase.from('categories').delete().eq('name', name);
    if (error) throw error;
  },

  // Questions
  async loadQuestions() {
    const { data, error } = await supabase.from('questions').select('*').order('id');
    if (error) throw error;
    // Attach categories
    const { data: qc, error: e2 } = await supabase.from('question_categories').select('*');
    if (e2) throw e2;
    const catsByQ = {};
    (qc || []).forEach(r => {
      catsByQ[r.question_id] = catsByQ[r.question_id] || [];
      catsByQ[r.question_id].push(r.category_name);
    });
    return (data || []).map(q => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options || null,
      correctAnswer: q.correct_answer || null,
      difficulty: q.difficulty || 'medium',
      reference: q.reference || '',
      imageUrl: q.image_url || '',
      code: q.code || '',
      categories: catsByQ[q.id] || []
    }));
  },
  async upsertQuestion(q) {
    const payload = {
      id: q.id ?? undefined,
      type: q.type,
      text: q.text,
      options: q.options ?? null,
      correct_answer: q.correctAnswer ?? null,
      difficulty: q.difficulty ?? 'medium',
      reference: q.reference ?? '',
      image_url: q.imageUrl ?? '',
      code: q.code ?? ''
    };
    const { data, error } = await supabase.from('questions')
      .upsert(payload)
      .select('*')
      .limit(1);
    if (error) throw error;
    const saved = (data && data[0]) ? data[0] : payload;

    // Replace categories
    await supabase.from('question_categories').delete().eq('question_id', saved.id);
    for (const c of (q.categories || [])) {
      await supabase.from('categories').upsert({ name: c });
      await supabase.from('question_categories').upsert({ question_id: saved.id, category_name: c });
    }
    return saved.id;
  },
  async deleteQuestion(id) {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) throw error;
  },

  // Students
  async loadStudents() {
    const { data, error } = await supabase.from('students').select('*').order('id');
    if (error) throw error;
    return data || [];
  },
  async upsertStudent(s) {
    const { error } = await supabase.from('students').upsert({ id: s.id, name: s.name, password: s.password });
    if (error) throw error;
  },
  async deleteStudent(id) {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
  },

  // Tests
  async loadTests() {
    const { data, error } = await supabase.from('tests').select('*').order('id');
    if (error) throw error;
    const tests = data || [];
    // Attach questions
    for (const t of tests) {
      const { data: tq } = await supabase.from('test_questions').select('*').eq('test_id', t.id).order('question_index');
      t.questions = (tq || []).map(r => r.question);
      const { data: ta } = await supabase.from('test_assignments').select('*').eq('test_id', t.id);
      t.assignedStudents = (ta || []).map(r => r.student_id);
    }
    return tests;
  },
  async createTest(test) {
    const { data, error } = await supabase.from('tests')
      .insert({ name: test.name, duration: test.duration })
      .select('*')
      .single();
    if (error) throw error;
    const testId = data.id;
    // Persist frozen questions snapshot
    for (let i = 0; i < test.questions.length; i++) {
      const q = test.questions[i];
      await supabase.from('test_questions').insert({ test_id: testId, question_index: i, question: q });
    }
    return testId;
  },
  async setTestAssignments(testId, studentIds) {
    await supabase.from('test_assignments').delete().eq('test_id', testId);
    for (const sid of studentIds) {
      await supabase.from('test_assignments').upsert({ test_id: testId, student_id: sid });
    }
  },
  async deleteTest(testId) {
    const { error } = await supabase.from('tests').delete().eq('id', testId);
    if (error) throw error;
  },

  // Submissions
  async loadSubmissions() {
    const { data, error } = await supabase.from('submissions').select('*').order('id');
    if (error) throw error;
    const subs = data || [];
    for (const s of subs) {
      const { data: ans } = await supabase.from('submission_answers').select('*').eq('submission_id', s.id).order('question_index');
      s.answers = ans || [];
    }
    return subs;
  },

  // Ensure one submission per (test_id, student_id) like your local logic
  async upsertSubmission(submission) {
    // Delete existing submission for this test+student before inserting, to mirror local unique behavior
    await supabase.from('submissions').delete().eq('test_id', submission.testId).eq('student_id', submission.studentId);

    const { data, error } = await supabase.from('submissions')
      .insert({
        test_id: submission.testId,
        student_id: submission.studentId,
        submitted_at: submission.submittedAt?.toISOString?.() || new Date().toISOString()
      })
      .select('*')
      .single();
    if (error) throw error;
    const subId = data.id;

    // Replace answers
    await supabase.from('submission_answers').delete().eq('submission_id', subId);
    for (const a of submission.answers) {
      await supabase.from('submission_answers').insert({
        submission_id: subId,
        question_index: a.questionIndex,
        question: a.question,
        type: a.type,
        answer: a.answer,
        correct: a.correct ?? null,
        reviewed: !!a.reviewed,
        comment: a.comment || null
      });
    }
    return subId;
  },

  async gradeAnswer(submissionId, questionIndex, isCorrect, comment) {
    const { error } = await supabase.from('submission_answers')
      .update({ reviewed: true, correct: !!isCorrect, comment: comment || null })
      .eq('submission_id', submissionId)
      .eq('question_index', questionIndex);
    if (error) throw error;
  },

  // Helper for "Reset Student" UX
  async deleteSubmissionsByStudent(studentId) {
    const { data } = await supabase.from('submissions').select('id').eq('student_id', studentId);
    for (const s of (data || [])) {
      await supabase.from('submissions').delete().eq('id', s.id);
    }
  }
};

// Expose to non-module scripts
if (typeof window !== 'undefined') {
  window.remoteStore = remoteStore;
}
