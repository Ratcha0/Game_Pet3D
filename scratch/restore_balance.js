import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Manual .env loader
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) env[key.trim()] = val.trim().replace(/"/g, '');
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

async function restoreBalance() {
  console.log("🚀 [BALANCE RESTORE] Final Attempt with column 'config'...");

  const originalMechanics = {
    dec_hunger: 0.08,
    dec_clean: 0.05,
    dec_happy: 0.06,
    reg_stamina: 0.75,
    max_stamina: 100,
    rare_rate: 8
  };

  const { data: configRow, error: fetchError } = await supabase
    .from('game_configs')
    .select('*')
    .eq('id', 'current')
    .maybeSingle();

  if (fetchError) {
    console.error("❌ Fetch Error:", fetchError);
    return;
  }

  if (!configRow) {
    console.error("❌ Config 'current' not found.");
    return;
  }

  const updatedConfig = { ...configRow.config };
  if (updatedConfig.mechanics) {
    updatedConfig.mechanics = { ...updatedConfig.mechanics, ...originalMechanics };
  } else {
    updatedConfig.mechanics = originalMechanics;
  }

  const { error: updateError } = await supabase
    .from('game_configs')
    .update({ config: updatedConfig })
    .eq('id', 'current');

  if (updateError) {
    console.error(`❌ Update Error:`, updateError);
  } else {
    console.log(`✅ [SUCCESS] Game Balance restored to 0.08/0.75 in Cloud.`);
  }

  console.log("🏁 [DONE] Balance restoration complete.");
}

restoreBalance();
