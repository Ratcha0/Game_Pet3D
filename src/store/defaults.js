/**
 * ⚙️ Hyper-Granular Settings Factory (Decoupled)
 * [RESTORED] คืนค่า Balance ตาม Backup (6_5_65) 100% 
 * แต่ยังคงรักษาโครงสร้างสำหรับระบบใหม่ (Fever, Diamonds) ไว้
 */
export const createDefaultSettings = (template, diff) => {
    const isHard = diff === 'hard';
    const isEasy = diff === 'easy';
    const modeMult = isEasy ? 0.7 : (isHard ? 1.5 : 1.0);

    // 📊 [BACKUP DATA] ค่าพื้นฐานแยกตามชนิดตัวละคร
    const base = {
        pet: {
            activities: {
                feed:   { r: 12, s: 6, xp: 100 },
                clean:  { r: 14, s: 5, xp: 80 },
                play:   { r: 18, s: 15, xp: 150 },
                repair: { r: 10, s: 4, xp: 70 }
            },
            mechanics: {
                dec_hunger: 0.08, dec_clean: 0.05, dec_happy: 0.06,
                reg_stamina: 0.75, max_stamina: 100, rare_rate: 8
            },
            rewards: { silver_min: 20, silver_max: 100, gold_min: 200, gold_max: 500 }
        },
        car: {
            activities: {
                feed:   { r: 30, s: 15, xp: 12 },
                clean:  { r: 15, s: 10, xp: 8 },
                play:   { r: 20, s: 20, xp: 15 },
                repair: { r: 30, s: 12, xp: 20 }
            },
            mechanics: {
                dec_hunger: 0.12, dec_clean: 0.03, dec_happy: 0.06,
                reg_stamina: 0.35, max_stamina: 100, rare_rate: 8
            },
            rewards: { silver_min: 20, silver_max: 45, gold_min: 150, gold_max: 400 }
        },
        plant: {
            activities: {
                feed:   { r: 20, s: 10, xp: 6 },
                clean:  { r: 25, s: 12, xp: 10 },
                play:   { r: 10, s: 8,  xp: 8 },
                repair: { r: 20, s: 15, xp: 12 }
            },
            mechanics: {
                dec_hunger: 0.05, dec_clean: 0.06, dec_happy: 0.03,
                reg_stamina: 0.55, max_stamina: 100, rare_rate: 12
            },
            rewards: { silver_min: 10, silver_max: 25, gold_min: 80, gold_max: 200 }
        }
    };

    const config = JSON.parse(JSON.stringify(base[template] || base.pet));

    // 🛠️ [ADAPTATION] คำนวณความยากตามโหมด
    config.mechanics.dec_hunger *= modeMult;
    config.mechanics.dec_clean *= modeMult;
    config.mechanics.dec_happy *= modeMult;
    config.mechanics.reg_stamina = isEasy ? (config.mechanics.reg_stamina * 1.5) : (isHard ? config.mechanics.reg_stamina * 0.6 : config.mechanics.reg_stamina);

    return {
        activities: config.activities,
        // 2. รางวัลไอเทมบนแมพ (Economy RESTORED)
        rewards: {
            silver_min: isEasy ? config.rewards.silver_min * 2 : (isHard ? config.rewards.silver_min * 0.5 : config.rewards.silver_min),
            silver_max: isEasy ? config.rewards.silver_max * 1.5 : (isHard ? config.rewards.silver_max * 0.5 : config.rewards.silver_max),
            silver_xp: 40,
            gold_min: config.rewards.gold_min,
            gold_max: config.rewards.gold_max,
            gold_rate: isEasy ? 25 : (isHard ? 8 : 15),
            gold_xp: 200,
            diamond_min: 800,
            diamond_max: 1500,
            diamond_rate: isEasy ? 5 : (isHard ? 1 : 2),
            diamond_xp: 1000
        },
        // 3. ภารกิจรายวัน (Quests RESTORED)
        quests: {
            target_feed: isEasy ? 2 : (isHard ? 8 : 5),
            target_clean: isEasy ? 1 : (isHard ? 6 : 3),
            target_play: isEasy ? 1 : (isHard ? 3 : 3),
            reward_mult: isEasy ? 1.0 : (isHard ? 2.5 : 1.4),
            base_tokens: 400,
            base_score: 5000,
            base_xp: 2000,
            reward_duration: 15,
            target_scoop: isEasy ? 3 : (isHard ? 15 : 8),
            target_fever: isEasy ? 1 : (isHard ? 4 : 2),
            target_spend: 1000
        },
        // 4. ร้านค้า (Shop Economy RESTORED)
        shop: {
            small_tokens: isHard ? 600 : 450, small_amount: 50,
            medium_tokens: isHard ? 1400 : 1000, medium_amount: 120,
            large_tokens: isHard ? 3200 : 2500, large_amount: 300
        },
        // 5. กลไกหลัก (Mechanics RESTORED)
        mechanics: {
            ...config.mechanics,
            sp_min: 20, sp_max: 60,
            poop_lifetime: isEasy ? 300 : (isHard ? 90 : 180),
            reward_lifetime: isEasy ? 240 : (isHard ? 80 : 150),
            max_poops: 3,
            max_rewards: 3,
            dec_happy_poop: isHard ? 30 : (isEasy ? 5 : 15),
            fever_threshold: 80,
            fever_mult: 1.8
        },
        // 6. บัฟและไอเทมเสริม (Boosters RESTORED)
        boosters: {
            score: { cost: 300, mult: 1.10, duration: 15 },
            decay: { cost: 450, mult: 0.80, duration: 20 },
            luck:  { cost: 500, mult: 1.50, duration: 10 }
        }
    };
};
