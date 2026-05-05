import { supabase } from './supabase.js';

let bossListeners = [];
let isSubscribed = false;

export const BossService = {
    // ลดเลือดบอส (Atomic Update via RPC)
    // ลดเลือดบอส (Atomic Update via RPC)
    async damageBoss(damage) {
        const playerId = localStorage.getItem('last_user_id') || 'GUEST';
        
        // 🔥 [PRODUCTION v2] ส่งดาเมจพร้อม Player ID เพื่อจัดอันดับ (ระบบ Atomic ปลอดภัย 100%)
        const { error } = await supabase.rpc('damage_world_boss_v2', { 
            p_player_id: playerId,
            p_damage_amount: Math.floor(damage) 
        });
        
        if (error) {
            console.error("❌ Boss Damage Sync Error: ฟังก์ชัน RPC 'damage_world_boss_v2' ไม่ทำงาน!", error);
            if (window.spawn) window.spawn("⚠️ ดาเมจไม่บันทึก! กรุณาตรวจสอบ RPC ใน Supabase", "text-red-400");
        }
    },

    // อัปเดตสถานะบอส (เปิด/ปิด/เลือด)
    async updateBossStatus(active, hp = null) {
        const { data: cfg } = await supabase.from('game_configs').select('config').eq('id', 'production_config').single();
        if (cfg?.config?.world_boss) {
            const wb = cfg.config.world_boss;
            const updatedConfig = { 
                ...cfg.config, 
                world_boss: { ...wb, active, hp: (hp !== null ? hp : wb.hp) } 
            };
            return await supabase.from('game_configs').update({ config: updatedConfig }).eq('id', 'production_config');
        }
    },

    // ติดตามการเปลี่ยนแปลง Realtime
    subscribe(onUpdate) {
        if (onUpdate && typeof onUpdate === 'function') {
            bossListeners.push(onUpdate);
        }

        if (!isSubscribed) {
            isSubscribed = true;
            return supabase
                .channel('boss-sync')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_configs', filter: 'id=eq.production_config' }, 
                    payload => {
                        if (payload.new?.config?.world_boss) {
                            bossListeners.forEach(listener => listener(payload.new.config.world_boss));
                        }
                    }
                ).subscribe();
        }
    }
};
