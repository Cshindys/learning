// Supabase client init. Fill in your details.
const SUPABASE_URL = window.SUPABASE_URL || '';  // e.g., 'https://xxxx.supabase.co'
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || ''; // public anon key

let supabase = null;
function initSupabase() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase initialized');
  } else {
    console.warn('Supabase not configured. Falling back to localStorage.');
  }
}
export { supabase, initSupabase };