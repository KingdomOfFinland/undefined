// Rotates Undefined Fighter's Black Market stock in Firebase.
//
// Run on a schedule (see .github/workflows/rotate-blackmarket.yml — every 12h)
// via the Firebase Admin SDK, which authenticates as a service account and so
// bypasses the "auth.uid === '<your admin uid>'" rule entirely — no need to
// sign in as you every run.
//
// This list of possible ids MUST be kept in sync with blackMarketAllPossibleIds()
// in index.html. If you add a new crate, ability, consumable, exchange deal,
// or buyable/exclusive skin to the game, add its id here too, or it'll never
// appear in the market.

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// ---------- Config ----------
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL; // e.g. https://your-project-default-rtdb.firebaseio.com

// How many of each kind of item to put in stock this rotation.
const COUNTS = {
  crates: 3,       // out of 7 total
  abilities: 2,    // out of 4 total
  consumables: 2,  // out of 4 total
  exchanges: 2,    // out of 3 total
  exclusives: 1,   // out of 4 total — kept rare on purpose
  skins: 6         // out of ~24 total
};

// ---------- Item pool ----------
// Keep this in sync with the client — see comment above.
const CRATE_IDS = [
  'crate_scrap', 'crate_contraband', 'crate_nuggets', 'crate_rusty', 'crate_jackpot',
  'crate_convoy', 'crate_vault'
];
const ABILITY_IDS = [
  'ability_shield_ability', 'ability_missilepanic_ability', 'ability_commsjam_ability', 'ability_backup_ability'
];
const CONSUMABLE_IDS = [
  'consumable_extra_flare', 'consumable_instant_shield', 'consumable_head_start', 'consumable_second_chance'
];
const EXCHANGE_IDS = [
  'exchange_bulk_coins_to_cash', 'exchange_bulk_cash_to_coins', 'exchange_bulk_nuggets_to_cash'
];
// exclusive_<categoryKey>_<skinId> — these skins ONLY exist in the black market,
// they're not in the normal Hangar tabs at all.
const EXCLUSIVE_SKIN_IDS = [
  'exclusive_ship_blackout', 'exclusive_bullet_contraband_bullet',
  'exclusive_missile_contraband_missile', 'exclusive_flare_contraband_flare'
];
// skin_<categoryKey>_<skinId> — regular currency-buyable skins that are also
// featured in the black market (categoryKey matches the Hangar tab keys).
const SKIN_IDS = [
  'skin_ship_bounty_runner', 'skin_ship_cash_reaper', 'skin_ship_nugget_wing',
  'skin_bullet_coin_bullet', 'skin_bullet_cash_bullet', 'skin_bullet_nugget_bullet',
  'skin_missile_coin_missile', 'skin_missile_cash_missile', 'skin_missile_nugget_missile',
  'skin_flare_coin_flare', 'skin_flare_cash_flare', 'skin_flare_nugget_flare',
  'skin_enemy_ufo_coin_ufo', 'skin_enemy_ufo_cash_ufo',
  'skin_enemy_fighter_coin_fighter',
  'skin_enemy_bomber_cash_bomber',
  'skin_enemy_spaceship_coin_cruiser', 'skin_enemy_spaceship_nugget_cruiser',
  'skin_enemy_carrier_coin_carrier', 'skin_enemy_carrier_cash_carrier', 'skin_enemy_carrier_nugget_carrier',
  'skin_enemy_drone_coin_drone'
];

// Display metadata written alongside each id — purely informational (the game
// only checks whether the key is present), but handy if you ever build an
// admin UI or just want to eyeball the db and know what's in stock.
const DISPLAY = {
  crate_scrap:      { name: 'Scrap Crate',        price: 150, type: 'crate' },
  crate_contraband: { name: 'Contraband Crate',   price: 15,  type: 'crate' },
  crate_nuggets:    { name: "Smuggler's Crate",   price: 8,   type: 'crate' },
  crate_rusty:      { name: 'Rusty Crate',        price: 50,  type: 'crate' },
  crate_jackpot:    { name: 'Jackpot Crate',      price: 20,  type: 'crate' },
  crate_convoy:     { name: 'Convoy Crate',       price: 25,  type: 'crate' },
  crate_vault:      { name: 'Vault Crate',        price: 35,  type: 'crate' },
  ability_shield_ability:       { name: 'Shield Burst',   price: 400, type: 'ability' },
  ability_missilepanic_ability: { name: 'Missile Panic',  price: 12,  type: 'ability' },
  ability_commsjam_ability:     { name: 'Comms Jam',      price: 450, type: 'ability' },
  ability_backup_ability:       { name: 'Call Backup',    price: 20,  type: 'ability' },
  consumable_extra_flare:    { name: 'Flare Pack',      price: 100, type: 'consumable' },
  consumable_instant_shield: { name: 'Instant Shield',  price: 6,   type: 'consumable' },
  consumable_head_start:     { name: 'Head Start',      price: 250, type: 'consumable' },
  consumable_second_chance: { name: 'Second Chance',    price: 15,  type: 'consumable' },
  exchange_bulk_coins_to_cash:   { name: 'Bulk Coin Exchange',   price: 500,  type: 'exchange' },
  exchange_bulk_cash_to_coins:   { name: 'Bulk Cash Exchange',   price: 10,   type: 'exchange' },
  exchange_bulk_nuggets_to_cash: { name: 'Bulk Nugget Deal',     price: 1000, type: 'exchange' },
  exclusive_ship_blackout:               { name: 'Blackout Interceptor', price: 150, type: 'exclusive' },
  exclusive_bullet_contraband_bullet:    { name: 'Contraband Rounds',    price: 80,  type: 'exclusive' },
  exclusive_missile_contraband_missile:  { name: 'Contraband Seeker',    price: 100, type: 'exclusive' },
  exclusive_flare_contraband_flare:      { name: 'Contraband Flare',     price: 60,  type: 'exclusive' }
};
function displayFor(id){
  return DISPLAY[id] || { name: id, price: 0, type: id.startsWith('skin_') ? 'skin' : 'item' };
}

function pickRandom(arr, n){
  const pool = [...arr];
  const picked = [];
  while(picked.length < n && pool.length){
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

async function main(){
  if(!DATABASE_URL) throw new Error('FIREBASE_DATABASE_URL env var is required');

  // FIREBASE_SERVICE_ACCOUNT_JSON should contain the full contents of a
  // service account key file, as a single-line JSON string (GitHub secret).
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL
  });

  const chosen = [
    ...pickRandom(CRATE_IDS, COUNTS.crates),
    ...pickRandom(ABILITY_IDS, COUNTS.abilities),
    ...pickRandom(CONSUMABLE_IDS, COUNTS.consumables),
    ...pickRandom(EXCHANGE_IDS, COUNTS.exchanges),
    ...pickRandom(EXCLUSIVE_SKIN_IDS, COUNTS.exclusives),
    ...pickRandom(SKIN_IDS, COUNTS.skins)
  ];

  const items = {};
  for(const id of chosen) items[id] = displayFor(id);

  const db = getDatabase();
  await db.ref('blackMarket').set({
    date: Date.now(),
    items
  });

  console.log(`Black market rotated — ${chosen.length} items now in stock:`);
  console.log(chosen.join(', '));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

