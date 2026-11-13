const genshin = require('genshin-db');
const fs = require('fs');

function safeGetNames(fnName) {
  try {
    if (typeof genshin[fnName] !== 'function') return [];
    return genshin[fnName]('names', { matchCategories: true }) || [];
  } catch (e) {
    return [];
  }
}

function calcPopularity(item, categoryType) {
  let base = 40;
  const r = Number(item.rarity);
  if (r === 5) base = 78;
  else if (r === 4) base = 38;
  else if (r === 3) base = 12;
  else if (r === 2) base = 5;
  else if (r === 1) base = 2;

  if (categoryType === 'weapon' && r === 4 && item.substatText === 'DEF') base = 6;
  if (categoryType === 'food' && (item.characterName || item.specialty)) base = 4;

  const nameStr = item.name || '';
  const variance = (nameStr.length * 7) % 19 - 9;
  return Math.max(1, Math.min(99, base + variance));
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function birthMonthOf(c) {
  if (c.birthdaymmdd) {
    const m = parseInt(String(c.birthdaymmdd).padStart(4, '0').slice(0, 2), 10);
    if (m >= 1 && m <= 12) return m;
  }
  if (typeof c.birthday === 'string') {
    const i = MONTHS.findIndex(n => c.birthday.includes(n));
    if (i >= 0) return i + 1;
  }
  return null;
}

// 1. Characters
const characters = safeGetNames('characters').map(name => {
  try {
    const c = genshin.characters(name);
    if (!c || !c.name || c.name === 'Aether' || c.name === 'Lumine') return null;
    return {
      name: c.name,
      aliases: [c.title, c.constellation].filter(Boolean).map(s => String(s).toLowerCase()),
      element: c.elementText || 'None',
      weapon: c.weaponText || 'Unknown',
      region: c.region || 'Unknown',
      rarity: Number(c.rarity) || 4,
      substat: c.substatText || 'None',
      affiliation: c.affiliation || 'None',
      birthMonth: birthMonthOf(c),
      popularity: calcPopularity(c, 'char')
    };
  } catch (e) { return null; }
}).filter(Boolean);

// 2. Weapons
const weapons = safeGetNames('weapons').map(name => {
  try {
    const w = genshin.weapons(name);
    if (!w || !w.name || Number(w.rarity) < 3) return null;
    return {
      name: w.name,
      aliases: [],
      type: w.weaponText || 'Sword',
      rarity: Number(w.rarity) || 4,
      substat: w.substatText || 'None',
      popularity: calcPopularity(w, 'weapon')
    };
  } catch (e) { return null; }
}).filter(Boolean);

// 3. World & Gear
const worldAndGear = [];

safeGetNames('artifacts').forEach(name => {
  try {
    const a = genshin.artifacts(name);
    if (a && a.name) {
      const rList = a.rarityList || a.rarity || [4];
      const maxR = Array.isArray(rList) ? Math.max(...rList.map(Number)) : Number(rList);
      worldAndGear.push({
        name: a.name,
        aliases: [],
        category: 'Artifact Set',
        rarity: maxR || 4,
        popularity: maxR === 5 ? 65 : 8
      });
    }
  } catch (e) {}
});

safeGetNames('enemies').forEach(name => {
  try {
    const e = genshin.enemies(name);
    if (e && e.name) {
      const isBoss = e.enemyType === 'BOSS' || e.categoryText === 'Mystical Beasts' || e.categoryText === 'Abyss';
      const validAliases = Array.isArray(e.specialNames)
        ? e.specialNames.filter(Boolean).slice(0, 2).map(s => String(s).toLowerCase())
        : [];
      worldAndGear.push({
        name: e.name,
        aliases: validAliases,
        category: e.enemyType === 'BOSS' ? 'World Boss' : 'Enemy',
        enemyGroup: e.categoryText || 'Other',
        popularity: isBoss ? 55 : 18
      });
    }
  } catch (e) {}
});

safeGetNames('foods').forEach(name => {
  try {
    const f = genshin.foods(name);
    if (f && f.name) {
      worldAndGear.push({
        name: f.name,
        aliases: [],
        category: f.characterName ? 'Character Specialty Dish' : 'Teyvat Food',
        foodType: f.filterText || 'Dish',
        rarity: Number(f.rarity) || 3,
        popularity: calcPopularity(f, 'food')
      });
    }
  } catch (e) {}
});

safeGetNames('domains').forEach(name => {
  try {
    const d = genshin.domains(name);
    if (d && d.name) {
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
  } catch (e) {}
});

safeGetNames('materials').forEach(name => {
  try {
    const m = genshin.materials(name);
    if (m && m.name && m.typeText && m.typeText.includes('Local Specialty')) {
      const regMatch = m.typeText.match(/\((.+)\)/);
      worldAndGear.push({
        name: m.name,
        aliases: [],
        category: 'Local Specialty',
        region: regMatch ? regMatch[1] : 'Teyvat',
        popularity: 30
      });
    }
  } catch (e) {}
});

// Clean-up: skip non-playable dummies and drop aliases that are really another item's name
const nameSet = new Set(worldAndGear.map(i => i.name.toLowerCase()));
worldAndGear.forEach(i => {
  i.aliases = (i.aliases || []).filter(a => !nameSet.has(a) || a === i.name.toLowerCase());
});
const playable = characters.filter(c => !/^manekin/i.test(c.name));

const fullDB = { characters: playable, weapons, worldAndGear };
const jsContent = `window.GENSHIN_WIKI_DB = ${JSON.stringify(fullDB, null, 2)};\n`;

fs.writeFileSync('genshin_data.js', jsContent, 'utf8');
console.log(`Generated: ${playable.length} chars, ${weapons.length} weapons, ${worldAndGear.length} world items.`);
