const SHEETS = {
  expenses: '지출DB',
  workTypes: '기준정보_공종',
  partners: '기준정보_거래처성명',
  expenseTypes: '기준정보_지출구분',
  sites: '기준정보_현장'
};

const HEADERS = {
  expenses: ['id', '입력일시', '지출일자', '연도', '월', '주차', '요일', '공종', '지출구분', '업체명성명', '금액_부가세제외', '부가세', '합계금액', '비고', '작성자', '현장명', '수정일시', '삭제여부'],
  workTypes: ['공종명', '사용여부', '정렬순서', '현장명'],
  partners: ['이름', '기본구분', '최근사용일', '사용횟수'],
  expenseTypes: ['지출구분'],
  sites: ['현장명', '사용여부', '정렬순서']
};

function doGet(e) {
  try {
    setupSheets();
    const params = e.parameter || {};
    const action = params.action || 'getData';
    const payload = params.payload ? JSON.parse(params.payload) : {};
    let data = {};
    if (action === 'getData') data = getData_();
    if (action === 'saveExpense') data = saveExpense_(payload);
    if (action === 'updateExpense') data = updateExpense_(payload);
    if (action === 'deleteExpense') data = deleteExpense_(payload.id);
    if (action === 'saveWorkType') data = saveWorkType_(payload);
    if (action === 'deleteWorkType') data = deleteWorkType_(payload);
    if (action === 'saveSite') data = saveSite_(payload);
    if (action === 'deleteSite') data = deleteSite_(payload);
    const response = { ok: true, data };
    if (params.callback) return jsonpResponse_(params.callback, response);
    return jsonResponse(response);
  } catch (error) {
    const response = { ok: false, message: error.message };
    if (e.parameter && e.parameter.callback) return jsonpResponse_(e.parameter.callback, response);
    return jsonResponse(response);
  }
}

function doPost(e) {
  try {
    setupSheets();
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const payload = body.payload || {};
    let data = {};
    if (action === 'getData') data = getData_();
    if (action === 'saveExpense') data = saveExpense_(payload);
    if (action === 'updateExpense') data = updateExpense_(payload);
    if (action === 'deleteExpense') data = deleteExpense_(payload.id);
    if (action === 'saveWorkType') data = saveWorkType_(payload);
    if (action === 'deleteWorkType') data = deleteWorkType_(payload);
    if (action === 'saveSite') data = saveSite_(payload);
    if (action === 'deleteSite') data = deleteSite_(payload);
    return jsonResponse({ ok: true, data });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message });
  }
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.expenses, HEADERS.expenses);
  ensureSheet_(ss, SHEETS.workTypes, HEADERS.workTypes);
  ensureSheet_(ss, SHEETS.partners, HEADERS.partners);
  ensureSheet_(ss, SHEETS.expenseTypes, HEADERS.expenseTypes);
  ensureSheet_(ss, SHEETS.sites, HEADERS.sites);
  seedExpenseTypes_();
}

function getData_() {
  setupSheets();
  return {
    expenses: getObjects_(SHEETS.expenses),
    workTypes: getObjects_(SHEETS.workTypes),
    partners: getObjects_(SHEETS.partners),
    expenseTypes: getObjects_(SHEETS.expenseTypes),
    sites: getObjects_(SHEETS.sites)
  };
}

function saveExpense_(expense) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.expenses);
  const row = HEADERS.expenses.map((header) => expense[header] || '');
  sheet.appendRow(row);
  upsertPartner_(expense['업체명성명'], expense['지출구분'], expense['지출일자']);
  saveWorkType_({ 공종명: expense['공종'], 현장명: expense['현장명'], 사용여부: 'Y' });
  saveSite_({ 현장명: expense['현장명'], 사용여부: 'Y' });
  return { id: expense.id };
}

function updateExpense_(expense) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.expenses);
  const rowNumber = findRowById_(sheet, expense.id);
  if (!rowNumber) return saveExpense_(expense);
  const row = HEADERS.expenses.map((header) => expense[header] || '');
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  upsertPartner_(expense['업체명성명'], expense['지출구분'], expense['지출일자']);
  saveWorkType_({ 공종명: expense['공종'], 현장명: expense['현장명'], 사용여부: 'Y' });
  saveSite_({ 현장명: expense['현장명'], 사용여부: 'Y' });
  return { id: expense.id };
}

function deleteExpense_(id) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.expenses);
  const rowNumber = findRowById_(sheet, id);
  if (!rowNumber) return { id };
  const deleteCol = HEADERS.expenses.indexOf('삭제여부') + 1;
  const updateCol = HEADERS.expenses.indexOf('수정일시') + 1;
  sheet.getRange(rowNumber, deleteCol).setValue('Y');
  sheet.getRange(rowNumber, updateCol).setValue(new Date().toISOString());
  return { id };
}

function saveWorkType_(payload) {
  const name = String(payload['공종명'] || '').trim();
  const site = String(payload['현장명'] || '').trim();
  if (!name) return {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.workTypes);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name && String(values[i][3] || '') === site) {
      sheet.getRange(i + 1, 2).setValue(payload['사용여부'] || 'Y');
      return { 공종명: name, 현장명: site };
    }
  }
  sheet.appendRow([name, payload['사용여부'] || 'Y', payload['정렬순서'] || values.length, site]);
  return { 공종명: name, 현장명: site };
}

function deleteWorkType_(payload) {
  const name = String(payload['공종명'] || '').trim();
  const site = String(payload['현장명'] || '').trim();
  if (!name) return {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.workTypes);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name && String(values[i][3] || '') === site) {
      sheet.getRange(i + 1, 2).setValue('N');
      return { 공종명: name, 현장명: site, 사용여부: 'N' };
    }
  }
  return { 공종명: name, 현장명: site };
}

function saveSite_(payload) {
  const name = String(payload['현장명'] || '').trim();
  if (!name) return {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.sites);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.getRange(i + 1, 2).setValue(payload['사용여부'] || 'Y');
      return { 현장명: name };
    }
  }
  sheet.appendRow([name, payload['사용여부'] || 'Y', payload['정렬순서'] || values.length]);
  return { 현장명: name };
}

function deleteSite_(payload) {
  const name = String(payload['현장명'] || '').trim();
  const purgeData = payload['삭제자료포함'] === true || payload['삭제자료포함'] === 'true';
  if (!name) return {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.sites);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.getRange(i + 1, 2).setValue('N');
      break;
    }
  }
  deactivateWorkTypesBySite_(name);
  if (purgeData) {
    markRowsDeletedBySite_(SHEETS.expenses, HEADERS.expenses, name);
  }
  return { 현장명: name, 사용여부: 'N', 삭제자료포함: purgeData };
}

function deactivateWorkTypesBySite_(site) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.workTypes);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const activeCol = headers.indexOf('사용여부') + 1;
  const siteCol = headers.indexOf('현장명');
  if (!activeCol || siteCol < 0) return;
  for (let i = 1; i < values.length; i++) {
    if (values[i][siteCol] === site) sheet.getRange(i + 1, activeCol).setValue('N');
  }
}

function markRowsDeletedBySite_(sheetName, headers, site) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const siteCol = headers.indexOf('현장명');
  const deleteCol = headers.indexOf('삭제여부') + 1;
  const updateCol = headers.indexOf('수정일시') + 1;
  if (siteCol < 0 || !deleteCol) return;
  for (let i = 1; i < values.length; i++) {
    if (values[i][siteCol] === site) {
      sheet.getRange(i + 1, deleteCol).setValue('Y');
      if (updateCol > 0) sheet.getRange(i + 1, updateCol).setValue(new Date().toISOString());
    }
  }
}

function upsertPartner_(name, type, dateText) {
  name = String(name || '').trim();
  if (!name) return;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.partners);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[values[i][1] || type, dateText, Number(values[i][3] || 0) + 1]]);
      return;
    }
  }
  sheet.appendRow([name, type, dateText, 1]);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = currentHeaders.join('') === '' || currentHeaders.join('|') !== headers.join('|');
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function seedExpenseTypes_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.expenseTypes);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 4, 1).setValues([['노무비'], ['외주비'], ['자재비'], ['경비']]);
}

function getObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== '')).map((row) => {
    const obj = {};
    headers.forEach((header, index) => obj[header] = row[index]);
    return obj;
  });
}

function findRowById_(sheet, id) {
  if (!id) return 0;
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return 0;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse_(callback, payload) {
  const safeCallback = String(callback).replace(/[^\w$.]/g, '');
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
