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
                STATE.clean=Math.min(100,STATE.clean+10); STATE.happy=Math.min(100,STATE.happy+5); STATE.xp+=8; 
                spawn('💩 เก็บแล้ว! +8XP'); 
            } else {
                spawn('✨ พื้นสะอาดอยู่แล้ว');
            }
            break;
        case 'play': STATE.happy=Math.min(100,STATE.happy+20); STATE.xp+=25; spawn('🎾 สนุก! +25XP'); break;
    }


    if (STATE.xp >= STATE.maxExp) {
        STATE.level++; STATE.xp=0; STATE.maxExp=Math.floor(STATE.maxExp*1.4);
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

window.toggleRanking = () => {
    const m=$('ranking-modal');
    if(m){m.classList.toggle('translate-y-full');if(!m.classList.contains('translate-y-full'))loadBoard();}
};

// --- BOOT ---
(() => {
    load(); loadAdminConfig();
    init3D('three-canvas', STATE.config.template, { sky:STATE.config.sky, ground:STATE.config.ground });
    updateUI();

    // ตั้ง Poop Callbacks
    setPoopCallbacks(
        // ผู้เล่นเก็บอึสำเร็จ
        () => {
            STATE.clean = Math.min(100, STATE.clean + 15);
            STATE.xp += 8;
            spawn('f4a9 เก็บแล้ว! +8XP');
            updateUI(); save();
        },
        // อึหมดเวลา — Happy ลด
        () => {
            STATE.happy = Math.max(0, STATE.happy - 12);
            spawn('f4a9 อึเน่าเกินไป! -12♥');
            updateUI(); save();
        }
    );

    // สุ่มอึทุก 10-15 วินาที (ชั่วคราวเพื่อเทส)
    function scheduleNextPoop() {
        const delay = (10 + Math.random() * 5) * 1000;
        setTimeout(() => {
            spawnPoop();
            spawn('💩 น้องอึแล้ว!');
            scheduleNextPoop();
        }, delay);
    }
    scheduleNextPoop();

    setInterval(()=>{
        STATE.hunger=Math.max(0,STATE.hunger-0.12);
        STATE.happy=Math.max(0,STATE.happy-0.08);
        STATE.clean=Math.max(0,STATE.clean-0.06);
        STATE.stamina=Math.min(STATE.maxStamina,STATE.stamina+0.2);
        updateUI();
    },5000);
})();
