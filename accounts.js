/* ===================================================
   STEALTH ACCOUNT SYSTEM (Callsign + Password)
   Bypasses school popups and auto-links to Firebase
=================================================== */

// Dynamic getters to always reference the active server DB & Auth instance
function getAuth() {
  try {
    if (window.auth) return window.auth;
    if (typeof firebase !== "undefined" && firebase.auth) {
      return firebase.auth();
    }
  } catch (e) {
    // Auth app might not be initialized yet
  }
  return null;
}

function getDb() {
  if (window.database) return window.database;
  try {
    if (typeof firebase !== "undefined" && firebase.database) {
      return firebase.database();
    }
  } catch (e) {}
  return null;
}

// Helper: Convert clean callsign to an internal stealth auth email safely
function formatCallsignEmail(callsign) {
  const clean = callsign.trim().toLowerCase().replace(/[^a-z0-9]/g, (c) => c.charCodeAt(0).toString(16));
  return `${clean}@undefinedgame.local`;
}

// 1. REGISTER NEW ACCOUNT
async function registerAccount(callsign, password) {
  const auth = getAuth();
  const db = getDb();

  if (!auth) {
    alert("❌ Firebase Auth not initialized yet!");
    return;
  }

  callsign = (callsign || "").trim();
  if (!callsign || callsign.length < 3 || callsign.length > 12) {
    alert("❌ Callsign must be between 3 and 12 characters!");
    return;
  }
  if (!password || password.length < 6) {
    alert("❌ Password must be at least 6 characters!");
    return;
  }

  const email = formatCallsignEmail(callsign);

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Set Display Name
    await user.updateProfile({ displayName: callsign });

    // Initialize Player Database Data if DB is available
    if (db) {
      const initialData = {
        profile: { name: callsign, createdAt: Date.now() },
        currency: { coins: 500, cash: 10, nuggets: 0 } // Starter pack!
      };
      await db.ref("players/" + user.uid).update(initialData);
    }

    localStorage.setItem("player_callsign", callsign);
    alert(`🎉 Account created! Welcome, ${callsign}!`);
    closeAuthModal();

    // Notify other scripts (like servers.js)
    window.dispatchEvent(new CustomEvent("playerAuthStateChanged", { detail: { user, callsign } }));
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      alert("❌ That callsign is already taken! Try another.");
    } else {
      alert("Registration failed: " + error.message);
    }
  }
}

// 2. LOGIN TO EXISTING ACCOUNT
async function loginAccount(callsign, password) {
  const auth = getAuth();
  if (!auth) {
    alert("❌ Firebase Auth not initialized yet!");
    return;
  }

  callsign = (callsign || "").trim();
  if (!callsign || !password) {
    alert("❌ Please enter both callsign and password!");
    return;
  }

  const email = formatCallsignEmail(callsign);

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    const name = user.displayName || callsign;

    localStorage.setItem("player_callsign", name);
    alert(`👋 Welcome back, ${name}!`);
    closeAuthModal();

    // Notify other scripts
    window.dispatchEvent(new CustomEvent("playerAuthStateChanged", { detail: { user, callsign: name } }));
  } catch (error) {
    alert("❌ Invalid Callsign or Password!");
  }
}

// 3. LOGOUT
async function logoutAccount() {
  const auth = getAuth();
  if (auth) {
    await auth.signOut();
  }
  localStorage.removeItem("player_callsign");
  window.dispatchEvent(new CustomEvent("playerAuthStateChanged", { detail: { user: null, callsign: null } }));
  alert("Logged out successfully.");
  location.reload();
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.style.display = "none";
  const pass = document.getElementById("acc-pass");
  if (pass) pass.value = "";
}

// 4. UI INJECTION (Top Bar & Modal)
function initAccountUI() {
  if (document.getElementById("user-bar")) return; // Prevent duplicate injection

  const style = document.createElement("style");
  style.innerHTML = `
    #user-bar {
      position: fixed; top: 12px; right: 12px; z-index: 99998;
      background: rgba(20, 20, 30, 0.85); backdrop-filter: blur(6px);
      border: 1px solid #ffd700; border-radius: 8px; padding: 6px 14px;
      color: #fff; font-family: monospace; display: flex; align-items: center; gap: 10px;
    }
    #auth-modal {
      display: none; position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%); width: 320px;
      background: #181824; color: #fff; border: 2px solid #ffd700;
      border-radius: 12px; padding: 22px; z-index: 99999;
      box-shadow: 0 0 30px rgba(0,0,0,0.8); font-family: monospace;
    }
    .auth-input {
      width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 10px;
      background: #101018; border: 1px solid #444; color: #fff;
      border-radius: 6px; font-family: inherit; font-size: 14px;
    }
    .auth-input:focus { outline: none; border-color: #ffd700; }
    .auth-btn {
      width: 100%; padding: 10px; font-weight: bold; border: none;
      border-radius: 6px; cursor: pointer; font-family: inherit; margin-bottom: 6px;
    }
  `;
  document.head.appendChild(style);

  // Top Bar
  const userBar = document.createElement("div");
  userBar.id = "user-bar";
  userBar.innerHTML = `<span id="user-display">👤 Guest</span> <button id="auth-main-btn" style="background:#ffd700; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer;">LOGIN</button>`;
  document.body.appendChild(userBar);

  // Modal
  const modal = document.createElement("div");
  modal.id = "auth-modal";
  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; color:#ffd700;">PILOT LOGIN</h3>
      <button id="auth-modal-close" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;">✖</button>
    </div>
    <input type="text" id="acc-callsign" class="auth-input" placeholder="Callsign (3-12 letters/numbers)" maxlength="12">
    <input type="password" id="acc-pass" class="auth-input" placeholder="Password (6+ characters)">
    <button class="auth-btn" id="btn-do-login" style="background:#ffd700; color:#000;">LOG IN</button>
    <button class="auth-btn" id="btn-do-register" style="background:#3b82f6; color:#fff;">CREATE ACCOUNT</button>
  `;
  document.body.appendChild(modal);

  // Modal Events
  document.getElementById("auth-modal-close").onclick = closeAuthModal;

  document.getElementById("auth-main-btn").onclick = () => {
    const auth = getAuth();
    if (auth && auth.currentUser && !auth.currentUser.isAnonymous) {
      logoutAccount();
    } else {
      modal.style.display = "block";
    }
  };

  document.getElementById("btn-do-login").onclick = () => {
    loginAccount(document.getElementById("acc-callsign").value, document.getElementById("acc-pass").value);
  };

  document.getElementById("btn-do-register").onclick = () => {
    registerAccount(document.getElementById("acc-callsign").value, document.getElementById("acc-pass").value);
  };

  // Allow pressing Enter to submit login
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loginAccount(document.getElementById("acc-callsign").value, document.getElementById("acc-pass").value);
    }
  });

  // Attach auth listener (with retry if Firebase is deferred/loading)
  function attachAuthListener() {
    const auth = getAuth();
    if (auth) {
      auth.onAuthStateChanged((user) => {
        const display = document.getElementById("user-display");
        const btn = document.getElementById("auth-main-btn");
        if (!display || !btn) return;

        if (user && !user.isAnonymous) {
          const name = user.displayName || localStorage.getItem("player_callsign") || "Pilot";
          display.innerText = `👤 ${name}`;
          btn.innerText = "LOGOUT";
          btn.style.background = "#ef4444";
          btn.style.color = "#fff";
        } else {
          display.innerText = "👤 Guest";
          btn.innerText = "LOGIN";
          btn.style.background = "#ffd700";
          btn.style.color = "#000";
        }
      });
      return true;
    }
    return false;
  }

  if (!attachAuthListener()) {
    const interval = setInterval(() => {
      if (attachAuthListener()) clearInterval(interval);
    }, 500);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAccountUI);
} else {
  initAccountUI();
}
