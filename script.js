// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ (สำคัญ!)
// ==========================================
// ให้นำ URL ที่ได้จากขั้นตอน Deploy as Web App ของ Google Apps Script มาใส่ในเครื่องหมายคำพูดด้านล่าง
const API_URL = "https://script.google.com/macros/s/AKfycbzsDGa-GrPvUFMFpm5THmS227GxauSU8C09x4OZqfm_PfNH92C3TN9mFU3a7jjXcTGtyw/exec";

// ==========================================
// 2. ข้อมูลระบบและ State
// ==========================================
const evaluationCriteria = [
   { id: 'q1', title: '1. Teamwork & Collaboration', desc: 'ความสามารถในการทำงานร่วมกับผู้อื่น และการช่วยเหลือสนับสนุนเพื่อนร่วมทีม' },
   { id: 'q2', title: '2. Responsibility & Reliability', desc: 'ความรับผิดชอบต่อหน้าที่ที่ได้รับมอบหมาย และความตรงต่อเวลา' },
   { id: 'q3', title: '3. Problem Solving', desc: 'ทัศนคติและการจัดการเมื่อเจออุปสรรคหรือปัญหาในงาน' },
   { id: 'q4', title: '4. Communication Skills', desc: 'การสื่อสารข้อมูลที่ชัดเจน สุภาพ และมีประสิทธิภาพ' },
   { id: 'q5', title: '5. Positive Attitude & Growth', desc: 'การเปิดรับความคิดเห็น (Feedback) และการสร้างพลังบวกในที่ทำงาน' }
];

let state = {
   roomCode: null,
   userName: null,
   usersInRoom: [],
   evaluations: [],
   targetEvaluatee: null,
   currentScores: [],
   roomCriteria: null,    // null = use default evaluationCriteria
   activityName: ''       // display name for this room's activity
};

let tempCriteria = []; // working copy inside the criteria editor

function getActiveCriteria() {
   return (state.roomCriteria && state.roomCriteria.length > 0)
      ? state.roomCriteria
      : evaluationCriteria;
}

function escapeHtml(str) {
   return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// 3. UI Navigation & Loading
// ==========================================

// Fixed back-navigation map. null = computed dynamically in getBackTarget()
const BACK_TARGETS = {
   'sec-admin-login'     : 'sec-landing',
   'sec-admin-dashboard' : 'sec-landing',
   'sec-user-join'       : 'sec-landing',
   'sec-eval-form'       : 'sec-user-lobby',
   'sec-result'          : null,   // depends on whether Admin or User
};

function getBackTarget() {
   const all = ['sec-landing','sec-admin-login','sec-admin-dashboard','sec-user-join','sec-user-lobby','sec-eval-form','sec-result'];
   const current = all.find(id => !document.getElementById(id).classList.contains('hidden-section'));
   if (!current || current === 'sec-landing') return null;
   if (current === 'sec-result') return (state.userName === 'Admin') ? 'sec-admin-dashboard' : 'sec-user-lobby';
   return BACK_TARGETS[current] ?? null;
}

function goBack() {
   const target = getBackTarget();
   if (target) showSection(target);
}

function updateHeaderButtons(sectionId) {
   const isLanding = (sectionId === 'sec-landing');
   document.getElementById('btn-home').classList.toggle('hidden', isLanding);
   // Show back button only for sections that have a defined back target
   // (evaluate after the section switch so getBackTarget reads the new DOM state)
   const hasBack = !isLanding && BACK_TARGETS.hasOwnProperty(sectionId);
   document.getElementById('btn-back').classList.toggle('hidden', !hasBack);
}

function showSection(sectionId) {
   const sections = ['sec-landing', 'sec-admin-login', 'sec-admin-dashboard', 'sec-user-join', 'sec-user-lobby', 'sec-eval-form', 'sec-result'];
   sections.forEach(id => {
      document.getElementById(id).classList.add('hidden-section');
   });
   document.getElementById(sectionId).classList.remove('hidden-section');
   updateHeaderButtons(sectionId);

   if (sectionId === 'sec-admin-dashboard') {
      renderRoomHistory();
   }
}

function goHome() {
   state.roomCode = null;
   state.userName = null;
   showSection('sec-landing');
}

function showLoader(show = true) {
   if (show) {
      document.getElementById('loader').classList.remove('hidden-section');
   } else {
      document.getElementById('loader').classList.add('hidden-section');
   }
}

// ==========================================
// 4. API Call Helper
// ==========================================
async function callAPI(action, payload) {
   if (!API_URL) {
      alert("ระบบยังไม่สามารถใช้งานได้ กรุณานำ URL ของ Google Apps Script มาใส่ในไฟล์ script.js บรรทัดที่ 6 ก่อนครับ");
      return null;
   }

   showLoader(true);
   try {
      const response = await fetch(API_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'text/plain;charset=utf-8' },
         body: JSON.stringify({ action, ...payload }),
         redirect: 'follow'
      });
      const result = await response.json();
      return result;
   } catch (err) {
      console.error("API Error:", err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย โปรดลองอีกครั้ง");
      return null;
   } finally {
      showLoader(false);
   }
}

// ==========================================
// 5. Admin Logic
// ==========================================
function handleAdminLogin(e) {
   e.preventDefault();
   const pass = document.getElementById('admin-pass').value;
   if (pass === "loading99") {
      document.getElementById('admin-error').classList.add('hidden');
      document.getElementById('admin-pass').value = '';
      showSection('sec-admin-dashboard');
   } else {
      document.getElementById('admin-error').classList.remove('hidden');
   }
}

async function createRoom() {
   const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   let randCode = '';
   for (let i = 0; i < 5; i++) randCode += chars.charAt(Math.floor(Math.random() * chars.length));

   const res = await callAPI("createRoom", { roomCode: randCode });
   if (res && res.status === "success") {
      state.roomCode = randCode;
      state.roomCriteria = null;
      state.activityName = '';
      document.getElementById('display-room-code').innerText = randCode;
      document.getElementById('admin-activity-name').value = '';
      document.getElementById('admin-room-info').classList.remove('hidden');
      document.getElementById('admin-users-panel').classList.add('hidden');
      document.getElementById('admin-eval-monitor').classList.add('hidden');
      document.getElementById('admin-criteria-panel').classList.add('hidden');
      await renderRoomHistory();
   }
}

function copyRoomCode() {
   navigator.clipboard.writeText(state.roomCode);
   alert("คัดลอกรหัสห้องแล้ว!");
}

async function saveActivityName() {
   if (!state.roomCode) return;
   const name = document.getElementById('admin-activity-name').value.trim();
   const res = await callAPI("setActivityName", { roomCode: state.roomCode, activityName: name });
   if (res && res.status === "success") {
      state.activityName = name;
      await renderRoomHistory(); // refresh history so the new name shows there too
      alert(name ? `บันทึกชื่อกิจกรรม "${name}" เรียบร้อยแล้ว` : "ล้างชื่อกิจกรรมเรียบร้อยแล้ว");
   } else {
      alert("เกิดข้อผิดพลาด: " + (res && res.message ? res.message : "ไม่สามารถบันทึกได้"));
   }
}

async function adminViewResult() {
   if (!state.roomCode) return;
   // Admin ใช้ชื่อจำลองเพื่อเข้าไปดูผล
   state.userName = "Admin";
   await fetchRoomData();
   showSection('sec-result');
   calculateResults();
}

// ==========================================
// 6. Room History (API-synced — all devices)
// ==========================================

// Fetches ALL rooms from the central Google Sheet so every device sees
// the same list regardless of which device created each room.
async function renderRoomHistory() {
   const container = document.getElementById('room-history-list');
   if (!container) return;

   container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4"><i class="fa-solid fa-rotate fa-spin mr-1"></i>กำลังโหลด...</p>';

   const res = await callAPI("getAllRooms", {});

   if (!res || res.status !== "success" || !res.rooms || res.rooms.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ยังไม่มีประวัติห้อง</p>';
      return;
   }

   container.innerHTML = res.rooms.map(r => `
      <div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-3 hover:bg-blue-50 transition">
         <div>
            <span class="font-black text-blue-900 tracking-wider text-lg">${r.code}</span>
            ${r.activityName ? `<p class="text-xs font-semibold text-amber-700 mt-0.5"><i class="fa-solid fa-star text-amber-400 mr-1 text-xs"></i>${r.activityName}</p>` : ''}
            <p class="text-xs text-gray-400 mt-0.5">${r.createdAt}</p>
         </div>
         <div class="flex items-center gap-2">
            <button onclick="revisitRoom('${r.code}')" class="text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg font-semibold transition">
               <i class="fa-solid fa-arrow-right mr-1"></i> เข้าห้องนี้
            </button>
            <button onclick="deleteRoomFromHistory('${r.code}')" class="text-sm bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg font-semibold transition" title="ลบห้องนี้">
               <i class="fa-solid fa-trash"></i>
            </button>
         </div>
      </div>
   `).join('');
}

async function revisitRoom(code) {
   state.roomCode = code;
   state.roomCriteria = null;
   document.getElementById('display-room-code').innerText = code;
   document.getElementById('admin-room-info').classList.remove('hidden');
   document.getElementById('admin-users-panel').classList.add('hidden');
   document.getElementById('admin-eval-monitor').classList.add('hidden');
   document.getElementById('admin-criteria-panel').classList.add('hidden');
   // Load room data (criteria + activityName) for the admin panel
   const res = await callAPI("getRoomData", { roomCode: code });
   if (res && res.status === "success") {
      state.roomCriteria = res.criteria || null;
      state.activityName = res.activityName || '';
      document.getElementById('admin-activity-name').value = state.activityName;
   }
   window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 7. Admin User Management
// ==========================================
function toggleAdminUsers() {
   const panel = document.getElementById('admin-users-panel');
   if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      refreshAdminUsers();
   } else {
      panel.classList.add('hidden');
   }
}

async function refreshAdminUsers() {
   if (!state.roomCode) return;
   const res = await callAPI("getRoomData", { roomCode: state.roomCode });
   if (res && res.status === "success") {
      renderAdminUserList(res.users);
   }
}

function renderAdminUserList(users) {
   const container = document.getElementById('admin-users-list');
   container.innerHTML = '';

   if (!users || users.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ยังไม่มีผู้เข้าร่วมในห้องนี้</p>';
      return;
   }

   users.forEach(userName => {
      // Build each row as a real DOM element to avoid onclick string-escaping bugs
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-white border border-gray-100 rounded-lg p-3 shadow-sm';

      // Left: avatar + name
      const left = document.createElement('div');
      left.className = 'flex items-center gap-2';
      left.innerHTML = `
         <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <i class="fa-solid fa-user text-sm"></i>
         </div>
         <span class="font-semibold text-gray-800">${userName}</span>`;

      // Right: delete button (listener attached — no inline onclick)
      const btn = document.createElement('button');
      btn.className = 'text-sm bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition';
      btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i> ลบ';
      btn.addEventListener('click', () => adminDeleteUser(userName));

      row.appendChild(left);
      row.appendChild(btn);
      container.appendChild(row);
   });
}

async function adminDeleteUser(userName) {
   if (!confirm(`ยืนยันการลบ "${userName}" ออกจากห้องนี้?`)) return;

   const res = await callAPI("deleteUser", { roomCode: state.roomCode, userName });

   if (res && res.status === "success") {
      await refreshAdminUsers();
      // Verify the user is actually gone (backend may not have deleteUser deployed yet)
      const stillExists = state.usersInRoom
         ? false  // don't use lobby state; read the fresh admin list
         : false;
      // Check the freshly-rendered list
      const allNames = Array.from(
         document.querySelectorAll('#admin-users-list .font-semibold')
      ).map(el => el.textContent.trim());
      if (allNames.includes(userName)) {
         alert(`⚠️ ไม่สามารถลบ "${userName}" ได้\nกรุณา Deploy Google Apps Script (code.gs) เวอร์ชันใหม่ก่อนใช้งานฟีเจอร์นี้`);
      }
   } else if (res && res.status === "error") {
      alert(`เกิดข้อผิดพลาด: ${res.message}`);
   }
}

// ==========================================
// 8. Evaluation Status Monitor
// ==========================================
function toggleEvalMonitor() {
   const panel = document.getElementById('admin-eval-monitor');
   if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      refreshEvalMonitor();
   } else {
      panel.classList.add('hidden');
   }
}

async function refreshEvalMonitor() {
   if (!state.roomCode) return;
   const res = await callAPI("getRoomData", { roomCode: state.roomCode });
   if (res && res.status === "success") {
      renderEvalMonitor(res.users || [], res.evaluations || []);
   }
}

function renderEvalMonitor(users, evaluations) {
   // Build lookup set: "evaluator||evaluatee" → true
   const doneSet = new Set(evaluations.map(e => `${e.evaluator}||${e.evaluatee}`));

   const n            = users.length;
   const totalPossible = n * (n - 1);
   const completed    = [...doneSet].filter(key => {
      const [ev, ee] = key.split('||');
      return users.includes(ev) && users.includes(ee);
   }).length;
   const remaining    = totalPossible - completed;
   const pct          = totalPossible > 0 ? Math.round((completed / totalPossible) * 100) : 0;

   renderEvalSummary(n, completed, remaining, totalPossible, pct);
   renderEvalMatrix(users, doneSet);
   renderPendingList(users, doneSet);
}

function renderEvalSummary(userCount, completed, remaining, total, pct) {
   const barColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400';
   document.getElementById('eval-monitor-summary').innerHTML = `
      <div class="grid grid-cols-3 gap-3 mb-4">
         <div class="bg-blue-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-black text-blue-900">${userCount}</div>
            <div class="text-xs text-blue-600 mt-1">ผู้เข้าร่วม</div>
         </div>
         <div class="bg-green-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-black text-green-700">${completed}</div>
            <div class="text-xs text-green-600 mt-1">ประเมินแล้ว</div>
         </div>
         <div class="bg-red-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-black text-red-600">${remaining}</div>
            <div class="text-xs text-red-500 mt-1">ยังไม่ได้ประเมิน</div>
         </div>
      </div>
      <div class="flex justify-between text-sm text-gray-600 mb-1">
         <span class="font-medium">ความคืบหน้าทั้งหมด</span>
         <span class="font-bold">${completed} / ${total} &nbsp;(${pct}%)</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
         <div class="h-3 rounded-full transition-all duration-700 ${barColor}"
              style="width:${pct}%"></div>
      </div>`;
}

function renderEvalMatrix(users, doneSet) {
   if (users.length === 0) {
      document.getElementById('eval-monitor-matrix').innerHTML = '';
      return;
   }

   let html = `
      <p class="text-xs text-gray-500 mt-5 mb-2">
         <i class="fa-solid fa-table-cells mr-1 text-gray-400"></i>
         <strong>แถว</strong> = ผู้ประเมิน &nbsp;|&nbsp; <strong>คอลัมน์</strong> = ผู้ถูกประเมิน
      </p>
      <div class="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table class="text-sm border-collapse min-w-max w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-400 border-r border-gray-200 sticky left-0 bg-gray-50 z-10 min-w-[100px]">
                ผู้ประเมิน ╲ ถูกประเมิน
              </th>`;

   users.forEach(u => {
      const label = u.length > 9 ? u.slice(0, 8) + '…' : u;
      html += `<th class="px-3 py-2 text-center text-xs font-semibold text-gray-600 min-w-[64px]" title="${u}">${label}</th>`;
   });

   html += `</tr></thead><tbody>`;

   users.forEach(evaluator => {
      html += `<tr class="border-b border-gray-100 hover:bg-teal-50 transition">`;
      html += `<td class="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-gray-200 sticky left-0 bg-white z-10 whitespace-nowrap">${evaluator}</td>`;

      users.forEach(evaluatee => {
         if (evaluator === evaluatee) {
            html += `<td class="px-3 py-2 text-center bg-gray-100 text-gray-300 select-none">—</td>`;
         } else {
            const done = doneSet.has(`${evaluator}||${evaluatee}`);
            html += `<td class="px-3 py-2 text-center text-base">${done ? '✅' : '❌'}</td>`;
         }
      });

      html += `</tr>`;
   });

   html += `</tbody></table></div>`;
   document.getElementById('eval-monitor-matrix').innerHTML = html;
}

function renderPendingList(users, doneSet) {
   const pending = [];
   users.forEach(evaluator => {
      users.forEach(evaluatee => {
         if (evaluator !== evaluatee && !doneSet.has(`${evaluator}||${evaluatee}`)) {
            pending.push({ evaluator, evaluatee });
         }
      });
   });

   const container = document.getElementById('eval-monitor-pending');

   if (pending.length === 0) {
      container.innerHTML = `
         <div class="mt-5 bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <i class="fa-solid fa-circle-check text-green-500 text-3xl mb-2"></i>
            <p class="text-green-700 font-bold">ทุกคนประเมินครบแล้ว! 🎉</p>
            <p class="text-green-600 text-sm mt-1">พร้อมดูผลสรุปได้เลย</p>
         </div>`;
      return;
   }

   container.innerHTML = `
      <div class="flex items-center justify-between mt-5 mb-2">
         <h5 class="text-sm font-semibold text-gray-700">
            <i class="fa-solid fa-hourglass-half text-orange-400 mr-1"></i>
            รายการที่ยังไม่ได้ประเมิน
         </h5>
         <span class="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">${pending.length} รายการ</span>
      </div>
      <div class="space-y-2 max-h-52 overflow-y-auto pr-1">
         ${pending.map(p => `
            <div class="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-sm">
               <span class="font-semibold text-gray-800 truncate">${p.evaluator}</span>
               <i class="fa-solid fa-arrow-right text-orange-400 text-xs flex-shrink-0"></i>
               <span class="font-semibold text-gray-800 truncate">${p.evaluatee}</span>
               <span class="ml-auto flex-shrink-0 text-xs text-orange-400 font-medium">ยังไม่ได้ประเมิน</span>
            </div>`).join('')}
      </div>`;
}

// ==========================================
// 9. PIN Input Helpers
// ==========================================
function setupPinBoxes() {
   document.querySelectorAll('.pin-box').forEach(input => {
      // Only accept single digit
      input.addEventListener('input', (e) => {
         const val = e.target.value;
         if (!/^\d$/.test(val)) { e.target.value = ''; return; }
         e.target.classList.add('filled');
         // Auto-advance to next box
         const group = e.target.dataset.group;
         const idx   = parseInt(e.target.dataset.index);
         const next  = document.querySelector(`.pin-box[data-group="${group}"][data-index="${idx + 1}"]`);
         if (next) next.focus();
      });

      // Backspace: clear current or move to previous
      input.addEventListener('keydown', (e) => {
         if (e.key === 'Backspace') {
            if (e.target.value) {
               e.target.value = '';
               e.target.classList.remove('filled');
            } else {
               const group = e.target.dataset.group;
               const idx   = parseInt(e.target.dataset.index);
               const prev  = document.querySelector(`.pin-box[data-group="${group}"][data-index="${idx - 1}"]`);
               if (prev) { prev.value = ''; prev.classList.remove('filled'); prev.focus(); }
            }
         }
      });

      // Prevent non-numeric keys
      input.addEventListener('keypress', (e) => {
         if (!/\d/.test(e.key)) e.preventDefault();
      });
   });
}

function getPinValue(group) {
   return Array.from(document.querySelectorAll(`.pin-box[data-group="${group}"]`))
      .map(el => el.value)
      .join('');
}

function clearPinBoxes(group) {
   document.querySelectorAll(`.pin-box[data-group="${group}"]`).forEach(el => {
      el.value = '';
      el.classList.remove('filled', 'error');
   });
}

function shakePinBoxes(group) {
   document.querySelectorAll(`.pin-box[data-group="${group}"]`).forEach(el => {
      el.classList.add('error');
      setTimeout(() => el.classList.remove('error'), 400);
   });
   setTimeout(() => clearPinBoxes(group), 400);
   const first = document.querySelector(`.pin-box[data-group="${group}"][data-index="0"]`);
   if (first) setTimeout(() => first.focus(), 420);
}

// ==========================================
// 10. User Logic (Two-Step Join, Lobby, Form)
// ==========================================
let roomUsersCache = [];

async function lookupRoomUsers() {
   const code = document.getElementById('user-room-code').value.toUpperCase().trim();
   if (code.length !== 5) { alert("กรุณากรอกรหัสห้อง 5 หลัก"); return; }

   const res = await callAPI("getRoomData", { roomCode: code });
   if (res && res.status === "error") { alert(res.message); return; }
   if (res && res.status === "success") {
      if (res.roomExists === false) { alert("ไม่พบรหัสห้องนี้ในระบบ โปรดตรวจสอบอีกครั้ง"); return; }
      roomUsersCache = res.users || [];

      // Show activity name in the subtitle below the page title
      const subtitle = document.getElementById('join-subtitle');
      const name = (res.activityName || '').trim();
      if (name) {
         subtitle.innerHTML = `<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-sm font-semibold mt-1"><i class="fa-solid fa-star text-amber-400 text-xs"></i>${escapeHtml(name)}</span>`;
      } else {
         subtitle.textContent = 'กรุณากรอกรหัสห้องเพื่อเข้าร่วม';
      }

      document.getElementById('join-room-display').innerText = code;
      document.getElementById('join-step-1').classList.add('hidden');
      document.getElementById('join-step-2').classList.remove('hidden');
      switchJoinTab('new');
      renderReturningUsers();
   }
}

function resetJoinStep() {
   document.getElementById('join-step-1').classList.remove('hidden');
   document.getElementById('join-step-2').classList.add('hidden');
   document.getElementById('user-room-code').value = '';
   document.getElementById('user-name-new').value = '';
   document.getElementById('user-name-returning').value = '';
   document.getElementById('join-subtitle').textContent = 'กรุณากรอกรหัสห้องเพื่อเข้าร่วม';
   clearPinBoxes('new');
   clearPinBoxes('returning');
   hidePinError('new');
   hidePinError('returning');
   roomUsersCache = [];
}

function switchJoinTab(tab) {
   const isNew = tab === 'new';
   document.getElementById('panel-new-user').classList.toggle('hidden', !isNew);
   document.getElementById('panel-returning-user').classList.toggle('hidden', isNew);
   document.getElementById('tab-btn-new').className      = `flex-1 py-2.5 text-sm font-semibold transition ${isNew  ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`;
   document.getElementById('tab-btn-returning').className = `flex-1 py-2.5 text-sm font-semibold transition ${!isNew ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`;
}

function renderReturningUsers() {
   const container = document.getElementById('returning-users-list');
   if (roomUsersCache.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm text-center py-3">ไม่พบรายชื่อผู้เคยเข้าร่วมในห้องนี้</p>';
      return;
   }
   container.innerHTML = roomUsersCache.map(u => `
      <button onclick="selectReturningUser('${u.replace(/'/g, "\\'")}')"
        class="w-full text-left flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:bg-blue-50 hover:border-blue-300 transition shadow-sm">
         <div class="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 flex-shrink-0">
            <i class="fa-solid fa-user text-sm"></i>
         </div>
         <span class="font-semibold text-gray-800">${u}</span>
         <i class="fa-solid fa-chevron-right ml-auto text-gray-400 text-xs"></i>
      </button>
   `).join('');
}

// Select from list → fill name, focus first PIN box (do NOT auto-submit)
function selectReturningUser(name) {
   document.getElementById('user-name-returning').value = name;
   clearPinBoxes('returning');
   hidePinError('returning');
   const first = document.querySelector('.pin-box[data-group="returning"][data-index="0"]');
   if (first) first.focus();
}

function showPinError(group, msg) {
   const el = document.getElementById(`pin-${group}-error`);
   if (!el) return;
   if (msg) el.textContent = msg;
   el.classList.remove('hidden');
}
function hidePinError(group) {
   const el = document.getElementById(`pin-${group}-error`);
   if (el) el.classList.add('hidden');
}

async function handleNewUserJoin() {
   const roomCode = document.getElementById('join-room-display').innerText.toUpperCase();
   const userName = document.getElementById('user-name-new').value.trim();
   const pin      = getPinValue('new');

   if (!userName) { alert("กรุณากรอกชื่อของคุณ"); return; }
   if (pin.length !== 4) {
      showPinError('new');
      shakePinBoxes('new');
      return;
   }
   hidePinError('new');
   await doJoinRoom(roomCode, userName, pin, 'new');
}

async function handleReturningUserJoin() {
   const roomCode = document.getElementById('join-room-display').innerText.toUpperCase();
   const userName = document.getElementById('user-name-returning').value.trim();
   const pin      = getPinValue('returning');

   if (!userName) { alert("กรุณากรอกหรือเลือกชื่อของคุณ"); return; }
   if (pin.length !== 4) {
      showPinError('returning', 'กรุณากรอก PIN ให้ครบ 4 หลัก');
      shakePinBoxes('returning');
      return;
   }
   hidePinError('returning');
   await doJoinRoom(roomCode, userName, pin, 'returning');
}

async function doJoinRoom(roomCode, userName, pin, pinGroup) {
   const res = await callAPI("joinRoom", { roomCode, userName, pin });
   if (res && res.status === "success") {
      // ── Clear all input fields ONLY after confirmed success ──
      document.getElementById('user-name-new').value = '';
      document.getElementById('user-name-returning').value = '';
      clearPinBoxes('new');
      clearPinBoxes('returning');
      hidePinError('new');
      hidePinError('returning');
      resetJoinStep(); // returns form to step-1 for next visit

      state.roomCode = roomCode;
      state.userName = userName;
      document.getElementById('lobby-room-code').innerText = roomCode;
      document.getElementById('lobby-user-name').innerText = "คุณ " + userName;
      await fetchRoomData();
      showSection('sec-user-lobby');
   } else if (res && res.status === "error") {
      // PIN-specific error: shake the correct box group
      if (res.message && res.message.includes("PIN") && pinGroup) {
         showPinError(pinGroup, res.message);
         shakePinBoxes(pinGroup);
      } else {
         alert(res.message);
      }
   }
}

async function fetchRoomData() {
   const res = await callAPI("getRoomData", { roomCode: state.roomCode });
   if (res && res.status === "success") {
      state.usersInRoom   = res.users;
      state.evaluations   = res.evaluations;
      state.roomCriteria  = res.criteria || null;
      state.activityName  = res.activityName || '';
      if (state.userName && state.userName !== "Admin") renderLobby();
   }
}

async function refreshLobby() {
   await fetchRoomData();
}

function renderLobby() {
   const container = document.getElementById('lobby-users-container');
   container.innerHTML = '';

   // ไม่รวมชื่อตัวเองในรายชื่อ
   const peers = state.usersInRoom.filter(u => u !== state.userName);
   document.getElementById('lobby-count').innerText = state.usersInRoom.length;

   const btn  = document.getElementById('btn-final-submit');
   const hint = document.getElementById('lock-hint');

   if (peers.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-center py-6">ยังไม่มีผู้เข้าร่วมคนอื่นในห้องนี้</p>`;
      btn.classList.add('hidden');
      hint.classList.add('hidden');
      return;
   }

   let pending = 0;

   peers.forEach(peer => {
      // เช็คว่าเราเคยประเมินคนนี้ใน room นี้หรือยัง
      const hasEvaluated = state.evaluations.some(e => e.evaluator === state.userName && e.evaluatee === peer);
      if (!hasEvaluated) pending++;

      const el = document.createElement('div');
      el.className = `user-card glass-card p-4 flex justify-between items-center ${hasEvaluated ? 'evaluated' : ''}`;

      el.innerHTML = `
         <div class="flex items-center gap-3">
           <div class="bg-blue-100 p-2 rounded-full user-card-icon w-10 h-10 flex items-center justify-center">
              <i class="fa-solid ${hasEvaluated ? 'fa-check text-green-500' : 'fa-user'}"></i>
           </div>
           <p class="font-semibold text-gray-800">${peer}</p>
         </div>
         <button class="${hasEvaluated ? 'bg-green-100 text-green-700' : 'btn-primary px-4 py-2 text-sm text-white'} rounded shadow"
                 ${hasEvaluated ? 'disabled' : `onclick="openEvaluationForm('${peer}')"`}>
            ${hasEvaluated ? 'ประเมินแล้ว' : 'ทำการประเมิน'}
         </button>
      `;
      container.appendChild(el);
   });

   btn.classList.remove('hidden');
   if (pending === 0) {
      btn.disabled = false;
      btn.className = 'bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition transform hover:scale-105';
      btn.innerHTML = 'ดูสรุปผลการประเมิน <i class="fa-solid fa-lock-open ml-2"></i>';
      hint.classList.add('hidden');
   } else {
      btn.disabled = true;
      btn.className = 'bg-gray-200 text-gray-400 font-bold py-3 px-8 rounded-full cursor-not-allowed transition';
      btn.innerHTML = `<i class="fa-solid fa-lock mr-2"></i> ดูสรุปผลการประเมิน`;
      hint.classList.remove('hidden');
      hint.textContent = `กรุณาประเมินให้ครบทุกคนก่อน (ยังเหลืออีก ${pending} คน)`;
   }
}

// ==========================================
// 11. Evaluation Logic
// ==========================================
function openEvaluationForm(peerName) {
   state.targetEvaluatee = peerName;
   state.currentScores = getActiveCriteria().map(() => 0);
   document.getElementById('eval-target-name').innerText = peerName;
   document.getElementById('btn-submit-eval').disabled = true;
   document.getElementById('btn-submit-eval').classList.add('opacity-50', 'cursor-not-allowed');

   renderQuestions();
   showSection('sec-eval-form');
}

function renderQuestions() {
   const container = document.getElementById('eval-questions-container');
   container.innerHTML = '';

   getActiveCriteria().forEach((crit, index) => {
      let div = document.createElement('div');
      div.className = "mb-6 pb-6 border-b border-gray-100 last:border-0";

      let html = `<h4 class="font-bold text-gray-800">${crit.title}</h4>
                  <p class="text-sm text-gray-500 mb-3">${crit.desc}</p>
                  <div class="flex justify-between max-w-sm mx-auto">`;
      // สร้างปุ่มเรตติ้ง 1-5
      for (let i = 1; i <= 5; i++) {
         const isActive = state.currentScores[index] === i ? 'active' : '';
         html += `<div class="rating-btn ${isActive}" onclick="setScore(${index}, ${i})">${i}</div>`;
      }
      html += `</div>`;
      div.innerHTML = html;
      container.appendChild(div);
   });
}

function setScore(qIndex, score) {
   state.currentScores[qIndex] = score;
   renderQuestions(); // Re-render for active classes
   checkAllScores();
}

function checkAllScores() {
   const allFilled = state.currentScores.every(s => s > 0);
   const btn = document.getElementById('btn-submit-eval');
   if (allFilled) {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
   } else {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
   }
}

async function submitEvaluation(e) {
   e.preventDefault();
   const res = await callAPI("submitEvaluation", {
      roomCode: state.roomCode,
      evaluator: state.userName,
      evaluatee: state.targetEvaluatee,
      scores: state.currentScores
   });

   if (res && res.status === "success") {
      // กลับไปล็อบบี้แล้วเรนเดอร์ใหม่
      await fetchRoomData();
      showSection('sec-user-lobby');
   }
}

// ==========================================
// 12. Criteria Editor (Admin)
// ==========================================
function toggleCriteriaEditor() {
   const panel = document.getElementById('admin-criteria-panel');
   if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      tempCriteria = JSON.parse(JSON.stringify(getActiveCriteria()));
      renderCriteriaEditor();
   } else {
      panel.classList.add('hidden');
   }
}

function renderCriteriaEditor() {
   const container = document.getElementById('criteria-items-list');
   container.innerHTML = '';
   tempCriteria.forEach((crit, index) => {
      const item = document.createElement('div');
      item.className = 'bg-gray-50 border border-gray-200 rounded-xl p-3';

      const header = document.createElement('div');
      header.className = 'flex items-center gap-2 mb-2';
      header.innerHTML = `<span class="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">หัวข้อ ${index + 1}</span>`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'ml-auto text-gray-300 hover:text-red-500 transition';
      removeBtn.innerHTML = '<i class="fa-solid fa-circle-xmark text-lg"></i>';
      removeBtn.addEventListener('click', () => {
         tempCriteria.splice(index, 1);
         renderCriteriaEditor();
      });
      header.appendChild(removeBtn);

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-purple-300';
      titleInput.placeholder = 'ชื่อหัวข้อ (เช่น Teamwork)';
      titleInput.value = crit.title;
      titleInput.addEventListener('input', e => { tempCriteria[index].title = e.target.value; });

      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.className = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300';
      descInput.placeholder = 'คำอธิบาย (ไม่บังคับ)';
      descInput.value = crit.desc || '';
      descInput.addEventListener('input', e => { tempCriteria[index].desc = e.target.value; });

      item.appendChild(header);
      item.appendChild(titleInput);
      item.appendChild(descInput);
      container.appendChild(item);
   });
}

function addCriteriaItem() {
   if (tempCriteria.length >= 10) { alert("กำหนดได้สูงสุด 10 หัวข้อ"); return; }
   tempCriteria.push({ id: `q${tempCriteria.length + 1}`, title: '', desc: '' });
   renderCriteriaEditor();
   // Focus the new title input
   const inputs = document.querySelectorAll('#criteria-items-list input[type="text"]');
   if (inputs.length) inputs[inputs.length - 2].focus(); // -2 = title of last item
}

async function saveCriteria() {
   if (tempCriteria.length === 0) { alert("ต้องมีอย่างน้อย 1 หัวข้อ"); return; }
   if (tempCriteria.some(c => !c.title.trim())) { alert("กรุณากรอกชื่อหัวข้อให้ครบทุกข้อ"); return; }

   const res = await callAPI("setCriteria", { roomCode: state.roomCode, criteria: tempCriteria });
   if (res && res.status === "success") {
      state.roomCriteria = JSON.parse(JSON.stringify(tempCriteria));
      document.getElementById('admin-criteria-panel').classList.add('hidden');
      alert("บันทึกหัวข้อเรียบร้อยแล้ว!");
   } else {
      alert("เกิดข้อผิดพลาด: " + (res && res.message ? res.message : "ไม่สามารถบันทึกได้"));
   }
}

function resetCriteriaToDefault() {
   if (!confirm("รีเซ็ตกลับเป็นหัวข้อเริ่มต้น 5 ข้อ?")) return;
   tempCriteria = JSON.parse(JSON.stringify(evaluationCriteria));
   renderCriteriaEditor();
}

// ==========================================
// 13. Delete Room
// ==========================================
async function deleteCurrentRoom() {
   if (!state.roomCode) return;
   if (!confirm(`ยืนยันการลบห้อง "${state.roomCode}"?\nข้อมูลผู้เข้าร่วมและผลการประเมินทั้งหมดจะถูกลบออกด้วย`)) return;

   const code = state.roomCode;
   const res = await callAPI("deleteRoom", { roomCode: code });
   if (res && res.status === "success") {
      state.roomCode = null;
      state.roomCriteria = null;
      ['admin-room-info','admin-users-panel','admin-eval-monitor','admin-criteria-panel'].forEach(id => {
         document.getElementById(id).classList.add('hidden');
      });
      await renderRoomHistory();
      alert(`ลบห้อง ${code} เรียบร้อยแล้ว`);
   }
}

async function deleteRoomFromHistory(code) {
   if (!confirm(`ยืนยันการลบห้อง "${code}"?\nข้อมูลทั้งหมดในห้องนี้จะถูกลบออก`)) return;

   const res = await callAPI("deleteRoom", { roomCode: code });
   if (res && res.status === "success") {
      if (state.roomCode === code) {
         state.roomCode = null;
         state.roomCriteria = null;
         ['admin-room-info','admin-users-panel','admin-eval-monitor','admin-criteria-panel'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
         });
      }
      await renderRoomHistory();
   }
}

// ==========================================
// 14. Result Summary & Ranking Logic
// ==========================================
async function showResultSummary() {
   if (state.userName && state.userName !== 'Admin') {
      const peers = state.usersInRoom.filter(u => u !== state.userName);
      const pending = peers.filter(p =>
         !state.evaluations.some(e => e.evaluator === state.userName && e.evaluatee === p)
      ).length;
      if (pending > 0) {
         alert(`กรุณาประเมินให้ครบทุกคนก่อน (ยังเหลืออีก ${pending} คน)`);
         return;
      }
   }
   showSection('sec-result');
   await fetchRoomData();
   calculateResults();
}

function calculateResults() {
   // Reset any display state left from a previous view
   document.querySelector('#result-content > div.bg-gradient-to-r').style.display = '';
   document.querySelector('#result-content > h3').style.display = '';
   const avgContainer = document.getElementById('result-avg-container');
   avgContainer.style.display = '';
   document.getElementById('admin-summary-container').classList.add('hidden');

   const myEvals = state.evaluations.filter(e => e.evaluatee === state.userName);

   document.getElementById('result-user-name').innerText =
      state.userName === "Admin" ? "Admin View" : "คุณ " + state.userName;

   document.getElementById('result-loading').classList.add('hidden');
   document.getElementById('result-content').classList.remove('hidden');

   if (state.userName === "Admin") {
      // Admin view: hide personal score panel, render member summary instead
      document.querySelector('#result-content > div.bg-gradient-to-r').style.display = 'none';
      document.querySelector('#result-content > h3').style.display = 'none';
      avgContainer.style.display = 'none';
      renderAdminSummary();
      return;
   }

   // ── User view ──────────────────────────────────────────
   if (myEvals.length === 0) {
      document.getElementById('result-total-score').innerText = "0";
      avgContainer.innerHTML = `<p class="col-span-2 text-center text-gray-500 py-6">ยังไม่มีคะแนนประเมินของคุณ</p>`;
      return;
   }

   const criteria = getActiveCriteria();
   let totalScoreAll = 0;
   avgContainer.innerHTML = '';

   for (let q = 0; q < criteria.length; q++) {
      let sum = 0;
      myEvals.forEach(ev => sum += Number(ev.scores[q] || 0));
      const avg = (sum / myEvals.length).toFixed(2);
      totalScoreAll += sum;

      const displayTitle = criteria[q].title.replace(/^\d+\.\s*/, '');
      avgContainer.innerHTML += `
         <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <h4 class="font-bold text-gray-800 text-sm truncate">${displayTitle}</h4>
            </div>
            <div class="bg-blue-50 text-blue-800 font-bold px-3 py-1 rounded-lg">
              ${avg} <span class="text-xs text-blue-400 font-normal">/ 5</span>
            </div>
         </div>
      `;
   }
   document.getElementById('result-total-score').innerText = totalScoreAll;
   document.getElementById('result-max-score').innerText = myEvals.length * criteria.length * 5;
}

// ── Admin member-summary with expandable raw-score tables ─────────────
function renderAdminSummary() {
   const container = document.getElementById('admin-summary-container');
   container.classList.remove('hidden');
   container.innerHTML = '';

   const criteria = getActiveCriteria();
   const members  = state.usersInRoom.filter(u => u !== 'Admin');

   if (members.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-center py-8">ยังไม่มีผู้เข้าร่วมในห้องนี้</p>';
      return;
   }

   // Pre-compute totals once; sorted highest-first — shared by both tabs
   const ranked = members.map(member => {
      const received = state.evaluations.filter(ev => ev.evaluatee === member);
      const total    = received.reduce(
         (sum, ev) => sum + ev.scores.reduce((s, v) => s + Number(v || 0), 0), 0
      );
      return { member, received, total };
   }).sort((a, b) => b.total - a.total);

   // ── Tab bar ──────────────────────────────────────────────────────
   const tabDefs = [
      { id: 'rank',    label: '👑 สรุป Ranking' },
      { id: 'avg',     label: '📊 สรุปคะแนนเฉลี่ย' },
      { id: 'allAvg',  label: '📋 สรุปผลเฉลี่ยทุกสมาชิก' },
      { id: 'members', label: '👥 สรุปผลทุกสมาชิก' }
   ];

   const tabBar = document.createElement('div');
   tabBar.className = 'flex flex-wrap rounded-xl overflow-hidden border border-gray-200 mb-5 shadow-sm';

   const rankPanel    = document.createElement('div');
   const avgPanel     = document.createElement('div');
   const allAvgPanel  = document.createElement('div');
   const memberPanel  = document.createElement('div');
   avgPanel.classList.add('hidden');
   allAvgPanel.classList.add('hidden');
   memberPanel.classList.add('hidden');

   const setTabStyles = (activeId) => {
      tabBtns.forEach((btn, i) => {
         const isActive = tabDefs[i].id === activeId;
         btn.className = `flex-1 py-2.5 text-sm font-semibold transition ${
            isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`;
      });
      rankPanel.classList.toggle('hidden',   activeId !== 'rank');
      avgPanel.classList.toggle('hidden',    activeId !== 'avg');
      allAvgPanel.classList.toggle('hidden', activeId !== 'allAvg');
      memberPanel.classList.toggle('hidden', activeId !== 'members');
   };

   // Build buttons first (referenced in setTabStyles)
   const tabBtns = tabDefs.map((def, i) => {
      const btn = document.createElement('button');
      btn.textContent = def.label;
      btn.addEventListener('click', () => setTabStyles(def.id));
      tabBar.appendChild(btn);
      return btn;
   });
   setTabStyles('rank'); // default: Tab 1 active

   container.appendChild(tabBar);

   // ── Tab 1: Ranking ───────────────────────────────────────────────
   const RANK_META = [
      { text: 'อันดับ 1 🏆', cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
      { text: 'อันดับ 2 🥈', cls: 'bg-gray-100  text-gray-700   border border-gray-300'   },
      { text: 'อันดับ 3 🥉', cls: 'bg-orange-100 text-orange-700 border border-orange-300' },
   ];

   const rankWrap = document.createElement('div');
   rankWrap.className = 'bg-amber-50 border border-amber-200 rounded-2xl p-6';

   const rankTitle = document.createElement('h3');
   rankTitle.className = 'font-bold text-amber-900 text-lg mb-4 text-center';
   rankTitle.textContent = '👑 Ranking ห้อง';
   rankWrap.appendChild(rankTitle);

   // Filter buttons: Top 1 / Top 3 / All  (default: Top 3)
   let activeFilter = 3;
   const filterDefs  = [{ label: 'Top 1', n: 1 }, { label: 'Top 3', n: 3 }, { label: 'All', n: 0 }];
   const rankListEl  = document.createElement('div');
   rankListEl.className = 'space-y-3';

   const renderRankItems = () => {
      rankListEl.innerHTML = '';
      const shown = activeFilter === 0 ? ranked : ranked.slice(0, Math.min(activeFilter, ranked.length));
      shown.forEach((item, i) => {
         const meta = RANK_META[i];

         const card = document.createElement('div');
         card.className = 'bg-white border border-yellow-100 rounded-xl px-4 py-3 shadow-sm flex items-center gap-4';

         // Rank badge
         const badge = document.createElement('div');
         badge.className = `font-bold text-sm px-3 py-1.5 rounded-full flex-shrink-0 text-center ${
            meta ? meta.cls : 'bg-gray-50 text-gray-500 border border-gray-200'}`;
         badge.textContent = meta ? meta.text : `อันดับ ${i + 1}`;

         // Name
         const nameEl = document.createElement('span');
         nameEl.className = 'flex-1 font-bold text-gray-800 text-base';
         nameEl.textContent = item.member;

         // Score
         const scoreEl = document.createElement('span');
         scoreEl.className = 'font-bold text-blue-700 text-base whitespace-nowrap';
         scoreEl.textContent = `${item.total} pts`;

         card.appendChild(badge);
         card.appendChild(nameEl);
         card.appendChild(scoreEl);
         rankListEl.appendChild(card);
      });
   };

   const filterRow = document.createElement('div');
   filterRow.className = 'flex gap-2 justify-center mb-4';
   const filterBtns = filterDefs.map(f => {
      const btn = document.createElement('button');
      const applyStyle = (active) => {
         btn.className = `px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
            active ? 'bg-amber-500 text-white border-amber-500'
                   : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400 hover:text-amber-700'}`;
      };
      applyStyle(f.n === activeFilter);
      btn.textContent = f.label;
      btn.addEventListener('click', () => {
         activeFilter = f.n;
         filterBtns.forEach((b, bi) => applyStyle(filterDefs[bi].n === activeFilter));
         renderRankItems();
      });
      filterRow.appendChild(btn);
      return btn;
   });

   rankWrap.appendChild(filterRow);
   rankWrap.appendChild(rankListEl);
   renderRankItems();
   rankPanel.appendChild(rankWrap);
   container.appendChild(rankPanel);

   // ── Tab 2: Average score per category (room-wide) ────────────────
   const avgTitle = document.createElement('h3');
   avgTitle.className = 'font-bold text-lg text-gray-800 mb-4 border-b pb-2';
   avgTitle.textContent = '📊 คะแนนเฉลี่ยแต่ละหัวข้อ (ภาพรวมทั้งห้อง)';
   avgPanel.appendChild(avgTitle);

   const allEvals = state.evaluations;
   const avgGrid  = document.createElement('div');
   avgGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

   if (allEvals.length === 0) {
      avgGrid.innerHTML = '<p class="col-span-2 text-gray-400 text-sm text-center py-6">ยังไม่มีข้อมูลการประเมิน</p>';
   } else {
      criteria.forEach((crit, qi) => {
         const sum = allEvals.reduce((s, ev) => s + Number(ev.scores[qi] || 0), 0);
         const avg = (sum / allEvals.length).toFixed(2);
         const displayTitle = crit.title.replace(/^\d+\.\s*/, '');

         const card = document.createElement('div');
         card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-3';
         card.innerHTML = `
            <h4 class="font-bold text-gray-800 text-sm">${escapeHtml(displayTitle)}</h4>
            <div class="bg-blue-50 text-blue-800 font-bold px-3 py-1 rounded-lg whitespace-nowrap flex-shrink-0">
               ${avg} <span class="text-xs text-blue-400 font-normal">/ 5</span>
            </div>`;
         avgGrid.appendChild(card);
      });
   }

   avgPanel.appendChild(avgGrid);
   container.appendChild(avgPanel);

   // ── Tab 3: All-member per-criteria average table ──────────────────
   (() => {
      // Pre-compute per-member, per-criterion averages
      const memberData = ranked.map(({ member, received }) => {
         if (received.length === 0) {
            return { member, avgs: criteria.map(() => null), totalAvg: null };
         }
         const avgs = criteria.map((_, qi) => {
            const sum = received.reduce((s, ev) => s + Number(ev.scores[qi] || 0), 0);
            return sum / received.length;
         });
         const totalAvg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
         return { member, avgs, totalAvg };
      });

      // Color scale per cell value
      const cellBg = v => {
         if (v === null) return '';
         if (v >= 4.5) return 'bg-green-100 text-green-800';
         if (v >= 3.0) return 'bg-yellow-50 text-yellow-800';
         return 'bg-red-100 text-red-700';
      };

      // Sort state: column index (criteria indices 0..n-1, then n = totalAvg), direction
      let sortCol = criteria.length; // default: Total Avg
      let sortAsc = false;           // default: descending

      const sortData = () => {
         return [...memberData].sort((a, b) => {
            const va = sortCol < criteria.length ? a.avgs[sortCol] : a.totalAvg;
            const vb = sortCol < criteria.length ? b.avgs[sortCol] : b.totalAvg;
            if (va === null && vb === null) return 0;
            if (va === null) return 1;
            if (vb === null) return -1;
            return sortAsc ? va - vb : vb - va;
         });
      };

      // Header labels
      const colLabels = [...criteria.map(c => c.title.replace(/^\d+\.\s*/, '')), 'TOTAL AVG'];

      // Build the panel
      const title = document.createElement('h3');
      title.className = 'font-bold text-lg text-gray-800 mb-3 border-b pb-2';
      title.textContent = '📋 สรุปผลเฉลี่ยทุกสมาชิก';
      allAvgPanel.appendChild(title);

      // Export CSV button
      const exportBtn = document.createElement('button');
      exportBtn.className = 'mb-4 text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold shadow transition flex items-center gap-2';
      exportBtn.innerHTML = '<i class="fa-solid fa-file-csv"></i> Export CSV';
      exportBtn.addEventListener('click', () => {
         const headers = ['Member', ...colLabels];
         const rows = memberData.map(m => [
            m.member,
            ...m.avgs.map(v => v === null ? '-' : v.toFixed(2)),
            m.totalAvg === null ? '-' : m.totalAvg.toFixed(2)
         ]);
         const csv = [headers, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
         const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
         const url  = URL.createObjectURL(blob);
         const a    = Object.assign(document.createElement('a'), { href: url, download: `summary_${state.roomCode || 'room'}.csv` });
         a.click();
         URL.revokeObjectURL(url);
      });
      allAvgPanel.appendChild(exportBtn);

      // Scrollable table wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'overflow-x-auto rounded-xl border border-gray-200 shadow-sm';

      const table = document.createElement('table');
      table.className = 'w-full text-sm border-collapse';

      // Build header row
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      headerRow.className = 'bg-gray-50 text-xs text-gray-500 uppercase tracking-wide';

      const thMember = document.createElement('th');
      thMember.className = 'px-4 py-3 text-left font-semibold sticky left-0 bg-gray-50 z-10 cursor-pointer select-none whitespace-nowrap';
      thMember.innerHTML = 'Member <span class="text-gray-300">⇅</span>';
      thMember.addEventListener('click', () => {
         // Sort by name (use avgs index = -1 sentinel via custom comparator)
         sortAsc = (sortCol === -1) ? !sortAsc : false;
         sortCol = -1;
         renderTable();
         updateHeaderArrows();
      });
      headerRow.appendChild(thMember);

      const colThs = colLabels.map((label, ci) => {
         const th = document.createElement('th');
         th.className = `px-4 py-3 text-center font-semibold cursor-pointer select-none ${ci === criteria.length ? 'whitespace-nowrap' : ''}`;
         th.dataset.col = ci;
         th.innerHTML = `${label} <span class="sort-arrow text-indigo-300">↓</span>`;
         th.addEventListener('click', () => {
            sortAsc = (sortCol === ci) ? !sortAsc : false;
            sortCol = ci;
            renderTable();
            updateHeaderArrows();
         });
         return th;
      });
      colThs.forEach(th => headerRow.appendChild(th));
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      wrapper.appendChild(table);
      allAvgPanel.appendChild(wrapper);

      const updateHeaderArrows = () => {
         colThs.forEach((th, ci) => {
            const arrow = th.querySelector('.sort-arrow');
            if (sortCol === ci) {
               arrow.textContent = sortAsc ? '↑' : '↓';
               arrow.className = 'sort-arrow text-indigo-600';
            } else {
               arrow.textContent = '↓';
               arrow.className = 'sort-arrow text-gray-300';
            }
         });
      };

      const renderTable = () => {
         tbody.innerHTML = '';
         const sorted = sortCol === -1
            ? [...memberData].sort((a, b) => sortAsc ? a.member.localeCompare(b.member) : b.member.localeCompare(a.member))
            : sortData();
         const topScore = sorted[0]?.totalAvg;

         sorted.forEach((m, rowIdx) => {
            const isTop = topScore !== null && m.totalAvg === topScore && topScore > 0;
            const tr = document.createElement('tr');
            tr.className = `border-t border-gray-100 transition ${isTop ? 'bg-amber-50' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:brightness-95`;

            // Member name cell
            const tdName = document.createElement('td');
            tdName.className = `px-4 py-2.5 font-semibold text-gray-800 sticky left-0 z-10 ${isTop ? 'bg-amber-50' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`;
            tdName.innerHTML = isTop
               ? `${escapeHtml(m.member)} <span class="text-amber-500 text-xs ml-1">👑</span>`
               : escapeHtml(m.member);
            tr.appendChild(tdName);

            // Criterion score cells
            m.avgs.forEach(v => {
               const td = document.createElement('td');
               const colorCls = v !== null ? cellBg(v) : '';
               td.className = `px-3 py-2 text-center`;
               td.innerHTML = v !== null
                  ? `<span class="inline-block px-2 py-0.5 rounded font-semibold text-xs ${colorCls}">${v.toFixed(2)}</span>`
                  : '<span class="text-gray-300">-</span>';
               tr.appendChild(td);
            });

            // Total avg cell
            const tdTotal = document.createElement('td');
            const totalColorCls = m.totalAvg !== null ? cellBg(m.totalAvg) : '';
            tdTotal.className = 'px-3 py-2 text-center font-bold';
            tdTotal.innerHTML = m.totalAvg !== null
               ? `<span class="inline-block px-2 py-0.5 rounded font-bold text-sm ${totalColorCls}">${m.totalAvg.toFixed(2)}</span>`
               : '<span class="text-gray-300">-</span>';
            tr.appendChild(tdTotal);

            tbody.appendChild(tr);
         });
      };

      renderTable();
      updateHeaderArrows();
      container.appendChild(allAvgPanel);
   })();

   // ── Tab 4: Per-member expandable score table ─────────────────────
   const memberHeading = document.createElement('h3');
   memberHeading.className = 'font-bold text-lg text-gray-800 mb-4 border-b pb-2';
   memberHeading.innerHTML = '<i class="fa-solid fa-users text-indigo-500 mr-2"></i>สรุปผลทุกสมาชิก';
   memberPanel.appendChild(memberHeading);

   ranked.forEach(({ member, received, total: totalScore }, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-3';

      // ── Card row ──
      const card = document.createElement('div');
      card.className = 'bg-white p-4 flex items-center justify-between';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-3';
      left.innerHTML = `
         <div class="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
            <i class="fa-solid fa-user text-sm"></i>
         </div>
         <div>
            <p class="font-bold text-gray-800">${escapeHtml(member)}</p>
            <p class="text-xs text-gray-400">รับการประเมิน ${received.length} ครั้ง</p>
         </div>`;

      const right = document.createElement('div');
      right.className = 'flex items-center gap-3';

      const scoreChip = document.createElement('span');
      scoreChip.className = 'font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg text-sm';
      scoreChip.textContent = `${totalScore} คะแนน`;

      const toggleBtn = document.createElement('button');
      toggleBtn.id = `toggle-btn-${idx}`;
      toggleBtn.className = 'text-gray-400 hover:text-indigo-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition text-xs font-bold select-none';
      toggleBtn.textContent = '▶';
      toggleBtn.addEventListener('click', () => toggleMemberDetail(idx));

      right.appendChild(scoreChip);
      right.appendChild(toggleBtn);
      card.appendChild(left);
      card.appendChild(right);

      // ── Detail table (pivot: one row per evaluator) ──
      const detail = document.createElement('div');
      detail.id = `member-detail-${idx}`;
      detail.className = 'hidden border-t border-gray-100';

      if (received.length === 0) {
         detail.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ยังไม่มีผลการประเมิน</p>';
      } else {
         const pivotRows = received.map(ev => ({
            evaluator: ev.evaluator,
            scores: criteria.map((_, qi) => Number(ev.scores[qi] || 0)),
            total:  criteria.reduce((s, _, qi) => s + Number(ev.scores[qi] || 0), 0)
         }));

         let sortAsc = false;

         const buildTbody = () => {
            const sorted = [...pivotRows].sort((a, b) =>
               sortAsc ? a.total - b.total : b.total - a.total
            );
            return sorted.map(row => `
               <tr class="hover:bg-gray-50 transition">
                  <td class="px-4 py-2.5 font-semibold text-gray-700 border-b border-gray-100 whitespace-nowrap">${escapeHtml(row.evaluator)}</td>
                  ${row.scores.map(s => `<td class="px-4 py-2.5 text-center text-gray-600 border-b border-gray-100">${s}</td>`).join('')}
                  <td class="px-4 py-2.5 text-center border-b border-gray-100">
                     <span class="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${row.total}</span>
                  </td>
               </tr>`).join('');
         };

         const colHeaders = criteria
            .map(c => escapeHtml(c.title.replace(/^\d+\.\s*/, '')))
            .map(h => `<th class="px-4 py-3 text-center font-semibold">${h}</th>`)
            .join('');

         const table = document.createElement('table');
         table.className = 'w-full text-sm';
         table.innerHTML = `
            <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
               <tr>
                  <th class="px-4 py-3 text-left font-semibold">Name</th>
                  ${colHeaders}
                  <th class="px-4 py-3 text-center font-semibold cursor-pointer select-none group whitespace-nowrap" data-sort-total>
                     Total <span class="text-indigo-400 group-hover:text-indigo-600 transition">↓</span>
                  </th>
               </tr>
            </thead>
            <tbody>${buildTbody()}</tbody>`;

         table.querySelector('[data-sort-total]').addEventListener('click', function () {
            sortAsc = !sortAsc;
            this.querySelector('span').textContent = sortAsc ? '↑' : '↓';
            table.querySelector('tbody').innerHTML = buildTbody();
         });

         detail.appendChild(table);
      }

      wrap.appendChild(card);
      wrap.appendChild(detail);
      memberPanel.appendChild(wrap);
   });

   container.appendChild(memberPanel);
}

function toggleMemberDetail(idx) {
   const detail = document.getElementById(`member-detail-${idx}`);
   const btn    = document.getElementById(`toggle-btn-${idx}`);
   const isOpen = !detail.classList.contains('hidden');
   detail.classList.toggle('hidden', isOpen);
   btn.textContent = isOpen ? '▶' : '▼';
}

// ==========================================
// 15. Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
   setupPinBoxes();
});

