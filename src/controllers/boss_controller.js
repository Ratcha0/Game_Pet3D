import { BossService } from '../services/boss_sync.js';
import { saveState } from '../store/state.js';
import { SFX } from '../services/sound.js';

/**
 * ☄️ Boss Controller
 * จัดการเหตุการณ์การสู้บอสในเกม
 */
export const initBossController = (STATE, engineHelpers) => {
    const { spawnWorldRock, clearWorldRocks, throwRockAtBoss, collectWorldRockAtPet, _getPetPosition, updateBossModel } = engineHelpers;

    // 📊 Boss Skill State (Link to persistent State)
    const BOSS_SKILLS = STATE.boss_skills;

    // 🔘 Toggle ย่อ/ขยายแผงควบคุมหลักทั้งหมด
    window.toggleMainHUD = () => {
        const panel = document.getElementById('main-stats-panel');
        const toggleArea = document.getElementById('hud-toggle-area');
        const icon = document.querySelector('.hud-toggle-icon');
        const text = document.querySelector('.hud-toggle-text');
        
        if (panel) {
            const isCollapsed = panel.classList.toggle('collapsed');
            if (toggleArea) toggleArea.classList.toggle('mini-mode', isCollapsed);
            if (icon) icon.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            if (text) text.innerText = isCollapsed ? 'แสดงหน้าจอ' : 'ย่อหน้าจอ';
            
            // 🔥 บังคับให้อัปเดตจุดแจ้งเตือนทันทีที่ย่อ/ขยาย
            updateSkillUI(); 
        }
    };

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
            const hpPercent = (hp / max) * 100;
            
            const bar = document.getElementById('boss-hp-bar');
            const text = document.getElementById('boss-hp-text');
            if (bar) bar.style.width = `${hpPercent}%`;
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
            updateSkillUI();
        } else {
            // 🛑 ซ่อนทุกอย่างที่เกี่ยวกับบอสทันที
            if (bossHPContainer) bossHPContainer.classList.add('hidden');
            if (skillPanel) skillPanel.classList.add('hidden');
            if (toggleArea) toggleArea.classList.add('hidden');
            if (throwBtn) throwBtn.classList.add('hidden');
            
            // ล้างสถานะบอส
            resetBossSkills();
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
    const updateSkillUI = () => {
        const currentState = JSON.stringify(BOSS_SKILLS);
        if (currentState === _lastSkillState) return;
        _lastSkillState = currentState;

        const skills = ['damage', 'crit', 'speed', 'bag'];
        skills.forEach(key => {
            const s = BOSS_SKILLS[key];
            const expBar = document.getElementById(`skill-${key}-exp`);
            const dotsContainer = document.getElementById(`dots-${key}`);
            const arrow = document.querySelector(`.boss-skill-item[onclick*="${key}"] .lvl-up-arrow`);
            
            // ใช้ XP รวมในการแสดงหลอดความก้าวหน้า
            if (expBar) {
                const pct = Math.min(100, (BOSS_SKILLS.xp / BOSS_SKILLS.next) * 100);
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
                if (BOSS_SKILLS.points > 0 && s.lvl < 5) {
                    arrow.classList.remove('hidden');
                } else {
                    arrow.classList.add('hidden');
                }
            }
        });

        // --- 🔴 Update Global Skill Noti Dot ---
        const globalDot = document.getElementById('skill-noti-dot');
        const mainPanel = document.getElementById('main-stats-panel');
        const isCollapsed = mainPanel ? mainPanel.classList.contains('collapsed') : false;
        
        if (globalDot) {
            // โชว์จุดแดงถ้ามี่แต้มสกิลค้างอยู่ (ไม่ต้องสนว่าย่อหรือขยาย)
            if (BOSS_SKILLS.points > 0) {
                globalDot.classList.remove('hidden');
            } else {
                globalDot.classList.add('hidden');
            }
        }
    };

    window.upgradeBossSkill = (key) => {
        const s = BOSS_SKILLS[key];
        if (BOSS_SKILLS.points > 0 && s.lvl < 5) {
            s.lvl++;
            BOSS_SKILLS.points--; // 🔥 [RESTORED] หักแต้มจริง
            STATE.boss_skills = BOSS_SKILLS; // ซิงค์ก้อนใหญ่ก่อนเซฟ
            saveState(); 
            updateSkillUI();
            
            applySkillEffects();
            const skillNames = { damage: 'ความแรงการปา', crit: 'โอกาสติดคริ', speed: 'ความเร็วขว้าง', bag: 'ความจุหิน' };
            window.spawn?.(`✨ อัปเกรด ${skillNames[key] || key} เป็น LVL ${s.lvl}! (เหลือ ${BOSS_SKILLS.points} แต้ม)`, "text-cyan-400 font-bold");
            SFX.playAsset('level');
        }
    };

    const applySkillEffects = () => {
        // 1. Power & Crit (ใช้อยู่ในฟังก์ชัน throwRock อยู่แล้ว)
        
        // 2. Speed (เวล 1 = x1.0, เวล 5 = x2.4)
        window._bossSpeedMult = 1.0 + (BOSS_SKILLS.speed.lvl - 1) * 0.35;
        
        // 3. Update Throw Button (อัปเดตเลขช่องเก็บหิน)
        updateThrowButton(STATE.config.world_boss);
    };

    window.updateBossThrowUI = () => updateThrowButton(STATE.config?.world_boss);
    
    const resetBossSkills = () => {
        // เลเวลสกิลจะถูกดึงมาจาก STATE ถาวร เราแค่รีเซ็ตความเร็วพื้นฐานและอัปเดต UI
        window._bossSpeedMult = 1.0 + (BOSS_SKILLS.speed.lvl - 1) * 0.35;
        updateSkillUI();
        updateThrowButton(STATE.config?.world_boss);
    };

    const updateThrowButton = (wb) => {
        const btn = document.getElementById('btn-throw-rock');
        if (!btn) return;
        
        const count = STATE.carrying_rock || 0;
        // Bag Capacity: เวล 1 = 2, เวล 5 = 10 (กัปเพิ่มทีละ 2)
        const baseLimit = (wb?.rock_carry_limit !== undefined) ? parseInt(wb.rock_carry_limit) : 2;
        const carryLimit = baseLimit + (BOSS_SKILLS.bag.lvl - 1) * 2; 

        if (wb?.active && (wb.hp > 0)) {
            btn.classList.remove('hidden');
            const label = btn.querySelector('.tracking-tighter');
            if (label) label.innerText = `ขว้าง! (${count}/${carryLimit})`;
            
            // ถ้าไม่มีหิน ให้จางลงและกดไม่ได้
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

    // ฟังก์ชันสำหรับเก็บหิน
    window.collectRock = (id) => {
        const currentCount = STATE.carrying_rock || 0;
        const wb = STATE.config?.world_boss;
        const baseLimit = (wb?.rock_carry_limit !== undefined) ? parseInt(wb.rock_carry_limit) : 2;
        const carryLimit = baseLimit + (BOSS_SKILLS.bag.lvl - 1) * 2;
        
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
            saveState(); // บันทึกทันทีป้องกัน Sync ทับ
            updateThrowButton(STATE.config?.world_boss);
            window.spawn?.(`🪨 เก็บหินแล้ว! (${STATE.carrying_rock}/${carryLimit})`, "text-orange-400 font-bold");
        }
    };

    // ฟังก์ชันสำหรับปาหิน
    window.throwRock = async () => {
        const count = STATE.carrying_rock || 0;
        if (count <= 0 || !STATE.config?.world_boss?.active || (STATE.config?.world_boss?.hp <= 0)) return;
        
        STATE.carrying_rock = count - 1;
        saveState(); // บันทึกทันที
        updateThrowButton(STATE.config.world_boss);
        
        // คำนวณดาเมจตามสกิล
        const powerLvl = BOSS_SKILLS.damage.lvl;
        const critLvl = BOSS_SKILLS.crit.lvl;
        
        const wbConfig = STATE.config?.world_boss || {};
        const baseDmg = (wbConfig.base_damage !== undefined) ? parseFloat(wbConfig.base_damage) : 5000;
        const scaleDmg = (wbConfig.damage_scale !== undefined) ? parseFloat(wbConfig.damage_scale) : 5000;

        let damage = baseDmg + (powerLvl * scaleDmg);
        let isCrit = Math.random() < (critLvl * 0.20); 
        
        if (isCrit) damage *= 2; // Critical hit!

        const petPos = _getPetPosition();
        throwRockAtBoss(petPos, async () => {
            await BossService.damageBoss(damage);
            
            // รับ Global Boss XP (ปรับสมดุลใหม่: ให้แต้มสกิลสัมพันธ์กับดาเมจมหาศาล)
            const expGained = Math.floor(damage / 10); 
            BOSS_SKILLS.xp += expGained;
            
            // เช็คเลเวลอัปรวม
            if (BOSS_SKILLS.xp >= BOSS_SKILLS.next) {
                BOSS_SKILLS.xp -= BOSS_SKILLS.next;
                BOSS_SKILLS.lvl++;
                BOSS_SKILLS.points++; // ได้แต้มสกิล!
                BOSS_SKILLS.next = Math.floor(BOSS_SKILLS.next * 1.2); // ปรับจาก 1.4 -> 1.2 เพื่อให้เลเวลไม่ตันยากเกินไปคราบ
                
                if (window.spawn) {
                    window.spawn(`🎊 เลเวลบอสเพิ่มเป็น ${BOSS_SKILLS.lvl}! ได้รับ 1 แต้มสกิล!`, "text-yellow-400 font-black animate-bounce");
                }
            }
            
            // ⚔️ [USER REQUEST] จัดการ XP ตัวละครหลักด้วย (สู้บอสต้องได้เวลหลักด้วย)
            if (window.STATE) {
                const globalXPGain = Math.min(20, Math.floor(damage * 0.05)); // 5% ของดาเมจเป็น XP หลัก
                window.STATE.xp += globalXPGain;
                if (window.checkLevelUp) window.checkLevelUp();
            }

            STATE.boss_skills = BOSS_SKILLS; // 🔥 [BUGFIX] ซิงค์ก่อนเซฟ
            saveState(); // บันทึก XP/LVL ใหม่
            updateSkillUI();

            const dmgStr = damage.toLocaleString();
            if (isCrit) {
                // 💥 ใหญ่สะใจ (Critical)
                window.spawn?.(`💥 CRITICAL! -${dmgStr}`, "text-orange-500 font-black text-3xl sm:text-5xl italic drop-shadow-[0_0_15px_rgba(249,115,22,0.8)]");
            } else {
                // 💢 ขนาดกำลังดี (Normal)
                window.spawn?.(`💢 -${dmgStr}`, "text-white font-black text-xl sm:text-3xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]");
            }
        });
    };

    // 🕒 ระบบเช็คตารางเวลาอัตโนมัติ
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
                    if (wb.hp <= 0 && wb.active === false) {
                        shouldBeActive = false;
                    } else {
                        shouldBeActive = true;
                    }
                    break;
                }
            }
        }

        if (shouldBeActive && !wb.active) {
            const spawnHP = (wb.hp <= 0) ? wb.max_hp : wb.hp;
            console.log("🕒 [Schedule] อัญเชิญบอสตามตารางเวลา!");
            await BossService.updateBossStatus(true, spawnHP);
        } else if (!shouldBeActive && wb.active) {
            console.log("🕒 [Schedule] บอสหายไปตามตารางเวลา (End of Slot)");
            await BossService.updateBossStatus(false, wb.max_hp);
        }
    };

    setInterval(checkBossSchedule, 30000);

    // เช็คสถานะเริ่มต้น
    checkBossSchedule();
    updateBossHUD(STATE.config?.world_boss);
    updateSkillUI();
    if (STATE.config?.world_boss) {
        updateBossModel(STATE.config.world_boss);
    }

    BossService.subscribe((wb) => {
        STATE.config.world_boss = wb;
        updateBossHUD(wb);
        updateBossModel(wb);
    });
};
