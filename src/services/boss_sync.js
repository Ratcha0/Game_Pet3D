import { supabase } from './supabase.js';

export const BossService = {
    // ลดเลือดบอส (Atomic Update)
    async damageBoss(damage) {
        const { data: cfg } = await supabase.from('game_configs').select('config').eq('id', 'production_config').single();
        if (cfg?.config?.world_boss) {
            const wb = cfg.config.world_boss;
            const newHP = Math.max(0, (wb.hp || 0) - (damage || 0));
            const updatedConfig = { 
                ...cfg.config, 
                world_boss: { ...wb, hp: newHP } 
            };
            return await supabase.from('game_configs').update({ config: updatedConfig }).eq('id', 'production_config');
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
        return supabase
            .channel('boss-sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_configs', filter: 'id=eq.production_config' }, 
                payload => {
                    if (payload.new?.config?.world_boss) {
                        onUpdate(payload.new.config.world_boss);
                    }
                }
            ).subscribe();
    }
};
