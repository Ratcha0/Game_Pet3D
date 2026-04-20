import { STATE, saveState, currentUserId } from '../store/state.js';
import { logScoreAction } from '../services/supabase.js';
import { SFX } from '../services/sound.js';
import { updateTemplate } from '../engine/3d_engine.js';

const getAvailableSkins = () => {
    return STATE.config.available_skins || [
        { id: 'cat-toon', template: 'pet', name: 'Classic Cat', desc: 'แมวหน้าบูดคู่บุญ', icon: '🐱', cost: 0, model: '/toon_cat_free.glb', colorCls: 'neon-gold' },
        { id: 'plant-stylized', template: 'plant', name: 'Classic Tree', desc: 'ต้นไม้แห้งๆ', icon: '🌳', cost: 0, model: '/stylized_tree.glb', colorCls: 'emerald' },
        { id: 'car-carton', template: 'car', name: 'Classic Car', desc: 'รถบังคับสุดจ๊าบ', icon: '🚗', cost: 0, model: '/car_carton.glb', colorCls: 'emerald', rotationY: 3.14159 },
        { id: 'cyberpunk_car', template: 'car', name: 'Cyberpunk 2077', desc: 'รถโลกอนาคตสุดเท่', icon: '🚀💨', cost: 5000, model: '/cyberpunk_car.glb', colorCls: 'neon-cyan' }
    ];
};

export function initShop() {
    window._lastTpl = null;
    window._forceRerender = true;

    window.updateSkinButtons = () => {
        const currentTpl = STATE.config.template || 'pet';
        const filteredSkins = getAvailableSkins().filter(s => s.template === currentTpl);
        
        filteredSkins.forEach(s => {
            const btnBox = document.getElementById(`skin-btn-${s.id}`);
            const badgeBox = document.getElementById(`skin-badge-${s.id}`);
            const cardBox = document.getElementById(`skin-card-${s.id}`);
            if (!btnBox || !cardBox) return;

            const isOwned = s.cost === 0 || (STATE.inventory && STATE.inventory.skins && STATE.inventory.skins.includes(s.id));
            let currentModel = '';
            if (STATE.inventory && STATE.inventory.equipped_skins && STATE.inventory.equipped_skins[currentTpl]) {
                currentModel = STATE.inventory.equipped_skins[currentTpl];
            } else if (STATE.inventory && STATE.inventory.equipped_skin) {
                currentModel = STATE.inventory.equipped_skin;
            } else {
                currentModel = STATE.config.custom_model || '';
            }
            if (currentModel === '') currentModel = getAvailableSkins().find(x => x.template === currentTpl && x.cost === 0)?.model || '';
            const isEquipped = currentModel.endsWith(s.model);

            const glowColor = s.colorCls === 'neon-cyan' ? 'cyan-500' : 'emerald-500';
            
            // Update Badge
            if (badgeBox) badgeBox.style.display = isEquipped ? 'block' : 'none';

            // Update Card Border
            if (isEquipped) {
                cardBox.className = `shop-card glass p-3 sm:p-4 rounded-3xl flex flex-col items-center text-center active:scale-[0.95] cursor-pointer glow overflow-hidden group border border-${glowColor}/80`;
                btnBox.className = `cost-box bg-black/80 px-3 py-2 rounded-xl border border-${glowColor}/20 font-black text-neon-gold text-[10px] sm:text-xs w-full flex justify-center items-center gap-1 ring-1 ring-white/50`;
                btnBox.innerText = 'สวมใส่อยู่';
            } else {
                cardBox.className = `shop-card glass p-3 sm:p-4 rounded-3xl flex flex-col items-center text-center active:scale-[0.95] cursor-pointer glow overflow-hidden group border border-${glowColor}/30`;
                btnBox.className = `cost-box bg-black/50 px-3 py-2 rounded-xl border border-${glowColor}/20 font-black text-neon-gold text-[10px] sm:text-xs w-full flex justify-center items-center gap-1`;
                btnBox.innerText = isOwned ? 'สวมใส่สกินนี้' : `${s.cost} 🪙`;
            }
        });
    };

    window.renderShopSkins = () => {
        const grid = document.getElementById('shop-skins-grid');
        if (!grid) return;
        
        const currentTpl = STATE.config.template || 'pet';
        
        if (window._lastTpl === currentTpl && !window._forceRerender) {
            window.updateSkinButtons();
            return;
        }

        window._lastTpl = currentTpl;
        window._forceRerender = false;
        
        const filteredSkins = getAvailableSkins().filter(s => s.template === currentTpl);
        let html = '';
        
        filteredSkins.forEach(s => {
            const glowColor = s.colorCls === 'neon-cyan' ? 'cyan-500' : 'emerald-500';
            html += `
                <div id="skin-card-${s.id}" onclick="buyOrEquipSkin('${s.id}')" class="shop-card glass p-3 sm:p-4 rounded-3xl flex flex-col items-center text-center active:scale-[0.95] cursor-pointer glow overflow-hidden group border border-${glowColor}/30">
                    <div class="absolute inset-0 bg-gradient-to-br from-${glowColor}/10 to-transparent pointer-events-none"></div>
                    <div class="w-full h-24 sm:h-28 bg-${glowColor}/10 rounded-2xl flex items-center justify-center mb-3 shadow-inner group-hover:scale-105 transition-transform drop-shadow-xl relative overflow-hidden pointer-events-none">
                        <model-viewer src="${s.model}" loading="lazy" class="w-full h-full object-contain" disable-zoom disable-pan auto-rotate rotation-per-second="45deg" shadow-intensity="0.5" camera-orbit="45deg 75deg 105%" environment-image="neutral" style="background-color: transparent;"></model-viewer>
                        <div id="skin-badge-${s.id}" class="absolute top-1 right-1 bg-white text-black text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce z-10 shadow-lg" style="display: none;">ON</div>
                    </div>
                    <h4 class="text-[10px] sm:text-xs font-black text-white uppercase tracking-wider mb-1 line-clamp-2 leading-tight">${s.name}</h4>
                    <span class="text-[8px] sm:text-[9px] text-white/50 mb-3 line-clamp-1">${s.desc}</span>
                    <div id="skin-btn-${s.id}" class="cost-box bg-black/50 px-3 py-2 rounded-xl border border-${glowColor}/20 font-black text-neon-gold text-[10px] sm:text-xs w-full flex justify-center items-center gap-1">
                        ...
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
        window.updateSkinButtons();
    };

    window.toggleShop = (close) => {
        const m = document.getElementById('shop-modal'); 
        if(!m) return;
        if(close) m.classList.add('translate-y-full');
        else {
            m.classList.remove('translate-y-full');
            if (window.renderShopSkins) window.renderShopSkins();
        }
    };

    window.switchShopTab = (tabName) => {
        const tabStamina = document.getElementById('shop-tab-stamina');
        const tabSkins = document.getElementById('shop-tab-skins');
        const btnStamina = document.getElementById('btn-tab-stamina');
        const btnSkins = document.getElementById('btn-tab-skins');
        
        if (!tabStamina || !tabSkins) return;

        SFX.playAsset('click');

        if (tabName === 'stamina') {
            tabStamina.classList.remove('hidden');
            tabStamina.classList.add('block');
            tabSkins.classList.remove('block');
            tabSkins.classList.add('hidden');
            
            btnStamina.className = "flex-1 py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]";
            btnSkins.className = "flex-1 py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all text-white/40 hover:bg-white/10 hover:text-white";
        } else {
            tabSkins.classList.remove('hidden');
            tabSkins.classList.add('block');
            tabStamina.classList.remove('block');
            tabStamina.classList.add('hidden');
            
            window.renderShopSkins(); // Render before display
            
            btnSkins.className = "flex-1 py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-pink-500/20 text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.2)]";
            btnStamina.className = "flex-1 py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all text-white/40 hover:bg-white/10 hover:text-white";
        }
    };

    window.buyOrEquipSkin = (skinId) => {
        const skin = getAvailableSkins().find(s => s.id === skinId);
        if (!skin) return;

        if (!STATE.inventory) STATE.inventory = { skins: [] };
        if (!STATE.inventory.skins) STATE.inventory.skins = [];

        const isOwned = skin.cost === 0 || STATE.inventory.skins.includes(skin.id);

        if (!isOwned) {
            if (STATE.tokens < skin.cost) {
                if(window.spawn) window.spawn('🪙 เหรียญไม่พอซื้อสกินครับ!'); 
                SFX.playAsset('error');
                return;
            }
            STATE.tokens -= skin.cost;
            STATE.inventory.skins.push(skin.id);
            logScoreAction(currentUserId, 'SKIN_PURCHASE', 0, -skin.cost, `ซื้อสกิน ${skin.name}`);
            if(window.spawn) window.spawn(`🎁 ปลดล็อคสกิน ${skin.name} สำเร็จ!`);
            SFX.playAsset('bell');
        }

        // Equip logic
        if (!STATE.inventory) STATE.inventory = { skins: [], equipped_skins: {} };
        if (!STATE.inventory.equipped_skins) STATE.inventory.equipped_skins = {};
        STATE.inventory.equipped_skins[STATE.config.template] = skin.model;
        
        saveState();
        
        // ส่งค่า Rotation จากสกินจริงเข้าไปด้วย (แก้ปัญหารถบางคันถอยหลัง)
        updateTemplate(STATE.config.template, skin.model, skin.rotationY || 0);

        if(window.spawn && isOwned) window.spawn(`🪄 สวมใส่สกิน ${skin.name} เรียบร้อย!`);
        SFX.playAsset('click');
        
        // Refresh UI
        window.renderShopSkins();
        if (window.updateUI) window.updateUI();
    };

    window.buyPackage = (tier) => {
        const pkg = STATE.config.shop[tier];
        if (!pkg) return;
        if (STATE.tokens < pkg.cost) { 
            if(window.spawn) window.spawn('🪙 เหรียญ (Tokens) ไม่พอครับ!'); 
            return; 
        }

        STATE.tokens -= pkg.cost;
        STATE.stamina += pkg.amt; 
        
        // บันทึก Log การซื้อของ
        logScoreAction(currentUserId, 'SHOP_PURCHASE', 0, -pkg.cost, `ซื้อแพ็คเกจ ${tier.toUpperCase()}`);

        if(window.spawn) window.spawn(`📦 ซื้อแพ็ค ${tier.toUpperCase()} สำเร็จ! (+${pkg.amt})`);
        SFX.playAsset('bell');
        
        if (window.updateUI) window.updateUI(); 
        saveState();
        setTimeout(() => window.toggleShop(true), 500); 
    };
}
