import { init3D, updateTemplate, updateEnvironment, spawnPoop, setPoopCallbacks, collectPoopByUI } from './3d_engine.js';

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
    tokens: 2500, hunger: 85, happy: 92, clean: 70, stamina: 90,
    maxStamina: 100, xp: 350, level: 5, maxExp: 1000,
    config: { template:'pet', sky:'day', ground:'grass',
              season_name:'Season 1', season_weeks:1,
              costs:{ feed:10, clean:8, repair:5, play:12 } }
};

const $ = id => document.getElementById(id);

function updateUI() {
    const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
    const l=$('hud-level'); if(l) l.innerText=STATE.level;
    const xpBar=$('bar-xp'); if(xpBar) xpBar.style.width=`${(STATE.xp/STATE.maxExp)*100}%`;

    [['bar-hunger','val-hunger',STATE.hunger],['bar-happy','val-happy',STATE.happy],
     ['bar-clean','val-clean',STATE.clean],['bar-stamina','val-stamina',STATE.stamina]]
    .forEach(([b,v,val])=>{
        const bar=$(b); if(bar) bar.style.width=`${val}%`;
        const ve=$(v); if(ve) ve.innerText=`${Math.floor(val)}%`;
    });

    // Costs
    ['feed','clean','repair','play'].forEach(k=>{
        const el=$(`cost-${k}`); if(el) el.innerText=STATE.config.costs[k];
    });

    // Season
    const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name;
    const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_weeks}W`;
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

window.doAction = (type) => {
    const cost = STATE.config.costs[type];
    if (STATE.stamina < cost) { spawn('⚡ พลังงานไม่พอ!'); return; }
    STATE.stamina -= cost;

    switch(type) {
        case 'feed': STATE.hunger=Math.min(100,STATE.hunger+15); STATE.xp+=15; spawn('🍖 อร่อย! +15XP'); break;
        case 'clean': STATE.clean=Math.min(100,STATE.clean+20); STATE.xp+=10; spawn('🧼 สะอาด! +10XP'); break;
        case 'repair': 
            if (collectPoopByUI()) {
                STATE.clean=Math.min(100,STATE.clean+10); STATE.happy=Math.min(100,STATE.happy+5); STATE.xp+=12; 
                spawn('💩 เก็บแล้ว! +12XP'); 
            } else {
                spawn('✨ พื้นสะอาดอยู่แล้ว');
            }
            break;
        case 'play': STATE.happy=Math.min(100,STATE.happy+20); STATE.xp+=25; spawn('🎾 สนุก! +25XP'); break;
    }


    if (STATE.xp >= STATE.maxExp) {
        STATE.level++;
        STATE.xp -= STATE.maxExp; // ทบ XP ไปเลเวลถัดไป ไม่ให้หายฟรี
        STATE.maxExp = Math.floor(STATE.maxExp * 1.25); // ปรับจาก 1.4 เหลือ 1.25 ให้สมดุลขึ้น
        spawn('🆙 LEVEL UP!');
    }
    updateUI(); save();
};

function save() { localStorage.setItem('pw3d', JSON.stringify(STATE)); }
function load() { const d=localStorage.getItem('pw3d'); if(d) Object.assign(STATE, JSON.parse(d)); }

function loadAdminConfig() {
    const c=localStorage.getItem('pw3d_config');
    if(c) {
        const p=JSON.parse(c);
        STATE.config.template=p.template_type||'pet';
        STATE.config.sky=p.sky||'day';
        STATE.config.ground=p.ground||'grass';
        STATE.config.season_name=p.season_name||'Season 1';
        STATE.config.season_weeks=p.season_weeks||1;
        STATE.config.costs={ feed:p.cost_feed||10, clean:p.cost_clean||8, repair:p.cost_repair||5, play:p.cost_play||12 };
    }
}

// Listen for admin changes
window.addEventListener('storage', (e) => {
    if(e.key==='pw3d_config') {
        loadAdminConfig();
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
            <div class="font-black text-neon-gold text-sm">${p.tokens.toLocaleString()} 🪙</div>
        </div>
    `).join('');
}

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

// ระบบลากนิ้ว (Swipe to Close)
const initSwipeToClose = () => {
    const modal = $('ranking-modal');
    const handle = $('ranking-handle');
    let startY = 0;
    let currentY = 0;
    
    if(!modal || !handle) return;

    const onTouchStart = (e) => {
        startY = e.touches[0].clientY;
        modal.style.transition = 'none'; // ปิด transition ตอนลาก
    };

    const onTouchMove = (e) => {
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) {
            // ลากลงเท่านั้น
            modal.style.transform = `translateY(${deltaY}px)`;
        }
    };

    const onTouchEnd = () => {
        const deltaY = currentY - startY;
        modal.style.transition = 'all 0.4s ease';
        
        if (deltaY > 150) {
            // ถ้าลากลงมาลึกเกิน 150px ให้ปิดเลย
            toggleRanking(true);
        } else {
            // ถ้าไม่ถึง ให้เด้งกลับที่เดิม
            modal.style.transform = 'translateY(0)';
        }
        currentY = 0;
        startY = 0;
    };

    // ใส่ Event ให้ทั้งก้อนบนสุดและตัวหูดึง
    handle.addEventListener('touchstart', onTouchStart);
    handle.addEventListener('touchmove', onTouchMove);
    handle.addEventListener('touchend', onTouchEnd);
    
    // คลิกที่หูก็ปิดได้เหมือนเดิม
    handle.onclick = () => toggleRanking(true);
};

// --- BOOT ---
(() => {
    load(); loadAdminConfig();
    init3D('three-canvas', STATE.config.template, { sky:STATE.config.sky, ground:STATE.config.ground });
    updateUI();
    initSwipeToClose(); // เปิดใช้งานระบบลาก

    // ตั้ง Poop Callbacks
    setPoopCallbacks(
        // ผู้เล่นเก็บอึสำเร็จ
        () => {
            STATE.clean = Math.min(100, STATE.clean + 15);
            STATE.xp += 12;
            spawn('f4a9 เก็บแล้ว! +12XP');
            updateUI(); save();
        },
        // อึหมดเวลา — Happy ลด
        () => {
            STATE.happy = Math.max(0, STATE.happy - 12);
            spawn('f4a9 อึเน่าเกินไป! -12♥');
            updateUI(); save();
        }
    );

    // สุ่มอึตามสถานะของสัตว์เลี้ยง (สมดุลขึ้น)
    function scheduleNextPoop() {
        // อึทุกๆ 60 - 150 วินาที (1 - 2.5 นาที)
        const baseDelay = (60 + Math.random() * 90) * 1000;
        
        setTimeout(() => {
            // โอกาสอึขึ้นอยู่กับความหิว (อิ่มมากยิ่งอึบ่อย) และความสะอาด
            const poopChance = (STATE.hunger / 100) * (1.2 - (STATE.clean / 100)); // ค่าสุ่มระหว่าง 0 - 1.2
            
            if (poopChance > 0.4) {
                spawnPoop();
                spawn('💩 น้องปวดท้องอึ!');
            }
            
            scheduleNextPoop();
        }, baseDelay);
    }
    scheduleNextPoop();

    setInterval(()=>{
        STATE.hunger=Math.max(0,STATE.hunger-0.12);
        STATE.happy=Math.max(0,STATE.happy-0.08);
        STATE.clean=Math.max(0,STATE.clean-0.06);
        STATE.stamina=Math.min(STATE.maxStamina,STATE.stamina+0.5); // ปรับจาก 0.2 เป็น 0.5 ให้ฟื้นฟูไวขึ้น
        updateUI();
    },5000);
})();
