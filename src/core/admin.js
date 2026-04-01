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
    highlightTpl();
}

window.setTemplate = (type) => { STATE.template=type; highlightTpl(); };

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
    };

    localStorage.setItem('pw3d_config', JSON.stringify(config));

    if(s) s.innerText='✅ บันทึกสำเร็จ!';
    setTimeout(()=>{ if(s) s.innerText='พร้อมบันทึก'; }, 2500);

    // Refresh preview
    const iframe=$('preview-frame');
    if(iframe) iframe.contentWindow.location.reload();
};

window.resetGame = () => {
    if(confirm('ลบข้อมูลทั้งหมด?')) {
        localStorage.removeItem('pw3d');
        localStorage.removeItem('pw3d_config');
        location.reload();
    }
};

loadConfig();
