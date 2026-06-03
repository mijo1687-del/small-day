const ROOT_FOLDER_NAME = '현장사진관리';
const PHOTO_DB_SHEET = 'PhotoDB';
const CATEGORIES = ['TBM', '현장시공', '안전관리', '환경관리'];
const HEADERS = [
  'id',
  'siteName',
  'contractor',
  'writer',
  'category',
  'date',
  'workType',
  'location',
  'content',
  'originalImageUrl',
  'originalFileId',
  'pdfUrl',
  'pdfFileId',
  'createdAt',
  'isPdfDeleted',
  'deletedAt',
  'errorMessage'
];

function doGet() {
  return json_({ ok: true, data: { message: 'Photo book API is running.' } });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const payload = body.payload || {};
    setup();
    let data = {};
    if (action === 'setup') data = setup();
    if (action === 'savePhotoBook') data = savePhotoBook_(payload);
    if (action === 'listPhotos') data = listPhotos_(payload);
    if (action === 'createPdfFromSelection') data = createPdfFromSelection_(payload);
    if (action === 'listPdfs') data = listPdfs_(payload);
    if (action === 'deletePdf') data = deletePdf_(payload.id);
    if (action === 'regeneratePdf') data = regeneratePdf_(payload.id);
    if (!action) throw new Error('action is required');
    return json_({ ok: true, data });
  } catch (error) {
    return json_({ ok: false, message: error.message || String(error) });
  }
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PHOTO_DB_SHEET) || ss.insertSheet(PHOTO_DB_SHEET);
  ensureHeaders_(sheet, HEADERS);
  getFolderStructure_();
  return { status: 'ok' };
}

function savePhotoBook_(payload) {
  validatePayload_(payload);
  const now = now_();
  const groupId = createId_('PB');
  const rows = [];
  const category = payload.category;
  const folders = getFolderStructure_();
  const photoFolder = folders.original[category];

  payload.photos.forEach((photo, index) => {
    const id = `${groupId}-${String(index + 1).padStart(2, '0')}`;
    const fileName = safeFileName_(`${formatDate_(photo.date)}_${category}_${payload.siteName}_${index + 1}.jpg`);
    const blob = Utilities.newBlob(Utilities.base64Decode(photo.base64), 'image/jpeg', fileName);
    const file = photoFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    rows.push({
      id,
      siteName: payload.siteName,
      contractor: payload.contractor,
      writer: payload.writer,
      category,
      date: formatDate_(photo.date),
      workType: category === '현장시공' ? photo.workType || '' : '',
      location: category === '현장시공' ? photo.location || '' : '',
      content: photo.content || '',
      originalImageUrl: file.getUrl(),
      originalFileId: file.getId(),
      pdfUrl: '',
      pdfFileId: '',
      createdAt: now,
      isPdfDeleted: false,
      deletedAt: '',
      errorMessage: ''
    });
  });

  appendRows_(rows);
  return { ids: rows.map((row) => row.id), count: rows.length };
}

function listPhotos_(filters) {
  const rows = readRows_().filter((row) => {
    if (filters.category && row.category !== filters.category) return false;
    if (filters.siteName && row.siteName !== filters.siteName) return false;
    if (filters.date && formatDate_(row.date) !== filters.date) return false;
    if (!row.originalFileId) return false;
    return true;
  }).map((row) => ({
    id: row.id,
    siteName: row.siteName,
    contractor: row.contractor,
    writer: row.writer,
    category: row.category,
    date: formatDate_(row.date),
    workType: row.workType,
    location: row.location,
    content: row.content,
    originalImageUrl: row.originalImageUrl,
    originalFileId: row.originalFileId,
    thumbUrl: driveThumbUrl_(row.originalFileId),
    createdAt: row.createdAt
  })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return { items: rows };
}

function createPdfFromSelection_(payload) {
  const ids = payload.photoIds || [];
  if (!ids.length) throw new Error('선택된 사진이 없습니다.');
  const rows = readRows_().filter((row) => ids.includes(row.id));
  if (!rows.length) throw new Error('선택한 원본사진 기록을 찾을 수 없습니다.');
  try {
    const pdf = createPdfForRows_(rows, {
      category: payload.category || rows[0].category,
      siteName: payload.siteName || rows[0].siteName,
      contractor: payload.contractor || rows[0].contractor,
      writer: payload.writer || rows[0].writer
    });
    updateRowsByIds_(rows.map((row) => row.id), {
      pdfUrl: pdf.url,
      pdfFileId: pdf.id,
      isPdfDeleted: false,
      deletedAt: '',
      errorMessage: ''
    });
    return { pdfUrl: pdf.url, pdfFileId: pdf.id, pdfFileName: pdf.name };
  } catch (error) {
    updateRowsByIds_(rows.map((row) => row.id), { errorMessage: error.message || String(error) });
    throw error;
  }
}

function listPdfs_(filters) {
  const rows = readRows_();
  const groups = {};
  rows.forEach((row) => {
    if (!row.pdfFileId && !row.errorMessage) return;
    if (filters.category && row.category !== filters.category) return;
    if (filters.siteName && String(row.siteName).indexOf(filters.siteName) < 0) return;
    if (filters.date && formatDate_(row.date) !== filters.date) return;
    if (!filters.includeDeleted && String(row.isPdfDeleted) === 'true') return;
    const key = row.pdfFileId || `ERR-${row.createdAt}-${row.category}-${row.siteName}`;
    if (!groups[key]) {
      groups[key] = {
        id: row.id,
        createdAt: row.createdAt,
        category: row.category,
        siteName: row.siteName,
        pdfUrl: row.pdfUrl,
        pdfFileId: row.pdfFileId,
        pdfFileName: row.pdfFileId ? '' : 'PDF 생성 실패',
        isPdfDeleted: row.isPdfDeleted,
        errorMessage: row.errorMessage,
        count: 0
      };
    }
    groups[key].count += 1;
  });
  const items = Object.keys(groups).map((key) => {
    const item = groups[key];
    if (item.pdfFileId) {
      try {
        item.pdfFileName = DriveApp.getFileById(item.pdfFileId).getName();
      } catch (error) {
        item.pdfFileName = 'PDF 파일 확인 불가';
      }
    }
    return item;
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { items };
}

function deletePdf_(id) {
  const rows = readRows_();
  const target = rows.find((row) => row.id === id);
  if (!target) throw new Error('대상 기록을 찾을 수 없습니다.');
  if (target.pdfFileId) {
    try {
      DriveApp.getFileById(target.pdfFileId).setTrashed(true);
    } catch (error) {
      // PDF may already be deleted. DB state still needs updating.
    }
  }
  const relatedIds = rows.filter((row) => row.pdfFileId === target.pdfFileId || row.id === id).map((row) => row.id);
  updateRowsByIds_(relatedIds, {
    isPdfDeleted: true,
    deletedAt: now_()
  });
  return { status: 'ok' };
}

function regeneratePdf_(id) {
  const rows = readRows_();
  const target = rows.find((row) => row.id === id);
  if (!target) throw new Error('대상 기록을 찾을 수 없습니다.');
  const related = rows.filter((row) => {
    if (target.pdfFileId) return row.pdfFileId === target.pdfFileId;
    return row.createdAt === target.createdAt && row.category === target.category && row.siteName === target.siteName;
  });
  if (!related.length) throw new Error('재생성할 원본사진 기록이 없습니다.');
  const pdf = createPdfForRows_(related, {
    category: target.category,
    siteName: target.siteName,
    contractor: target.contractor,
    writer: target.writer
  });
  updateRowsByIds_(related.map((row) => row.id), {
    pdfUrl: pdf.url,
    pdfFileId: pdf.id,
    isPdfDeleted: false,
    deletedAt: '',
    errorMessage: ''
  });
  return { pdfUrl: pdf.url, pdfFileId: pdf.id, pdfFileName: pdf.name };
}

function createPdfForRows_(rows, payload) {
  const category = payload.category || rows[0].category;
  const folders = getFolderStructure_();
  const pdfFolder = folders.pdf[category];
  const html = buildPdfHtml_(rows, payload);
  const firstDate = formatDate_(rows[0].date);
  const fileName = uniquePdfName_(pdfFolder, `${firstDate}_${formatHm_()}_${category}_${payload.siteName}.pdf`);
  const blob = Utilities.newBlob(html, 'text/html', `${fileName}.html`).getAs(MimeType.PDF).setName(fileName);
  const file = pdfFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: file.getUrl(), name: fileName };
}

function buildPdfHtml_(rows, payload) {
  const pages = [];
  for (let i = 0; i < rows.length; i += 2) pages.push([rows[i], rows[i + 1] || null]);
  const category = payload.category || rows[0].category;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic",Arial,sans-serif;color:#111}
.page{page-break-after:always;min-height:277mm}.title{text-align:center;font-size:22px;font-weight:700;letter-spacing:8px;margin-bottom:5mm}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #222;border-bottom:0;font-size:10px}
.meta div{padding:5px;border-right:1px solid #222}.meta div:last-child{border-right:0}
.block{height:126mm;border:1px solid #222;margin-bottom:5mm;display:grid;grid-template-rows:1fr auto}
.photo{display:flex;align-items:center;justify-content:center;padding:2mm;overflow:hidden}.photo img{max-width:100%;max-height:98mm;object-fit:contain}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}td{border:1px solid #222;padding:5px;vertical-align:middle}.label{width:17mm;text-align:center;font-weight:700;background:#f1f3f4}
.blank{height:126mm;border:1px solid #222;margin-bottom:5mm}
</style></head><body>
${pages.map((pair) => `<section class="page">
  <div class="title">사진대장</div>
  <div class="meta"><div>현장명: ${esc_(payload.siteName || '')}</div><div>시공사: ${esc_(payload.contractor || '')}</div><div>작성자: ${esc_(payload.writer || '')}</div></div>
  ${photoBlock_(pair[0], category)}
  ${photoBlock_(pair[1], category)}
</section>`).join('')}
</body></html>`;
}

function photoBlock_(row, category) {
  if (!row) return '<div class="blank"></div>';
  const image = imageDataUrl_(row.originalFileId);
  const table = category === '현장시공'
    ? `<table><tr><td class="label">공종</td><td>${esc_(row.workType)}</td><td class="label">부위</td><td>${esc_(row.location)}</td><td class="label">일시</td><td>${esc_(formatDate_(row.date))}</td></tr><tr><td class="label">내용</td><td colspan="5">${esc_(row.content)}</td></tr></table>`
    : `<table><tr><td class="label">내용</td><td>${esc_(row.content)}</td><td class="label">일시</td><td>${esc_(formatDate_(row.date))}</td></tr></table>`;
  return `<div class="block"><div class="photo"><img src="${image}"></div>${table}</div>`;
}

function imageDataUrl_(fileId) {
  const blob = DriveApp.getFileById(fileId).getBlob();
  return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
}

function driveThumbUrl_(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

function validatePayload_(payload) {
  if (!payload.siteName) throw new Error('현장명이 필요합니다.');
  if (!payload.contractor) throw new Error('시공사가 필요합니다.');
  if (!payload.writer) throw new Error('작성자가 필요합니다.');
  if (!CATEGORIES.includes(payload.category)) throw new Error('카테고리가 올바르지 않습니다.');
  if (!payload.photos || !payload.photos.length) throw new Error('저장할 사진이 없습니다.');
}

function getFolderStructure_() {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const originalRoot = getOrCreateFolder_(root, '원본사진');
  const pdfRoot = getOrCreateFolder_(root, '사진대장PDF');
  const original = {};
  const pdf = {};
  CATEGORIES.forEach((category) => {
    original[category] = getOrCreateFolder_(originalRoot, category);
    pdf[category] = getOrCreateFolder_(pdfRoot, category);
  });
  return { root, original, pdf };
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getLastRow() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0] : [];
  if (current.slice(0, headers.length).join('|') !== headers.join('|')) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function appendRows_(objects) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PHOTO_DB_SHEET);
  sheet.getRange(sheet.getLastRow() + 1, 1, objects.length, HEADERS.length).setValues(objects.map(rowFromObject_));
}

function readRows_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PHOTO_DB_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter((row) => row.some((cell) => cell !== '')).map((row) => {
    const object = {};
    headers.forEach((header, index) => object[header] = normalizeCell_(header, row[index]));
    return object;
  });
}

function updateRowsByIds_(ids, patch) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PHOTO_DB_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  values.slice(1).forEach((row, rowIndex) => {
    if (!ids.includes(row[idCol])) return;
    Object.keys(patch).forEach((key) => {
      const col = headers.indexOf(key);
      if (col >= 0) sheet.getRange(rowIndex + 2, col + 1).setValue(patch[key]);
    });
  });
}

function rowFromObject_(object) {
  return HEADERS.map((header) => object[header] === undefined ? '' : object[header]);
}

function normalizeCell_(header, value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (header === 'date') return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  }
  return value;
}

function uniquePdfName_(folder, baseName) {
  const dot = baseName.lastIndexOf('.');
  const name = dot >= 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot >= 0 ? baseName.slice(dot) : '.pdf';
  let candidate = `${name}${ext}`;
  let index = 1;
  while (folder.getFilesByName(candidate).hasNext()) {
    candidate = `${name}_${String(index).padStart(3, '0')}${ext}`;
    index += 1;
  }
  return candidate;
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function formatHm_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'HHmm');
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function createId_(prefix) {
  return `${prefix}-${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMddHHmmss')}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeFileName_(name) {
  return String(name).replace(/[\\/:*?"<>|#%{}]/g, '_');
}

function esc_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
