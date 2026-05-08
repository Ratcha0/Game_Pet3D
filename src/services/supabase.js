import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bueyeufcfdsdgqbrtpau.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZXlldWZjZmRzZGdxYnJ0cGF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTAyNTIsImV4cCI6MjA5MTI4NjI1Mn0.RGjyIoZnS3WL1RSyYGPqAzzTVfK0tYrdkxPnE1iA-ho';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 🚀 [DEEP AUDIT v2.1] โหลดข้อมูลสัตว์เลี้ยงพร้อมระบบวินิจฉัยปัญหา (Detailed Diagnostics)
 */
export async function loadPetState(userId) {
    console.log(`🔍 [DB] Loading full state for: ${userId}`);
    if (!userId) return { data: null, error: 'No User ID' };

    try {
        // แยกการยิง Query เพื่อเก็บ Log รายตัว
        const queries = [
            { key: 'profiles', promise: supabase.from('profiles').select('*').eq('id', userId).maybeSingle() },
            { key: 'pet_stats', promise: supabase.from('pet_stats').select('*').eq('player_id', userId).maybeSingle() },
            { key: 'pet_progression', promise: supabase.from('pet_progression').select('*').eq('player_id', userId).maybeSingle() },
            { key: 'pet_assets', promise: supabase.from('pet_assets').select('*').eq('player_id', userId).maybeSingle() },
            { key: 'pet_activities', promise: supabase.from('pet_activities').select('*').eq('player_id', userId).maybeSingle() },
            { key: 'pet_buffs', promise: supabase.from('pet_buffs').select('*').eq('player_id', userId).maybeSingle() }
        ];

        const results = await Promise.all(queries.map(q => q.promise));
        
        // 🛡️ [DIAGNOSTICS] เช็ค Error รายตาราง
        let hasCriticalError = false;
        results.forEach((res, i) => {
            if (res.error) {
                console.error(`🚨 [DB] Table '${queries[i].key}' Error:`, res.error.message);
                // ถ้าตาราง profiles หาย คือปัญหาใหญ่
                if (queries[i].key === 'profiles') hasCriticalError = true;
            }
        });

        const [profile, stats, prog, assets, activity, buffs] = results;

        if (hasCriticalError) throw new Error("Critical table 'profiles' is missing or inaccessible.");

        console.log("✅ [DB] Multi-table data fetch completed.");

        if (!profile.data) {
            console.log("ℹ️ [DB] No profile found. User might be new.");
            return { data: null, error: null };
        }

        // 🛡️ [DEEP MERGE] รวมร่างข้อมูลจากทุกตารางแบบปลอดภัย (Null-Safe)
        const fullData = {
            id: userId,
            username: profile.data?.display_name || userId,
            pin_code: profile.data?.pin_code || "",
            is_banned: profile.data?.is_banned || false,
            
            // Stats
            hunger: stats.data?.hunger ?? 80,
            clean: stats.data?.clean ?? 80,
            love: stats.data?.love ?? 50,
            stamina: stats.data?.stamina ?? 100,
            max_stamina: stats.data?.max_stamina ?? 100,
            carrying_rock: stats.data?.carrying_rock ?? 0,
            last_interaction_at: stats.data?.last_interaction_at || new Date().toISOString(),

            // Progression
            level: prog.data?.level ?? 1,
            xp: prog.data?.xp ?? 0,
            max_exp: prog.data?.max_exp ?? 200,
            score: prog.data?.score ?? 0,
            tokens: prog.data?.tokens ?? 500,
            current_season: prog.data?.current_season ?? 1,
            boss_damage: prog.data?.boss_damage ?? 0,

            // Assets
            inventory: assets.data?.inventory ?? { skins: [], boosters: {}, equipped_skins: {} },
            boss_skills: assets.data?.boss_skills ?? { points: 0, xp: 0, lvl: 1 },

            // Activities
            quests: activity.data?.quests ?? {},
            last_quest_date: activity.data?.last_quest_date,
            login_streak: activity.data?.login_streak ?? 0,
            last_login_date: activity.data?.last_login_date,
            achievements: activity.data?.achievements ?? [],

            // Buffs
            buffs: buffs.data?.buffs ?? { score_mult: 1, score_expiry: 0, decay_mult: 1, decay_expiry: 0, luck_mult: 1, luck_expiry: 0, regen_mult: 1, regen_expiry: 0 },

            // Config (Persisted in Inventory JSON to avoid schema cache issues)
            config_meta: assets.data?.inventory?.config || {
                template: profile.data?.template || "pet", // Fallback to old profile col if it existed
                difficulty_mode: profile.data?.difficulty_mode || "normal"
            }
        };

        return { data: fullData, error: null };
    } catch (e) {
        console.error("❌ loadPetState Deep Error:", e);
        return { data: null, error: e };
    }
}

/**
 * 🚀 [DEEP AUDIT v2] บันทึกข้อมูลแบบรักษาความถูกต้องของประเภทข้อมูล (Type-Safe Save)
 */
export async function savePetState(userId, state) {
    console.log(`💾 [DB] Saving state for: ${userId}...`);
    if (!userId) return;

    try {
        // 1. Profile (Upsert)
        const profile = {
            id: userId,
            display_name: state.username,
            pin_code: state.pin_code,
            is_banned: state.is_banned || false,
            last_login_at: new Date().toISOString()
        };

        // 2. Stats
        const stats = {
            player_id: userId,
            hunger: parseFloat(state.hunger) || 0,
            clean: parseFloat(state.clean) || 0,
            love: parseFloat(state.love) || 0,
            stamina: parseFloat(state.stamina) || 0,
            max_stamina: parseFloat(state.max_stamina) || 100,
            carrying_rock: parseInt(state.carrying_rock) || 0,
            last_interaction_at: new Date().toISOString()
        };

        // 3. Progression
        const prog = {
            player_id: userId,
            level: parseInt(state.level) || 1,
            xp: parseFloat(state.xp) || 0,
            max_exp: parseFloat(state.max_exp) || 200,
            score: parseInt(state.score) || 0,
            tokens: parseInt(state.tokens) || 500,
            current_season: parseInt(state.current_season) || 1,
            boss_damage: parseInt(state.boss_damage) || 0
        };

        // 4. Assets
        const assets = {
            player_id: userId,
            inventory: {
                ...(state.inventory || {}),
                config: {
                    template: state.config?.template || 'pet',
                    difficulty_mode: state.config?.difficulty_mode || 'normal'
                }
            },
            boss_skills: state.boss_skills || {}
        };

        // 5. Activities
        const activities = {
            player_id: userId,
            quests: state.quests || {},
            last_quest_date: state.last_quest_date,
            login_streak: parseInt(state.login_streak) || 0,
            last_login_date: state.last_login_date,
            achievements: state.achievements || []
        };

        // 6. Buffs
        const buffs = {
            player_id: userId,
            buffs: state.buffs || {}
        };

        // 🛡️ [CRITICAL FIX] บันทึก Profiles ก่อนเพื่อให้ตารางอื่นอ้างอิง Foreign Key ได้ (ป้องกัน Error 23503)
        const profileResult = await supabase.from('profiles').upsert(profile);
        if (profileResult.error) throw profileResult.error;

        // เมื่อ Profile รอดแล้ว ค่อยบันทึกที่เหลือพร้อมกันได้
        const results = await Promise.all([
            supabase.from('pet_stats').upsert(stats),
            supabase.from('pet_progression').upsert(prog),
            supabase.from('pet_assets').upsert(assets),
            supabase.from('pet_activities').upsert(activities),
            supabase.from('pet_buffs').upsert(buffs)
        ]);

        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
            console.error("❌ [DB] Save Errors encountered:", errors);
            throw errors[0].error;
        }

        console.log("✨ [DB] State saved successfully across all tables.");
        return { success: true };
    } catch (e) {
        console.error("🚨 [DB] CRITICAL SAVE ERROR:", e);
        return { success: false, error: e };
    }
}

export async function fetchLiveRankings(seasonNum = 1) {
    const { data, error } = await supabase
        .from('pet_progression')
        .select(`score, level, profiles!inner (display_name)`)
        .eq('current_season', seasonNum)
        .order('score', { ascending: false })
        .limit(50);

    if (error) return { data: [], error };
    return { 
        data: data.map(item => ({
            pet_name: item.profiles?.display_name || "Unknown",
            level: item.level,
            score: item.score
        })), 
        error: null 
    };
}

export async function loadGameConfig() {
    const { data, error } = await supabase.from('game_configs').select('config').eq('id', 'current').maybeSingle();
    return { data: data?.config || null, error };
}

export async function saveGameConfig(configData) {
    return await supabase.from('game_configs').upsert({
        id: 'current',
        config: configData,
        updated_at: new Date().toISOString()
    });
}

export async function logSeasonHistory(userId, season, score, level) {
    await supabase.from('season_history').insert({
        player_id: userId, season_number: season, final_score: score, final_level: level
    });
}

export async function fetchSeasonRankings(seasonNum) {
    const { data, error } = await supabase
        .from('season_history')
        .select(`final_score, final_level, profiles!inner (display_name)`)
        .eq('season_number', seasonNum)
        .order('final_score', { ascending: false });
    
    if (error) return { data: [], error };
    return {
        data: data.map(item => ({
            pet_name: item.profiles?.display_name,
            score: item.final_score,
            level: item.final_level
        })),
        error: null
    };
}

export async function fetchAllPlayers() {
    // 🔥 [DEEP AUDIT v2] ใช้ View พิเศษที่รวมข้อมูลครบทุกตารางมาให้แล้ว
    const { data, error } = await supabase
        .from('admin_user_overview')
        .select('*')
        .order('last_login_at', { ascending: false });
    
    if (error) return { data: [], error };
    return {
        data: data.map(item => ({
            player_id: item.id,
            pet_name: item.display_name,
            is_banned: item.is_banned,
            level: item.level || 1,
            score: item.score || 0,
            tokens: item.tokens || 0,
            boss_damage: item.boss_damage || 0,
            last_interaction_at: item.last_interaction_at || item.last_login_at
        })),
        error: null
    };
}

export async function setUserBanStatus(userId, status) {
    return await supabase.from('profiles').update({ is_banned: status }).eq('id', userId);
}

export async function updateLoginTime(userId) {
    if (!userId) return;
    return await supabase.from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);
}

/**
 * 🏆 ดึงอันดับโลก (Compatibility Alias)
 */
export async function fetchLeaderboard(limit = 10) {
    return await fetchLiveRankings(1); // ดึงซีซั่น 1 เป็นหลัก
}

/**
 * 📜 บันทึก Log การได้คะแนน
 */
export async function logScoreAction(userId, action, scoreChange, tokenChange, memo) {
    return await supabase.from('score_logs').insert({
        player_id: userId,
        action_type: action,
        score_change: parseInt(scoreChange) || 0,
        token_change: parseInt(tokenChange) || 0,
        memo: memo || ""
    });
}

// --- 🛡️ COMPATIBILITY ALIASES (เพื่อให้แอปเดิมทำงานได้ 100%) ---
export const fetchAllUsers = fetchAllPlayers;
export async function checkBanStatus(userId) {
    const { data } = await supabase.from('profiles').select('is_banned').eq('id', userId).maybeSingle();
    return data?.is_banned || false;
}
