import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI, spawnReward, setRewardCallback } from './3d_engine.js';

// --- MOCK ---
const MOCK_BOARD = [
    { id:'hero01', tokens:9800, level:12, score: 98000 },
    { id:'boss02', tokens:7200, level:9, score: 72000 },
    { id:'star03', tokens:5100, level:7, score: 51000 },
    { id:'fire04', tokens:3400, level:5, score: 34000 },
    { id:'cool05', tokens:1800, level:3, score: 18000 },
];

// --- STATE ---
const STATE = {
    tokens: 5000, // เงินสำหรับซื้อของ (เริ่มต้นให้ 5000)
    score: 2500,  // คะแนนสะสมสำหรับโชว์
    hunger: 85, clean: 70, stamina: 90, love: 80,
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
        special: { type: 'scoop', target: 5, current: 0, label: 'ช้อนอึทองคำ', icon: '💩' },
        claimed: false
    },
    buffs: {
        regen: 1.0,
        regen_expiry: 0
    }
};

const SPECIAL_QUEST_POOL = [
    { type: 'scoop', label: 'ช้อนอึทองคำ', icon: '💩', targetIcon: '🏆' },
    { type: 'fever', label: 'นักสู้สายฟีเวอร์', icon: '🔥', targetIcon: '🌟' },
    { type: 'pure_love', label: 'เลิฟขีดสุด (100%)', icon: '💖', targetIcon: '👑' },
    { type: 'spend', label: 'สายลุยไม่คุยให้เสียงาน', icon: '⚡', targetIcon: '🏃' }
];

const $ = id => document.getElementById(id);

function updateUI() {
    const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
    const s=$('hud-score'); if(s) s.innerText=Math.floor(STATE.score).toLocaleString();
    const l=$('hud-level'); if(l) l.innerText=STATE.level;
    const xpBar=$('bar-xp'); if(xpBar) xpBar.style.width=`${(STATE.xp/STATE.maxExp)*100}%`;
    const xpVal=$('hud-xp-val'); if(xpVal) xpVal.innerText=`${Math.floor(STATE.xp)}/${Math.floor(STATE.maxExp)} XP`;

    // Update Shop display from config
    ['small','medium','large'].forEach(tier => {
        const c = $(`shop-cost-${tier}`); if(c) c.innerText = STATE.config.shop[tier].cost;
        const a = $(`shop-amt-${tier}`); if(a) a.innerText = STATE.config.shop[tier].amt;
    });

    const labels = {
        pet:   { h:'หิว', l:'รัก', c:'สะอาด', s:'พลัง', af:'ป้อนอาหาร', ac:'อาบน้ำ', ar:'เก็บอึ', ap:'เล่นด้วย' },
        car:   { h:'เชื้อเพลิง', l:'สภาพรถ', c:'ล้างรถ', s:'แบตเตอรี่', af:'เติมน้ำมัน', ac:'ล้างรถ', ar:'ซ่อมบำรุง', ap:'ลองเครื่อง' },
        plant: { h:'น้ำ', l:'ปุ๋ย', c:'พรวนดิน', s:'ความสด', af:'รดน้ำ', ac:'ให้ปุ๋ย', ar:'กำจัดแมลง', ap:'เปิดเพลง' }
    };
    const cur = labels[STATE.config.template] || labels.pet;

    [['bar-hunger','val-hunger',STATE.hunger, cur.h],['bar-happy','val-happy',STATE.love, cur.l],
     ['bar-clean','val-clean',STATE.clean, cur.c],['bar-stamina','val-stamina',STATE.stamina, cur.s]]
    .forEach(([b,v,val,label])=>{
        const maxVal = (b === 'bar-stamina') ? (STATE.maxStamina || 100) : 100;
        const bar = $(b); if(bar) bar.style.width = `${Math.min(100, (val/maxVal)*100)}%`;
        const txt = $(v); if(txt) {
            txt.innerHTML = `${label} <span class="text-white/30 italic">${Math.round(val)}%</span>`;
        }
    });

    // Update Action Button Labels
    const af=$('lbl-act-feed'); if(af) af.innerText = cur.af;
    const ac=$('lbl-act-clean'); if(ac) ac.innerText = cur.ac;
    const ar=$('lbl-act-repair'); if(ar) ar.innerText = cur.ar;
    const ap=$('lbl-act-play'); if(ap) ap.innerText = cur.ap;

    // Update HUD Mood Emoji (Header)
    const moodEl = $('mood-emoji');
    const moodVal = $('mood-val');
    if(moodEl && moodVal) {
        // use 'love' instead of 'happy' for the main mood feeling
        const curLove = Math.round(STATE.love);
        moodVal.innerText = `${curLove}%`;
        if(curLove > 85) moodEl.innerText = '😍';
        else if(curLove > 50) moodEl.innerText = '😊';
        else if(curLove > 20) moodEl.innerText = '😐';
        else moodEl.innerText = '🥺';
    }

    const btnRepair = $('btn-repair');
    if (btnRepair) {
        // Only show manual repair button in "EASY" mode. 
        // In Normal/Hard, players must walk to clean it up.
        const mode = STATE.config.difficulty_mode || 'normal';
        btnRepair.style.display = (mode === 'easy') ? 'flex' : 'none';
    }

    // Season
    const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name;
    const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_weeks}W`;

    // Quest Check for Pure Love
    if(STATE.love >= 100) incrementSpecialQuest('pure_love');

    updateQuestUI();
}

function updateQuestUI() {
    const q = STATE.quests;
    if(!q) return;
    const tiers = ['feed','clean','play'];
    let allDone = true;
    
    tiers.forEach(t => {
        const bar = $(`q-bar-${t}`); if(bar) bar.style.width = `${Math.min(100, (q[t]/q[`${t}_max`])*100)}%`;
        const val = $(`q-val-${t}`); if(val) val.innerText = `${q[t]}/${q[`${t}_max`]}`;
        if(q[t] < q[`${t}_max`]) allDone = false;
    });

    // Special Quest
    const specBar = $('q-bar-special');
    const specVal = $('q-val-special');
    const specLabel = $('q-label-special');
    const specIcon = $('q-icon-special');

    if(specLabel) specLabel.innerText = `Challenge: ${q.special.label}`;
    if(specIcon) specIcon.innerText = q.special.icon;
    if(specBar) specBar.style.width = `${Math.min(100, (q.special.current/q.special.target)*100)}%`;
    if(specVal) specVal.innerText = `${q.special.current}/${q.special.target}`;
    if(q.special.current < q.special.target) allDone = false;

    // Show Buff Icon next to stamina if active
    const buffIcon = $('stamina-buff-icon');
    if(buffIcon) {
        const isActive = STATE.buffs.regen > 1 && Date.now() < STATE.buffs.regen_expiry;
        buffIcon.classList.toggle('hidden', !isActive);
    }

    const btn = $('btn-claim-quest');
    const dot = $('quest-noti-dot');
    if(btn) {
        if(q.claimed) {
            btn.innerText = '✅ รับของขวัญวันนี้แล้ว';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/5 text-white/20 font-black uppercase text-xs cursor-not-allowed';
            if(dot) dot.classList.add('hidden');
        } else if(allDone) {
            btn.innerText = '🎁 เปิดรับของขวัญ (เหรียญ + ฟื้นพลังเร็ว)';
            btn.disabled = false;
            btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-r from-neon-gold to-orange-500 text-black font-black uppercase text-sm shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse';
            if(dot) {
                dot.classList.remove('hidden');
                dot.querySelector('.animate-ping')?.classList.remove('hidden');
            }
        } else {
            btn.innerText = '🔒 ดูแลน้องให้ครบตามเป้าหมาย';
            btn.disabled = true;
            btn.className = 'w-full py-4 rounded-2xl bg-white/10 text-white/40 font-black uppercase text-xs cursor-not-allowed';
            if(dot) {
                dot.classList.add('hidden'); // Only show when ALL quests are done and ready to claim
            }
        }
    }
}

function incrementSpecialQuest(type, amt = 1) {
    if(!STATE.quests || !STATE.quests.special) return;
    const spec = STATE.quests.special;
    if(spec.type === type && spec.current < spec.target) {
        spec.current = Math.min(spec.target, spec.current + amt);
        updateQuestUI();
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
    if (STATE.tokens < pkg.cost) { spawn('🪙 เหรียญ (Tokens) ไม่พอครับ!'); return; }

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
    incrementSpecialQuest('spend', cost);

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
            STATE.love=Math.min(100,STATE.love+5); // การป้อนอาหารเพิ่มความผูกพัน (💖)
            STATE.xp+=mech.rxp_feed; 
            if(STATE.quests.feed < STATE.quests.feed_max) STATE.quests.feed++;
            spawn(`🍖 อร่อย! +${mech.rxp_feed}XP +10🏆`); 
            break;
        case 'clean': 
            STATE.clean=Math.min(100,STATE.clean+mech.rst_clean); 
            STATE.love=Math.min(100,STATE.love+5); // การทำความสะอาดเพิ่มความผูกพัน (💖)
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
            STATE.love=Math.min(100,STATE.love+mech.rst_play); // ใช้ค่า rst_play จาก config
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
    STATE.love = Math.min(100, STATE.love + 5); // เก็บอึให้ก็เพิ่มความผูกพัน (💖)
    
    // --- QUEST PROGRESS ---
    incrementSpecialQuest('scoop');

    // --- GACHA: RARE DROP ---
    const rareRate = (mech.rare_rate ?? 10) / 100;
    const isRare = Math.random() < rareRate;
    const rareMult = mech.rare_xp_mult ?? 3;
    const gainedXP = isRare ? mech.rxp_repair * rareMult : mech.rxp_repair;
    STATE.xp += gainedXP;

    const actionScore = mech.rscore_scoop || 25; 
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
        STATE.maxExp = Math.floor(STATE.maxExp * 1.2); 
        
        const bonusScore = 5000 + (STATE.level * 1000); 
        const bonusTokens = 500 + (STATE.level * 50); 
        
        STATE.score += bonusScore;
        STATE.tokens += bonusTokens;
        
        STATE.hunger = 100;
        STATE.love = 100;
        STATE.clean = 100;
        STATE.stamina = Math.max(STATE.stamina, STATE.maxStamina);

        spawn(`🆙 LEVEL UP! ตอนนี้เลเวล ${STATE.level} แล้ว! 🎉`);
        spawn(`🎁 รับรางวัลเลเวลใหม่ +${bonusScore.toLocaleString()} 🏆 และ +${bonusTokens} 🪙`);
        
        checkLevelUp();
    }
}

function load() {
    const s = localStorage.getItem('PW3D_SAVE');
    if (s) {
        const d = JSON.parse(s);
        STATE.tokens = d.tokens ?? 500;
        STATE.score = d.score ?? 2500;
        STATE.hunger = d.hunger ?? 85;
        STATE.clean = d.clean ?? 70;
        STATE.stamina = d.stamina ?? 90;
        STATE.love = d.love ?? 80;
        STATE.xp = d.xp ?? 350;
        STATE.level = d.level ?? 5;
        STATE.maxExp = d.maxExp ?? 1000;

        if (d.quests) STATE.quests = d.quests;
        if (d.buffs) STATE.buffs = d.buffs;
    }
}

function save() {
    const today = new Date().toDateString();
    const data = {
        tokens: STATE.tokens, score: STATE.score, hunger: STATE.hunger,
        clean: STATE.clean, stamina: STATE.stamina,
        love: STATE.love, xp: STATE.xp, level: STATE.level, maxExp: STATE.maxExp,
        quests: STATE.quests, quest_date: today, buffs: STATE.buffs
    };
    localStorage.setItem('PW3D_SAVE', JSON.stringify(data));
}

function loadAdminConfig() {
    const c = localStorage.getItem('pw3d_config');
    if (c) {
        const p = JSON.parse(c);
        applyConfig(p);
    }
}

function applyConfig(p) {
    if (!p) return;
    
    STATE.config.template = p.template || 'pet';
    STATE.config.sky = p.sky || 'day';
    STATE.config.ground = p.ground || 'grass';
    STATE.config.season_name = p.season_name || 'Season 1';
    STATE.config.season_weeks = p.season_weeks || 1;
    STATE.config.difficulty_mode = p.difficulty_mode || 'normal';
    STATE.config.custom_model = p.custom_model || '';
    
    STATE.maxStamina = p.max_stamina || 100;
    STATE.config.q_special_mult = p.q_special_mult || 1.5;

    STATE.config.costs = {
        feed: p.cost_feed ?? 10,
        clean: p.cost_clean ?? 8,
        repair: p.cost_repair ?? 5,
        play: p.cost_play ?? 12
    };

    STATE.config.shop = {
        small: { cost: p.shop_s_cost || 500, amt: p.shop_s_amt || 50 },
        medium: { cost: p.shop_m_cost || 900, amt: p.shop_m_amt || 100 },
        large: { cost: p.shop_l_cost || 2000, amt: p.shop_l_amt || 250 }
    };

    STATE.config.mechanics = {
        dec_hunger: p.dec_hunger ?? 0.12,
        dec_clean: p.dec_clean ?? 0.06,
        dec_happy: p.dec_happy ?? 0.08,
        reg_stamina: p.reg_stamina ?? 0.5,
        
        sp_min: p.poop_min ?? 20,
        sp_max: p.poop_max ?? 50,
        r_min: p.reward_min ?? 30,
        r_max: p.reward_max ?? 90,

        rare_rate: p.rare_rate ?? 10,
        rare_xp_mult: p.rare_xp_mult ?? 3,
        rare_token_min: p.rare_token_min ?? 20,
        rare_token_max: p.rare_token_max ?? 50,
        fever_threshold: p.fever_threshold ?? 80,
        fever_mult: p.fever_mult ?? 1.5,
        
        rst_feed: p.rst_feed ?? 15,
        rxp_feed: p.rxp_feed ?? 15,
        rst_play: p.rst_play ?? 20,
        rxp_play: p.rxp_play ?? 25,
        rst_clean: p.rst_clean ?? 20,
        rxp_clean: p.rxp_clean ?? 10,
        rst_repair: p.rst_repair ?? 10,
        rxp_repair: p.rxp_repair ?? 12,
        rscore_scoop: p.rscore_scoop ?? 20
    };

    STATE.config.q_feed = p.q_feed || 3;
    STATE.config.q_clean = p.q_clean || 2;
    STATE.config.q_play = p.q_play || 1;
    STATE.config.qt_scoop = p.qt_scoop || 10;
    STATE.config.qt_fever = p.qt_fever || 2;
    STATE.config.qt_love = p.qt_love || 10;
    STATE.config.qt_spend = p.qt_spend || 100;
}

window.addEventListener('storage', (e) => {
    if(e.key==='pw3d_config') {
        loadAdminConfig();
        updateTemplate(STATE.config.template, STATE.config.custom_model);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateUI();
    }
});

window.addEventListener('message', (e) => {
    if(e.data && e.data.type === 'PW3D_PREVIEW') {
        applyConfig(e.data.config);
        updateTemplate(STATE.config.template, STATE.config.custom_model);
        updateEnvironment(STATE.config.sky, STATE.config.ground);
        updateUI();
    }
});

function loadBoard() {
    const list=$('ranking-list'); if(!list) return;
    const medals=['🥇','🥈','🥉'];
    list.innerHTML = MOCK_BOARD.map((p,i)=>`
        <div class="rounded-xl p-3 flex items-center gap-3 ${i<3?'bg-neon-purple/10 border border-neon-purple/20':'bg-white/3 border border-white/5'}">
            <div class="w-8 h-8 rounded-lg ${i<3?'bg-neon-purple/20':'bg-white/5'} flex items-center justify-center font-black text-sm">${medals[i]||'#'+(i+1)}</div>
            <div class="flex-1"><div class="font-bold text-sm text-white/80">Player ${p.id.substring(0,6)}</div><div class="text-[8px] text-white/30">Lv.${p.level}</div></div>
            <div class="font-black text-neon-gold text-sm">${(p.score).toLocaleString()} 🏆</div>
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
    const tiers = ['feed','clean','play'];
    let allDone = true;
    tiers.forEach(t => { if(STATE.quests[t] < STATE.quests[`${t}_max`]) allDone = false; });
    if(STATE.quests.special.current < STATE.quests.special.target) allDone = false;
    
    if(!allDone) { spawn('🔒 เควสยังไม่ครบ!'); return; }

    STATE.tokens += 500;
    STATE.score += 5000;
    STATE.quests.claimed = true;
    
    STATE.buffs.regen = STATE.config.q_special_mult || 1.5;
    STATE.buffs.regen_expiry = Date.now() + (24 * 60 * 60 * 1000); 

    spawn('🎁 รับของขวัญสำเร็จ! (แถมเหรียญ + ฟื้นพลังเร็ว x1.5)');
    updateUI(); save();
};

function resetDailyQuests() {
    const last = localStorage.getItem('pw3d_last_quest');
    const now = new Date().toDateString();
    if (last !== now) {
        const randIndex = Math.floor(Math.random() * SPECIAL_QUEST_POOL.length);
        const picked = SPECIAL_QUEST_POOL[randIndex];
        
        let target = 5;
        if(picked.type === 'scoop') target = STATE.config.qt_scoop || 10;
        if(picked.type === 'fever') target = STATE.config.qt_fever || 2;
        if(picked.type === 'pure_love') target = STATE.config.qt_love || 10;
        if(picked.type === 'spend') target = STATE.config.qt_spend || 100;

        STATE.quests = {
            feed: 0, feed_max: STATE.config.q_feed || 3,
            clean: 0, clean_max: STATE.config.q_clean || 2,
            play: 0, play_max: STATE.config.q_play || 1,
            special: { 
                type: picked.type, 
                label: picked.label, 
                icon: picked.icon, 
                target: target, 
                current: 0 
            },
            claimed: false
        };
        localStorage.setItem('pw3d_last_quest', now);
        updateUI(); save();
    }
}

window.toggleRanking = (forcedState) => {
    const m = $('ranking-modal');
    if (!m) return;
    
    if (forcedState === true) m.classList.add('translate-y-full');
    else if (forcedState === false) m.classList.remove('translate-y-full');
    else m.classList.toggle('translate-y-full');

    if (!m.classList.contains('translate-y-full')) {
        loadBoard();
        m.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        m.style.transform = ''; 
    }
};

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


(() => {
    load(); loadAdminConfig();
    init3D('three-canvas', STATE.config.template, { 
        sky:STATE.config.sky, ground:STATE.config.ground, 
        customModel: STATE.config.custom_model 
    });
    resetDailyQuests(); 
    updateUI();
    
    setPoopCallbacks(
        window.onPoopCollectedManual,
        () => {
            const mech = STATE.config.mechanics || { dec_happy_poop: 12 };
            STATE.love = Math.max(0, STATE.love - (mech.dec_happy_poop || 12));
            spawn('💩 อึเน่าเกินไป! -12♥');
            updateUI(); save();
        }
    );

    setRewardCallback((type, val) => {
        const mech = STATE.config.mechanics || {};
        if (type === 'coin') {
            const min = mech.rare_token_min || 20;
            const max = mech.rare_token_max || 50;
            const tokenGain = Math.floor(min + Math.random() * (max - min));
            
            STATE.tokens += tokenGain;
            STATE.xp += (mech.rxp_repair || 12) * (mech.rare_xp_mult || 1);
            
            spawn(`🪙 เก็บเหรียญได้ +${tokenGain} Token! (+Bonus XP)`);
            updateUI(); save();
        }
    });

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

    function scheduleNextReward() {
        const mech = STATE.config.mechanics || { r_min:90, r_max:240, rare_rate: 10, fever_threshold: 80 };
        const delay = (mech.r_min + Math.random() * (mech.r_max - (mech.r_min || 0))) * 1000;
        
        setTimeout(() => {
            const dropRate = (mech.rare_rate || 10) / 100;
            const threshold = mech.fever_threshold || 80;
            if (STATE.love > threshold && Math.random() < dropRate) {
                spawnReward('coin');
                spawn('🎁 น้องอารมณ์ดีมากจนอยากให้รางวัล!');
            }
            scheduleNextReward();
        }, delay);
    }
    scheduleNextReward();

    setInterval(()=>{
        const mech = STATE.config.mechanics || { dec_hunger: 0.12, dec_happy: 0.08, dec_clean: 0.06, reg_stamina: 0.5 };
        STATE.maxStamina = STATE.maxStamina || 100;
        
        STATE.hunger=Math.max(0,STATE.hunger-mech.dec_hunger);
        STATE.love=Math.max(0,STATE.love-(mech.dec_happy || 0.08)); 
        STATE.clean=Math.max(0,STATE.clean-mech.dec_clean);
        
        let currentRegen = mech.reg_stamina;
        const thr = mech.fever_threshold ?? 80;
        const isPerfect = (STATE.hunger >= thr && STATE.love >= thr && STATE.clean >= thr);
        
        let multiplier = 1.0;
        if (isPerfect) {
            multiplier *= (mech.fever_mult ?? 1.5);
            if (Math.random() < 0.05) {
                spawn('🌟 น้องแฮปปี้สุดๆ! (ฟื้นพลังไวขึ้น)');
                incrementSpecialQuest('fever');
            }
        }

        // --- REWARD BUFF x1.5 FROM QUEST ---
        if (STATE.buffs.regen > 1 && Date.now() < STATE.buffs.regen_expiry) {
            multiplier *= STATE.buffs.regen;
        }

        // --- REGEN LOGIC: Allow exceeding Max but don't regen if over ---
        if (STATE.stamina < STATE.maxStamina) {
            STATE.stamina = Math.min(STATE.maxStamina, STATE.stamina + (currentRegen * multiplier));
        }

        updateUI();
    }, 5000);
})();
