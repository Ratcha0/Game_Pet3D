import { BossService } from '../services/boss_sync.js';
import { saveState } from '../store/state.js';
import { SFX } from '../services/sound.js';

/**
 * ☄️ Boss Controller
 * จัดการเหตุการณ์การสู้บอสในเกม
 */
export const initBossController = (STATE, engineHelpers) => {
    const { spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel, flashBoss } = engineHelpers;

    // 🔘 Toggle ย่อ/ขยายแผงควบคุมหลักทั้งหมด (Consolidated in game.js)

    // อัปเดตการแสดงผล HUD ของบอส
    const updateBossHUD = (wb) => {
        const bossHPContainer = document.getElementById('world-boss-hud');
        const skillPanel = document.getElementById('boss-skill-panel');
        const toggleArea = document.getElementById('boss-skill-toggle-area');
        const throwBtn = document.getElementById('btn-throw-rock');
        
        // 🔥 [STRICT VISIBILITY] บอสต้องเปิดใช้งาน และ มีเลือดเหลืออยู่ ถึงจะแสดง
        const isActive = !!(wb && wb.active === true && (wb.hp > 0));

        if (isActive) {
            if (bossHPContainer) bossHPContainer.classList.remove('hidden');
            if (skillPanel) skillPanel.classList.remove('hidden');
            if (throwBtn) updateThrowButton(wb);

            const hp = wb?.hp ?? 0;
            const max = wb?.max_hp ?? 1000000;
            
            // 🔥 [UI SAFETY FIX] ป้องกันหลอดเลือดเอ๋อ (หลอดดำ) ถ้าเลือดปัจจุบันมากกว่าเลือดสูงสุด
            const rawPercent = (hp / max) * 100;
            const hpPercent = Math.max(0, Math.min(100, rawPercent));
            
            const bar = document.getElementById('boss-hp-bar');
            const text = document.getElementById('boss-hp-text');
            if (bar) {
                bar.style.width = `${hpPercent}%`;
                // เปลี่ยนสีหลอดตามความวิกฤต (ชมพู -> แดง)
                if (hpPercent < 20) bar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
                else bar.style.background = 'linear-gradient(90deg, #ec4899, #8b5cf6)';
            }
            if (text) text.innerText = `${hp.toLocaleString()} HP`;
            
            // Rock Spawning Logic
            const spawnDelay = (wb?.rock_spawn_delay ?? 1) * 1000;
            if (!window._rockSpawner || window._rockSpawnerDelay !== spawnDelay) {
                if (window._rockSpawner) clearInterval(window._rockSpawner);
                window._rockSpawnerDelay = spawnDelay;
                window._rockSpawner = setInterval(() => {
                    const currentLimit = STATE.config.world_boss?.rock_spawn_limit ?? 3;
                    if (window._worldRocks && window._worldRocks.length < currentLimit) {
                        const id = 'rock_' + Date.now();
                        const pos = { x: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 };
                        spawnWorldRock(id, pos);
                    }
                }, spawnDelay);
            }
            window.updateSkillUI();
        } else {
            // 🛑 ซ่อนทุกอย่างที่เกี่ยวกับบอสทันที
            if (bossHPContainer) bossHPContainer.classList.add('hidden');
            if (skillPanel) skillPanel.classList.add('hidden');
            if (toggleArea) toggleArea.classList.add('hidden');
            if (throwBtn) throwBtn.classList.add('hidden');
            
            // 🛡️ [BUGFIX] บอสตาย ต้องลบตัวบอสออกจากฉากทันที
            if (typeof updateBossModel === 'function') {
                updateBossModel(null); // ส่ง null เพื่อสั่งลบออกจากฉาก 3D
            }

            if (wb && wb.hp <= 0) {
                // 🛡️ [AUDIT FIX] ลบ resetBossSkills() ออก เพื่อให้ผู้เล่นเก็บเลเวลสกิลไว้สู้บอสตัวถัดไปได้
                // จะรีเซ็ตจริงเฉพาะตอน "จบซีซั่น" (Season Reset) เท่านั้น
            }

            if (typeof clearWorldRocks === 'function') clearWorldRocks();
            
            // หยุดการเกิดของหิน
            if (window._rockSpawner) {
                clearInterval(window._rockSpawner);
                window._rockSpawner = null;
                window._rockSpawnerDelay = null;
            }
        }
    };

    let _lastSkillState = "";
    window.updateSkillUI = () => {
        const currentState = JSON.stringify(STATE.boss_skills);
        if (currentState === _lastSkillState) return;
        _lastSkillState = currentState;

        const skills = ['damage', 'crit', 'speed', 'bag'];
        skills.forEach(key => {
            const s = STATE.boss_skills[key];
            const expBar = document.getElementById(`skill-${key}-exp`);
            const dotsContainer = document.getElementById(`dots-${key}`);
            const arrow = document.querySelector(`.boss-skill-item[onclick*="${key}"] .lvl-up-arrow`);
            
            // ใช้ XP รวมในการแสดงหลอดความก้าวหน้า
            if (expBar) {
                const pct = Math.min(100, (STATE.boss_skills.xp / STATE.boss_skills.next) * 100);
                expBar.style.width = `${pct}%`;
            }
            
            if (dotsContainer) {
                dotsContainer.innerHTML = '';
                for (let i = 1; i <= 5; i++) {
                    const dot = document.createElement('div');
                    dot.className = `skill-dot ${i <= s.lvl ? 'active' : ''}`;
                    dotsContainer.appendChild(dot);
                }
            }
            // ปุ่มอัปเกรดจะโชว์ถ้า "มีแต้มสกิล" และ "เลเวลยังไม่เต็ม"
            if (arrow) {
                if (STATE.boss_skills.points > 0 && s.lvl < 5) {
                    arrow.classList.remove('hidden');
                } else {
                    arrow.classList.add('hidden');
                }
            }
        });

        // --- 🔴 Update Global Skill Noti Dot ---
        const globalDot = document.getElementById('skill-noti-dot');
        if (globalDot) {
            if (STATE.boss_skills.points > 0) {
                globalDot.classList.remove('hidden');
            } else {
                globalDot.classList.add('hidden');
            }
        }
    };

    window.upgradeBossSkill = (key) => {
        const s = STATE.boss_skills[key];
        if (STATE.boss_skills.points > 0 && s.lvl < 5) {
            s.lvl++;
            STATE.boss_skills.points--;
            saveState(false, true); 
            window.updateSkillUI();
            applySkillEffects();
            
            const skillNames = { damage: 'ความแรงการปา', crit: 'โอกาสติดคริ', speed: 'ความเร็วขว้าง', bag: 'ความจุหิน' };
            window.spawn?.(`✨ อัปเกรด ${skillNames[key] || key} เป็น LVL ${s.lvl}! (เหลือ ${STATE.boss_skills.points} แต้ม)`, "text-cyan-400 font-bold");
            SFX.playAsset('level');
        }
    };

    const applySkillEffects = () => {
        window._bossSpeedMult = 1.0 + (STATE.boss_skills.speed.lvl - 1) * 0.35;
        updateThrowButton(STATE.config.world_boss);
    };

    window.updateBossThrowUI = () => updateThrowButton(STATE.config?.world_boss);
    
    const resetBossSkills = () => {
        STATE.boss_skills.lvl = 1;
        STATE.boss_skills.xp = 0;
        STATE.boss_skills.next = 5000;
        STATE.boss_skills.points = 0;
        
        const skills = ['damage', 'crit', 'speed', 'bag'];
        skills.forEach(key => {
            STATE.boss_skills[key].lvl = 1;
        });

        STATE.carrying_rock = 0;
        window._bossSpeedMult = 1.0;
        window.updateSkillUI();
        updateThrowButton(STATE.config?.world_boss);
        saveState(false, true);
        console.log("🧹 [Boss System] รีเซ็ตสกิลและสถานะการต่อสู้แล้ว");
    };

    const updateThrowButton = (wb) => {
        const btn = document.getElementById('btn-throw-rock');
        if (!btn) return;
        
        const count = STATE.carrying_rock || 0;
        const baseLimit = (wb?.rock_carry_limit !== undefined) ? parseInt(wb.rock_carry_limit) : 2;
        const carryLimit = baseLimit + (STATE.boss_skills.bag.lvl - 1) * 2; 

        if (wb?.active && (wb.hp > 0)) {
            btn.classList.remove('hidden');
            const label = btn.querySelector('.tracking-tighter');
            if (label) label.innerText = `ขว้าง! (${count}/${carryLimit})`;
            
            if (count > 0) {
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
            } else {
                btn.style.opacity = "0.5";
                btn.style.pointerEvents = "none";
            }
        } else {
            btn.classList.add('hidden');
        }
    };

    window.collectRock = (id) => {
        const currentCount = STATE.carrying_rock || 0;
        const wb = STATE.config?.world_boss;
        const baseLimit = (wb?.rock_carry_limit !== undefined) ? parseInt(wb.rock_carry_limit) : 2;
        const carryLimit = baseLimit + (STATE.boss_skills.bag.lvl - 1) * 2;
        
        if (currentCount >= carryLimit) {
            const now = Date.now();
            if (!window._lastRockWarn || now - window._lastRockWarn > 2000) {
                window.spawn?.(`🎒 กระเป๋าเต็ม! (${carryLimit} ก้อน)`, "text-red-400 font-bold");
                window._lastRockWarn = now;
            }
            return;
        }

        if (collectWorldRockAtPet(id)) {
            STATE.carrying_rock = currentCount + 1;
            saveState();
            updateThrowButton(STATE.config?.world_boss);
            window.spawn?.(`🪨 เก็บหินแล้ว! (${STATE.carrying_rock}/${carryLimit})`, "text-orange-400 font-black scale-110");
        }
    };

    let _isThrowing = false;
    window.throwRock = async () => {
        if (_isThrowing) return;

        const count = STATE.carrying_rock || 0;
        if (count <= 0 || !STATE.config?.world_boss?.active || (STATE.config?.world_boss?.hp <= 0)) return;
        
        _isThrowing = true;
        STATE.carrying_rock = count - 1;
        saveState();
        updateThrowButton(STATE.config.world_boss);
        
        const powerLvl = STATE.boss_skills.damage.lvl;
        const critLvl = STATE.boss_skills.crit.lvl;
        
        const wbConfig = STATE.config?.world_boss || {};
        const baseDmg = (wbConfig.base_damage !== undefined) ? parseFloat(wbConfig.base_damage) : 5000;
        const scaleDmg = (wbConfig.damage_scale !== undefined) ? parseFloat(wbConfig.damage_scale) : 5000;

        let damage = baseDmg + (powerLvl * scaleDmg);
        let isCrit = Math.random() < (critLvl * 0.20); 
        
        if (isCrit) damage *= 2; 

        const petPos = _getPetPosition();
        const cooldownMs = Math.max(500, 1200 / (window._bossSpeedMult || 1.0));

        throwRockAtBoss(petPos, async () => {
            if (flashBoss) flashBoss(); // 💥 [VISUAL JUICE]
            await BossService.damageBoss(Math.floor(damage));
            
            setTimeout(() => {
                _isThrowing = false;
            }, cooldownMs);

            const expGained = Math.floor(damage / 10); 
            STATE.boss_skills.xp += expGained;
            
            if (STATE.boss_skills.xp >= STATE.boss_skills.next) {
                STATE.boss_skills.xp -= STATE.boss_skills.next;
                STATE.boss_skills.lvl++;
                STATE.boss_skills.points++;
                STATE.boss_skills.next = Math.floor(STATE.boss_skills.next * 1.2);
                
                if (window.spawn) {
                    window.spawn(`🎊 เลเวลบอสเพิ่มเป็น ${STATE.boss_skills.lvl}! ได้รับ 1 แต้มสกิล!`, "text-yellow-400 font-black animate-bounce");
                }
            }
            
            if (STATE) {
                const globalXPGain = Math.min(20, Math.floor(damage * 0.05));
                STATE.xp += globalXPGain;
                if (window.checkLevelUp) window.checkLevelUp();
            }

            saveState(false, true); 
            window.updateSkillUI();

            const dmgStr = damage.toLocaleString();
            if (isCrit) {
                window.spawn?.(`💥 CRITICAL! -${dmgStr}`, "text-orange-500 font-black text-3xl sm:text-5xl italic drop-shadow-[0_0_15px_rgba(249,115,22,0.8)]");
            } else {
                window.spawn?.(`💢 -${dmgStr}`, "text-white font-black text-xl sm:text-3xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]");
            }
        });
    };

    const checkBossSchedule = async () => {
        const wb = STATE.config?.world_boss;
        if (!wb || !wb.schedules || wb.schedules.length === 0) return;

        const now = new Date();
        const day = now.getDay();
        
        let shouldBeActive = false;
        for (const slot of wb.schedules) {
            if (slot.day == day) {
                const [sHour, sMin] = slot.time.split(':').map(Number);
                const startTime = new Date(now);
                startTime.setHours(sHour, sMin, 0, 0);
                
                const endTime = new Date(startTime);
                endTime.setMinutes(endTime.getMinutes() + (slot.duration || 30));
                
                if (now >= startTime && now <= endTime) {
                    shouldBeActive = (wb.hp > 0);
                    break;
                }
            }
        }

        if (shouldBeActive && !wb.active) {
            await BossService.updateBossStatus(true, (wb.hp <= 0) ? wb.max_hp : wb.hp);
        } else if (!shouldBeActive && wb.active) {
            await BossService.updateBossStatus(false, wb.max_hp);
        }
    };

    setInterval(checkBossSchedule, 30000);
    checkBossSchedule();
    updateBossHUD(STATE.config?.world_boss);
    window.updateSkillUI();
    if (STATE.config?.world_boss) updateBossModel(STATE.config.world_boss);

    let _isVictoryReported = false;
    BossService.subscribe((wb) => {
        STATE.config.world_boss = wb;
        
        if (wb.hp <= 0 && wb.active && !_isVictoryReported) {
            _isVictoryReported = true;
            // 🛡️ [REFACTORED] นำระบบแจกรางวัลแบบ Manual ออก เพื่อไปใช้ระบบ RPC ใน BossRewardController แทน
            // ป้องกันการได้รางวัลซ้ำซ้อน
            
            BossService.updateBossStatus(false, 0);
        }

        if (!wb.active) {
            if (_isVictoryReported || (STATE.boss_skills && STATE.boss_skills.lvl > 1)) {
                 resetBossSkills();
            }
            _isVictoryReported = false;
        }

        updateBossHUD(wb);
        updateBossModel(wb);
    });
};
