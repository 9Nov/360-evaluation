// =========================================================
// Google Apps Script สำหรับใช้เป็น Backend Database ให้กับ Web App
// โปรดคัดลอกโค้ดนี้ทั้งหมด นำไปวางในส่วน "ส่วนขยาย" -> "Apps Script" ของ Google Sheets
// =========================================================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if(!ss.getSheetByName("Rooms")) {
    const sheet = ss.insertSheet("Rooms");
    sheet.appendRow(["Room Code", "Created At"]);
  }
  if(!ss.getSheetByName("Users")) {
    const sheet = ss.insertSheet("Users");
    sheet.appendRow(["Room Code", "User Name", "Joined At", "PIN"]);
  }
  if(!ss.getSheetByName("Evaluations")) {
    const sheet = ss.insertSheet("Evaluations");
    sheet.appendRow(["Room Code", "Evaluator", "Evaluatee", "Q1 (Teamwork)", "Q2 (Responsibility)", "Q3 (Problem Solving)", "Q4 (Communication)", "Q5 (Attitude)", "Timestamp"]);
  }
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// รองรับ HTTP POST
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
        return responseJson({status: "error", message: "No data payload provided."});
    }
    
    // พยายามสร้าง Sheet ทั้ง 3 ตัว หากยังไม่มี (เพื่อลดทอนส่วนที่ต้องตั้งค่าเอง)
    try { setupSheets(); } catch(ex) {}
    
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let result = { status: "success" };
    
    if (action === "createRoom") {
      const db = ss.getSheetByName("Rooms");
      db.appendRow([payload.roomCode, new Date().toISOString()]);
      result.roomCode = payload.roomCode;
    } 
    else if (action === "joinRoom") {
      const dbRooms = ss.getSheetByName("Rooms");
      const roomsData = dbRooms.getDataRange().getValues();

      const roomExists = roomsData.some((r, idx) => idx > 0 && r[0] == payload.roomCode);
      if (!roomExists) {
        return responseJson({ status: "error", message: "ไม่พบรหัสห้องนี้ในระบบ โปรดตรวจสอบอีกครั้ง" });
      }

      const dbUsers   = ss.getSheetByName("Users");
      const usersData = dbUsers.getDataRange().getValues();

      // Find existing row for this room + userName
      let existingRowIndex = -1;
      let storedPin        = '';
      for (let i = 1; i < usersData.length; i++) {
        if (usersData[i][0] == payload.roomCode && usersData[i][1] == payload.userName) {
          existingRowIndex = i;
          storedPin = String(usersData[i][3] || ''); // Column D = PIN (index 3)
          break;
        }
      }

      const incomingPin = String(payload.pin || '');

      if (existingRowIndex === -1) {
        // ─── New user: add row with PIN ───────────────────────────
        dbUsers.appendRow([payload.roomCode, payload.userName, new Date().toISOString(), incomingPin]);
      } else {
        // ─── Returning user: verify PIN ───────────────────────────
        if (storedPin !== '') {
          // PIN is set — must match exactly
          if (incomingPin !== storedPin) {
            return responseJson({ status: "error", message: "PIN ไม่ถูกต้อง กรุณาลองอีกครั้ง" });
          }
        } else {
          // Legacy row (no PIN stored yet) — accept and store the provided PIN
          dbUsers.getRange(existingRowIndex + 1, 4).setValue(incomingPin);
        }
      }

      result.userName = payload.userName;
    }
    // ดึงข้อมูลรายชื่อเพื่อน และผลที่ประเมินไปแล้ว เพื่อแสดงว่าใครประเมินแล้วบ้าง หรือคำนวณผล
    else if (action === "getRoomData") {
      const dbRooms = ss.getSheetByName("Rooms");
      const dbUsers = ss.getSheetByName("Users");
      const dbEvals = ss.getSheetByName("Evaluations");

      const roomsData = dbRooms.getDataRange().getValues();
      const roomExists = roomsData.some((r, idx) => idx > 0 && r[0] == payload.roomCode);
      result.roomExists = roomExists;

      const uData = dbUsers.getDataRange().getValues();
      const users = [];
      for (let i = 1; i < uData.length; i++) {
        if (uData[i][0] == payload.roomCode) {
          users.push(uData[i][1]); // ใส่รายชื่อ
        }
      }

      const eData = dbEvals.getDataRange().getValues();
      const evaluations = [];
      for (let i = 1; i < eData.length; i++) {
        if (eData[i][0] == payload.roomCode) {
          evaluations.push({
            evaluator: eData[i][1],
            evaluatee: eData[i][2],
            scores: [eData[i][3], eData[i][4], eData[i][5], eData[i][6], eData[i][7]]
          });
        }
      }
      result.users = users;
      result.evaluations = evaluations;
    }
    else if (action === "deleteUser") {
      const dbUsers = ss.getSheetByName("Users");
      const usersData = dbUsers.getDataRange().getValues();
      for (let i = usersData.length - 1; i >= 1; i--) {
        if (usersData[i][0] == payload.roomCode && usersData[i][1] == payload.userName) {
          dbUsers.deleteRow(i + 1);
        }
      }
      result.message = "User deleted";
    }
    else if (action === "submitEvaluation") {
      const db = ss.getSheetByName("Evaluations");
      db.appendRow([
        payload.roomCode, 
        payload.evaluator, 
        payload.evaluatee, 
        payload.scores[0], 
        payload.scores[1], 
        payload.scores[2], 
        payload.scores[3], 
        payload.scores[4], 
        new Date().toISOString()
      ]);
    }
    
    return responseJson(result);
  } catch (err) {
    return responseJson({status: "error", message: err.toString()});
  }
}

// รองรับ HTTP GET สำหรับเอาไว้ Test ตรวจสอบ URL เบื้องต้น
function doGet(e) {
  return responseJson({status: "success", message: "The API is up and running. Method GET works correctly."});
}
