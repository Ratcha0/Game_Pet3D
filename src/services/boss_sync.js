import { supabase } from './supabase.js';
import { STATE } from '../store/state.js';

let bossListeners = [];
let isSubscribed = false;
let currentBossState = null;

export const BossService = {
    // 👹 [ACTION] ส่งดาเมจไปที่บอส
    async damageBoss(damage) {
        const playerId = STATE.username || 'GUEST';
        console.log(`👹 [BOSS] Submitting ${damage} damage for ${playerId}...`);

        try {
            // 🔥 ใช้ RPC damage_world_boss_v2 เพื่อความปลอดภัยและเป็น Atomic
            const { data, error } = await supabase.rpc('damage_world_boss_v2', { 
                p_player_id: playerId,
                p_damage_amount: Math.floor(damage) 
            });
            
            if (error) {
                console.error("❌ [BOSS] RPC Error Detail:", error.message, error.details, error.hint);
                return;
            }
            console.log("✨ [BOSS] Damage successfully synced. Server HP:", data);
        } catch (e) {
            console.error("🚨 [BOSS] Critical submission error:", e);
        }
    },

    // ⚙️ [ADMIN] อัปเดตสถานะบอส (เปิด/ปิด/ตั้งเลือด)
    async updateBossStatus(active, hp = null) {
        console.log(`⚙️ [BOSS-ADMIN] Updating status: active=${active}, hp=${hp}`);
        const { data: cfg } = await supabase.from('game_configs').select('config').eq('id', 'current').single();
        if (cfg?.config?.world_boss) {
            const wb = cfg.config.world_boss;
            const updatedConfig = { 
                ...cfg.config, 
                world_boss: { ...wb, active, hp: (hp !== null ? hp : wb.hp) } 
            };
            const result = await supabase.from('game_configs').update({ config: updatedConfig }).eq('id', 'current');
            
            // Sync current state
            currentBossState = updatedConfig.world_boss;
            window._bossActive = !!(currentBossState.active && currentBossState.hp > 0);
            
            console.log("✅ [BOSS-ADMIN] Config updated on Cloud.");
            return result;
        }
    },

    // 📡 [REALTIME] ติดตามการเปลี่ยนแปลงจากผู้เล่นคนอื่น
    subscribe(onUpdate) {
        if (onUpdate && typeof onUpdate === 'function') {
            bossListeners.push(onUpdate);
        }

        if (!isSubscribed) {
            console.log("📡 [BOSS] Initializing Real-time Subscription...");
            isSubscribed = true;
            
            const channel = supabase.channel('world_boss_sync')
                .on('postgres_changes', { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'game_configs', 
                    filter: "id=eq.current" 
                }, payload => {
                    const newBoss = payload.new?.config?.world_boss;
                    if (newBoss) {
                        console.log(`📡 [BOSS] Live update: active=${newBoss.active}, hp=${newBoss.hp}`);
                        window._bossActive = !!(newBoss.active && newBoss.hp > 0);
                        currentBossState = newBoss;
                        bossListeners.forEach(listener => listener(newBoss));
                    }
                })
                .subscribe(status => {
                    console.log(`📡 [BOSS] Channel Status: ${status}`);
                    // 🛡️ [FALLBACK] ถ้าเชื่อมต่อ Realtime ไม่สำเร็จ (เช่น ลืมเปิด Replication)
                    // ให้ใช้ระบบ Polling เช็คทุกๆ 5 วินาทีแทน เพื่อไม่ให้บอสค้าง
                    if (status !== 'SUBSCRIBED') {
                        console.warn("⚠️ [BOSS] Real-time failed. Using polling fallback...");
                        setInterval(async () => {
                            const { data } = await supabase.from('game_configs').select('config').eq('id', 'current').maybeSingle();
                            const boss = data?.config?.world_boss;
                            if (boss && JSON.stringify(boss) !== JSON.stringify(currentBossState)) {
                                currentBossState = boss;
                                bossListeners.forEach(l => l(boss));
                            }
                        }, 5000);
                    }
                });
            
            // 🔄 [AUTO-REFRESH] เช็คสถานะทันทีครั้งแรกที่ Subscribe
            this.damageBoss(0); // เรียก RPC เบาๆ เพื่อกระตุ้น State (ถ้าจำเป็น)

            return channel;
        }
    }
};
