import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// หัวใจสำคัญ: การตั้งค่า Header เพื่อแก้ปัญหา Iframe
app.use((req, res, next) => {
    // 1. อนุญาตให้ทุกเว็บดึงไปใช้ (หรือเฉพาะ 3 เจ้านั้นที่คุณระบุ)
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://likepoint2-0.web.app https://minipoint.likepoint.io http://localhost:8080 http://localhost:5173;");
    
    // 2. ยกเลิกการจำกัด SAMEORIGIN ของ Railway (ใช้ Header นี้แทน)
    res.setHeader("X-Frame-Options", "ALLOWALL");
    
    // 3. อนุญาตเรื่อง CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
});

// ให้บริการไฟล์ Static (HTML, JS, CSS)
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname)); // รองรับการรันแบบไม่ได้ build ด้วย

// ส่งหน้าหลักเมื่อเรียกไปที่ URL
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

app.listen(port, () => {
    console.log(`🚀 PetWorld Server is running at http://localhost:${port}`);
});
