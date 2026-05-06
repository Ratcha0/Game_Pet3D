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
    let { data, error } = await supabase
        .from('pet_states')
        .upsert({
            player_id: userId,
            pet_name: stateData.username,
            pin_code: stateData.pin_code,
            level: stateData.level,
            xp: Math.floor(stateData.xp),
            max_exp: stateData.max_exp || 200,
            max_stamina: stateData.max_stamina || 100,
            score: Math.floor(stateData.score),
            tokens: Math.floor(stateData.tokens),
            hunger: stateData.hunger,
            clean: stateData.clean,
            love: Math.floor(stateData.love),
            stamina: stateData.stamina,
            inventory: stateData.inventory || { skins: [], boosters: [] },
            boss_skills: stateData.boss_skills || { points: 0, xp: 0, lvl: 1 },
            quests_data: stateData.quests || {},
            last_quest_date: stateData.last_quest_date,
            current_season: stateData.current_season || 1, // 🏆 [AUDIT FIX] ดึงจากสถานะจริงของผู้เล่น ไม่ใช่อ้างอิงจาก Config กลาง เพื่อป้องกัน Reset Loop
            // 🚀 [CLOUD SYNC FIX] เปิดใช้งานการเซฟฟิลด์ใหม่ๆ ทั้งหมดจริง
            config: stateData.config || {},
            buffs: stateData.buffs || { score_mult: 1, score_expiry: 0, decay_mult: 1, decay_expiry: 0, luck_mult: 1, luck_expiry: 0, regen_mult: 1, regen_expiry: 0 },
            login_streak: stateData.login_streak || 0,
            last_login_date: stateData.last_login_date || "",
            memory: stateData.memory || { interaction_counts: { feed: 0, clean: 0, play: 0, repair: 0 }, loyalty_bonus: 0 },
            carrying_rock: stateData.carrying_rock || 0,
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
 * เพิ่มรางวัลผู้เล่นแบบ Atomic (RPC) - ป้องกันเงินหาย
 */
export async function addPlayerRewards(userId, tokens, xp, score) {
    const { error } = await supabase.rpc('add_player_rewards', {
        p_player_id: userId,
        p_tokens: Math.floor(tokens),
        p_xp: Math.floor(xp),
        p_score: Math.floor(score)
    });
    if (error) console.error("Error adding rewards via RPC:", error);
    return { error };
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
 * บันทึกสรุปผลงานเมื่อจบซีซั่น (Season Reset)
 */
export async function logSeasonHistory(userId, seasonNum, score, level, rank = null) {
    const { data, error } = await supabase
        .from('season_history')
        .insert({
            player_id: userId,
            season_number: seasonNum,
            final_score: Math.floor(score),
            final_level: level,
            final_rank: rank
        });
        
    if (error) console.error("Error logging season history:", error);
    return { data, error };
}

/**
 * ดึง Ranking ผู้เล่นดะแนนสูงสุด 10 อันดับแรก
 */
export async function fetchLeaderboard(seasonNum = 1) {
    const { data, error } = await supabase
        .from('pet_states')
        .select('player_id, level, score, pet_name')
        .eq('current_season', seasonNum)
        .order('score', { ascending: false })
        .limit(10);
        
    if (error) console.error("Error fetching leaderboard:", error);
    return { data, error };
}

/**
 * ดึงสรุปอันดับของซีซั่นที่ผ่านๆ มา
 */
export async function fetchSeasonRankings(seasonNum) {
    const { data, error } = await supabase
        .from('season_history')
        .select('player_id, final_score, created_at, final_level')
        .eq('season_number', seasonNum)
        .order('final_score', { ascending: false })
        .limit(20);
        
    if (error) console.error("Error fetching season rankings:", error);
    return { data, error };
}

/**
 * ดึงอันดับ "สด" ของซีซั่นปัจจุบัน (ดึงจาก Pet States โดยตรง)
 */
export async function fetchLiveRankings(seasonNum) {
    const { data, error } = await supabase
        .from('pet_states')
        .select('player_id, score, last_interaction_at, pet_name, level')
        .eq('current_season', seasonNum)
        .order('score', { ascending: false })
        .limit(20);
        
    if (error) console.error("Error fetching live rankings:", error);
    return { data, error };
}

/**
 * ดึงรายชื่อผู้เล่นทั้งหมด (สำหรับหน้าจัดการผู้เล่น)
 */
export async function fetchAllUsers(onlyBanned = false) {
    let query = supabase
        .from('pet_states')
        .select('player_id, score, level, tokens, is_banned, last_interaction_at')
        .order('last_interaction_at', { ascending: false });
        
    if (onlyBanned) query = query.eq('is_banned', true);
    
    const { data, error } = await query;
    if (error) console.error("Error fetching users:", error);
    return { data, error };
}

/**
 * แบน/ปลดแบนผู้เล่น
 */
export async function setUserBanStatus(userId, status) {
    const { data, error } = await supabase
        .from('pet_states')
        .update({ is_banned: status })
        .eq('player_id', userId);
        
    if (error) console.error(`Error setting ban status for ${userId}:`, error);
    return { data, error };
}
