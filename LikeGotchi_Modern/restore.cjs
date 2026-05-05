const fs = require('fs');

const logPath = '/home/ags-sds/.gemini/antigravity/brain/5702991e-cca4-4f58-961d-3788910c6dad/.system_generated/logs/overview.txt';
if (fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, 'utf8');
    // We are looking for the point where the user deleted 734 lines of CSS.
    // The previous state of styles.css before the deletion.
    
    // An easy way is to read the backup we made earlier if it exists, or extract from log.
    // Let's just find the longest string starting with "@tailwind base;"
    const matches = log.match(/@tailwind base;[\s\S]*?\n}/g);
    if (matches) {
        let longestCss = "";
        for (const m of matches) {
            if (m.length > longestCss.length) {
                longestCss = m;
            }
        }
        fs.writeFileSync('/home/ags-sds/Documents/Project_Game/LikeGotchi_Modern/src/styles.css', longestCss);
        console.log("RESTORED CSS FROM LOGS. Length:", longestCss.length);
    } else {
        console.log("NOT FOUND IN LOGS");
    }
}
