const GAS_WEB_APP_URL = "";

const EXPENSE_TYPES = ["노무비", "외주비", "자재비", "경비"];
const DEFAULT_WORK_TYPES = ["토공", "철근", "콘크리트", "거푸집", "조적", "미장", "방수", "도장", "전기", "설비"];
const DEFAULT_SITE_NAMES = ["남해미조권역", "밀양하납신축", "진해사령부보수"];
const STORAGE_KEYS = {
  apiUrl: "siteExpense.apiUrl",
  expenses: "siteExpense.expenses",
  workTypes: "siteExpense.workTypes",
  partners: "siteExpense.partners",
  writer: "siteExpense.writer",
  siteName: "siteExpense.siteName",
  sites: "siteExpense.sites",
  currentSite: "siteExpense.currentSite"
};

const state = {
  expenses: [],
  workTypes: [],
  partners: [],
  sites: [],
  expenseTypes: EXPENSE_TYPES,
  lookupMode: "work"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadLocalState();
  seedDefaults();
  setDefaultDates();
  bindEvents();
  renderAll();
  syncFromServer(false);
}

function loadLocalState() {
  state.expenses = normalizeExpenses(readJson(STORAGE_KEYS.expenses, []));
  state.workTypes = readJson(STORAGE_KEYS.workTypes, []);
  state.partners = readJson(STORAGE_KEYS.partners, []);
  state.sites = readJson(STORAGE_KEYS.sites, []);
  $("#apiUrl").value = localStorage.getItem(STORAGE_KEYS.apiUrl) || GAS_WEB_APP_URL;
  $("#writer").value = localStorage.getItem(STORAGE_KEYS.writer) || "";
  $("#siteName").value = localStorage.getItem(STORAGE_KEYS.siteName) || localStorage.getItem(STORAGE_KEYS.currentSite) || "";
  $("#reportWriter").value = $("#writer").value;
  $("#reportSiteName").value = $("#siteName").value;
}

function seedDefaults() {
  if (!state.sites.length) state.sites = DEFAULT_SITE_NAMES.map((name, index) => ({ name, active: "Y", order: index + 1 }));
  normalizeWorkTypes();
  if (!state.workTypes.length) seedDefaultWorkTypesForSites();
  const savedSite = localStorage.getItem(STORAGE_KEYS.currentSite);
  if (savedSite && savedSite !== "all" && savedSite !== "전체 현장") {
    addSite(savedSite, false, true);
    $("#siteName").value = savedSite;
  } else if (!savedSite && activeSites().length) {
    const firstSite = activeSites()[0].name;
    localStorage.setItem(STORAGE_KEYS.currentSite, firstSite);
    $("#siteName").value = firstSite;
    $("#reportSiteName").value = firstSite;
  }
}

function setDefaultDates() {
  const today = toDateInput(new Date());
  const month = today.slice(0, 7);
  $("#expenseDate").value = today;
  $("#dashboardMonth").value = month;
  $("#dashboardDay").value = today;
  $("#filterMonth").value = month;
  $("#filterDay").value = today;
  $("#reportMonth").value = month;
  $("#reportDay").value = today;
  const weekValue = toWeekInput(new Date());
  $("#dashboardWeek").value = weekValue;
  $("#filterWeek").value = weekValue;
  $("#reportWeek").value = weekValue;
}

function bindEvents() {
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#expenseForm").addEventListener("submit", saveExpense);
  $("#resetButton").addEventListener("click", resetForm);
  $("#syncButton").addEventListener("click", () => syncFromServer(true));
  $("#addWorkTypeButton").addEventListener("click", openWorkTypeAddPanel);
  $("#deleteWorkTypeButton").addEventListener("click", deleteSelectedWorkType);
  $("#confirmAddWorkTypeButton").addEventListener("click", confirmQuickWorkType);
  $("#cancelAddWorkTypeButton").addEventListener("click", closeWorkTypeAddPanel);
  $("#quickNewWorkType").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmQuickWorkType();
    }
  });
  $("#addSettingWorkTypeButton").addEventListener("click", () => addWorkType($("#newWorkType").value, true));
  $("#addCurrentSiteButton").addEventListener("click", openSiteAddPanel);
  $("#confirmAddSiteButton").addEventListener("click", confirmQuickSite);
  $("#cancelAddSiteButton").addEventListener("click", closeSiteAddPanel);
  $("#quickNewSiteName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmQuickSite();
    }
  });
  $("#deleteCurrentSiteButton").addEventListener("click", deleteCurrentSite);
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#clearFiltersButton").addEventListener("click", clearFilters);
  $("#pdfButton").addEventListener("click", exportPdf);

  ["dashboardMonth", "dashboardWeek", "dashboardDay"].forEach((id) => $("#" + id).addEventListener("change", renderDashboard));
  ["periodType", "filterMonth", "filterWeek", "filterDay", "filterStart", "filterEnd", "filterType", "filterWorkType", "filterName", "filterMin", "filterMax"].forEach((id) => {
    $("#" + id).addEventListener("input", renderSearch);
    $("#" + id).addEventListener("change", renderSearch);
  });
  ["lookupWorkType", "lookupName"].forEach((id) => {
    $("#" + id).addEventListener("input", renderLookup);
    $("#" + id).addEventListener("change", renderLookup);
  });
  $$(".lookup-tab").forEach((button) => button.addEventListener("click", () => setLookupMode(button.dataset.lookup)));
  ["amount", "filterMin", "filterMax"].forEach((id) => $("#" + id).addEventListener("input", formatNumberInput));
  $("#writer").addEventListener("change", () => localStorage.setItem(STORAGE_KEYS.writer, $("#writer").value.trim()));
  $("#siteName").addEventListener("change", handleSiteNameChange);
  $("#currentSiteMain").addEventListener("change", handleCurrentSiteMainChange);
}

function switchTab(tab) {
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
  renderAll();
}

async function saveExpense(event) {
  event.preventDefault();
  const existingId = $("#expenseId").value;
  const base = buildExpenseFromForm(existingId);
  if (!base) return;

  if (existingId) {
    const index = state.expenses.findIndex((item) => item.id === existingId);
    if (index >= 0) state.expenses[index] = { ...state.expenses[index], ...base, 수정일시: new Date().toISOString() };
  } else {
    state.expenses.unshift(base);
  }

  rememberPartner(base.업체명성명, base.지출구분, base.지출일자);
  addWorkType(base.공종, false, true);
  addSite(base.현장명, false, true);
  setCurrentSite(base.현장명);
  persistLocal();
  renderAll();
  resetForm(true);
  showToast(existingId ? "수정했습니다." : "저장했습니다. 바로 다음 입력이 가능합니다.");
  await postToServer(existingId ? "updateExpense" : "saveExpense", base);
}

function buildExpenseFromForm(existingId) {
  const amount = parseNumber($("#amount").value);
  if (!$("#expenseDate").value || !$("#workType").value.trim() || !$("#partnerName").value.trim() || !$("#siteName").value.trim() || !amount) {
    showToast("지출일자, 공종, 업체명/성명, 현장명, 금액을 확인해 주세요.");
    return null;
  }
  const date = new Date($("#expenseDate").value + "T00:00:00");
  const vat = Math.round(amount * 0.1);
  return {
    id: existingId || createId(),
    입력일시: existingId ? findExpense(existingId)?.입력일시 || new Date().toISOString() : new Date().toISOString(),
    지출일자: $("#expenseDate").value,
    연도: date.getFullYear(),
    월: date.getMonth() + 1,
    주차: getMondayWeekLabel(date),
    요일: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
    공종: $("#workType").value.trim(),
    지출구분: $("#expenseType").value,
    업체명성명: $("#partnerName").value.trim(),
    금액_부가세제외: amount,
    부가세: vat,
    합계금액: amount + vat,
    비고: $("#memo").value.trim(),
    작성자: $("#writer").value.trim(),
    현장명: $("#siteName").value.trim(),
    수정일시: existingId ? new Date().toISOString() : "",
    삭제여부: "N"
  };
}

function normalizeExpenses(expenses) {
  return expenses.map((item) => normalizeExpense(item));
}

function normalizeExpense(item) {
  const normalized = { ...item };
  normalized.지출일자 = normalizeSheetDate(normalized.지출일자);
  normalized.입력일시 = typeof normalized.입력일시 === "string" ? normalized.입력일시 : String(normalized.입력일시 || "");
  normalized.수정일시 = typeof normalized.수정일시 === "string" ? normalized.수정일시 : String(normalized.수정일시 || "");
  const date = new Date(`${normalized.지출일자}T00:00:00`);
  if (normalized.지출일자 && !Number.isNaN(date.getTime())) {
    normalized.연도 = date.getFullYear();
    normalized.월 = date.getMonth() + 1;
    normalized.주차 = getMondayWeekLabel(date);
    normalized.요일 = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  }
  normalized.금액_부가세제외 = Number(normalized.금액_부가세제외 || 0);
  normalized.부가세 = Number(normalized.부가세 || Math.round(normalized.금액_부가세제외 * 0.1));
  normalized.합계금액 = Number(normalized.합계금액 || normalized.금액_부가세제외 + normalized.부가세);
  normalized.삭제여부 = normalized.삭제여부 || "N";
  return normalized;
}

function editExpense(id) {
  const item = findExpense(id);
  if (!item) return;
  switchTab("input");
  $("#expenseId").value = item.id;
  $("#expenseDate").value = item.지출일자;
  $("#expenseType").value = item.지출구분;
  $("#workType").value = item.공종;
  $("#partnerName").value = item.업체명성명;
  $("#amount").value = formatNumber(item.금액_부가세제외, false);
  $("#memo").value = item.비고 || "";
  $("#writer").value = item.작성자 || "";
  $("#siteName").value = item.현장명 || "";
  setCurrentSite(item.현장명 || "all", false);
  $("#saveButton").textContent = "수정 저장";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteExpense(id) {
  if (!confirm("삭제 처리할까요? 조회와 정산서에서 제외됩니다.")) return;
  const item = findExpense(id);
  if (!item) return;
  item.삭제여부 = "Y";
  item.수정일시 = new Date().toISOString();
  persistLocal();
  renderAll();
  showToast("삭제 처리했습니다.");
  await postToServer("deleteExpense", { id });
}

function resetForm(keepContext = false) {
  const date = $("#expenseDate").value;
  const writer = $("#writer").value;
  const siteName = $("#siteName").value;
  $("#expenseForm").reset();
  $("#expenseId").value = "";
  $("#expenseDate").value = keepContext ? date : toDateInput(new Date());
  $("#writer").value = writer;
  $("#siteName").value = siteName;
  $("#reportSiteName").value = siteName;
  $("#expenseType").value = "노무비";
  $("#saveButton").textContent = "저장";
  closeWorkTypeAddPanel();
  $("#workType").focus();
}

function renderAll() {
  renderOptions();
  renderInputSummary();
  renderRecent();
  renderDashboard();
  renderSearch();
  renderLookup();
  renderSettings();
}

function renderOptions() {
  const currentSiteValue = getCurrentSite();
  const siteOptions = activeSites().map((item) => [item.name, item.name]);
  fillSelect($("#currentSiteMain"), siteOptions, true);
  $("#currentSiteMain").value = activeSites().some((item) => item.name === currentSiteValue) ? currentSiteValue : activeSites()[0]?.name || "";
  fillSelect($("#expenseType"), state.expenseTypes.map((x) => [x, x]), false);
  fillSelect($("#filterType"), [["all", "전체"], ...state.expenseTypes.map((x) => [x, x])], false);
  const workOptions = activeWorkTypes().map((item) => [item.name, item.name]);
  fillSelect($("#workType"), [["", "공종 선택"], ...workOptions], true);
  fillSelect($("#filterWorkType"), [["all", "전체"], ...workOptions], false);
  fillSelect($("#lookupWorkType"), workOptions, false);
  fillSelect($("#reportWorkType"), [["all", "전체"], ...workOptions], false);
  $("#partnerList").innerHTML = state.partners.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join("");
  if (!$("#expenseType").value) $("#expenseType").value = "노무비";
}

function renderInputSummary() {
  const active = getActiveExpenses();
  const today = toDateInput(new Date());
  const week = getWeekRange(new Date());
  $("#todayTotal").textContent = won(sum(active.filter((item) => item.지출일자 === today)));
  $("#weekTotal").textContent = won(sum(active.filter((item) => isDateBetween(item.지출일자, week.start, week.end))));
}

function renderRecent() {
  const recent = getActiveExpenses().slice(0, 5);
  $("#recentCount").textContent = `${recent.length}건`;
  $("#recentList").innerHTML = recent.length ? recent.map(renderExpenseItem).join("") : empty("최근 입력 내역이 없습니다.");
}

function renderDashboard() {
  const active = getActiveExpenses();
  $("#dashboardCards").innerHTML = renderMetricCards(active, "총");
  const month = $("#dashboardMonth").value;
  const week = parseWeekInput($("#dashboardWeek").value);
  const day = $("#dashboardDay").value;
  $("#monthlyCards").innerHTML = renderMetricCards(active.filter((item) => item.지출일자.startsWith(month)), "월별");
  $("#weeklyCards").innerHTML = renderMetricCards(active.filter((item) => week && isDateBetween(item.지출일자, week.start, week.end)), "주간");
  $("#dailyCards").innerHTML = renderMetricCards(active.filter((item) => item.지출일자 === day), "일자별");
}

function renderSearch() {
  updatePeriodFields();
  const items = getFilteredExpenses();
  $("#filteredTotal").textContent = won(sum(items));
  $("#breakdownCards").innerHTML = renderMetricCards(items, "");
  $("#expenseList").innerHTML = items.length ? items.map(renderExpenseItem).join("") : empty("조건에 맞는 지출내역이 없습니다.");
}

function renderLookup() {
  const active = getActiveExpenses();
  let items = [];
  let title = "";
  if (state.lookupMode === "work") {
    const workType = $("#lookupWorkType").value;
    items = active.filter((item) => !workType || item.공종 === workType);
    title = workType || "공종";
  } else if (state.lookupMode === "company") {
    const name = $("#lookupName").value.trim();
    items = active.filter((item) => item.지출구분 === "외주비" && includesText(item.업체명성명, name));
    title = name || "업체별 외주비";
  } else {
    const name = $("#lookupName").value.trim();
    items = active.filter((item) => item.지출구분 === "노무비" && includesText(item.업체명성명, name));
    title = name || "성명별 노무비";
  }
  const monthly = groupBy(items, (item) => `${item.연도}-${String(item.월).padStart(2, "0")}`);
  const weekly = groupBy(items, (item) => item.주차);
  $("#lookupResult").innerHTML = `
    <div class="lookup-card"><strong>${escapeHtml(title)} 총액: ${won(sum(items))}</strong>${renderBreakdownLine(items)}</div>
    <div class="lookup-card"><strong>월별</strong>${renderGrouped(monthly)}</div>
    <div class="lookup-card"><strong>주간별</strong>${renderGrouped(weekly)}</div>
    ${items.length ? items.map(renderExpenseItem).join("") : empty("조회 내역이 없습니다.")}
  `;
}

function renderSettings() {
  $("#workTypeManager").innerHTML = activeWorkTypes().map((item) => `
    <div class="expense-item">
      <div class="expense-head"><strong>${escapeHtml(item.name)}</strong><span class="expense-meta">${escapeHtml(item.site || getCurrentSite())} · 순서 ${item.order || ""}</span></div>
      <div class="item-actions single">
        <button class="delete" type="button" onclick="deleteWorkType(decodeURIComponent('${encodeURIComponent(item.name)}'))">공종 삭제</button>
      </div>
    </div>
  `).join("") || empty("등록된 공종이 없습니다.");
  $("#partnerManager").innerHTML = state.partners.map((item) => `
    <div class="expense-item">
      <div class="expense-head"><strong>${escapeHtml(item.name)}</strong><span class="expense-meta">${escapeHtml(item.type || "")} · ${item.count || 0}회</span></div>
    </div>
  `).join("") || empty("등록된 거래처/성명이 없습니다.");
}

function renderMetricCards(items, prefix) {
  const totals = totalsByType(items);
  return [
    metric(`${prefix} 노무비`, totals["노무비"], "labor"),
    metric(`${prefix} 외주비`, totals["외주비"], "outsourcing"),
    metric(`${prefix} 자재비`, totals["자재비"], "material"),
    metric(`${prefix} 경비`, totals["경비"], "expense"),
    metric(`${prefix || "전체"} 합계`, sum(items), "total")
  ].join("");
}

function metric(label, value, type) {
  return `<div class="metric-card ${type}"><span>${label.trim()}</span><strong>${won(value)}</strong></div>`;
}

function renderExpenseItem(item) {
  return `
    <article class="expense-item">
      <div class="expense-head">
        <div>
          <div class="expense-title">${escapeHtml(item.공종)} · ${escapeHtml(item.지출구분)}</div>
          <div class="expense-meta">${escapeHtml(item.지출일자)}(${escapeHtml(item.요일 || "")}) · ${escapeHtml(item.업체명성명)}</div>
          <div class="expense-meta">${escapeHtml(item.현장명 || "")} ${item.비고 ? "· " + escapeHtml(item.비고) : ""}</div>
        </div>
        <div class="expense-amount">${won(item.금액_부가세제외)}</div>
      </div>
      <div class="item-actions">
        <button type="button" onclick="editExpense('${item.id}')">수정</button>
        <button class="delete" type="button" onclick="deleteExpense('${item.id}')">삭제</button>
      </div>
    </article>
  `;
}

function setLookupMode(mode) {
  state.lookupMode = mode;
  $$(".lookup-tab").forEach((button) => button.classList.toggle("active", button.dataset.lookup === mode));
  $("#lookupWorkWrap").hidden = mode !== "work";
  $("#lookupNameWrap").hidden = mode === "work";
  $("#lookupNameLabel").textContent = mode === "company" ? "업체명 검색" : "성명 검색";
  renderLookup();
}

function getFilteredExpenses() {
  const periodType = $("#periodType").value;
  const type = $("#filterType").value;
  const workType = $("#filterWorkType").value;
  const name = $("#filterName").value.trim();
  const min = parseNumber($("#filterMin").value);
  const max = parseNumber($("#filterMax").value);
  return getActiveExpenses().filter((item) => {
    if (!matchesPeriod(item, periodType)) return false;
    if (type !== "all" && item.지출구분 !== type) return false;
    if (workType !== "all" && item.공종 !== workType) return false;
    if (name && !includesText(item.업체명성명, name)) return false;
    if (min && Number(item.금액_부가세제외) < min) return false;
    if (max && Number(item.금액_부가세제외) > max) return false;
    return true;
  });
}

function matchesPeriod(item, periodType) {
  if (periodType === "all") return true;
  if (periodType === "month") return item.지출일자.startsWith($("#filterMonth").value);
  if (periodType === "week") {
    const week = parseWeekInput($("#filterWeek").value);
    return week && isDateBetween(item.지출일자, week.start, week.end);
  }
  if (periodType === "day") return item.지출일자 === $("#filterDay").value;
  if (periodType === "custom") return isDateBetween(item.지출일자, $("#filterStart").value || "0000-01-01", $("#filterEnd").value || "9999-12-31");
  return true;
}

function updatePeriodFields() {
  const type = $("#periodType").value;
  $$(".period-field").forEach((field) => field.classList.toggle("hidden", field.dataset.period !== type));
}

function clearFilters() {
  $("#periodType").value = "all";
  $("#filterType").value = "all";
  $("#filterWorkType").value = "all";
  $("#filterName").value = "";
  $("#filterMin").value = "";
  $("#filterMax").value = "";
  renderSearch();
}

function exportPdf() {
  const reportType = $("#reportType").value;
  const items = getReportItems(reportType);
  if (!items.length) {
    showToast("PDF로 출력할 내역이 없습니다.");
    return;
  }
  const period = getReportPeriodText(reportType);
  const currentSite = getCurrentSite();
  const siteName = currentSite === "all" ? "전체 현장" : ($("#reportSiteName").value.trim() || currentSite || items[0]?.현장명 || "");
  const writer = $("#reportWriter").value.trim() || items[0]?.작성자 || "";
  const totals = totalsByType(items);
  const rows = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.지출일자)}</td>
      <td>${escapeHtml(item.공종)}</td>
      <td>${escapeHtml(item.지출구분)}</td>
      <td>${escapeHtml(item.업체명성명)}</td>
      <td class="num">${formatNumber(item.금액_부가세제외, false)}</td>
      <td class="num">${formatNumber(item.부가세, false)}</td>
      <td class="num">${formatNumber(item.합계금액, false)}</td>
      <td>${escapeHtml(item.비고 || "")}</td>
    </tr>
  `).join("");
  const html = `
    <!doctype html>
    <html lang="ko">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(getReportTitle(reportType))}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { margin: 0; color: #111; font-family: "Malgun Gothic", Arial, sans-serif; font-size: 12px; }
        h1 { margin: 0 0 14px; text-align: center; font-size: 24px; }
        .meta, .summary { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #333; border-bottom: 0; }
        .meta div, .summary div { padding: 8px; border-right: 1px solid #333; border-bottom: 1px solid #333; }
        .meta div:nth-child(4n), .summary div:nth-child(4n) { border-right: 0; }
        .label { display: block; margin-bottom: 3px; color: #555; font-size: 10px; }
        table { width: 100%; margin-top: 14px; border-collapse: collapse; table-layout: fixed; }
        th, td { padding: 6px; border: 1px solid #333; word-break: break-word; }
        th { background: #e9eeee; }
        .num { text-align: right; }
        .footer { margin-top: 18px; text-align: right; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(getReportTitle(reportType))}</h1>
      <section class="meta">
        <div><span class="label">현장명</span>${escapeHtml(siteName)}</div>
        <div><span class="label">기간</span>${escapeHtml(period)}</div>
        <div><span class="label">작성일</span>${toDateInput(new Date())}</div>
        <div><span class="label">작성자</span>${escapeHtml(writer)}</div>
      </section>
      <section class="summary">
        <div><span class="label">노무비 합계</span>${won(totals["노무비"])}</div>
        <div><span class="label">외주비 합계</span>${won(totals["외주비"])}</div>
        <div><span class="label">자재비 합계</span>${won(totals["자재비"])}</div>
        <div><span class="label">경비 합계</span>${won(totals["경비"])}</div>
        <div><span class="label">전체 합계</span>${won(sum(items))}</div>
      </section>
      <table>
        <thead>
          <tr>
            <th style="width: 34px;">No</th>
            <th style="width: 78px;">지출일자</th>
            <th>공종</th>
            <th style="width: 58px;">구분</th>
            <th>업체명/성명</th>
            <th>공급가</th>
            <th>부가세</th>
            <th>합계</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">확인: ____________________</div>
      <script>window.addEventListener("load", () => { window.print(); });<\/script>
    </body>
    </html>
  `;
  const popup = window.open("", "_blank");
  if (!popup) {
    showToast("팝업 차단을 해제한 뒤 다시 출력해 주세요.");
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function getReportItems(type) {
  const active = getActiveExpenses();
  if (type === "all") return active;
  if (type === "month") return active.filter((item) => item.지출일자.startsWith($("#reportMonth").value));
  if (type === "week") {
    const week = parseWeekInput($("#reportWeek").value);
    return active.filter((item) => week && isDateBetween(item.지출일자, week.start, week.end));
  }
  if (type === "day") return active.filter((item) => item.지출일자 === $("#reportDay").value);
  if (type === "work") return active.filter((item) => $("#reportWorkType").value === "all" || item.공종 === $("#reportWorkType").value);
  if (type === "company") return active.filter((item) => item.지출구분 === "외주비" && includesText(item.업체명성명, $("#reportName").value.trim()));
  if (type === "person") return active.filter((item) => item.지출구분 === "노무비" && includesText(item.업체명성명, $("#reportName").value.trim()));
  return active;
}

async function syncFromServer(showMessage) {
  const apiUrl = getApiUrl();
  const selectedSite = getCurrentSite();
  if (!apiUrl) {
    if (showMessage) showToast("설정 탭에서 Apps Script URL을 입력해 주세요.");
    return;
  }
  try {
    const data = await requestServer("getData", {});
    if (data.expenses) state.expenses = normalizeExpenses(data.expenses);
    if (data.workTypes) state.workTypes = data.workTypes.map((item, index) => ({ name: item.공종명 || item.name, active: item.사용여부 || "Y", order: item.정렬순서 || index + 1, site: item.현장명 || item.site || "" }));
    if (data.partners) state.partners = data.partners.map((item) => ({ name: item.이름 || item.name, type: item.기본구분 || item.type, recent: item.최근사용일 || item.recent, count: item.사용횟수 || item.count || 0 }));
    if (data.sites) state.sites = data.sites.map((item, index) => ({ name: item.현장명 || item.name, active: item.사용여부 || "Y", order: item.정렬순서 || index + 1 }));
    normalizeWorkTypes();
    mergeSitesFromExpenses();
    persistLocal();
    if (selectedSite && activeSites().some((item) => item.name === selectedSite)) {
      setCurrentSite(selectedSite, false);
    }
    renderAll();
    if (showMessage) showToast(`${getCurrentSite()} 현장 자료를 불러왔습니다.`);
  } catch (error) {
    if (showMessage) showToast("동기화 실패: URL과 배포 권한을 확인해 주세요.");
  }
}

async function postToServer(action, payload) {
  if (!getApiUrl()) return;
  try {
    await requestServer(action, payload);
  } catch (error) {
    showToast("로컬 저장 완료. 서버 동기화는 실패했습니다.");
  }
}

async function requestServer(action, payload) {
  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      body: JSON.stringify({ action, payload }),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "server error");
    return data.data || {};
  } catch (error) {
    return requestServerJsonp(action, payload);
  }
}

function requestServerJsonp(action, payload) {
  return new Promise((resolve, reject) => {
    const callback = `siteExpenseCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(getApiUrl());
    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload || {}));
    url.searchParams.set("callback", callback);
    window[callback] = (data) => {
      delete window[callback];
      script.remove();
      if (!data.ok) {
        reject(new Error(data.message || "server error"));
        return;
      }
      resolve(data.data || {});
    };
    script.onerror = () => {
      delete window[callback];
      script.remove();
      reject(new Error("JSONP request failed"));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function addWorkType(name, fromSettings = false, silent = false) {
  const clean = (name || "").trim();
  const site = getCurrentSite();
  if (!clean) {
    if (!silent) showToast("공종명을 입력해 주세요.");
    return;
  }
  const existing = state.workTypes.find((item) => item.name === clean && workTypeSite(item) === site);
  let order;
  if (existing) {
    existing.active = "Y";
    existing.site = site;
    order = existing.order || nextWorkTypeOrder(site);
  } else {
    order = nextWorkTypeOrder(site);
    state.workTypes.push({ name: clean, active: "Y", order, site });
  }
  persistLocal();
  postToServer("saveWorkType", { 현장명: site, 공종명: clean, 사용여부: "Y", 정렬순서: order });
  if (fromSettings) $("#newWorkType").value = "";
  renderAll();
  $("#workType").value = clean;
  if (!silent) showToast("공종을 추가했습니다.");
}

async function deleteSelectedWorkType() {
  const name = $("#workType").value.trim();
  if (!name) {
    showToast("삭제할 공종을 먼저 선택하거나 입력해 주세요.");
    return;
  }
  await deleteWorkType(name);
}

async function deleteWorkType(name) {
  const clean = String(name || "").trim();
  const site = getCurrentSite();
  if (!clean) return;
  const usedCount = state.expenses.filter((item) => item.삭제여부 !== "Y" && item.현장명 === site && item.공종 === clean).length;
  const message = usedCount
    ? `"${clean}" 공종을 현재 현장 드롭박스에서 삭제할까요?\n지출DB ${usedCount}건은 삭제하지 않고 그대로 보관됩니다.`
    : `"${clean}" 공종을 현재 현장 드롭박스에서 삭제할까요?`;
  if (!confirm(message)) return;
  const found = state.workTypes.find((item) => item.name === clean && workTypeSite(item) === site);
  if (found) found.active = "N";
  $("#workType").value = "";
  persistLocal();
  renderAll();
  showToast("현재 현장 공종 목록에서 삭제했습니다.");
  await postToServer("deleteWorkType", { 현장명: site, 공종명: clean });
}

function addSite(name, fromSettings = false, silent = false) {
  const clean = (name || "").trim();
  if (!clean) {
    if (!silent) showToast("현장명을 입력해 주세요.");
    return;
  }
  const existing = state.sites.find((item) => item.name === clean);
  if (existing) {
    existing.active = "Y";
  } else {
    state.sites.push({ name: clean, active: "Y", order: state.sites.length + 1 });
  }
  persistLocal();
  postToServer("saveSite", { 현장명: clean, 사용여부: "Y", 정렬순서: state.sites.length });
  setCurrentSite(clean);
  renderAll();
  if (!silent) showToast("현장을 추가하고 선택했습니다.");
}

async function deleteSite(name) {
  const siteName = String(name || "").trim();
  if (!siteName) return;
  const usedCount = state.expenses.filter((item) => item.삭제여부 !== "Y" && item.현장명 === siteName).length;
  const message = usedCount
    ? `"${siteName}" 현장을 목록에서 삭제할까요?\n기존 지출 ${usedCount}건은 우선 보관됩니다.`
    : `"${siteName}" 현장을 목록에서 삭제할까요?`;
  if (!confirm(message)) return;
  const purgeData = usedCount
    ? confirm(`기존 지출DB도 삭제 처리할까요?\n확인: 해당 현장 지출까지 조회에서 제외\n취소: 현장 목록에서만 삭제`)
    : false;
  const found = state.sites.find((item) => item.name === siteName);
  if (found) found.active = "N";
  state.workTypes.filter((item) => workTypeSite(item) === siteName).forEach((item) => item.active = "N");
  if (purgeData) {
    state.expenses.filter((item) => item.현장명 === siteName).forEach((item) => {
      item.삭제여부 = "Y";
      item.수정일시 = new Date().toISOString();
    });
  }
  const current = getCurrentSite();
  if (current === siteName) {
    const nextSite = activeSites().find((item) => item.name !== siteName)?.name || "";
    setCurrentSite(nextSite, false);
  }
  persistLocal();
  renderAll();
  showToast(purgeData ? "현장과 기존 DB를 삭제 처리했습니다." : "현장 목록에서만 삭제했습니다. 기존 DB는 보관됩니다.");
  await postToServer("deleteSite", { 현장명: siteName, 삭제자료포함: purgeData });
}

function openWorkTypeAddPanel() {
  const current = $("#workType").value.trim();
  if (current && !activeWorkTypes().some((item) => item.name === current)) {
    addWorkType(current);
    closeWorkTypeAddPanel();
    return;
  }
  $("#quickNewWorkType").value = current;
  $("#workTypeAddPanel").hidden = false;
  $("#quickNewWorkType").focus();
}

function confirmQuickWorkType() {
  const name = $("#quickNewWorkType").value.trim();
  addWorkType(name);
  if (name) closeWorkTypeAddPanel();
}

function closeWorkTypeAddPanel() {
  $("#workTypeAddPanel").hidden = true;
  $("#quickNewWorkType").value = "";
}

function rememberPartner(name, type, date) {
  const clean = (name || "").trim();
  if (!clean) return;
  const found = state.partners.find((item) => item.name === clean);
  if (found) {
    found.type = found.type || type;
    found.recent = date;
    found.count = Number(found.count || 0) + 1;
  } else {
    state.partners.push({ name: clean, type, recent: date, count: 1 });
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.apiUrl, $("#apiUrl").value.trim());
  localStorage.setItem(STORAGE_KEYS.writer, $("#writer").value.trim());
  localStorage.setItem(STORAGE_KEYS.siteName, $("#siteName").value.trim());
  localStorage.setItem(STORAGE_KEYS.currentSite, getCurrentSite());
  showToast("설정을 저장했습니다.");
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(normalizeExpenses(state.expenses)));
  localStorage.setItem(STORAGE_KEYS.workTypes, JSON.stringify(state.workTypes));
  localStorage.setItem(STORAGE_KEYS.partners, JSON.stringify(state.partners));
  localStorage.setItem(STORAGE_KEYS.sites, JSON.stringify(state.sites));
}

function getActiveExpenses() {
  const site = getCurrentSite();
  return state.expenses
    .filter((item) => item.삭제여부 !== "Y")
    .filter((item) => site === "all" || item.현장명 === site)
    .sort((a, b) => String(b.지출일자).localeCompare(String(a.지출일자)) || String(b.입력일시).localeCompare(String(a.입력일시)));
}

function activeWorkTypes() {
  const site = getCurrentSite();
  return state.workTypes
    .filter((item) => item.active !== "N")
    .filter((item) => workTypeSite(item) === site)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
}

function activeSites() {
  return state.sites
    .filter((item) => item.active !== "N")
    .filter((item) => item.name !== "all" && item.name !== "전체 현장")
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
}

function getCurrentSite() {
  return $("#currentSiteMain").value || localStorage.getItem(STORAGE_KEYS.currentSite) || activeSites()[0]?.name || "";
}

function setCurrentSite(siteName, rerender = true) {
  const site = siteName === "all" || siteName === "전체 현장" ? activeSites()[0]?.name || "" : siteName || activeSites()[0]?.name || "";
  localStorage.setItem(STORAGE_KEYS.currentSite, site);
  if ($("#currentSiteMain")) $("#currentSiteMain").value = site;
  if (site !== "all") {
    $("#siteName").value = site;
    $("#reportSiteName").value = site;
    localStorage.setItem(STORAGE_KEYS.siteName, site);
  }
  if (rerender) renderAll();
}

function handleCurrentSiteMainChange() {
  const site = $("#currentSiteMain").value;
  setCurrentSite(site, false);
  if (site !== "all") {
    $("#siteName").value = site;
    $("#reportSiteName").value = site;
  }
  renderAll();
}

function deleteCurrentSite() {
  const site = getCurrentSite();
  if (!site) {
    showToast("삭제할 현장을 먼저 선택해 주세요.");
    return;
  }
  deleteSite(site);
}

function openSiteAddPanel() {
  $("#siteAddPanel").hidden = false;
  $("#quickNewSiteName").focus();
}

function confirmQuickSite() {
  const name = $("#quickNewSiteName").value.trim();
  addSite(name, false, false);
  if (name) closeSiteAddPanel();
}

function closeSiteAddPanel() {
  $("#siteAddPanel").hidden = true;
  $("#quickNewSiteName").value = "";
}

function handleSiteNameChange() {
  const site = $("#siteName").value.trim();
  localStorage.setItem(STORAGE_KEYS.siteName, site);
  if (site) addSite(site, false, true);
  if (site) setCurrentSite(site);
}

function mergeSitesFromExpenses() {
  state.expenses.forEach((item) => {
    const site = String(item.현장명 || "").trim();
    if (site && !state.sites.some((row) => row.name === site)) {
      state.sites.push({ name: site, active: "Y", order: state.sites.length + 1 });
    }
  });
}

function normalizeWorkTypes() {
  const fallbackSite = localStorage.getItem(STORAGE_KEYS.currentSite) || state.sites[0]?.name || DEFAULT_SITE_NAMES[0];
  state.workTypes = state.workTypes.map((item, index) => ({
    name: item.name || item.공종명 || "",
    active: item.active || item.사용여부 || "Y",
    order: item.order || item.정렬순서 || index + 1,
    site: item.site || item.현장명 || fallbackSite
  })).filter((item) => item.name);
}

function seedDefaultWorkTypesForSites() {
  const sites = activeSites().length ? activeSites() : DEFAULT_SITE_NAMES.map((name, index) => ({ name, active: "Y", order: index + 1 }));
  state.workTypes = sites.flatMap((site) => DEFAULT_WORK_TYPES.map((name, index) => ({
    name,
    active: "Y",
    order: index + 1,
    site: site.name
  })));
}

function workTypeSite(item) {
  return item.site || item.현장명 || localStorage.getItem(STORAGE_KEYS.currentSite) || activeSites()[0]?.name || "";
}

function nextWorkTypeOrder(site) {
  const orders = state.workTypes.filter((item) => workTypeSite(item) === site).map((item) => Number(item.order || 0));
  return Math.max(0, ...orders) + 1;
}

function findExpense(id) {
  return state.expenses.find((item) => item.id === id);
}

function totalsByType(items) {
  return EXPENSE_TYPES.reduce((acc, type) => {
    acc[type] = sum(items.filter((item) => item.지출구분 === type));
    return acc;
  }, {});
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.금액_부가세제외 || 0), 0);
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function renderGrouped(groups) {
  const keys = Object.keys(groups).sort();
  if (!keys.length) return `<p class="expense-meta">내역 없음</p>`;
  return keys.map((key) => `<p class="expense-meta">${escapeHtml(key)}: ${won(sum(groups[key]))}</p>`).join("");
}

function renderBreakdownLine(items) {
  const totals = totalsByType(items);
  return `<p class="expense-meta">노무비 ${won(totals["노무비"])} · 외주비 ${won(totals["외주비"])} · 자재비 ${won(totals["자재비"])} · 경비 ${won(totals["경비"])}</p>`;
}

function fillSelect(select, options, keepValue = true) {
  const previous = select.value;
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  if (keepValue && options.some(([value]) => value === previous)) select.value = previous;
}

function formatNumberInput(event) {
  const number = parseNumber(event.target.value);
  event.target.value = number ? formatNumber(number, false) : "";
}

function parseNumber(value) {
  return Number(String(value || "").replace(/[^\d]/g, ""));
}

function formatNumber(value, suffix = true) {
  const number = Number(value || 0);
  return number.toLocaleString("ko-KR") + (suffix ? "원" : "");
}

function won(value) {
  return formatNumber(value, true);
}

function toDateInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function normalizeSheetDate(value) {
  if (!value) return "";
  if (value instanceof Date) return toDateInput(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return toDateInput(parsed);
    return isoMatch[1];
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : toDateInput(parsed);
}

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  const start = new Date(d);
  start.setDate(d.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateInput(start), end: toDateInput(end) };
}

function getMondayWeekLabel(date) {
  const range = getWeekRange(date);
  return `${range.start}~${range.end}`;
}

function toWeekInput(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function parseWeekInput(value) {
  if (!value) return null;
  const [yearText, weekText] = value.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: toDateInput(monday), end: toDateInput(sunday) };
}

function isDateBetween(value, start, end) {
  return value >= start && value <= end;
}

function includesText(value, search) {
  return String(value || "").toLowerCase().includes(String(search || "").toLowerCase());
}

function createId() {
  return `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function getApiUrl() {
  return ($("#apiUrl").value || localStorage.getItem(STORAGE_KEYS.apiUrl) || GAS_WEB_APP_URL).trim();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function getReportTitle(type) {
  return {
    all: "전체 지출내역서",
    month: "월별 정산서",
    week: "주간 정산서",
    day: "일자별 지출내역서",
    work: "공종별 지출내역서",
    company: "업체별 정산서",
    person: "성명별 노무비 내역서"
  }[type] || "정산서";
}

function getReportPeriodText(type) {
  if (type === "month") return $("#reportMonth").value;
  if (type === "week") {
    const week = parseWeekInput($("#reportWeek").value);
    return week ? `${week.start} ~ ${week.end}` : "";
  }
  if (type === "day") return $("#reportDay").value;
  if (type === "work") return $("#reportWorkType").value;
  if (type === "company" || type === "person") return $("#reportName").value.trim() || "전체";
  return "전체";
}
