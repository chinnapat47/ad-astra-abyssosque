const genshin = require('genshin-db');
const fs = require('fs');

// ฟังก์ชันคำนวณความนิยมอัตโนมัติ (เพื่อให้ตัวละคร/ไอเทมลับได้เรต <1.5% Miracle)
function calcPopularity(item, categoryType) {
  let base = 40;
  if (item.rarity === 5 || item.rarity === '5') base = 78;
  else if (item.rarity === 4 || item.rarity === '4') base = 38;
  else if (item.rarity === 3 || item.rarity === '3') base = 12;
  else if (item.rarity === 2 || item.rarity === '2') base = 5;
  else if (item.rarity === 1 || item.rarity === '1') base = 2;

  // อาวุธจากกิจกรรมจำกัดเวลา หรือของหายาก ให้ลดค่าความนิยมลงเพื่อให้ติด Miracle ง่ายขึ้น
  if (categoryType === 'weapon' && item.rarity == 4 && item.substatText === 'DEF') base = 6;
  if (categoryType === 'food' && item.specialty) base = 4; // อาหารจานพิเศษของตัวละคร

  // กระจายค่าเล็กน้อยตามความยาวชื่อไม่ให้เลขซ้ำกันเกินไป
  const variance = (item.name.length * 7) % 19 - 9;
  return Math.max(1, Math.min(99, base + variance));
}

// 1. ดึงข้อมูลตัวละครทั้งหมด
const charNames = genshin.characters('names', { matchCategories: true });
const characters = charNames.map(name => {
  const c = genshin.characters(name);
  if (!c || c.name === 'Aether' || c.name === 'Lumine') return null;
  return {
    name: c.name,
    aliases: [c.title, c.constellation].filter(Boolean).map(s => s.toLowerCase()),
    element: c.elementText || 'None',
    weapon: c.weaponText || 'Unknown',
    region: c.region || 'Unknown',
    rarity: Number(c.rarity) || 4,
    substat: c.substatText || 'None',
    affiliation: c.affiliation || 'None',
    birthMonth: c.birthdaymmdd ? c.birthdaymmdd.split('/')[0] : null,
    popularity: calcPopularity(c, 'char')
  };
}).filter(Boolean);

// 2. ดึงข้อมูลอาวุธทั้งหมด (3 ดาว - 5 ดาว)
const weaponNames = genshin.weapons('names', { matchCategories: true });
const weapons = weaponNames.map(name => {
  const w = genshin.weapons(name);
  if (!w || Number(w.rarity) < 3) return null;
  return {
    name: w.name,
    aliases: [],
    type: w.weaponText,
    rarity: Number(w.rarity),
    substat: w.substatText || 'None',
    popularity: calcPopularity(w, 'weapon')
  };
}).filter(Boolean);

// 3. ดึงข้อมูล World, Gear, Enemies, Foods, Domains, Materials
const worldAndGear = [];

// 3.1 Artifact Sets
genshin.artifacts('names', { matchCategories: true }).forEach(name => {
  const a = genshin.artifacts(name);
  if (a) {
    worldAndGear.push({
      name: a.name,
      aliases: [],
      category: 'Artifact Set',
      rarity: Math.max(...(a.rarityList || [4])),
      popularity: a.rarityList && a.rarityList.includes(5) ? 65 : 8
    });
  }
});

// 3.2 Enemies & Bosses
genshin.enemies('names', { matchCategories: true }).forEach(name => {
  const e = genshin.enemies(name);
  if (e) {
    const isBoss = e.enemyType === 'BOSS' || e.categoryText === 'Mystical Beasts' || e.categoryText === 'Abyss';
    worldAndGear.push({
      name: e.name,
      aliases: e.specialNames ? e.specialNames.slice(0, 2).map(s => s.toLowerCase()) : [],
      category: e.enemyType === 'BOSS' ? 'World Boss' : 'Enemy',
      enemyGroup: e.categoryText || 'Other',
      popularity: isBoss ? 55 : 18
    });
  }
});

// 3.3 Foods & Specialty Dishes
genshin.foods('names', { matchCategories: true }).forEach(name => {
  const f = genshin.foods(name);
  if (f) {
    worldAndGear.push({
      name: f.name,
      aliases: [],
      category: f.characterName ? 'Character Specialty Dish' : 'Teyvat Food',
      foodType: f.filterText || 'Dish',
      rarity: Number(f.rarity) || 3,
      popularity: calcPopularity(f, 'food')
    });
  }
});

// 3.4 Domains
genshin.domains('names', { matchCategories: true }).forEach(name => {
  const d = genshin.domains(name);
  if (d) {
    // ตัดเลขโรมัน I, II, III, IV ท้ายชื่อดันเจี้ยนออกเพื่อไม่ให้ซ้ำ
    const cleanName = d.name.replace(/\s+(I|II|III|IV)$/i, '').trim();
    if (!worldAndGear.some(item => item.name === cleanName && item.category === 'Domain')) {
      worldAndGear.push({
        name: cleanName,
        aliases: [],
        category: 'Domain',
        region: d.regionName || 'Unknown',
        popularity: 35
      });
    }
  }
});

// 3.5 Local Specialties (ของประจำภูมิภาค)
genshin.materials('names', { matchCategories: true }).forEach(name => {
  const m = genshin.materials(name);
  if (m && m.typeText && m.typeText.includes('Local Specialty')) {
    const regMatch = m.typeText.match(/\((.+)\)/);
    worldAndGear.push({
      name: m.name,
      aliases: [],
      category: 'Local Specialty',
      region: regMatch ? regMatch[1] : 'Teyvat',
      popularity: 30
    });
  }
});

const fullDB = { characters, weapons, worldAndGear };
const jsContent = `// ไฟล์นี้สร้างอัตโนมัติจาก GitHub Actions\nwindow.GENSHIN_WIKI_DB = ${JSON.stringify(fullDB, null, 2)};\n`;

fs.writeFileSync('genshin_data.js', jsContent, 'utf8');
console.log('Successfully generated genshin_data.js!');
