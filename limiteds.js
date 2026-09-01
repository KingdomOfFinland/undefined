/* ===================================================
   LIMITED ITEMS SYSTEM (Stock & Time Limited)
=================================================== */

const rtdb = window.database || (typeof firebase !== "undefined" ? firebase.database() : null);
const rtAuth = window.auth || (typeof firebase !== "undefined" ? firebase.auth() : null);

function getPlayerUid() {
  if (rtAuth && rtAuth.currentUser) return rtAuth.currentUser.uid;
  let guest = localStorage.getItem("game_guest_uid");
  if (!guest) {
    guest = "guest_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("game_guest_uid", guest);
  }
  return guest;
}

function getPlayerName() {
  return localStorage.getItem("player_callsign") || (rtAuth && rtAuth.currentUser ? rtAuth.currentUser.displayName : null) || "Player_" + getPlayerUid().substring(0, 5);
}

// Purchase Limited Item
async function buyLimitedItem(itemId) {
  const uid = getPlayerUid();
  const itemRef = rtdb.ref("limitedItems/" + itemId);
  const playerCurRef = rtdb.ref("players/" + uid + "/currency");

  const snap = await itemRef.once("value");
  if (!snap.exists()) {
    alert("❌ Item not found!");
    return;
  }

  const item = snap.val();
  const currencyKey = item.currencyType || "coins";

  // Check Time
  if (Date.now() > item.expiresAt) {
    alert("⏳ Event ended! Item is no longer available.");
    return;
  }

  // Check Currency
  const curSnap = await playerCurRef.once("value");
  const currencyData = curSnap.val() || { coins: 0, cash: 0, nuggets: 0 };

  if ((currencyData[currencyKey] || 0) < item.price) {
    alert(`💰 Not enough ${currencyKey}! You need ${item.price.toLocaleString()}.`);
    return;
  }

  // Transaction: Decrement stock safely
  const stockRef = rtdb.ref("limitedItems/" + itemId + "/remainingStock");
  stockRef.transaction((currentStock) => {
    if (currentStock === null) return currentStock;
    if (currentStock <= 0) return; // Sold out
    return currentStock - 1;
  }, async (error, committed, snapshot) => {
    if (error) {
      alert("Purchase failed: " + error.message);
    } else if (!committed) {
      alert("❌ Sold out right before you clicked!");
    } else {
      const newStock = snapshot.val();
      const serialNum = item.totalStock - newStock;

      // Deduct currency
      const newBalance = (currencyData[currencyKey] || 0) - item.price;
      await playerCurRef.child(currencyKey).set(newBalance);

      // Save item to player limited inventory
      const newItemKey = rtdb.ref("players/" + uid + "/limitedInventory").push().key;
      const itemData = {
        name: item.name,
        serial: `#${serialNum} / ${item.totalStock}`,
        origin: "shop_buy",
        ts: Date.now()
      };

      await rtdb.ref("players/" + uid + "/limitedInventory/" + newItemKey).set(itemData);

      alert(`🎉 SUCCESS! You bought ${item.name} (${itemData.serial})!`);
    }
  });
}

// UI Setup
function initLimitedShop() {
  const style = document.createElement("style");
  style.innerHTML = `
    #limited-shop-modal {
      display: none; position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%); width: 380px; max-height: 80vh;
      overflow-y: auto; background: #14141f; color: #fff; border: 2px solid #ffd700;
      border-radius: 12px; padding: 20px; z-index: 99999;
      box-shadow: 0 0 30px rgba(255, 215, 0, 0.3); font-family: monospace;
    }
    .limited-card {
      background: #1f1f2e; padding: 14px; border-radius: 8px;
      margin-bottom: 12px; border: 1px solid #333;
    }
    .limited-btn {
      background: #ffd700; color: #000; border: none; padding: 8px 12px;
      font-weight: bold; cursor: pointer; border-radius: 6px; width: 100%;
      margin-top: 8px; font-family: inherit; font-size: 14px;
    }
    .limited-btn:disabled { background: #444; color: #777; cursor: not-allowed; }
    #limited-toggle-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 99998;
      background: #ffd700; color: #000; font-weight: bold;
      border: 2px solid #fff; border-radius: 8px; padding: 10px 14px;
      cursor: pointer; font-family: monospace;
    }
  `;
  document.head.appendChild(style);

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "limited-toggle-btn";
  toggleBtn.innerText = "⭐ LIMITED SHOP";
  toggleBtn.onclick = () => {
    const modal = document.getElementById("limited-shop-modal");
    modal.style.display = modal.style.display === "block" ? "none" : "block";
  };
  document.body.appendChild(toggleBtn);

  const modal = document.create
