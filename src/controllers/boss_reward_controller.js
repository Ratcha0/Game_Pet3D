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

    init() {
        console.log("👹 Boss Reward Controller Initialized");
        
        // ติดตามสถานะบอสจาก BossService
        BossService.subscribe((wb) => {
            if (!wb) return;

            // ตรวจสอบว่าบอสตายหรือยัง (HP <= 0 และ บอส active อยู่)
            if (wb.hp <= 0 && wb.active) {
                if (!this.isVictoryShown) {
                    this.handleBossDefeat();
                }
            } else {
                // ถ้าบอสเกิดใหม่ หรือยังไม่ตาย ให้รีเซ็ตสถานะการโชว์ Popup
                this.isVictoryShown = false;
            }
        });
    },

    async handleBossDefeat() {
        this.isVictoryShown = true;
        console.log("🏆 Boss Defeated! Fetching rankings...");

        try {
            // 1. ดึงตารางอันดับจากฐานข้อมูล
            const { data: leaderboard, error } = await supabase.rpc('get_boss_leaderboard');
            if (error) throw error;

            // 2. หาอันดับของตัวเอง
            const myPlayerId = localStorage.getItem('last_user_id') || 'GUEST';
            const { data: myData } = await supabase
                .from('pet_states')
                .select('boss_damage')
                .eq('player_id', myPlayerId)
                .single();

            const myDamage = myData?.boss_damage || 0;
            const myRank = leaderboard.findIndex(p => p.player_id === myPlayerId) + 1;

            // 3. แสดง Modal สรุปผล
            this.showVictoryModal(leaderboard, myRank, myDamage);

            // 4. แจกรางวัล (จะทำเฉพาะคนที่มีดาเมจเท่านั้น)
            if (myDamage > 0) {
                this.claimRewards(myRank);
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
        list.innerHTML = leaderboard.map((player, index) => {
            const isMe = player.player_id === (localStorage.getItem('last_user_id') || 'GUEST');
            return `
                <div class="flex items-center justify-between p-3 rounded-xl ${isMe ? 'bg-neon-purple/20 border border-neon-purple/30' : 'bg-white/5'} mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center font-black text-xs">
                            ${(index + 1)}
                        </div>
                        <div class="font-bold text-sm ${isMe ? 'text-neon-purple' : 'text-white'}">${player.player_id}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-black text-rose-400">${player.damage.toLocaleString()}</div>
                        <div class="text-[7px] text-white/30 uppercase font-black">DAMAGE</div>
                    </div>
                </div>
            `;
        }).join('') || '<div class="text-center py-4 text-white/20">ยังไม่มีข้อมูลดาเมจ</div>';

        // โชว์สถิติตัวเอง
        document.getElementById('my-boss-damage').innerText = myDamage.toLocaleString();
        document.getElementById('my-boss-rank').innerText = myRank > 0 ? `#${myRank}` : 'N/A';

        // แสดง Modal
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    },


    async claimRewards(ignoredRank) {
        const myPlayerId = localStorage.getItem('last_user_id') || 'GUEST';
        
        // 🔥 [AUDIT v4] ดึงทุกอย่างในครั้งเดียว (Atomic)
        const { data, error } = await supabase.rpc('claim_boss_reward_v2', {
            p_player_id: myPlayerId
        });

        if (error) {
            console.error("❌ Claim Error:", error);
            return;
        }

        if (data && data.length > 0) {
            const res = data[0];
            const finalRank = res.rank;
            const finalDamage = res.damage_done;
            const rewardTokens = res.reward_tokens;
            const rewardScore = res.reward_score;

            // 🛡️ [SYNC FIX] อัปเดต STATE ภายในเครื่องทันทีเพื่อให้ตัวเลขบนหน้าจอขยับตาม
            STATE.tokens += rewardTokens;
            STATE.score += rewardScore;
            
            if (window.updateUI) window.updateUI();
            saveState(false, true); // บันทึกสถานะล่าสุดลง Local/Cloud ทันที

            // อัปเดตตัวเลขในหน้าจอสรุปผล
            if (document.getElementById('my-boss-damage')) document.getElementById('my-boss-damage').innerText = finalDamage.toLocaleString();
            if (document.getElementById('my-boss-rank')) document.getElementById('my-boss-rank').innerText = `#${finalRank}`;

            if (window.spawn) {
                const rankText = finalRank <= 5 ? `อันดับที่ ${finalRank}` : "ผู้เข้าร่วม";
                window.spawn(`🎉 รับรางวัล${rankText}: 🪙 ${rewardTokens.toLocaleString()} / 🏆 ${rewardScore.toLocaleString()}`, "text-yellow-400 font-black animate-bounce");
            }
            
            // เล่นเอฟเฟกต์พลุ/เฉลิมฉลอง
            if (window.triggerLevelUpEffect) window.triggerLevelUpEffect();
        }
    },

    closeModal() {
        const modal = document.getElementById('boss-victory-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
};

// ทำให้เรียกปิดจาก HTML ได้
window.closeBossVictoryModal = () => BossRewardController.closeModal();
