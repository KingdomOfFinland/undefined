/* ===================================================
   PLAYER AUCTION HOUSE SYSTEM
   (Bidding, Buyout, Snipe Protection, Instant Refunds)
=================================================== */

// 1. Create a New Auction Listing
async function createAuction(inventoryKey, startBid, buyoutPrice, durationHours = 24) {
  const uid = getPlayerUid();
  const name = getPlayerName();

  const itemSnap = await rtdb.ref(`players/${uid}/limitedInventory/${inventoryKey}`).once("value");
  if (!itemSnap.exists()) {
    alert("❌ Item not found in your inventory!");
    return;
  }

  const item = itemSnap.val();

  // Delete item from inventory to hold it in escrow
  await rtdb.ref(`players/${uid}/limitedInventory/${inventoryKey}`).remove();

  const auctionRef = rtdb.ref("auctions").push();
  await auctionRef.set({
    sellerUid: uid,
    sellerName: name,
    itemName: item.name,
    serial: item.serial,
    currentBid: parseInt(startBid) || 100,
    buyoutPrice: parseInt(buyoutPrice) || 0,
    highestBidderUid: "none",
    highestBidderName: "None",
    endsAt: Date.now() + (durationHours * 3600000),
    status: "active",
    ts: Date.now()
  });

  alert("🏛️ Auction listed successfully!");
}

// 2. Place a Bid (With Automatic Refund for the Outbid Player)
async function placeAuctionBid(auctionId, bidAmount) {
  const uid = getPlayerUid();
  const name = getPlayerName();
  bidAmount = parseInt(bidAmount);

  const auctionRef = rtdb.ref("auctions/" + auctionId);
  const bidderCurRef = rtdb.ref(`players/${uid}/currency/coins`);

  // Check bidder balance
  const curSnap = await bidderCurRef.once("value");
  const myCoins = curSnap.val() || 0;
  if (myCoins < bidAmount) {
    alert("💰 You don't have enough coins for this bid!");
    return;
  }

  // Atomic Transaction for the auction
  auctionRef.transaction((auction) => {
    if (!auction) return auction;
    if (auction.status !== "active" || Date.now() > auction.endsAt) return; // Expired
    if (bidAmount <= auction.currentBid) return; // Bid too low
    if (auction.sellerUid === uid) return; // Can't bid on own auction

    // Snipe Protection: If bid in last 60 seconds, add +60 seconds
    if (auction.endsAt - Date.now() < 60000) {
      auction.endsAt += 60000;
    }

    // Record previous highest bidder for refund
    auction.prevBidder = auction.highestBidderUid;
    auction.prevBidAmount = auction.currentBid;

    auction.currentBid = bidAmount;
    auction.highestBidderUid = uid;
    auction.highestBidderName = name;

    return auction;
  }, async (error, committed, snapshot) => {
    if (error || !committed) {
      alert("❌ Bid failed! Someone might have outbid you.");
    } else {
      const data = snapshot.val();

      // Deduct coins from new bidder
      await bidderCurRef.set(myCoins - bidAmount);

      // Refund old bidder (if not initial state)
      if (data.prevBidder && data.prevBidder !== "none") {
        const oldBidderRef = rtdb.ref(`players/${data.prevBidder}/currency/coins`);
        const oldSnap = await oldBidderRef.once("value");
        await oldBidderRef.set((oldSnap.val() || 0) + data.prevBidAmount);
      }

      alert(`🔥 You are now the highest bidder at ${bidAmount.toLocaleString()} coins!`);
    }
  });
}

// 3. Instant Buyout Function
async function buyoutAuction(auctionId) {
  const uid = getPlayerUid();
  const auctionRef = rtdb.ref("auctions/" + auctionId);
  const snap = await auctionRef.once("value");
  if (!snap.exists()) return;

  const auction = snap.val();
  if (auction.status !== "active" || !auction.buyoutPrice) return;
  if (auction.sellerUid === uid) {
    alert("❌ You cannot buy out your own item!");
    return;
  }

  const curRef = rtdb.ref(`players/${uid}/currency/coins`);
  const curSnap = await curRef.once("value");
  const myCoins = curSnap.val() || 0;

  if (myCoins < auction.buyoutPrice) {
    alert("💰 Not enough coins for buyout!");
    return;
  }

  // Deduct coins & transfer item
  await curRef.set(myCoins - auction.buyoutPrice);

  // Give gold to seller
  const sellerRef = rtdb.ref(`players/${auction.sellerUid}/currency/coins`);
  const sellerSnap = await sellerRef.once("value");
  await sellerRef.set((sellerSnap.val() || 0) + auction.buyoutPrice);

  // Give item to buyer
  await rtdb.ref(`players/${uid}/limitedInventory`).push().set({
    name: auction.itemName,
    serial: auction.serial,
    origin: "auction_buyout",
    ts: Date.now()
  });

  // Close auction
  await auctionRef.update({ status: "sold", highestBidderUid: uid });
  alert("🎉 Buyout successful! Item added to your inventory.");
}

// UI Setup for Auction House
function initAuctionUI() {
  const style = document.createElement("style");
  style.innerHTML = `
    #auction-modal {
      display: none; position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%); width: 420px; max-height: 85vh;
      overflow-y: auto; background: #181824; color: #fff; border: 2px solid #38bdf8;
      border-radius: 12px; padding: 20px; z-index: 99999;
      box-shadow: 0 0 30px rgba(56, 189, 248, 0.3); font-family: monospace;
    }
    .auction-card {
      background: #232336; padding: 12px; border-radius: 8px;
      margin-bottom: 12px; border: 1px solid #3b4252;
    }
    #auction-toggle-btn {
      position: fixed; bottom: 20px; right: 180px; z-index: 99998;
      background: #38bdf8; color: #000; font-weight: bold;
      border: 2px solid #fff; border-radius: 8px; padding: 10px 14px;
      cursor: pointer; font-family: monospace;
    }
  `;
  document.head.appendChild(style);

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "auction-toggle-btn";
  toggleBtn.innerText = "🏛️ AUCTIONS";
  toggleBtn.onclick = () => {
    const modal = document.getElementById("auction-modal");
    modal.style.display = modal.style.display === "block" ? "none" : "block";
  };
  document.body.appendChild(toggleBtn);

  const modal = document.createElement("div");
  modal.id = "auction-modal";
  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; color:#38bdf8;">🏛️ PLAYER AUCTION HOUSE</h3>
      <button onclick="document.getElementById('auction-modal').style.display='none'" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">✖</button>
    </div>
    <div id="auction-listings">Loading auctions...</div>
  `;
  document.body.appendChild(modal);

  // Realtime Auction Listener
  rtdb.ref("auctions").orderByChild("status").equalTo("active").on("value", (snap) => {
    const container = document.getElementById("auction-listings");
    if (!snap.exists()) {
      container.innerHTML = "<p style='color:#888;'>No active auctions right now.</p>";
      return;
    }
    container.innerHTML = "";
    const list = snap.val();

    Object.keys(list).forEach((key) => {
      const auc = list[key];
      const timeLeft = Math.max(0, auc.endsAt - Date.now());
      const mins = Math.floor(timeLeft / 60000);

      const card = document.createElement("div");
      card.className = "auction-card";
      card.innerHTML = `
        <div style="font-weight:bold; color:#38bdf8; font-size:16px;">${auc.itemName} (${auc.serial})</div>
        <div style="font-size:12px; color:#aaa; margin: 4px 0;">Seller: <b>${auc.sellerName}</b> | Ends in: <b>${mins}m</b></div>
        <div style="font-size:14px; color:#ffd700;">Highest Bid: ${auc.currentBid.toLocaleString()} coins (${auc.highestBidderName})</div>
        ${auc.buyoutPrice ? `<div style="font-size:13px; color:#4ade80;">Buyout: ${auc.buyoutPrice.toLocaleString()} coins</div>` : ""}
        
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input type="number" id="bid-input-${key}" placeholder="${auc.currentBid + 100}" style="width:100px; padding:6px; border-radius:4px; border:1px solid #444; background:#111; color:#fff; font-family:inherit;">
          <button id="bid-btn-${key}" style="flex:1; background:#ffd700; border:none; font-weight:bold; cursor:pointer; border-radius:4px; font-family:inherit;">BID</button>
          ${auc.buyoutPrice ? `<button id="buyout-btn-${key}" style="flex:1; background:#4ade80; border:none; font-weight:bold; cursor:pointer; border-radius:4px; font-family:inherit;">BUYOUT</button>` : ""}
        </div>
      `;
      container.appendChild(card);

      card.querySelector(`#bid-btn-${key}`).onclick = () => {
        const amt = card.querySelector(`#bid-input-${key}`).value;
        placeAuctionBid(key, amt);
      };

      if (auc.buyoutPrice) {
        card.querySelector(`#buyout-btn-${key}`).onclick = () => buyoutAuction(key);
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuctionUI);
} else {
  initAuctionUI();
}
