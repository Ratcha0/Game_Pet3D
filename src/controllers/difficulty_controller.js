import { STATE, saveState } from '../store/state.js';
import { SFX } from '../services/sound.js';

export function showDifficultyModal(onComplete) {
    // 🛡️ [ISOLATION] ป้องกันไม่ให้แอดมินหรือหน้าพรีวิวเด้งหน้านี้
    if (window.self !== window.top || window._isAdminPreview) {
        if (onComplete) onComplete();
        return;
    }

    const modalId = 'difficulty-selection-modal';
    if (document.getElementById(modalId)) return;

    const modal = document.createElement('div');
    modal.id = modalId;
    // ใช้ z-[10000] เพื่อให้ลอยทับทุกอย่าง รวมถึงหน้า PIN (ที่ z-[9999])
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-[#0a0f1d]/90 backdrop-blur-xl opacity-0 transition-opacity duration-500";
    
    // ตั้งค่าเริ่มต้น (ดึงจากของเดิม หรือให้เป็น normal)
    let selectedMode = STATE.config?.difficulty_mode || 'normal';

    const renderButtons = () => {
        const modes = [
            { id: 'easy', icon: '🌱', title: 'ง่าย', desc: 'เล่นชิลๆ เติบโตเรื่อยๆ',
              base: 'text-emerald-400', 
              active: 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-105' },
            { id: 'normal', icon: '🔥', title: 'ปกติ', desc: 'สมดุล ความท้าทายปานกลาง',
              base: 'text-amber-400', 
              active: 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-105' },
            { id: 'hard', icon: '☠️', title: 'ยาก', desc: 'หิวไวโบนัสเยอะ ท้าทายสุด',
              base: 'text-rose-400', 
              active: 'bg-rose-500/20 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] scale-105' }
        ];

        return modes.map(m => {
            const isSel = selectedMode === m.id;
            const style = isSel ? m.active : "bg-white/5 border-white/10 hover:bg-white/10";
            const titleColor = isSel ? m.base : 'text-white/60';

            return `
                <div class="flex-1 flex flex-col items-center justify-center p-4 rounded-2xl border transition-all cursor-pointer ${style}" onclick="window._selectDifficulty('${m.id}')">
                    <div class="text-3xl mb-2">${m.icon}</div>
                    <div class="font-black text-xs sm:text-sm tracking-wider ${titleColor}">${m.title}</div>
                    <div class="text-[9px] text-white/40 text-center mt-1 leading-tight">${m.desc}</div>
                </div>
            `;
        }).join('');
    };

    modal.innerHTML = `
        <div class="w-[90%] max-w-sm bg-black/40 border border-white/10 rounded-[2rem] p-6 shadow-2xl flex flex-col gap-6 transform scale-95 transition-transform duration-500" id="diff-modal-content">
            <div class="text-center">
                <h2 class="text-xl font-black text-white uppercase tracking-widest mb-1">ระดับความยาก</h2>
                <p class="text-[10px] text-white/50 uppercase tracking-widest">เลือกระดับความท้าทายก่อนเข้าเกม</p>
            </div>
            
            <div class="flex gap-3" id="diff-buttons-container">
                ${renderButtons()}
            </div>
            
            <button id="diff-start-btn" class="w-full py-4 rounded-2xl bg-neon-purple/20 border border-neon-purple/50 text-neon-purple font-black uppercase tracking-widest hover:bg-neon-purple hover:text-white transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]">
                เริ่มเกม
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Global setter for onclick
    window._selectDifficulty = (mode) => {
        SFX.playClick();
        selectedMode = mode;
        document.getElementById('diff-buttons-container').innerHTML = renderButtons();
    };

    // Fade in
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('diff-modal-content').classList.remove('scale-95');
    });

    document.getElementById('diff-start-btn').onclick = () => {
        SFX.playAsset('bell'); 
        
        // 💾 Save state
        if (!STATE.config) STATE.config = {};
        STATE.config.difficulty_mode = selectedMode;
        
        // เราเรียก saveState เพื่อเก็บค่าการตั้งค่าลง Cloud (ไปอยู่รวมใน pet_assets -> inventory -> config)
        saveState(true);

        // 🎞️ Animate out
        modal.classList.add('opacity-0');
        document.getElementById('diff-modal-content').classList.add('scale-95');
        
        // รอให้เฟดเสร็จค่อยลบ UI และเริ่มเข้าเกม
        setTimeout(() => {
            modal.remove();
            delete window._selectDifficulty;
            if (onComplete) onComplete();
        }, 500);
    };
}
