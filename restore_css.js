const fs = require('fs');

const logPath = '/home/ags-sds/.gemini/antigravity/brain/5702991e-cca4-4f58-961d-3788910c6dad/.system_generated/logs/overview.txt';
if (fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, 'utf8');
    // Find the last known full version of styles.css before the deletion
    const match = log.match(/@tailwind base;[\s\S]*?}/g);
    if (match) {
        let longestCss = "";
        for (const m of match) {
            if (m.length > longestCss.length) {
                longestCss = m;
            }
        }
        fs.writeFileSync('/home/ags-sds/Documents/Project_Game/LikeGotchi_Modern/src/styles.css', longestCss);
        console.log("RESTORED CSS FROM LOGS. Length:", longestCss.length);
    } else {
        console.log("NOT FOUND IN LOGS");
    }
} else {
    console.log("NO LOG FILE");
}
