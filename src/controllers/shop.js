import { STATE, saveState, currentUserId, getActiveConfig } from '../store/state.js';
import { logScoreAction } from '../services/supabase.js';
import { SFX } from '../services/sound.js';
import { updateTemplate } from '../engine/3d_engine.js';

const getAvailableSkins = () => {
    if (STATE.config.available_skins && STATE.config.available_skins.length > 0) {
        return STATE.config.available_skins;
    }
    return [
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

        // เพิ่ม Effect Fade-out ก่อนเปลี่ยนหมวดหมู่
        grid.style.opacity = '0';
        grid.style.transform = 'translateY(10px)';

        setTimeout(() => {
            window._lastTpl = currentTpl;
            window._forceRerender = false;
            
            const filteredSkins = getAvailableSkins().filter(s => s.template === currentTpl);
            let html = '';
            
            filteredSkins.forEach(s => {
                const glowColor = s.colorCls === 'neon-cyan' ? 'cyan-500' : 'emerald-500';
                html += `
                    <div id="skin-card-${s.id}" onclick="buyOrEquipSkin('${s.id}')" class="shop-card glass p-3 sm:p-4 rounded-3xl flex flex-col items-center text-center active:scale-[0.95] cursor-pointer glow overflow-hidden group border border-${glowColor}/30 transition-all duration-500">
                        <div class="absolute inset-0 bg-gradient-to-br from-${glowColor}/10 to-transparent pointer-events-none"></div>
                        <div class="w-full h-24 sm:h-28 bg-${glowColor}/10 rounded-2xl flex items-center justify-center mb-3 shadow-inner group-hover:scale-105 transition-transform drop-shadow-xl relative overflow-hidden pointer-events-none">
                            <!-- Skeleton Loader (Shimmer) -->
                            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer"></div>
                            
                            <model-viewer 
                                src="${s.model}" 
                                loading="eager" 
                                reveal="auto"
                                class="w-full h-full object-contain opacity-0 transition-opacity duration-700" 
                                onprogress="if(this.getAttribute('loaded')==='true') this.style.opacity='1'"
                                onload="this.style.opacity='1'; this.setAttribute('loaded','true')"
                                disable-zoom disable-pan auto-rotate rotation-per-second="45deg" 
                                shadow-intensity="0.5" camera-orbit="45deg 75deg 105%" 
                                environment-image="neutral" style="background-color: transparent;">
                            </model-viewer>
                            
                            <div id="skin-badge-${s.id}" class="absolute top-1 right-1 bg-white text-black text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce z-10 shadow-lg" style="display: none;">ใช้งานอยู่</div>
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

            // ค่อยๆ โชว์ผลลัพธ์ทั้งหมดพร้อมกัน
            requestAnimationFrame(() => {
                grid.style.transition = 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
                grid.style.opacity = '1';
                grid.style.transform = 'translateY(0)';
            });
        }, 150);
    };

    window.toggleShop = (close) => {
        const m = document.getElementById('shop-modal'); 
        if(!m) return;
        if(close) {
            m.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
            m.classList.remove('opacity-100', 'translate-y-0');
            setTimeout(() => { if(m.classList.contains('opacity-0')) m.classList.add('hidden'); }, 500);
        } else {
            // Close other modals
            if (window.toggleQuest) window.toggleQuest(true);
            if (window.toggleRanking) window.toggleRanking(true);
            if (window.toggleNameModal) window.toggleNameModal(true);
            
            m.classList.remove('hidden');
            setTimeout(() => {
                m.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
                m.classList.add('opacity-100', 'translate-y-0');
            }, 10);
            
            if (window.renderShopSkins) window.renderShopSkins();
            if (window.renderShopBoosters) window.renderShopBoosters();
        }
    };

    window.switchShopTab = (tab) => {
        const tabStamina = document.getElementById('shop-tab-stamina');
        const tabBoosters = document.getElementById('shop-tab-boosters');
        const tabSkins = document.getElementById('shop-tab-skins');
        const btnStamina = document.getElementById('btn-tab-stamina');
        const btnBoosters = document.getElementById('btn-tab-boosters');
        const btnSkins = document.getElementById('btn-tab-skins');
        if (!tabStamina || !tabSkins || !tabBoosters) return;

        // Reset all: Remove block and add hidden
        [tabStamina, tabBoosters, tabSkins].forEach(t => { 
            t.classList.add('hidden'); 
            t.classList.remove('block'); 
        });
        [btnStamina, btnBoosters, btnSkins].forEach(b => { 
            b.className = "flex-1 py-3 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all text-white/40 hover:bg-white/10 hover:text-white"; 
        });

        if (tab === 'stamina') {
            tabStamina.classList.remove('hidden');
            tabStamina.classList.add('block');
            btnStamina.className = "flex-1 py-3 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]";
        } else if (tab === 'boosters') {
            tabBoosters.classList.remove('hidden');
            tabBoosters.classList.add('block');
            btnBoosters.className = "flex-1 py-3 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all bg-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]";
            if (window.renderShopBoosters) window.renderShopBoosters();
        } else if (tab === 'skins') {
            tabSkins.classList.remove('hidden');
            tabSkins.classList.add('block');
            btnSkins.className = "flex-1 py-3 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all bg-pink-500/20 text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.2)]";
            if (window.renderShopSkins) window.renderShopSkins();
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
        const active = getActiveConfig();
        const shop = active.shop;
        
        const cost = shop[`${tier}_tokens`];
        const amt = shop[`${tier}_amount`];

        if (!cost || !amt) return;

        if (STATE.tokens < cost) { 
            if(window.spawn) window.spawn('🪙 เหรียญ (Tokens) ไม่พอครับ!'); 
            SFX.playAsset('error');
            return; 
        }

        STATE.tokens -= cost;
        STATE.stamina += amt; 
        
        logScoreAction(currentUserId, 'SHOP_PURCHASE', 0, -cost, `ซื้อแพ็คเกจ ${tier.toUpperCase()}`);

        if(window.spawn) window.spawn(`📦 ซื้อแพ็ค ${tier.toUpperCase()} สำเร็จ! (+${amt})`);
        SFX.playAsset('bell');
        
        if (window.updateUI) window.updateUI(); 
        saveState();
        setTimeout(() => window.toggleShop(true), 500); 
    };

    window.renderShopBoosters = () => {
        const grid = document.getElementById('shop-boosters-grid');
        if (!grid) return;
        const config = getActiveConfig().boosters || {};
        
        const types = [
            { id: 'score', name: 'แต้มทวีคูณ', getDesc: (c) => `+${Math.round((c.mult-1)*100)}% Score ตลอด ${c.duration} นาที`, icon: '📊', color: 'amber' },
            { id: 'decay', name: 'เกราะกันหิว', getDesc: (c) => `สถานะลดช้าลง ${Math.round((1-c.mult)*100)}% นาน ${c.duration} นาที`, icon: '🛡️', color: 'blue' },
            { id: 'luck', name: 'ดวงมหาเฮง', getDesc: (c) => `พบของแรร์ง่ายขึ้น ${c.mult} เท่า นาน ${c.duration} นาที`, icon: '🍀', color: 'emerald' }
        ];

        let html = '';
        types.forEach(t => {
            const item = config[t.id];
            if (!item) return;
            const desc = t.getDesc(item);
            const expiry = STATE.buffs[`${t.id}_expiry`] || 0;
            const isActive = expiry > Date.now();
            const timeStr = isActive ? `ใช้งานอยู่ในอีก ${Math.ceil((expiry - Date.now())/60000)} นาที` : 'พร้อมซื้อ';

            html += `
                <div onclick="buyBooster('${t.id}')" class="glass p-3 sm:p-4 rounded-2xl flex items-center gap-3 sm:gap-4 border border-white/5 hover:bg-white/5 active:scale-[0.98] transition-all cursor-pointer group">
                    <div class="w-10 h-10 sm:w-12 sm:h-12 bg-${t.color}-500/10 rounded-xl flex items-center justify-center text-xl sm:text-2xl">${t.icon}</div>
                    <div class="flex-1 text-left">
                        <div class="flex justify-between items-center mb-0.5">
                            <h4 class="font-black text-xs sm:text-sm text-white uppercase italic">${t.name}</h4>
                            <span class="text-[9px] font-black ${isActive ? 'text-neon-gold animate-pulse' : 'text-white/20 uppercase tracking-tighter'}">${timeStr}</span>
                        </div>
                        <p class="text-[10px] text-white/50 leading-none">${desc}</p>
                    </div>
                    <div class="cost-box bg-black/40 px-3 py-2 rounded-xl border border-white/10 font-black text-neon-gold text-xs sm:text-sm">
                        ${isActive ? '✅' : `${item.cost} 🪙`}
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    };

window.applyBuff = (type, durationMin) => {
    if (!type || type === 'none' || durationMin <= 0) return;
    
    const config = getActiveConfig().boosters || {};
    const b = config[type];
    if (!b) return;

    const now = Date.now();
    const currentExp = STATE.buffs[`${type}_expiry`] || 0;
    // ถ้าบัพเดิมยังไม่หมดอาย ให้บวกเวลาต่อจากของเดิม (Stacking)
    const baseStart = currentExp > now ? currentExp : now;
    
    STATE.buffs[`${type}_mult`] = b.mult;
    STATE.buffs[`${type}_expiry`] = baseStart + (durationMin * 60 * 1000);
    
    saveState();
    if (window.renderShopBoosters) window.renderShopBoosters();
};

window.buyBooster = (type) => {
    if (window._buying) return;
    const config = getActiveConfig().boosters || {};
    const b = config[type];
    if (!b) return;

    if (STATE.tokens < b.cost) {
        if(window.spawn) window.spawn('🪙 เหรียญไม่พอซื้อบัฟครับ!'); 
        SFX.playAsset('error');
        return;
    }

    window._buying = true;
    setTimeout(() => { window._buying = false; }, 800); 

    STATE.tokens -= b.cost;
    window.applyBuff(type, b.duration);

    logScoreAction(currentUserId, 'BUFF_PURCHASE', 0, -b.cost, `ซื้อบัฟ ${type}`);
    if(window.spawn) window.spawn(`🌟 เปิดใช้งานบัฟ ${type.toUpperCase()} สำเร็จ!`);
    SFX.playAsset('bell');
    
    if (window.updateUI) window.updateUI();
};
}
