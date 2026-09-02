/* ===================================================
   MULTI-SERVER SYSTEM & LIVE SERVER LOAD INDICATOR
   Auto-tracks active players using Firebase Presence (.info/connected)
=================================================== */

const SERVER_LIST = [
  {
    id: "server_1",
    name: "Server 1 (Helsinki)",
    databaseURL: "https://defineds1-default-rtdb.europe-west1.firebasedatabase.app",
    maxPlayers: 100
  },
  {
    id: "server_2",
    name: "Server 2 (Tampere)",
    databaseURL: "https://defineds2-default-rtdb.europe-west1.firebasedatabase.app",
    maxPlayers: 100
  },
  {
    id: "server_3",
    name: "Server 3 (Oulu)",
    databaseURL: "https://defineds3-e877b-default-rtdb.europe-west1.firebasedatabase.app",
    maxPlayers: 100
  }
];

let activeServerApp = null;
let currentServerId = localStorage.getItem("selected_server") || SERVER_LIST[0].id;
let currentPresenceRef = null;
let currentConnectedRef = null;

function getPlayerUID() {
  try {
    if (typeof firebase !== "undefined" && firebase.auth && firebase.apps.length > 0) {
      const user = firebase.auth().currentUser;
      if (user) return user.uid;
    }
  } catch (e) {}

  let guestUid = localStorage.getItem("game_guest_uid");
  if (!guestUid) {
    guestUid = "anon_" + Math.random().toString(36).substring(2, 7);
    localStorage.setItem("game_guest_uid", guestUid);
  }
  return guestUid;
}

function getPlayerName() {
  try {
    if (typeof firebase !== "undefined" && firebase.auth && firebase.apps.length > 0) {
      const user = firebase.auth().currentUser;
      if (user && user.displayName) return user.displayName;
    }
  } catch (e) {}
  return localStorage.getItem("player_callsign") || "Pilot";
}

function trackPlayerPresence(dbInstance, uid) {
  if (!dbInstance) return;

  if (currentConnectedRef) currentConnectedRef.off();
  if (currentPresenceRef) currentPresenceRef.remove();

  currentPresenceRef = dbInstance.ref("presence/" + uid);
  currentConnectedRef = dbInstance.ref(".info/connected");

  currentConnectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      currentPresenceRef.onDisconnect().remove();
      currentPresenceRef.set({
        joinedAt: Date.now(),
        name: getPlayerName()
      });
    }
  });
}

function switchServer(serverId) {
  if (typeof firebase === "undefined") return;

  const server = SERVER_LIST.find((s) => s.id === serverId) || SERVER_LIST[0];
  currentServerId = server.id;
  localStorage.setItem("selected_server", server.id);

  if (!firebase.apps.some((app) => app.name === server.id)) {
    activeServerApp = firebase.initializeApp({ databaseURL: server.databaseURL }, server.id);
  } else {
    activeServerApp = firebase.app(server.id);
  }

  window.database = activeServerApp.database();
  trackPlayerPresence(window.database, getPlayerUID());

  console.log(`🌐 Connected to ${server.name}`);
  updateServerButtonLabel(server.name);
}

function getLoadStatus(count, max) {
  const ratio = count / max;
  if (ratio >= 1.0) return { label: "FULL", color: "#ef4444", bar: 100 };
  if (ratio >= 0.75) return { label: "HIGH", color: "#f97316", bar: Math.min(100, ratio * 100) };
  if (ratio >= 0.35) return { label: "MEDIUM", color: "#eab308", bar: Math.min(100, ratio * 100) };
  return { label: "OPTIMAL", color: "#22c55e", bar: Math.max(5, ratio * 100) };
}

function initServerUI() {
  if (document.getElementById("server-btn")) return;

  const style = document.createElement("style");
  style.innerHTML = `
    #server-btn {
      position: fixed; top: 12px; right: 210px; z-index: 100000;
      background: #11111a; border: 1px solid #38bdf8; border-radius: 8px;
      padding: 6px 12px; color: #38bdf8; font-family: monospace;
      font-weight: bold; cursor: pointer; display: block !important;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    }
    #server-btn:hover { background: #1a1a2e; }
    #server-modal {
      display: none; position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%); width: 360px;
      background: #13131e; color: #fff; border: 2px solid #38bdf8;
      border-radius: 12px; padding: 20px; z-index: 100001;
      box-shadow: 0 0 30px rgba(56, 189, 248, 0.5); font-family: monospace;
    }
    .server-card {
      background: #1c1c2b; padding: 12px; border-radius: 8px;
      margin-bottom: 10px; border: 1px solid #333; cursor: pointer;
      transition: border 0.2s;
    }
    .server-card:hover { border-color: #38bdf8; }
    .server-card.active { border-color: #ffd700; background: #232338; }
    .load-bar-bg {
      width: 100%; height: 6px; background: #2b2b3d;
      border-radius: 3px; margin-top: 8px; overflow: hidden;
    }
    .load-bar-fill { height: 100%; transition: width 0.4s; }
  `;
  document.head.appendChild(style);

  // Positioned right next to the login bar in the top right
  const btn = document.createElement("button");
  btn.id = "server-btn";
  btn.innerText = "🌐 Server 1";
  btn.onclick = () => {
    const modal = document.getElementById("server-modal");
    modal.style.display = modal.style.display === "block" ? "none" : "block";
  };
  document.body.appendChild(btn);

  // Modal
  const modal = document.createElement("div");
  modal.id = "server-modal";
  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; color:#38bdf8;">🌐 SELECT SERVER</h3>
      <button id="server-modal-close" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;">✖</button>
    </div>
    <div id="server-list-container"></div>
  `;
  document.body.appendChild(modal);

  document.getElementById("server-modal-close").onclick = () => {
    modal.style.display = "none";
  };

  const container = document.getElementById("server-list-container");

  SERVER_LIST.forEach((server) => {
    let monitorApp;
    try {
      if (!firebase.apps.some((a) => a.name === "monitor_" + server.id)) {
        monitorApp = firebase.initializeApp({ databaseURL: server.databaseURL }, "monitor_" + server.id);
      } else {
        monitorApp = firebase.app("monitor_" + server.id);
      }
    } catch (e) {
      console.error("Monitor app init error:", e);
      return;
    }

    const card = document.createElement("div");
    card.id = `card-${server.id}`;
    card.className = `server-card ${server.id === currentServerId ? "active" : ""}`;
    card.onclick = () => {
      switchServer(server.id);
      document.querySelectorAll(".server-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      document.getElementById("server-modal").style.display = "none";
    };
    container.appendChild(card);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-weight:bold;">
        <span>${server.name}</span>
        <span style="color:#22c55e; font-size:12px;">● CONNECTING...</span>
      </div>
      <div class="load-bar-bg"><div class="load-bar-fill" style="width:0%; background:#22c55e;"></div></div>
    `;

    try {
      monitorApp.database().ref("presence").on("value", (snap) => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        const status = getLoadStatus(count, server.maxPlayers);

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-weight:bold;">
            <span>${server.name}</span>
            <span style="color:${status.color}; font-size:12px;">● ${status.label} (${count}/${server.maxPlayers})</span>
          </div>
          <div class="load-bar-bg">
            <div class="load-bar-fill" style="width:${status.bar}%; background:${status.color};"></div>
          </div>
        `;
      });
    } catch (e) {
      console.error("Presence listener error:", e);
    }
  });

  switchServer(currentServerId);
}

function updateServerButtonLabel(name) {
  const btn = document.getElementById("server-btn");
  if (btn) {
    const parts = name.split(" ");
    btn.innerText = `🌐 ${parts[0]} ${parts[1] || ""}`;
  }
}

window.addEventListener("playerAuthStateChanged", () => {
  if (window.database) {
    trackPlayerPresence(window.database, getPlayerUID());
  }
});

function startServerManager() {
  if (typeof firebase !== "undefined") {
    initServerUI();
  } else {
    setTimeout(startServerManager, 100);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startServerManager);
} else {
  startServerManager();
}
