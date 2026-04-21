import { createClient } from '@supabase/supabase-js';

// ค่าเหล่านี้ดึงมาจากไฟล์ .env
// ถ้าใช้งานบน Vercel โดยไม่ได้เซ็ตหลังบ้าน จะวิ่งมาใช้ค่าสำรองตรงนี้แทน (เพื่อกันบัค HTTP Headers)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bueyeufcfdsdgqbrtpau.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZXlldWZjZmRzZGdxYnJ0cGF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTAyNTIsImV4cCI6MjA5MTI4NjI1Mn0.RGjyIoZnS3WL1RSyYGPqAzzTVfK0tYrdkxPnE1iA-ho';

// สร้างตัวเชื่อมต่อ (Client)
export const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ฟังก์ชัน Helper ที่เตรียมไว้ให้สำหรับเรียกใช้งาน
// ==========================================

/**
 * เก็บ/อัปเดตข้อมูลเซฟเกมสัตว์เลี้ยง
 */
export async function savePetState(userId, stateData) {
    const { data, error } = await supabase
        .from('pet_states')
        .upsert({
            player_id: userId,
            pet_name: stateData.username,
            pin_code: stateData.pin_code,
            level: stateData.level,
            xp: Math.floor(stateData.xp),
            max_exp: stateData.maxExp,
            score: Math.floor(stateData.score),
            tokens: Math.floor(stateData.tokens),
            hunger: stateData.hunger,
            clean: stateData.clean,
            love: Math.floor(stateData.love),
            stamina: stateData.stamina,
            quests_data: stateData.quests,
            buffs_data: stateData.buffs,
            inventory: stateData.inventory,
            last_interaction_at: new Date().toISOString()
        }, { onConflict: 'player_id' });
        
    if (error) console.error("Error saving pet state:", error);
    return { data, error };
}

/**
 * ดึงข้อมูลเซฟเกมสัตว์เลี้ยงมาโหลดตอนเข้าเกม
 */
export async function loadPetState(userId) {
    const { data, error } = await supabase
        .from('pet_states')
        .select('*')
        .eq('player_id', userId)
        .maybeSingle();
        
    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found (ผู้เล่นใหม่)
        console.error("Error loading pet state:", error);
    }
    return { data, error };
}

/**
 * โหลด Config จากหน้า Admin (ใช้ดึงค่าพวก ความยากง่าย ราคาของ)
 */
export async function loadGameConfig(configId = 'production_config') {
    const { data, error } = await supabase
        .from('game_configs')
        .select('*')
        .eq('id', configId)
        .single();
        
    if (error) console.error("Error loading game config:", error);
    return { data, error };
}
/**
 * บันทึก Config จากหน้า Admin ขึ้น Cloud (Matrix, Skins, Global Settings)
 */
export async function saveGameConfig(configData, configId = 'production_config') {
    const { data, error } = await supabase
        .from('game_configs')
        .upsert({
            id: configId,
            config: configData,
            updated_at: new Date().toISOString()
        });
        
    if (error) console.error("Error saving game config:", error);
    return { data, error };
}

/**
 * บันทึกประวัติคะแนนเมื่อเล่นเกม ส่งกลับระบบหลังบ้าน
 */
export async function logScoreAction(userId, actionType, scoreGain, tokenGain, desc = '') {
    const { data, error } = await supabase
        .from('score_logs')
        .insert({
            player_id: userId,
            action_type: actionType,
            score_change: Math.floor(scoreGain),
            token_change: Math.floor(tokenGain),
            description: desc
        });
        
    if (error) console.error("Error logging score:", error);
    return { data, error };
}

/**
 * ดึง Ranking ผู้เล่นดะแนนสูงสุด 10 อันดับแรก
 */
export async function fetchLeaderboard() {
    const { data, error } = await supabase
        .from('pet_states')
        .select('player_id, level, score')
        .order('score', { ascending: false })
        .limit(10);
        
    if (error) console.error("Error fetching leaderboard:", error);
    return { data, error };
}
