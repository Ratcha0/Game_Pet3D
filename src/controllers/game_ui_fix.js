window.updateUI = function() {
    try {
        if (!STATE) return;

        const musicBtn = document.getElementById('music-btn');
        if (musicBtn) {
            musicBtn.innerText = SFX.musicEnabled ? '🎵' : '🔇';
        }

        const un=$('hud-username'); if(un) un.innerText=STATE.username;
        const t=$('hud-tokens'); if(t) t.innerText=Math.floor(STATE.tokens).toLocaleString();
        const s=$('hud-score'); if(s) s.innerText=Math.floor(STATE.score).toLocaleString();
        
        // 📈 XP Progress Bar & Levels
        const lvlEl = $('hud-level');
        const xpBar = $('bar-xp');
        const xpVal = $('hud-xp-val');
        
        const safeLvl = parseInt(STATE.level) || 1;
        const safeXP  = parseFloat(STATE.xp) || 0;
        const safeMax = parseFloat(STATE.max_exp) || 200;

        if (lvlEl) lvlEl.innerText = safeLvl;
        if (xpBar) {
            const percentage = (safeXP / safeMax) * 100;
            xpBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        }
        if (xpVal) xpVal.innerText = `${Math.floor(safeXP)}/${Math.floor(safeMax)} XP`;

        // Update Shop display from config
        const active = getActiveConfig();
        if (active && active.shop) {
            ['small','medium','large'].forEach(tier => {
                const c = $(`shop-cost-${tier}`); if(c) c.innerText = active.shop[`${tier}_tokens`];
                const a = $(`shop-amt-${tier}`); if(a) a.innerText = active.shop[`${tier}_amount`];
            });
        }

        // 🛡️ [AUTO-THEME SYNC] อัปเดตไอคอนและป้ายชื่อเมื่อ Template หรือ Skin เปลี่ยน
        const activeSkin = STATE.inventory?.equipped_skins?.pet || '';
        const uiKey = `${STATE.config.template}_${activeSkin}`;
        
        if (window._lastUIKey !== uiKey) {
            window._lastUIKey = uiKey;
            
            const isCarSkin = activeSkin.toLowerCase().includes('car');
            const effectiveTemplate = isCarSkin ? 'car' : (STATE.config.template || 'pet');
            
            const labels = {
                pet:   { h:'ความหิว', l:'ความรัก', c:'ความสะอาด', s:'พลังงาน', af:'ป้อนอาหาร', ac:'อาบน้ำ', ap:'เล่นด้วย' },
                car:   { h:'เชื้อเพลิง', l:'สภาพเครื่อง', c:'ความเงางาม', s:'แบตเตอรี่', af:'เติมน้ำมัน', ac:'ล้างรถ', ap:'จูนเครื่อง' },
                plant: { h:'ระดับน้ำ', l:'รับแสงแดด', c:'ความสดชื่น', s:'การเติบโต', af:'รดน้ำ', ac:'เช็ดใบ', ap:'เปิดเพลง' }
            };
            const statIcons = {
                pet:   { hunger:'🍖', happy:'💖', clean:'🧼', stamina:'⚡' },
                car:   { hunger:'⛽', happy:'🔧', clean:'✨', stamina:'🔋' },
                plant: { hunger:'💧', happy:'☀️', clean:'🌿', stamina:'☘️' }
            };
            const actIcons = {
                pet:   { feed:'🍗', clean:'🧼', play:'🎾' },
                car:   { feed:'⛽', clean:'🚿', play:'🏁' },
                plant: { feed:'💧', clean:'🌿', play:'🎵' }
            };

            const cur = labels[effectiveTemplate] || labels.pet;
            const si = statIcons[effectiveTemplate] || statIcons.pet;
            const ai = actIcons[effectiveTemplate] || actIcons.pet;

            const ih=$('icon-hunger'); if(ih) ih.innerText = si.hunger;
            const ihp=$('icon-happy'); if(ihp) ihp.innerText = si.happy;
            const ic=$('icon-clean'); if(ic) ic.innerText = si.clean;
            
            const stats = [['lbl-stat-hunger', cur.h], ['lbl-stat-happy', cur.l], ['lbl-stat-clean', cur.c], ['lbl-stat-stamina', cur.s]];
            stats.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });

            const acts = [['lbl-act-feed', cur.af], ['lbl-act-clean', cur.ac], ['lbl-act-play', cur.ap]];
            acts.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });
            
            const actBtnIcons = [['icon-act-feed', ai.feed], ['icon-act-clean', ai.clean], ['icon-act-play', ai.play]];
            actBtnIcons.forEach(([id, val]) => { const el = $(id); if(el) el.innerText = val; });

            // Update User Icon to match effective template
            const userIcon = $('hud-user-icon');
            if (userIcon) {
                const icons = { pet:'🐱', car:'🏎️', plant:'🌵' };
                userIcon.innerText = icons[effectiveTemplate] || '🐱';
                if (window.twemoji) twemoji.parse(userIcon);
            }

            // 🛍️ [SHOP REFRESH]
            const isShopOpen = !document.getElementById('shop-modal')?.classList.contains('hidden');
            if (isShopOpen) {
                if (window.updateSkinButtons) window.updateSkinButtons();
                if (window.renderShopBoosters) window.renderShopBoosters();
            }
        } else if (window._forceRerender) {
            if (window.renderShopSkins) {
                window.renderShopSkins();
                window._forceRerender = false;
            }
        }

        const activeCfg = getActiveConfig() || {};
        const mechanics = activeCfg.mechanics || {};
        const maxStam = mechanics.max_stamina || 100;

        [['bar-hunger','val-hunger',STATE.hunger], ['bar-happy','val-happy',STATE.love],
         ['bar-clean','val-clean',STATE.clean], ['bar-stamina','val-stamina',STATE.stamina]]
        .forEach(([b,v,val])=>{
            const maxVal = (b === 'bar-stamina') ? maxStam : 100;
            const bar = $(b); 
            if(bar) {
                const currentVal = parseFloat(val) || 0;
                const percent = Math.min(100, Math.max(0, (currentVal / (maxVal || 100)) * 100));
                bar.style.width = `${percent}%`;
            }
            const txt = $(v); if(txt) {
                const isStamina = b === 'bar-stamina';
                const displayVal = Math.round(parseFloat(val) || 0);
                txt.innerHTML = isStamina ? `${displayVal}` : `${displayVal}%`;

                const parentBox = bar ? bar.parentElement : null;
                if (displayVal < 20 && b !== 'bar-stamina') {
                    txt.classList.add('alert-red');
                    if(parentBox) parentBox.classList.add('alert-red');
                } else {
                    txt.classList.remove('alert-red');
                    if(parentBox) parentBox.classList.remove('alert-red');
                }
            }
        });

        const moodEl = $('mood-emoji');
        const moodVal = $('mood-val');
        if(moodEl && moodVal) {
            const curLove = Math.round(STATE.love || 0);
            moodVal.innerText = `${curLove}%`;
            
            let newEmoji = '😐';
            if(curLove > 85) newEmoji = '😍';
            else if(curLove > 50) newEmoji = '😊';
            else if(curLove > 20) newEmoji = '😐';
            else newEmoji = '🥺';
            
            if (moodEl.innerText !== newEmoji) {
                moodEl.innerText = newEmoji;
                if (window.twemoji) twemoji.parse(moodEl);
            }
        }

        const sb=$('season-badge'); if(sb) sb.innerText=STATE.config.season_name || 'Season 1';
        const st=$('season-timer'); if(st) st.innerText=`${STATE.config.season_duration || 15}D`;

        if(STATE.love >= 100) incrementSpecialQuest('pure_love');

    } catch (e) {
        console.error("❌ updateUI Error:", e);
    }
};
