import { BossService } from '../services/boss_sync.js';
import { supabase } from '../services/supabase.js';
import { STATE, saveState } from '../store/state.js';

/**
 * BOSS REWARD CONTROLLER
 * จัดการเรื่องการแสดงอันดับและแจกรางวัลเมื่อบอสตาย
 * สร้างแยกไฟล์เพื่อไม่ให้กระทบระบบการเล่นหลัก
 */

export const BossRewardController = {
    isVictoryShown: false,
    isClaimed: false,

    init() {
        console.log("👹 Boss Reward Controller Initialized");
        
        // ติดตามสถานะบอสจาก BossService
        BossService.subscribe((wb) => {
            if (!wb) return;

            // 🏆 [ROBUST VICTORY CHECK]
            if (wb.hp <= 0 && wb.max_hp > 0) {
                if (!this.isVictoryShown) {
                    this.handleBossDefeat();
                }
            } else if (wb.hp > 0) {
                // ถ้าบอสมีเลือดใหม่ (เกิดใหม่) ให้รีเซ็ตสถานะ
                this.isVictoryShown = false;
                this.isClaimed = false;
                
                // เคลียร์ประวัติการรับรางวัลของบอสตัวเก่าในรอบถัดไป (ถ้าจำเป็น)
                // ในที่นี้เราใช้ max_hp เป็นตัวแยกบอสแต่ละตัว
            }
        });
    },

    async handleBossDefeat() {
        // 🛡️ [PERSISTENT CHECK] ถ้าเคยรับไปแล้วในบอสรอบนี้ ห้ามเด้งซ้ำ
        const wb = BossService.state;
        const victoryKey = `boss_victory_${wb?.max_hp || 0}`;
        if (localStorage.getItem(victoryKey)) {
            console.log("🛡️ [REWARD] Already claimed for this boss. Skipping modal.");
            this.isVictoryShown = true;
            return;
        }

        this.isVictoryShown = true;
        console.log("🏆 Boss Defeated! Fetching rankings...");

        try {
            // 1. ดึงตารางอันดับจากฐานข้อมูล
            const { data: leaderboard, error } = await supabase.rpc('get_boss_leaderboard');
            if (error) throw error;

            // 🛡️ [ARCHIVE SYNC] บันทึกผลการล่าลงใน Config กลางทันที
            if (leaderboard && leaderboard.length > 0) {
                console.log("📊 [REWARD] Archiving final results to cloud config...");
                const formattedResults = leaderboard.map(p => ({
                    player_id: p.player_id,
                    name: p.display_name || p.pet_name || p.player_id,
                    damage: p.damage
                }));
                BossService.updateBossResults?.(formattedResults);
            }

            // 2. หาอันดับของตัวเอง
            const myPlayerId = localStorage.getItem('last_user_id') || 'GUEST';
            const { data: myData } = await supabase
                .from('pet_progression')
                .select('boss_damage')
                .eq('player_id', myPlayerId)
                .maybeSingle();

            const myDamage = (myData?.boss_damage > 0) ? myData.boss_damage : (STATE.boss_damage || 0);
            const myRank = (leaderboard || []).findIndex(p => p.player_id === myPlayerId) + 1;

            // 3. แสดง Modal สรุปผล
            if (myDamage > 0) {
                this.showVictoryModal(leaderboard, myRank, myDamage);
                // สั่งเซฟทันทีว่า "เห็นแล้ว" ป้องกันเด้งซ้ำตอนรีเฟรช
                localStorage.setItem(victoryKey, 'true'); 
                this.claimRewards();
            } else {
                console.log("ℹ️ [REWARD] No damage to claim. Skipping victory modal.");
                this.isVictoryShown = true;
            }

        } catch (err) {
            console.error("❌ Error handling boss defeat:", err);
        }
    },

    showVictoryModal(leaderboard, myRank, myDamage) {
        const modal = document.getElementById('boss-victory-modal');
        const list = document.getElementById('boss-rank-list');
        if (!modal || !list) return;

        // สร้างรายการอันดับ 1-5
        list.innerHTML = (leaderboard || []).slice(0, 5).map((player, index) => {
            const isMe = player.player_id === (localStorage.getItem('last_user_id') || 'GUEST');
            return `
                <div class="flex items-center justify-between p-3 rounded-xl ${isMe ? 'bg-neon-purple/20 border border-neon-purple/30' : 'bg-white/5'} mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center font-black text-xs">
                            ${(index + 1)}
                        </div>
                        <div class="font-bold text-sm ${isMe ? 'text-neon-purple' : 'text-white'}">${player.display_name || player.pet_name || player.player_id}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-black text-rose-400">${(player.damage || 0).toLocaleString()}</div>
                        <div class="text-[7px] text-white/30 uppercase font-black">DAMAGE</div>
                    </div>
                </div>
            `;
        }).join('') || '<div class="text-center py-4 text-white/20">ยังไม่มีข้อมูลดาเมจ</div>';

        // โชว์สถิติตัวเอง
        document.getElementById('my-boss-damage').innerText = (myDamage || 0).toLocaleString();
        document.getElementById('my-boss-rank').innerText = myRank > 0 ? `#${myRank}` : 'N/A';

        // 🎁 [REWARD PREVIEW] แสดงของรางวัล
        const rewardZone = document.getElementById('reward-preview-zone');
        const tokenPreview = document.getElementById('reward-tokens-preview');
        const xpPreview = document.getElementById('reward-xp-preview');
        
        if (rewardZone && myDamage > 0) {
            const wb = BossService.state;
            const baseTokens = wb?.reward_tokens || 2500;
            const baseXP = wb?.reward_xp || 1000;
            
            let multiplier = 1.0;
            if (myRank === 1) multiplier = 1.5;
            else if (myRank === 2) multiplier = 1.3;
            else if (myRank === 3) multiplier = 1.2;

            if (tokenPreview) tokenPreview.innerText = Math.floor(baseTokens * multiplier).toLocaleString();
            if (xpPreview) xpPreview.innerText = Math.floor(baseXP * multiplier).toLocaleString();
            
            rewardZone.classList.remove('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    },

    async claimRewards() {
        if (this.isClaimed) return;

        const myPlayerId = localStorage.getItem('last_user_id') || 'GUEST';
        console.log(`🎁 [REWARD] Claiming for: ${myPlayerId}`);
        
        try {
            const { data, error } = await supabase.rpc('claim_boss_reward_v2', {
                p_player_id: myPlayerId
            });

            if (error) throw error;
            this.isClaimed = true;

            if (data && data.length > 0) {
                const res = data[0];
                const rTokens = parseInt(res.reward_tokens || 0);
                const rScore = parseInt(res.reward_score || 0);

                console.log(`🎁 [REWARD] Result: Tokens=${rTokens}, Score=${rScore}`);

                if (rTokens > 0 || rScore > 0) {
                    STATE.tokens += rTokens;
                    STATE.score += rScore;
                    STATE.boss_damage = 0; 
                    
                    if (window.updateUI) window.updateUI();
                    await saveState(true); 

                    if (window.spawn) {
                        window.spawn(`🎉 รับรางวัลสำเร็จ! +${rTokens.toLocaleString()}🪙`, "text-yellow-400 font-black");
                    }
                    if (window.triggerLevelUpEffect) window.triggerLevelUpEffect();
                } else {
                    console.log("ℹ️ [REWARD] Zero rewards returned.");
                }
            }
        } catch (err) {
            console.error("❌ [REWARD] Claim failed:", err);
            window.spawn?.("❌ รับรางวัลไม่สำเร็จ กรุณาลองใหม่", "text-rose-500");
        }
    },

    closeModal() {
        this.claimRewards();
        const modal = document.getElementById('boss-victory-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
};

window.closeBossVictoryModal = () => BossRewardController.closeModal();
