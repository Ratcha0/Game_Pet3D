import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vkqcmqyvsqfzflejpbpz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrcWNtcXl2c3FmemZsZWpxYnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTE0NjAsImV4cCI6MjA5MDU2NzQ2MH0.R6R_Y6BeW5cgWSdiyZjb6JvSnHq9T0N5CCJnwHyH_-8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
