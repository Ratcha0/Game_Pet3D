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
    // res.setHeader("X-Frame-Options", "ALLOWALL");
    res.removeHeader('X-Frame-Options');
    
    // 3. อนุญาตเรื่อง CORS
    res.setHeader("Access-Control-Allow-Origin", "OPTION", "DELETE");
    next();
});

// ให้บริการไฟล์ Static (HTML, JS, CSS)
app.use(express.static(path.join(__dirname, 'dist'))); // ต้องมีไฟล์นี้หลัง build
app.use(express.static(__dirname)); 

// ส่งหน้าหลักเมื่อเรียกไปที่ URL
app.get('/', (req, res) => {
    // ลองส่งจาก dist ก่อน ถ้าไม่มีค่อยส่งจาก root
    res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'index.html'));
        }
    });
});

app.listen(port, () => {
    console.log(`🚀 PetWorld Server is running at http://localhost:${port}`);
});
