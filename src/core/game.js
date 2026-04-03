import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI, spawnReward, setRewardCallback } from './3d_engine.js';

// --- MOCK ---
const MOCK_BOARD = [
    { id:'hero01', tokens:9800, level:12 },
    { id:'boss02', tokens:7200, level:9 },
    { id:'star03', tokens:5100, level:7 },
    { id:'fire04', tokens:3400, level:5 },
    { id:'cool05', tokens:1800, level:3 },
];

// --- STATE ---
const STATE = {
    tokens: 500, // เงินสำหรับซื้อของ (เริ่มต้นให้ 500)
    score: 2500,  // คะแนนสะสมสำหรับโชว์
    hunger: 85, happy: 92, clean: 70, stamina: 90,
    maxStamina: 100, xp: 350, level: 5, maxExp: 1000,
    config: {
        template: 'pet', sky: 'day', ground: 'grass',
        season_name: 'Season 1', season_weeks: 1,
        costs: { feed: 10, clean: 8, repair: 5, play: 12 },
        shop: {
            small: { cost: 500, amt: 50 },
            medium: { cost: 900, amt: 100 },
            large: { cost: 2000, amt: 250 }
        },
        happy_drop_rate: 0.7 
    },
    quests: {
        feed: 0, feed_max: 3,
        clean: 0, clean_max: 2,
        play: 0, play_max: 1,
        claimed: false
    }
};

const $ = id => document.getElementById(id);

function updateUI() {
    const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
    const s=$('hud-score'); if(s) s.innerText=Math.floor(STATE.score).toLocaleString();
    const l=$('hud-level'); if(l) l.innerText=STATE.level;
    const xpBar=$('bar-xp'); if(xpBar) xpBar.style.width=`${(STATE.xp/STATE.maxExp)*100}%`;

    // Update Shop display from config
    ['small','medium','large'].forEach(tier => {
        const c = $(`shop-cost-${tier}`); if(c) c.innerText = STATE.config.shop[tier].cost;
        const a = $(`shop-amt-${tier}`); if(a) a.innerText = STATE.config.shop[tier].amt;
    });

    [['bar-hunger','val-hunger',STATE.hunger],['bar-happy','val-happy',STATE.happy],
     ['bar-clean','val-clean',STATE.clean],['bar-stamina','val-stamina',STATE.stamina]]
    .forEach(([b,v,val])=>{
        const maxVal = (b === 'bar-stamina') ? (STATE.maxStamina || 100) : 100;
        const pct = Math.min(100, (val / maxVal) * 100);
        const bar=$(b); if(bar) bar.style.width=`${pct}%`;
        const ve=$(v); if(ve) ve.innerText=`${Math.floor(val)}/${maxVal}`;
    });

    // Costs
    ['feed','clean','repair','play'].forEach(k=>{
        const el=$(`cost-${k}`); if(el) el.innerText=STATE.config.costs[k];
    });

    // Hide/Show Scoop Poop button based on difficulty
    const btnRepair = $('btn-repair');
    if (btnRepair) {
        if (STATE.config.difficulty_mode === 'normal' || STATE.config.difficulty_mode === 'hard') {
            btnRepair.style.display = 'none';
        } else {
            btnRepair.style.display = 'flex'; // หรือบล็อกเดิม
        }
    }

    // Season
    const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name;
    const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_weeks}W`;

    updateQuestUI();
}

function updateQuestUI() {
    const q = STATE.quests || { feed:0, feed_max:3, clean:0, clean_max:2, play:0, play_max:1, claimed:false };
    const tiers = ['feed','clean','play'];
    let allDone = true;
    
    tiers.forEach(t => {
        const bar = $(`q-bar-${t}`); if(bar) bar.style.width = `${Math.min(100, (q[t]/q[`${t}_max`])*100)}%`;
        const val = $(`q-val-${t}`); if(val) val.innerText = `${q[t]}/${q[`${t}_max`]}`;
        if(q[t] < q[`${t}_max`]) allDone = false;
    });

    const btn = $('btn-claim-quest');
    if(btn) {
        if(q.claimed) {
            btn.innerText = '✅ รับรางวัลแล้ว';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/5 text-white/20 font-black uppercase text-xs cursor-not-allowed';
        } else if(allDone) {
            btn.innerText = '🎁 รับรางวัลภารกิจ (5,000 🏆)';
            btn.disabled = false;
            btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-r from-neon-gold to-orange-500 text-black font-black uppercase text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse';
        } else {
            btn.innerText = '🔒 ทำภารกิจให้ครบ';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/10 text-white/40 font-black uppercase text-xs cursor-not-allowed';
        }
    }
}

function spawn(text) {
    const a=$('spawn-area'); if(!a) return;
    const e=document.createElement('div');
    e.className='absolute text-2xl font-black float-up pointer-events-none z-[60] text-white drop-shadow-[0_0_15px_rgba(139,92,246,0.6)]';
    e.style.left=`${Math.random()*50+25}%`;
    e.style.top=`${Math.random()*40+20}%`;
    e.innerText=text;
    a.appendChild(e);
    setTimeout(()=>e.remove(),2000);
}

window.toggleShop = (close) => {
    const m = $('shop-modal'); if(!m) return;
    if(close) m.classList.add('translate-y-full');
    else m.classList.remove('translate-y-full');
};

window.buyPackage = (tier) => {
    const pkg = STATE.config.shop[tier];
    if (!pkg) return;
    if (STATE.tokens < pkg.cost) { spawn('🏆 Score ไม่พอสำหรับแพ็คนี้!'); return; }

    STATE.tokens -= pkg.cost;
    STATE.stamina += pkg.amt; // ⚡ ยอมให้พลังงานทะลุหลอด Max ได้เลยตามที่ซื้อ
    spawn(`📦 ซื้อแพ็ค ${tier.toUpperCase()} สำเร็จ! (+${pkg.amt})`);
    updateUI(); save();
    setTimeout(() => toggleShop(true), 500); // ปิดร้านค้าอัตโนมัติ
};

window.doAction = (type) => {
    const cost = STATE.config.costs[type];
    if (STATE.stamina < cost) { spawn('⚡ พลังงานไม่พอ!'); return; }
    STATE.stamina -= cost;

    const mech = STATE.config.mechanics || {
        rst_feed:15, rxp_feed:15, rst_clean:20, rxp_clean:10, 
        rst_play:20, rxp_play:25, rst_repair:10, rxp_repair:12,
        rscore_scoop: 20
    };

    const scoreGainPerAction = 10; // คะแนนพื้นฐานที่ได้ทุกครั้ง
    STATE.score += scoreGainPerAction;

    switch(type) {
        case 'feed': 
            STATE.hunger=Math.min(100,STATE.hunger+mech.rst_feed); 
            STATE.xp+=mech.rxp_feed; 
            if(STATE.quests.feed < STATE.quests.feed_max) STATE.quests.feed++;
            spawn(`🍖 อร่อย! +${mech.rxp_feed}XP +10🏆`); 
            break;
        case 'clean': 
            STATE.clean=Math.min(100,STATE.clean+mech.rst_clean); 
            STATE.xp+=mech.rxp_clean; 
            if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            spawn(`🧼 สะอาด! +${mech.rxp_clean}XP +10🏆`); 
            break;
        case 'repair': 
            if (collectPoopByUI()) {
                onPoopCollectedManual(); 
                if(STATE.quests.clean < STATE.quests.clean_max) STATE.quests.clean++;
            } else {
                spawn('✨ พื้นสะอาดอยู่แล้ว');
            }
            break;
        case 'play': 
            STATE.happy=Math.min(100,STATE.happy+mech.rst_play); 
            STATE.xp+=mech.rxp_play; 
            if(STATE.quests.play < STATE.quests.play_max) STATE.quests.play++;
            spawn(`🎾 สนุก! +${mech.rxp_play}XP +10🏆`); 
            break;
    }


    checkLevelUp();
    updateUI(); save();
};

// --- ฟังก์ชันรวมศูนย์สำหรับคำนวณรางวัลเมื่อเก็บกวาดอึ (เรียกจากทั้งคลิก 3D และปุ่ม UI) ---
window.onPoopCollectedManual = () => {
    const mech = STATE.config.mechanics || { rst_repair:10, rxp_repair:12, rscore_scoop: 20 };
    STATE.clean = Math.min(100, STATE.clean + mech.rst_repair);
    STATE.happy = Math.min(100, STATE.happy + 5);
    
    // --- GACHA: RARE DROP ---
    const rareRate = (mech.rare_rate ?? 10) / 100;
    const isRare = Math.random() < rareRate;
    const rareMult = mech.rare_xp_mult ?? 3;
    const gainedXP = isRare ? mech.rxp_repair * rareMult : mech.rxp_repair;
    STATE.xp += gainedXP;

    const actionScore = 25; 
    STATE.score += actionScore;

    if (isRare) {
        const tMin = mech.rare_token_min ?? 20;
        const tMax = mech.rare_token_max ?? 50;
        const jackpotTokens = Math.floor(tMin + Math.random() * (tMax - tMin));
        STATE.tokens += jackpotTokens;
        spawn(`✨ ทาดา! ซ่อนของแรร์ไว้ (+${jackpotTokens} Token)`);
    } else {
        spawn(`💩 เก็บแล้ว! +${gainedXP}XP +${actionScore}🏆`);
    }
    
    checkLevelUp();
    updateUI(); save();
};

function checkLevelUp() {
    if (STATE.xp >= STATE.maxExp) {
        STATE.level++;
        STATE.xp -= STATE.maxExp;
        STATE.maxExp = Math.floor(STATE.maxExp * 1.25);
        
        const lvlBonusScore = 5000; 
        const lvlBonusTokens = 500; 
        STATE.score += lvlBonusScore;
        STATE.tokens += lvlBonusTokens;
        spawn(`🆙 LEVEL UP! +${lvlBonusScore}🏆 +${lvlBonusTokens}🪙`);
    }
}

function save() { localStorage.setItem('pw3d', JSON.stringify(STATE)); }
function load() { const d=localStorage.getItem('pw3d'); if(d) Object.assign(STATE, JSON.parse(d)); }

function loadAdminConfig() {
    const c=localStorage.getItem('pw3d_config');
    if(c) {
        const p=JSON.parse(c);
        STATE.config.difficulty_mode = p.difficulty_mode || 'normal';
        STATE.config.template=p.template_type||'pet';
        STATE.config.sky=p.sky||'day';
        STATE.config.ground=p.ground||'grass';
        STATE.config.season_name=p.season_name||'Season 1';
        STATE.config.season_weeks=p.season_weeks||1;
        STATE.config.costs = { feed:p.cost_feed||10, clean:p.cost_clean||8, repair:p.cost_repair||5, play:p.cost_play||12 };
        STATE.config.shop = {
            small: { cost: p.shop_s_cost || 500, amt: p.shop_s_amt || 50 },
            medium: { cost: p.shop_m_cost || 900, amt: p.shop_m_amt || 100 },
            large: { cost: p.shop_l_cost || 2000, amt: p.shop_l_amt || 250 }
        };
        STATE.config.happy_drop_rate = p.happy_drop_rate ?? 0.7;
        STATE.maxStamina = p.max_stamina || 100;
        STATE.config.mechanics = {
            dec_hunger: p.dec_hunger ?? 0.12, dec_clean: p.dec_clean ?? 0.06, dec_happy: p.dec_happy ?? 0.08,
            reg_stamina: p.reg_stamina ?? 0.5,
            rare_rate: p.rare_rate ?? 10, rare_xp_mult: p.rare_xp_mult ?? 3,
            rare_token_min: p.rare_token_min ?? 20, rare_token_max: p.rare_token_max ?? 50,
            fever_threshold: p.fever_threshold ?? 80, fever_mult: p.fever_mult ?? 1.5,
            rst_feed: p.rst_feed ?? 15, rxp_feed: p.rxp_feed ?? 15, rst_play: p.rst_play ?? 20, rxp_play: p.rxp_play ?? 25,
            rst_clean: p.rst_clean ?? 20, rxp_clean: p.rxp_clean ?? 10, rst_repair: p.rst_repair ?? 10, rxp_repair: p.rxp_repair ?? 12,
            rscore_scoop: p.rscore_scoop ?? 20, rscore_level: p.rscore_level ?? 1000,
            sp_min: p.sp_min ?? 60, sp_max: p.sp_max ?? 150
        };
    }
}

// Listen for admin changes (from save)
window.addEventListener('storage', (e) => {
    if(e.key==='pw3d_config') {
        loadAdminConfig();
        updateTemplate(STATE.config.template);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateUI();
    }
});

// Listen for LIVE preview from dashboard iframe (without saving)
window.addEventListener('message', (e) => {
    if(e.data && e.data.type === 'PW3D_PREVIEW') {
        const p = e.data.config;
        STATE.config.difficulty_mode = p.difficulty_mode || 'normal';
        STATE.config.template = p.template_type || 'pet';
        STATE.config.sky = p.sky || 'day';
        STATE.config.ground = p.ground || 'grass';
        STATE.config.season_name = p.season_name || 'Season 1';
        STATE.config.season_weeks = p.season_weeks || 1;
        STATE.config.costs = { feed:p.cost_feed||10, clean:p.cost_clean||8, repair:p.cost_repair||5, play:p.cost_play||12 };
        STATE.config.shop = {
            small: { cost: p.shop_s_cost || 500, amt: p.shop_s_amt || 50 },
            medium: { cost: p.shop_m_cost || 900, amt: p.shop_m_amt || 100 },
            large: { cost: p.shop_l_cost || 2000, amt: p.shop_l_amt || 250 }
        };
        STATE.config.happy_drop_rate = p.happy_drop_rate ?? 0.7;
        STATE.maxStamina = p.max_stamina || 100;
        STATE.config.mechanics = {
            dec_hunger: p.dec_hunger ?? 0.12, dec_clean: p.dec_clean ?? 0.06, dec_happy: p.dec_happy ?? 0.08,
            reg_stamina: p.reg_stamina ?? 0.5,
            rare_rate: p.rare_rate ?? 10, rare_xp_mult: p.rare_xp_mult ?? 3,
            rare_token_min: p.rare_token_min ?? 20, rare_token_max: p.rare_token_max ?? 50,
            fever_threshold: p.fever_threshold ?? 80, fever_mult: p.fever_mult ?? 1.5,
            rst_feed: p.rst_feed ?? 15, rxp_feed: p.rxp_feed ?? 15, rst_play: p.rst_play ?? 20, rxp_play: p.rxp_play ?? 25,
            rst_clean: p.rst_clean ?? 20, rxp_clean: p.rxp_clean ?? 10, rst_repair: p.rst_repair ?? 10, rxp_repair: p.rxp_repair ?? 12,
            rscore_scoop: p.rscore_scoop ?? 20, rscore_level: p.rscore_level ?? 1000,
            sp_min: p.sp_min ?? 60, sp_max: p.sp_max ?? 150
        };
        
        updateTemplate(STATE.config.template);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateUI();
    }
});

// Leaderboard
function loadBoard() {
    const list=$('ranking-list'); if(!list) return;
    const medals=['🥇','🥈','🥉'];
    list.innerHTML = MOCK_BOARD.map((p,i)=>`
        <div class="rounded-xl p-3 flex items-center gap-3 ${i<3?'bg-neon-purple/10 border border-neon-purple/20':'bg-white/3 border border-white/5'}">
            <div class="w-8 h-8 rounded-lg ${i<3?'bg-neon-purple/20':'bg-white/5'} flex items-center justify-center font-black text-sm">${medals[i]||'#'+(i+1)}</div>
            <div class="flex-1"><div class="font-bold text-sm text-white/80">Player ${p.id.substring(0,6)}</div><div class="text-[8px] text-white/30">Lv.${p.level}</div></div>
            <div class="font-black text-neon-gold text-sm">${p.tokens.toLocaleString()} 🏆</div>
        </div>
    `).join('');
}

window.toggleQuest = (close) => {
    const m = $('quest-modal'); if(!m) return;
    if(close) m.classList.add('translate-y-full');
    else {
        m.classList.remove('translate-y-full');
        updateQuestUI();
    }
};

window.claimQuestReward = () => {
    if(STATE.quests.claimed) return;
    STATE.score += 5000;
    STATE.tokens += 200;
    STATE.quests.claimed = true;
    spawn('🎁 รับรางวัลภารกิจสำเร็จ! +5,000 🏆 และ +200 🪙');
    updateUI(); save();
};

window.toggleRanking = (forcedState) => {
    const m = $('ranking-modal');
    if (!m) return;
    
    // ถ้ามีการระบุสถานะ (เช่น true=ปิด) ให้ทำตามนั้น
    if (forcedState === true) m.classList.add('translate-y-full');
    else if (forcedState === false) m.classList.remove('translate-y-full');
    else m.classList.toggle('translate-y-full');

    if (!m.classList.contains('translate-y-full')) {
        loadBoard();
        m.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        m.style.transform = ''; // รีเซ็ตตำแหน่งจากการลาก
    }
};

// --- Full Screen & Minimize ---
window.toggleMinimize = () => {
    const container = $('game-container');
    const reopenBtn = $('reopen-btn');
    const hud = document.querySelector('.hud');
    const isMin = container.classList.contains('minimized');

    if (isMin) {
        container.classList.remove('minimized');
        container.style.cssText = "";
        if(reopenBtn) reopenBtn.classList.add('hidden');
        if(hud) { hud.style.opacity="1"; hud.style.pointerEvents="auto"; }
        spawn('🏠 กลับสู่หน้าหลัก');
    } else {
        container.classList.add('minimized');
        container.style.cssText = `
            position: fixed; bottom: 85px; right: 25px;
            width: 140px; height: 140px; border-radius: 40px;
            z-index: 250; border: 3px solid #8b5cf6;
            box-shadow: 0 15px 40px rgba(0,0,0,0.6);
            overflow: hidden; pointer-events: none;
        `;
        if(reopenBtn) reopenBtn.classList.remove('hidden');
        if(hud) { hud.style.opacity="0"; hud.style.pointerEvents="none"; }
        spawn('➖ ย่อหน้าต่างแล้ว');
    }
    // แจ้ง 3D Engine ว่าขนาดเปลี่ยน
    window.dispatchEvent(new Event('resize'));
};

window.toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            spawn('❌ อุปกรณ์ไม่รองรับ Full Screen');
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
};


// --- BOOT ---
(() => {
    load(); loadAdminConfig();
    init3D('three-canvas', STATE.config.template, { sky:STATE.config.sky, ground:STATE.config.ground });
    updateUI();
    
    // ตั้ง Poop Callbacks
    setPoopCallbacks(
        // เมื่อคลิกบน 3D โดยตรง
        window.onPoopCollectedManual,
        // อึหมดเวลา — Happy ลด
        () => {
            const mech = STATE.config.mechanics || { dec_happy_poop: 12 };
            STATE.happy = Math.max(0, STATE.happy - (mech.dec_happy_poop || 12));
            spawn('💩 อึเน่าเกินไป! -12♥');
            updateUI(); save();
        }
    );

    // ตั้งระบบรางวัล (Token Drop)
    setRewardCallback((type, val) => {
        if (type === 'coin') {
            const tokenGain = Math.floor(10 + Math.random() * 20); // สุ่มเพิ่ม 10-30 Token
            STATE.tokens += tokenGain;
            spawn(`🪙 เก็บเหรียญได้ +${tokenGain} Token!`);
            updateUI(); save();
        }
    });

    // สุ่มอึตามสถานะของสัตว์เลี้ยง (สมดุลขึ้น)
    function scheduleNextPoop() {
        const mech = STATE.config.mechanics || { sp_min:60, sp_max:150 };
        const baseDelay = (mech.sp_min + Math.random() * (mech.sp_max - mech.sp_min)) * 1000;
        
        setTimeout(() => {
            spawnPoop();
            spawn('💩 น้องปวดท้องอึ / ของร่วงลงแหมะ!');
            
            scheduleNextPoop();
        }, baseDelay);
    }
    scheduleNextPoop();

    setInterval(()=>{
        const mech = STATE.config.mechanics || { dec_hunger: 0.12, dec_happy: 0.08, dec_clean: 0.06, reg_stamina: 0.5 };
        STATE.maxStamina = STATE.maxStamina || 100;
        
        STATE.hunger=Math.max(0,STATE.hunger-mech.dec_hunger);
        STATE.happy=Math.max(0,STATE.happy-mech.dec_happy);
        STATE.clean=Math.max(0,STATE.clean-mech.dec_clean);
        
        // --- FEVER MODE (PERFECT ZONE) ---
        let currentRegen = mech.reg_stamina;
        const thr = mech.fever_threshold ?? 80;
        const isPerfect = (STATE.hunger >= thr && STATE.happy >= thr && STATE.clean >= thr);
        if (isPerfect) {
            currentRegen *= (mech.fever_mult ?? 1.5); 
            if (Math.random() < 0.05) spawn('🌟 สมบูรณ์แบบ! (Fever Mode)');
        }

        // ⚡ รีเจนเฉพาะตอนน้อยกว่าหลอดเต็ม (ถ้าตุนไว้ทะลุ 100 จะไม่ขึ้นต่อ และไม่หักทิ้ง)
        if (STATE.stamina < STATE.maxStamina) {
            STATE.stamina=Math.min(STATE.maxStamina, STATE.stamina+currentRegen);
        }

        // --- HAPPY BONUS DROP ---
        // ถ้าความสุขสูง มีโอกาสเสกเหรียญ (ปรับได้ผ่าน Admin)
        const dropRate = STATE.config.happy_drop_rate || 0.7;
        if (STATE.happy > 85 && Math.random() > dropRate) {
            spawnReward('coin');
            spawn('🎁 น้องมีความสุขจนอยากให้รางวัล!');
        }

        updateUI();
    },5000);
})();
