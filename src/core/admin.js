const $ = id => document.getElementById(id);
const STATE = { template:'pet', sky:'day', ground:'grass', season_name:'Season 1', season_weeks:1, costs:{feed:10,clean:8,repair:5,play:12} };

function highlightTpl() {
    ['pet','plant','car'].forEach(k=>{
        const el=$(`tpl-${k}`);
        if(el) el.classList.toggle('active', k===STATE.template);
    });
}

function loadConfig() {
    const c=localStorage.getItem('pw3d_config');
    if(c) Object.assign(STATE, JSON.parse(c));
    
    if($('cfg-sky')) $('cfg-sky').value = STATE.sky||'day';
    if($('cfg-ground')) $('cfg-ground').value = STATE.ground||'grass';
    if($('cfg-season-name')) $('cfg-season-name').value = STATE.season_name||'Season 1';
    if($('cfg-season-weeks')) $('cfg-season-weeks').value = STATE.season_weeks||1;
    if($('cfg-feed')) $('cfg-feed').value = STATE.costs?.feed||10;
    if($('cfg-clean')) $('cfg-clean').value = STATE.costs?.clean||8;
    if($('cfg-repair')) $('cfg-repair').value = STATE.costs?.repair||5;
    if($('cfg-play')) $('cfg-play').value = STATE.costs?.play||12;
    
    if($('cfg-max-stamina')) $('cfg-max-stamina').value = STATE.max_stamina || 100;
    if($('cfg-reg-stamina')) $('cfg-reg-stamina').value = STATE.reg_stamina || 0.5;
    if($('cfg-dec-hunger')) $('cfg-dec-hunger').value = STATE.dec_hunger || 0.12;
    if($('cfg-dec-clean')) $('cfg-dec-clean').value = STATE.dec_clean || 0.06;
    if($('cfg-dec-happy')) $('cfg-dec-happy').value = STATE.dec_happy || 0.08;
    
    if($('cfg-rst-feed')) $('cfg-rst-feed').value = STATE.rst_feed || 15;
    if($('cfg-rxp-feed')) $('cfg-rxp-feed').value = STATE.rxp_feed || 15;
    if($('cfg-rst-play')) $('cfg-rst-play').value = STATE.rst_play || 20;
    if($('cfg-rxp-play')) $('cfg-rxp-play').value = STATE.rxp_play || 25;
    if($('cfg-rst-clean')) $('cfg-rst-clean').value = STATE.rst_clean || 20;
    if($('cfg-rxp-clean')) $('cfg-rxp-clean').value = STATE.rxp_clean || 10;
    if($('cfg-rst-repair')) $('cfg-rst-repair').value = STATE.rst_repair || 10;
    if($('cfg-rxp-repair')) $('cfg-rxp-repair').value = STATE.rxp_repair || 12;

    if($('cfg-sp-min')) $('cfg-sp-min').value = STATE.sp_min || 60;
    if($('cfg-sp-max')) $('cfg-sp-max').value = STATE.sp_max || 150;

    if($('cfg-happy-drop-rate')) $('cfg-happy-drop-rate').value = STATE.happy_drop_rate || 0.7;

    if($('cfg-shop-s-cost')) $('cfg-shop-s-cost').value = STATE.shop_s_cost || 500;
    if($('cfg-shop-s-amt')) $('cfg-shop-s-amt').value = STATE.shop_s_amt || 50;
    if($('cfg-shop-m-cost')) $('cfg-shop-m-cost').value = STATE.shop_m_cost || 900;
    if($('cfg-shop-m-amt')) $('cfg-shop-m-amt').value = STATE.shop_m_amt || 100;
    if($('cfg-shop-l-amt')) $('cfg-shop-l-amt').value = STATE.shop_l_amt || 250;

    if($('cfg-rscore-scoop')) $('cfg-rscore-scoop').value = STATE.rscore_scoop || 20;
    if($('cfg-rscore-level')) $('cfg-rscore-level').value = STATE.rscore_level || 1000;

    highlightTpl();
    
    // Attach live preview events so changes reflect immediately in the iframe
    const allInputs = [
        'cfg-sky', 'cfg-ground', 'cfg-season-name', 'cfg-season-weeks', 'cfg-feed', 'cfg-clean', 'cfg-repair', 'cfg-play',
        'cfg-max-stamina', 'cfg-reg-stamina', 'cfg-dec-hunger', 'cfg-dec-clean', 'cfg-dec-happy',
        'cfg-rst-feed', 'cfg-rxp-feed', 'cfg-rst-play', 'cfg-rxp-play', 'cfg-rst-clean', 'cfg-rxp-clean', 'cfg-rst-repair', 'cfg-rxp-repair',
        'cfg-sp-min', 'cfg-sp-max', 'cfg-happy-drop-rate',
        'cfg-shop-s-cost', 'cfg-shop-s-amt', 'cfg-shop-m-cost', 'cfg-shop-m-amt', 'cfg-shop-l-cost', 'cfg-shop-l-amt',
        'cfg-rscore-scoop', 'cfg-rscore-level'
    ];
    allInputs.forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', sendPreview);
    });
}

function sendPreview() {
    const config = {
        template_type: STATE.template,
        sky: $('cfg-sky')?.value || 'day',
        ground: $('cfg-ground')?.value || 'grass',
        season_name: $('cfg-season-name')?.value || 'Season 1',
        season_weeks: parseInt($('cfg-season-weeks')?.value) || 1,
        cost_feed: parseInt($('cfg-feed')?.value) || 10,
        cost_clean: parseInt($('cfg-clean')?.value) || 8,
        cost_repair: parseInt($('cfg-repair')?.value) || 5,
        cost_play: parseInt($('cfg-play')?.value) || 12,
        max_stamina: parseInt($('cfg-max-stamina')?.value) || 100,
        reg_stamina: parseFloat($('cfg-reg-stamina')?.value) || 0.5,
        dec_hunger: parseFloat($('cfg-dec-hunger')?.value) || 0.12,
        dec_clean: parseFloat($('cfg-dec-clean')?.value) || 0.06,
        dec_happy: parseFloat($('cfg-dec-happy')?.value) || 0.08,
        happy_drop_rate: parseFloat($('cfg-happy-drop-rate')?.value) || 0.7,
        shop_s_cost: parseInt($('cfg-shop-s-cost')?.value) || 500,
        shop_s_amt: parseInt($('cfg-shop-s-amt')?.value) || 50,
        shop_m_cost: parseInt($('cfg-shop-m-cost')?.value) || 900,
        shop_m_amt: parseInt($('cfg-shop-m-amt')?.value) || 100,
        shop_l_cost: parseInt($('cfg-shop-l-cost')?.value) || 2000,
        shop_l_amt: parseInt($('cfg-shop-l-amt')?.value) || 250,
        rscore_scoop: parseInt($('cfg-rscore-scoop')?.value) || 20,
        rscore_level: parseInt($('cfg-rscore-level')?.value) || 1000,
        rst_feed: parseInt($('cfg-rst-feed')?.value) || 15,
        rxp_feed: parseInt($('cfg-rxp-feed')?.value) || 15,
        rst_play: parseInt($('cfg-rst-play')?.value) || 20,
        rxp_play: parseInt($('cfg-rxp-play')?.value) || 25,
        rst_clean: parseInt($('cfg-rst-clean')?.value) || 20,
        rxp_clean: parseInt($('cfg-rxp-clean')?.value) || 10,
        rst_repair: parseInt($('cfg-rst-repair')?.value) || 10,
        rxp_repair: parseInt($('cfg-rxp-repair')?.value) || 12,
        sp_min: parseInt($('cfg-sp-min')?.value) || 60,
        sp_max: parseInt($('cfg-sp-max')?.value) || 150
    };
    const iframe = $('preview-frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'PW3D_PREVIEW', config }, '*');
    }
}

window.setTemplate = (type) => { STATE.template=type; highlightTpl(); sendPreview(); };

window.saveAll = () => {
    const s=$('save-status');
    if(s) s.innerText='⏳ กำลังบันทึก...';

    const config = {
        template_type: STATE.template,
        sky: $('cfg-sky')?.value || 'day',
        ground: $('cfg-ground')?.value || 'grass',
        season_name: $('cfg-season-name')?.value || 'Season 1',
        season_weeks: parseInt($('cfg-season-weeks')?.value) || 1,
        cost_feed: parseInt($('cfg-feed')?.value) || 10,
        cost_clean: parseInt($('cfg-clean')?.value) || 8,
        cost_repair: parseInt($('cfg-repair')?.value) || 5,
        cost_play: parseInt($('cfg-play')?.value) || 12,
        max_stamina: parseInt($('cfg-max-stamina')?.value) || 100,
        reg_stamina: parseFloat($('cfg-reg-stamina')?.value) || 0.5,
        dec_hunger: parseFloat($('cfg-dec-hunger')?.value) || 0.12,
        dec_clean: parseFloat($('cfg-dec-clean')?.value) || 0.06,
        dec_happy: parseFloat($('cfg-dec-happy')?.value) || 0.08,
        happy_drop_rate: parseFloat($('cfg-happy-drop-rate')?.value) || 0.7,
        shop_s_cost: parseInt($('cfg-shop-s-cost')?.value) || 500,
        shop_s_amt: parseInt($('cfg-shop-s-amt')?.value) || 50,
        shop_m_cost: parseInt($('cfg-shop-m-cost')?.value) || 900,
        shop_m_amt: parseInt($('cfg-shop-m-amt')?.value) || 100,
        shop_l_cost: parseInt($('cfg-shop-l-cost')?.value) || 2000,
        shop_l_amt: parseInt($('cfg-shop-l-amt')?.value) || 250,
        rscore_scoop: parseInt($('cfg-rscore-scoop')?.value) || 20,
        rscore_level: parseInt($('cfg-rscore-level')?.value) || 1000,
        rst_feed: parseInt($('cfg-rst-feed')?.value) || 15,
        rxp_feed: parseInt($('cfg-rxp-feed')?.value) || 15,
        rst_play: parseInt($('cfg-rst-play')?.value) || 20,
        rxp_play: parseInt($('cfg-rxp-play')?.value) || 25,
        rst_clean: parseInt($('cfg-rst-clean')?.value) || 20,
        rxp_clean: parseInt($('cfg-rxp-clean')?.value) || 10,
        rst_repair: parseInt($('cfg-rst-repair')?.value) || 10,
        rxp_repair: parseInt($('cfg-rxp-repair')?.value) || 12,
        sp_min: parseInt($('cfg-sp-min')?.value) || 60,
        sp_max: parseInt($('cfg-sp-max')?.value) || 150
    };

    localStorage.setItem('pw3d_config', JSON.stringify(config));

    if(s) s.innerText='✅ บันทึกสำเร็จ!';
    setTimeout(()=>{ if(s) s.innerText='พร้อมบันทึก'; }, 2500);
    // ไม่ต้อง reload iframe แล้ว เพราะมันอัปเดตแบบ Real-time ไปแล้ว
};

window.resetGame = () => {
    if(confirm('ลบข้อมูลทั้งหมด?')) {
        localStorage.removeItem('pw3d');
        localStorage.removeItem('pw3d_config');
        location.reload();
    }
};

loadConfig();
