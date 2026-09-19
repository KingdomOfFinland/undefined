// Rotates Undefined Fighter's Daily Shop stock in Firebase.
//
// Run on a schedule (see .github/workflows/rotate-daily-shop.yml — every day at midnight)
// via the Firebase Admin SDK, which authenticates as a service account and bypasses
// the "auth.uid === '<your admin uid>'" rule entirely — no need to sign in as you.
//
// 25 slots per day:
//   10 Silver   — common skins (coins)
//    7 Gold     — upgrades + abilities
//    4 Diamond  — cash skins + perks
//    2 Obsidian — nuggets skins
//    1 Emerald  — anything from any pool
//    1 Lottery  — 49% straight retired limited / 51% random roll (Finnish lottery odds jackpot inside)
//
// Retired limiteds (exclusive skins not in the normal shop) are the only items
// that can appear in the Lottery slot.
//
// KEEP THESE POOLS IN SYNC with index.html's SHIP_SKINS, BULLET_SKINS,
// MISSILE_SKINS, FLARE_SKINS, UPGRADE_DEFS, ABILITY_DEFS, and the exclusive
// skin list. If you add a new skin or ability, add it here too.

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase }          from 'firebase-admin/database';

// ---------- Config ----------
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;

// ---------- Item pools (keep in sync with index.html) ----------

const SILVER_POOL = [
  // Ship skins (coins)
  { id:'ship_neon',          name:'Neon Interceptor',   type:'skin', key:'ship',    price:300,  currency:'coins' },
  { id:'ship_gold',          name:'Gold Rush',           type:'skin', key:'ship',    price:400,  currency:'coins' },
  { id:'ship_stealth',       name:'Stealth Frame',       type:'skin', key:'ship',    price:350,  currency:'coins' },
  { id:'ship_arctic',        name:'Arctic Phantom',      type:'skin', key:'ship',    price:380,  currency:'coins' },
  // Bullet skins (coins)
  { id:'coin_bullet',        name:'Coin Rounds',         type:'skin', key:'bullet',  price:150,  currency:'coins' },
  { id:'neon_bullet',        name:'Neon Tracer',         type:'skin', key:'bullet',  price:180,  currency:'coins' },
  // Missile skins (coins)
  { id:'coin_missile',       name:'Coin Seeker',         type:'skin', key:'missile', price:200,  currency:'coins' },
  // Flare skins (coins)
  { id:'coin_flare',         name:'Coin Flare',          type:'skin', key:'flare',   price:100,  currency:'coins' },
];

const GOLD_POOL = [
  // Upgrades
  { id:'upg_hp',       name:'Reinforced Hull (Upgrade)',  type:'upgrade', price:300,  currency:'coins' },
  { id:'upg_speed',    name:'Afterburner (Upgrade)',      type:'upgrade', price:250,  currency:'coins' },
  { id:'upg_firerate', name:'Rapid Cycler (Upgrade)',     type:'upgrade', price:15,   currency:'cash'  },
  // Abilities
  { id:'shield_ability',         name:'Shield Burst',   type:'ability', price:340,  currency:'coins' },
  { id:'commsjam_ability',       name:'Comms Jam',      type:'ability', price:382,  currency:'coins' },
  { id:'spawnbubble_ability',    name:'Spawn Bubble',   type:'ability', price:255,  currency:'coins' },
  { id:'missilepanic_ability',   name:'Missile Panic',  type:'ability', price:10,   currency:'cash'  },
  { id:'backup_ability',         name:'Call Backup',    type:'ability', price:17,   currency:'cash'  },
  { id:'missilecult_ability',    name:'Missile Cult',   type:'ability', price:15,   currency:'cash'  },
];

const DIAMOND_POOL = [
  // Cash skins
  { id:'ship_bounty_runner',   name:'Bounty Runner',      type:'skin', key:'ship',    price:8,   currency:'cash' },
  { id:'ship_cash_reaper',     name:'Cash Reaper',        type:'skin', key:'ship',    price:10,  currency:'cash' },
  { id:'cash_bullet',          name:'Cash Rounds',        type:'skin', key:'bullet',  price:5,   currency:'cash' },
  { id:'cash_missile',         name:'Cash Seeker',        type:'skin', key:'missile', price:6,   currency:'cash' },
  { id:'cash_flare',           name:'Cash Flare',         type:'skin', key:'flare',   price:4,   currency:'cash' },
  // Perks
  { id:'perk_firerate_boost',  name:'Overclock Chip',     type:'perk', price:6,   currency:'cash' },
  { id:'perk_hp_boost',        name:'Reinforced Hull',    type:'perk', price:5,   currency:'cash' },
  { id:'perk_speed_boost',     name:'Turbo Thrusters',    type:'perk', price:5,   currency:'cash' },
];

const OBSIDIAN_POOL = [
  // Nugget skins
  { id:'ship_nugget_wing',     name:'Nugget Wing',        type:'skin', key:'ship',    price:40,  currency:'nuggets' },
  { id:'nugget_bullet',        name:'Nugget Rounds',      type:'skin', key:'bullet',  price:25,  currency:'nuggets' },
  { id:'nugget_missile',       name:'Nugget Seeker',      type:'skin', key:'missile', price:30,  currency:'nuggets' },
  { id:'nugget_flare',         name:'Nugget Flare',       type:'skin', key:'flare',   price:20,  currency:'nuggets' },
];

const EMERALD_POOL = [
  // Mix of everything at a good discount — anything from the other pools
  ...SILVER_POOL,
  ...GOLD_POOL,
  ...DIAMOND_POOL,
  ...OBSIDIAN_POOL,
];

// Retired limiteds — exclusive skins no longer available in normal limited drops
const RETIRED_LIMITEDS = [
  { id:'solarvanguard',        name:'Solar Vanguard',     type:'skin', key:'ship' },
  { id:'terraguardian',        name:'Terra Guardian',     type:'skin', key:'ship' },
  { id:'thehawk',              name:'The Hawk',           type:'skin', key:'ship' },
  { id:'golden_pin_bullet',    name:'Golden Pin',         type:'skin', key:'bullet' },
  { id:'golden_pin_missile',   name:'Golden Pin Seeker',  type:'skin', key:'missile' },
];

// Slot counts per rarity
const COUNTS = {
  silver:  10,
  gold:     7,
  diamond:  4,
  obsidian: 2,
  emerald:  1,
  lottery:  1
};

// Discount per rarity (applied to price)
const DISCOUNTS = {
  silver:  0.85,
  gold:    0.80,
  diamond: 0.75,
  obsidian:0.70,
  emerald: 0.65,
  lottery: 1.00  // lottery slot is always 1 coin
};

// ---------- Helpers ----------
function pickRandom(arr, n){
  const pool = [...arr];
  const picked = [];
  while(picked.length < n && pool.length){
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function applyDiscount(item, rarityId){
  const d = DISCOUNTS[rarityId] || 1;
  return { ...item, price: Math.max(1, Math.round(item.price * d)), rarity: rarityId };
}

function buildLotterySlot(){
  // 49% — straight retired limited (1 coin)
  if(Math.random() < 0.49 && RETIRED_LIMITEDS.length > 0){
    const item = RETIRED_LIMITEDS[Math.floor(Math.random() * RETIRED_LIMITEDS.length)];
    return { ...item, price:1, currency:'coins', rarity:'lottery', lotteryType:'direct_limited' };
  }
  // 51% — random roll across all rarities
  // Inside that roll: Finnish lottery jackpot odds (0.0000054%) = retired limited
  if(Math.random() < 0.0000000054 && RETIRED_LIMITEDS.length > 0){
    const item = RETIRED_LIMITEDS[Math.floor(Math.random() * RETIRED_LIMITEDS.length)];
    return { ...item, price:1, currency:'coins', rarity:'lottery', lotteryType:'jackpot' };
  }
  const pools = { silver:SILVER_POOL, gold:GOLD_POOL, diamond:DIAMOND_POOL, obsidian:OBSIDIAN_POOL, emerald:EMERALD_POOL };
  const rarityIds = Object.keys(pools);
  const rolledRarity = rarityIds[Math.floor(Math.random() * rarityIds.length)];
  const pool = pools[rolledRarity];
  const item = pool[Math.floor(Math.random() * pool.length)];
  return { ...item, price:1, currency:'coins', rarity:'lottery', lotteryType:'roll', rolledRarity };
}

// ---------- Main ----------
async function main(){
  if(!DATABASE_URL) throw new Error('FIREBASE_DATABASE_URL env var is required');

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({ credential: cert(serviceAccount), databaseURL: DATABASE_URL });
  const db = getDatabase();

  const slots = [
    ...pickRandom(SILVER_POOL,   COUNTS.silver  ).map(i => applyDiscount(i, 'silver')),
    ...pickRandom(GOLD_POOL,     COUNTS.gold    ).map(i => applyDiscount(i, 'gold')),
    ...pickRandom(DIAMOND_POOL,  COUNTS.diamond ).map(i => applyDiscount(i, 'diamond')),
    ...pickRandom(OBSIDIAN_POOL, COUNTS.obsidian).map(i => applyDiscount(i, 'obsidian')),
    ...pickRandom(EMERALD_POOL,  COUNTS.emerald ).map(i => applyDiscount(i, 'emerald')),
    buildLotterySlot()
  ];

  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);

  await db.ref('dailyShop').set({
    date: Date.now(),
    expiresAt: midnight.getTime(),
    slots
  });

  console.log(`Daily shop rotated — ${slots.length} slots:`);
  slots.forEach((s, i) => console.log(`  [${i+1}] [${s.rarity.toUpperCase()}] ${s.name} — ${s.price} ${s.currency}${s.lotteryType ? ` (${s.lotteryType})` : ''}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
