/**
 * Main application logic for ArbitrageLab
 * Mirror copy of ODIN RESEARCH Arbitrage Screener & Backtester
 */

let currentView = "screener";
let currentCategory = "All";
let screenerRows = [];
let columnFilters = {};
let sortCol = "symbol";
let sortAsc = true;
let pairsList = [];
let selectedSymbol = "JP225";
let currentPairData = null;
let currentBacktestResult = null;
let currentTradePage = 1;
const TRADES_PER_PAGE = 15;
let fundingDisplayMode = "exchange"; // "exchange" or "net"

// =============================================================================
// Modern Toast Notification Popup System
// =============================================================================
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById("toast-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  },

  show(title, message, type = "info", duration = 3500) {
    if (!this.container) this.init();

    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === "warning") {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon-wrap">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close-btn" onclick="Toast.dismiss(this.parentElement)">&times;</button>
      <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    `;

    this.container.appendChild(toast);

    const timer = setTimeout(() => {
      this.dismiss(toast);
    }, duration);

    toast._timer = timer;
    return toast;
  },

  dismiss(toast) {
    if (!toast || toast.classList.contains("toast-hiding")) return;
    clearTimeout(toast._timer);
    toast.classList.add("toast-hiding");
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 280);
  },

  success(title, msg, dur) { return this.show(title, msg, "success", dur); },
  info(title, msg, dur) { return this.show(title, msg, "info", dur); },
  warning(title, msg, dur) { return this.show(title, msg, "warning", dur); },
  error(title, msg, dur) { return this.show(title, msg, "error", dur); }
};

// =============================================================================
// Smart Floating Financial Cell Detail Popover (Popup)
// =============================================================================
let popoverHideTimer = null;

function showCellPopover(event, symbol, type) {
  clearTimeout(popoverHideTimer);
  const popover = document.getElementById("cell-detail-popover");
  if (!popover) return;

  const row = screenerRows.find(r => r.symbol === symbol);
  if (!row) return;

  let headerType = "Metric Details";
  let contentHtml = "";

  if (type === "spread") {
    headerType = "Price & Spread Mechanics";
    const hlMid = row.hl_mid !== null ? row.hl_mid.toLocaleString() : "--";
    const mt5Mid = row.mt5_mid !== null ? row.mt5_mid.toLocaleString() : "--";
    const spreadStr = row.current_spread !== null ? `${row.current_spread > 0 ? "+" : ""}${row.current_spread.toFixed(2)}` : "--";
    const spreadPct = row.current_spread_pct !== null ? `${row.current_spread_pct > 0 ? "+" : ""}${row.current_spread_pct.toFixed(2)}%` : "--";
    const oracleMid = row.hl_oracle !== null ? row.hl_oracle.toLocaleString() : "--";
    const oracleSpread = row.oracle_spread !== null ? `${row.oracle_spread > 0 ? "+" : ""}${row.oracle_spread.toFixed(2)}` : "--";

    contentHtml = `
      <div class="popover-row">
        <span class="popover-label">HyperLiquid Mid</span>
        <span class="popover-val">${hlMid}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">MetaTrader 5 Mid</span>
        <span class="popover-val">${mt5Mid}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Current Spread (HL - MT5)</span>
        <span class="popover-val" style="color: ${row.current_spread > 0 ? '#10b981' : '#ef4444'};">${spreadStr}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Spread %</span>
        <span class="popover-val" style="color: ${row.current_spread_pct > 0 ? '#10b981' : '#ef4444'};">${spreadPct}</span>
      </div>
      <div class="popover-divider"></div>
      <div class="popover-row">
        <span class="popover-label">HyperLiquid Oracle</span>
        <span class="popover-val">${oracleMid}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Oracle Spread</span>
        <span class="popover-val">${oracleSpread}</span>
      </div>
    `;
  } else if (type === "funding") {
    headerType = fundingDisplayMode === "net" ? "Net Carry & Broker Swaps" : "Exchange Perpetual Funding";
    const fLong = `${row.ann_funding_long > 0 ? "+" : ""}${row.ann_funding_long.toFixed(2)}%`;
    const fShort = `${row.ann_funding_short > 0 ? "+" : ""}${row.ann_funding_short.toFixed(2)}%`;
    const swapLong = `${row.mt5_swap_long > 0 ? "+" : ""}${(row.mt5_swap_long || 0).toFixed(2)}%`;
    const swapShort = `${row.mt5_swap_short > 0 ? "+" : ""}${(row.mt5_swap_short || 0).toFixed(2)}%`;
    const netLong = `${row.net_carry_long > 0 ? "+" : ""}${(row.net_carry_long || 0).toFixed(2)}%`;
    const netShort = `${row.net_carry_short > 0 ? "+" : ""}${(row.net_carry_short || 0).toFixed(2)}%`;

    contentHtml = `
      <div class="popover-row">
        <span class="popover-label">HL Perp Funding (Long / Short)</span>
        <span class="popover-val">${fLong} / ${fShort}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">MT5 Broker Swaps (Long / Short)</span>
        <span class="popover-val">${swapLong} / ${swapShort}</span>
      </div>
      <div class="popover-divider"></div>
      <div class="popover-row">
        <span class="popover-label">Strategy 1: Long HL / Short MT5</span>
        <span class="popover-val" style="color: ${row.net_carry_long > 0 ? '#10b981' : '#ef4444'};">${netLong}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Strategy 2: Short HL / Long MT5</span>
        <span class="popover-val" style="color: ${row.net_carry_short > 0 ? '#10b981' : '#ef4444'};">${netShort}</span>
      </div>
      <div class="popover-rec-box">
        <strong>Recommendation:</strong> ${row.recommendation || 'No positive carry edge'}
      </div>
    `;
  } else if (type === "volume") {
    headerType = "Market Depth & Volume";
    const vol = formatCurrency(row.volume_24h_usd);
    const oi = formatCurrency(row.open_interest_usd);

    contentHtml = `
      <div class="popover-row">
        <span class="popover-label">HyperLiquid 24h Volume</span>
        <span class="popover-val" style="color: #38bdf8;">${vol}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Open Interest (USD)</span>
        <span class="popover-val">${oi}</span>
      </div>
      <div class="popover-row">
        <span class="popover-label">Execution Venue</span>
        <span class="popover-val">${row.hl_symbol} (Mainnet L1)</span>
      </div>
    `;
  }

  popover.innerHTML = `
    <div class="popover-header">
      <div class="popover-title-row">
        <span class="popover-symbol">${row.symbol}</span>
        <span class="popover-tag">${row.category || 'Asset'}</span>
      </div>
      <div class="popover-type">${headerType}</div>
    </div>
    <div class="popover-body">
      ${contentHtml}
    </div>
  `;

  popover.style.display = "block";
  positionPopover(event.clientX, event.clientY);
}

function positionPopover(x, y) {
  const popover = document.getElementById("cell-detail-popover");
  if (!popover || popover.style.display === "none") return;

  const width = 320;
  const height = popover.offsetHeight || 180;
  const padding = 15;

  let left = x + 16;
  let top = y + 16;

  // Viewport bounds check so popover never clips off screen
  if (left + width > window.innerWidth - padding) {
    left = x - width - 16;
  }
  if (top + height > window.innerHeight - padding) {
    top = window.innerHeight - height - padding;
  }
  if (top < padding) top = padding;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function hideCellPopover() {
  popoverHideTimer = setTimeout(() => {
    const popover = document.getElementById("cell-detail-popover");
    if (popover) popover.style.display = "none";
  }, 80);
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  checkVenueConnection();
  fetchPairsList();
  fetchScreenerData();

  // Always default to Arbitrage Screener on fresh load (clean any stale backtester hash)
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
  showView("screener");

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "pair-analysis") {
      showView("pair-analysis");
    } else {
      showView("screener");
    }
  });

  // Close searchable dropdown on click outside
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".searchable-select-wrap");
    if (wrap && !wrap.contains(e.target)) {
      const menu = document.getElementById("pair-dropdown-menu");
      if (menu) menu.classList.remove("open");
    }
  });

  // Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeVenueModal();
      closeTradeModal();
    }
  });

  // Auto-refresh screener every 15s in background & check connection every 30s
  setInterval(() => {
    if (currentView === "screener") {
      fetchScreenerData(true);
    }
  }, 15000);

  setInterval(() => {
    checkVenueConnection();
  }, 30000);
});

// View Navigation
function showView(viewName) {
  currentView = viewName;
  window.location.hash = viewName;
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

  if (viewName === "screener") {
    document.getElementById("view-screener").classList.add("active");
    document.getElementById("nav-screener").classList.add("active");
  } else if (viewName === "pair-analysis") {
    document.getElementById("view-pair-analysis").classList.add("active");
    document.getElementById("nav-pair-analysis").classList.add("active");
    if (selectedSymbol && !currentPairData) {
      loadSelectedPair();
    } else {
      setTimeout(() => {
        if (typeof resizeAllCharts === "function") resizeAllCharts();
      }, 50);
    }
  }
}

// -----------------------------------------------------------------------------
// Screener Functions (Image 1)
// -----------------------------------------------------------------------------

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll(".cat-tab").forEach(tab => {
    tab.classList.toggle("active", tab.innerText.includes(cat) || (cat === "Favorites" && tab.innerText.includes("Favorites")));
  });
  fetchScreenerData();
}

async function fetchScreenerData(isBackground = false, forceRefresh = false) {
  const refreshBtn = document.querySelector(".btn-refresh");
  if (refreshBtn && forceRefresh) {
    refreshBtn.classList.add("loading");
  }
  try {
    const url = `/api/screener?category=${encodeURIComponent(currentCategory)}${forceRefresh ? '&refresh=true' : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      screenerRows = json.data;
      renderScreenerTable();
      if (forceRefresh) {
        Toast.success("Screener Refreshed", `${screenerRows.length} pairs synced with HyperLiquid & MT5 live feeds`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch screener data:", err);
  } finally {
    if (refreshBtn) {
      setTimeout(() => refreshBtn.classList.remove("loading"), 300);
    }
  }
}

function formatCurrency(val) {
  if (val === null || val === undefined) return "--";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

function setFundingDisplayMode(mode) {
  const prevMode = fundingDisplayMode;
  fundingDisplayMode = mode;

  // Sync button active classes across both screener and pair analysis views
  const updateBtns = (containerId) => {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    cont.querySelectorAll(".mode-toggle-btn").forEach(btn => {
      const isNet = btn.id.toLowerCase().includes("net");
      btn.classList.toggle("active", mode === "net" ? isNet : !isNet);
    });
  };
  updateBtns("screener-mode-toggle");
  updateBtns("pair-mode-toggle");

  // Update screener table header text
  const thAnnFunding = document.getElementById("th-ann-funding");
  const thFundingArb = document.getElementById("th-funding-arb");
  if (thAnnFunding) {
    thAnnFunding.innerText = mode === "net" ? "⇅ Net Carry (Long / Short)" : "⇅ Ann. Funding (Long / Short)";
  }
  if (thFundingArb) {
    thFundingArb.innerText = mode === "net" ? "⇅ Net Carry Arbitrage" : "⇅ Funding Arbitrage";
  }

  // Refresh screener table
  renderScreenerTable();

  // Refresh Pair Analysis KPI ribbon if loaded
  if (currentPairData && currentPairData.metrics) {
    renderPairFundingKPIs(currentPairData.metrics);
  }

  if (prevMode !== mode) {
    if (mode === "net") {
      Toast.info("Net Carry Mode Active", "Arbitrage yields now factor in MT5 broker overnight financing swaps.");
    } else {
      Toast.info("Exchange Funding Active", "Arbitrage yields now show raw HyperLiquid perpetual funding rates.");
    }
  }
}

function renderPairFundingKPIs(m) {
  if (!m) return;
  const titleLS = document.getElementById("kpi-title-funding-ls");
  const titleArb = document.getElementById("kpi-title-funding-arb");
  const valLS = document.getElementById("kpi-funding-ls");
  const valArb = document.getElementById("kpi-funding-arb");
  const subArb = document.getElementById("kpi-funding-sub");

  if (fundingDisplayMode === "net") {
    if (titleLS) titleLS.innerText = "Net Carry (Long / Short)";
    if (titleArb) titleArb.innerText = "Net Carry Arbitrage";

    const netLong = m.net_carry_long !== undefined ? m.net_carry_long : (m.ann_funding_long + (m.mt5_swap_short || 0));
    const netShort = m.net_carry_short !== undefined ? m.net_carry_short : (m.ann_funding_short + (m.mt5_swap_long || 0));
    const netArb = m.net_carry_arbitrage !== undefined ? m.net_carry_arbitrage : Math.max(netLong, netShort);

    if (valLS) valLS.innerText = `${netLong > 0 ? "+" : ""}${netLong.toFixed(2)}% / ${netShort > 0 ? "+" : ""}${netShort.toFixed(2)}%`;
    if (valArb) {
      valArb.innerText = `${netArb > 0 ? "+" : ""}${netArb.toFixed(2)}%`;
      valArb.className = `kpi-value ${netArb > 0 ? "pos" : (netArb < 0 ? "neg" : "")}`;
    }
    if (subArb) {
      const swapInfo = `MT5 swaps: L ${m.mt5_swap_long > 0 ? "+" : ""}${(m.mt5_swap_long || 0).toFixed(2)}% / S ${m.mt5_swap_short > 0 ? "+" : ""}${(m.mt5_swap_short || 0).toFixed(2)}%`;
      subArb.innerText = `${m.recommendation || ''} (${swapInfo})`;
      subArb.style.display = "block";
    }
  } else {
    if (titleLS) titleLS.innerText = "Ann. Funding (Long / Short)";
    if (titleArb) titleArb.innerText = "Funding Arbitrage";

    const annLong = m.ann_funding_long !== undefined ? m.ann_funding_long : 0;
    const annShort = m.ann_funding_short !== undefined ? m.ann_funding_short : 0;
    const arbVal = m.funding_arbitrage !== undefined ? m.funding_arbitrage : (annShort > 0 ? annShort : annLong);

    if (valLS) valLS.innerText = `${annLong > 0 ? "+" : ""}${annLong.toFixed(2)}% / ${annShort > 0 ? "+" : ""}${annShort.toFixed(2)}%`;
    if (valArb) {
      valArb.innerText = `${arbVal > 0 ? "+" : ""}${arbVal.toFixed(2)}%`;
      valArb.className = `kpi-value ${arbVal > 0 ? "pos" : (arbVal < 0 ? "neg" : "")}`;
    }
    if (subArb) {
      subArb.innerText = "";
      subArb.style.display = "none";
    }
  }
}

function renderScreenerTable() {
  const tbody = document.getElementById("screener-tbody");
  tbody.innerHTML = "";

  const isNet = (fundingDisplayMode === "net");

  // Filter rows
  let filtered = screenerRows.filter(r => {
    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const filterStr = val.trim().toLowerCase();
      let targetKey = key;
      if (isNet) {
        if (key === "ann_funding") targetKey = "net_carry_long";
        if (key === "funding_arbitrage") targetKey = "net_carry_arbitrage";
      } else {
        if (key === "ann_funding") targetKey = "ann_funding_long";
      }

      if (filterStr.startsWith(">") || filterStr.startsWith("<")) {
        const op = filterStr[0];
        const targetVal = parseFloat(filterStr.slice(1).trim());
        const cellVal = parseFloat(r[targetKey]);
        if (!isNaN(targetVal) && !isNaN(cellVal)) {
          if (op === ">" && cellVal <= targetVal) return false;
          if (op === "<" && cellVal >= targetVal) return false;
        }
      } else {
        const cellStr = String(r[targetKey] || "").toLowerCase();
        if (!cellStr.includes(filterStr)) return false;
      }
    }
    return true;
  });

  // Sort rows
  filtered.sort((a, b) => {
    let effectiveSortCol = sortCol;
    if (isNet) {
      if (sortCol === "ann_funding_long") effectiveSortCol = "net_carry_long";
      if (sortCol === "funding_arbitrage") effectiveSortCol = "net_carry_arbitrage";
    }
    let va = a[effectiveSortCol];
    let vb = b[effectiveSortCol];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "string") {
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortAsc ? va - vb : vb - va;
  });

  filtered.forEach(r => {
    const tr = document.createElement("tr");

    const spreadClass = r.current_spread > 0 ? "pos" : (r.current_spread < 0 ? "neg" : "");
    const spreadPctClass = r.current_spread_pct > 0 ? "pos" : (r.current_spread_pct < 0 ? "neg" : "");
    const oracleClass = r.oracle_spread > 0 ? "pos" : (r.oracle_spread < 0 ? "neg" : "");

    const spdStr = r.current_spread !== null ? `${r.current_spread > 0 ? "+" : ""}${r.current_spread.toFixed(2)}` : "--";
    const spdPctStr = r.current_spread_pct !== null ? `${r.current_spread_pct > 0 ? "+" : ""}${r.current_spread_pct.toFixed(2)}%` : "--";
    const orcStr = r.oracle_spread !== null ? `${r.oracle_spread > 0 ? "+" : ""}${r.oracle_spread.toFixed(2)}` : "--";

    const fLong = isNet ? (r.net_carry_long !== undefined ? r.net_carry_long : r.ann_funding_long) : r.ann_funding_long;
    const fShort = isNet ? (r.net_carry_short !== undefined ? r.net_carry_short : r.ann_funding_short) : r.ann_funding_short;
    const fArb = isNet ? (r.net_carry_arbitrage !== undefined ? r.net_carry_arbitrage : r.funding_arbitrage) : r.funding_arbitrage;

    const fundingLSStr = `${fLong > 0 ? "+" : ""}${fLong.toFixed(2)}% / ${fShort > 0 ? "+" : ""}${fShort.toFixed(2)}%`;
    const fundingArbStr = `${fArb > 0 ? "+" : ""}${fArb.toFixed(2)}%`;
    const fundingArbClass = fArb > 0 ? "pos" : (fArb < 0 ? "neg" : "");
    const titleTooltip = isNet
      ? `title="MT5 Broker Swaps: Long ${(r.mt5_swap_long || 0).toFixed(2)}% / Short ${(r.mt5_swap_short || 0).toFixed(2)}% | ${r.recommendation || ''}"`
      : `title="HyperLiquid Raw Exchange Funding (Hourly annualized)"`;

    tr.innerHTML = `
      <td><span class="star-icon ${r.is_favorite ? 'active' : ''}" onclick="toggleFavorite('${r.symbol}')" title="Click to favorite">★</span></td>
      <td style="font-weight: 600; cursor: pointer;" onclick="openPairAnalysis('${r.symbol}')" onmouseenter="showCellPopover(event, '${r.symbol}', 'spread')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${r.symbol}</td>
      <td class="num-cell ${spreadClass}" onmouseenter="showCellPopover(event, '${r.symbol}', 'spread')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${spdStr}</td>
      <td class="num-cell ${spreadPctClass}" onmouseenter="showCellPopover(event, '${r.symbol}', 'spread')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${spdPctStr}</td>
      <td class="num-cell ${oracleClass}" onmouseenter="showCellPopover(event, '${r.symbol}', 'spread')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${orcStr}</td>
      <td class="num-cell" onmouseenter="showCellPopover(event, '${r.symbol}', 'funding')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${fundingLSStr}</td>
      <td class="num-cell ${fundingArbClass}" onmouseenter="showCellPopover(event, '${r.symbol}', 'funding')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${fundingArbStr}</td>
      <td class="num-cell" onmouseenter="showCellPopover(event, '${r.symbol}', 'volume')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${formatCurrency(r.volume_24h_usd)}</td>
      <td class="num-cell" onmouseenter="showCellPopover(event, '${r.symbol}', 'volume')" onmousemove="positionPopover(event.clientX, event.clientY)" onmouseleave="hideCellPopover()">${formatCurrency(r.open_interest_usd)}</td>
      <td style="text-align: right;">
        <button class="btn-view-details" onclick="openPairAnalysis('${r.symbol}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          View
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let filterDebounceTimer = null;

function applyFilters(column, value) {
  columnFilters[column] = value;
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    renderScreenerTable();
  }, 100);
}

function sortTable(column) {
  if (sortCol === column) {
    sortAsc = !sortAsc;
  } else {
    sortCol = column;
    sortAsc = false;
  }
  renderScreenerTable();
}

function toggleFavorite(symbol) {
  const row = screenerRows.find(r => r.symbol === symbol);
  if (row) {
    row.is_favorite = !row.is_favorite;
    renderScreenerTable();
    if (row.is_favorite) {
      Toast.success("Favorite Added", `${symbol} added to your Favorites watchlist`);
    } else {
      Toast.info("Favorite Removed", `${symbol} removed from Favorites`);
    }
  }
}

// -----------------------------------------------------------------------------
// Searchable Pair Select Dropdown (Image 2)
// -----------------------------------------------------------------------------

function togglePairDropdown() {
  const menu = document.getElementById("pair-dropdown-menu");
  menu.classList.toggle("open");
  if (menu.classList.contains("open")) {
    const input = document.getElementById("pair-search-input");
    input.value = "";
    filterPairDropdown("");
    setTimeout(() => input.focus(), 50);
  }
}

function handleDropdownKey(e) {
  if (e.key === "Escape") {
    const menu = document.getElementById("pair-dropdown-menu");
    if (menu) menu.classList.remove("open");
  } else if (e.key === "Enter") {
    const first = document.querySelector("#pair-options-container .dropdown-option");
    if (first) first.click();
  }
}

function filterPairDropdown(query) {
  const q = query.toLowerCase();
  const filtered = pairsList.filter(p => 
    p.label.toLowerCase().includes(q) || 
    p.symbol.toLowerCase().includes(q) ||
    p.hl_symbol.toLowerCase().includes(q) ||
    p.mt5_symbol.toLowerCase().includes(q)
  );
  renderDropdownOptions(filtered);
}

function renderDropdownOptions(pairs) {
  const container = document.getElementById("pair-options-container");
  container.innerHTML = "";
  if (pairs.length === 0) {
    container.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 11.5px; text-align: center;">No symbols found</div>`;
    return;
  }

  pairs.forEach(p => {
    const div = document.createElement("div");
    div.className = "dropdown-option";
    div.innerText = p.label;
    div.onclick = () => selectPair(p.symbol, p.label);
    container.appendChild(div);
  });
}

function selectPair(symbol, label) {
  selectedSymbol = symbol;
  document.getElementById("pair-selected-label").innerText = label;
  document.getElementById("pair-dropdown-menu").classList.remove("open");
  loadSelectedPair();
}

async function fetchPairsList() {
  try {
    const res = await fetch("/api/pairs");
    const json = await res.json();
    if (json.pairs) {
      pairsList = json.pairs;
      renderDropdownOptions(pairsList);

      const defaultPair = pairsList.find(p => p.symbol === "JP225") || pairsList[0];
      if (defaultPair) {
        selectedSymbol = defaultPair.symbol;
        document.getElementById("pair-selected-label").innerText = defaultPair.label;
      }
    }
  } catch (err) {
    console.error("Failed to load pairs list:", err);
  }
}

function openPairAnalysis(symbol) {
  selectedSymbol = symbol;
  const p = pairsList.find(x => x.symbol === symbol);
  if (p) {
    document.getElementById("pair-selected-label").innerText = p.label;
  }
  showView("pair-analysis");
  loadSelectedPair();
  Toast.info("Pair Analysis", `Loaded historical spread & backtest charts for ${symbol}`, 2200);
}

const RELOAD_BTN_DEFAULT_HTML = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M23 4v6h-6"></path>
    <path d="M1 20v-6h6"></path>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
  Reload
`;

const RUN_BACKTEST_DEFAULT_HTML = `▶ Run Backtest`;

let currentPairLoadReqId = 0;

// -----------------------------------------------------------------------------
// Pair Analysis Loader & Renderer (Images 2, 3, 4, 5)
// -----------------------------------------------------------------------------

async function loadSelectedPair(forceRefresh = false) {
  if (!selectedSymbol) return;

  const reqId = ++currentPairLoadReqId;
  const reloadBtn = document.getElementById("btn-reload-pair");
  if (reloadBtn) {
    reloadBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spinner-svg">
        <path d="M23 4v6h-6"></path>
        <path d="M1 20v-6h6"></path>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      Loading...
    `;
    reloadBtn.style.opacity = "0.75";
    reloadBtn.disabled = true;
  }

  const tf = document.getElementById("timeframe-select").value;
  const lookback = document.getElementById("lookback-select").value;

  try {
    const res = await fetch(`/api/pair-analysis?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${tf}&lookback_hours=${lookback}${forceRefresh ? '&refresh=true' : ''}`);
    const json = await res.json();
    
    // Ignore outdated responses if another setting was picked
    if (reqId !== currentPairLoadReqId) return;
    if (!json.success) return;

    currentPairData = json;
    const p = json.pair;
    const m = json.metrics;
    const s = json.stats;
    const c = json.chart_data;

    // Header title with feed status badge
    const badgeHtml = json.data_source === "AUTONOMOUS_ORACLE" 
      ? ` <span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; font-weight: 500; margin-left: 8px;">● Oracle Benchmark</span>`
      : (json.data_source === "MT5_REMOTE"
        ? ` <span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(34, 197, 94, 0.12); color: #22c55e; font-weight: 500; margin-left: 8px;">● MT5 Synced</span>`
        : ` <span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(34, 197, 94, 0.12); color: #22c55e; font-weight: 500; margin-left: 8px;">● MT5 Live</span>`);
    document.getElementById("pair-analysis-header").innerHTML = `${p.symbol} — ${p.hl_symbol} vs ${p.mt5_symbol}${badgeHtml}`;

    // KPI ribbon (horizontal strip)
    const spdStr = m.current_spread !== null ? `${m.current_spread > 0 ? "+" : ""}${m.current_spread.toFixed(2)}` : "--";
    const spdPctStr = m.current_spread_pct !== null ? `${m.current_spread_pct > 0 ? "+" : ""}${m.current_spread_pct.toFixed(2)}%` : "--";
    const orcStr = m.oracle_spread !== null ? `${m.oracle_spread > 0 ? "+" : ""}${m.oracle_spread.toFixed(2)}` : "--";

    const kpiSpreadEl = document.getElementById("kpi-spread");
    kpiSpreadEl.innerText = spdStr;
    kpiSpreadEl.className = `kpi-value ${m.current_spread > 0 ? "pos" : (m.current_spread < 0 ? "neg" : "")}`;

    const kpiSpreadPctEl = document.getElementById("kpi-spread-pct");
    kpiSpreadPctEl.innerText = spdPctStr;
    kpiSpreadPctEl.className = `kpi-value ${m.current_spread_pct > 0 ? "pos" : (m.current_spread_pct < 0 ? "neg" : "")}`;

    const kpiOracleEl = document.getElementById("kpi-oracle-spread");
    kpiOracleEl.innerText = orcStr;
    kpiOracleEl.className = `kpi-value ${m.oracle_spread > 0 ? "pos" : (m.oracle_spread < 0 ? "neg" : "")}`;

    // Render Ann. Funding or Net Carry based on active toggle
    renderPairFundingKPIs(m);

    document.getElementById("kpi-volume").innerText = formatCurrency(m.volume_24h_usd);
    document.getElementById("kpi-oi").innerText = formatCurrency(m.open_interest_usd);

    // Chart titles matching Image 3
    const refLabel = json.data_source === "AUTONOMOUS_ORACLE" ? `${p.mt5_symbol} (Benchmark)` : p.mt5_symbol;
    document.getElementById("chart-1-title").innerText = `${p.hl_symbol} vs ${refLabel} — close price`;
    document.getElementById("chart-2-title").innerText = `Spread: ${p.hl_symbol} — ${refLabel}`;
    document.getElementById("chart-3-title").innerText = `Oracle basis: ${p.hl_symbol} oracle basis (${tf}, recent window)`;

    // Aligned bars footer text: "5,423 aligned 1m bars | 2024-10-07 13:17 -> 2024-10-12 10:24 UTC"
    const startTimeStr = c.times[0] ? c.times[0].replace("T", " ").slice(0, 16) : "";
    const endTimeStr = c.times[c.count - 1] ? c.times[c.count - 1].replace("T", " ").slice(0, 16) : "";
    const sourceTag = json.data_source === "AUTONOMOUS_ORACLE" ? " (Oracle Benchmark)" : (json.data_source === "MT5_REMOTE" ? " (MT5 Synced)" : "");
    let infoText = `${c.count.toLocaleString()} aligned ${tf} bars | ${startTimeStr} -> ${endTimeStr} UTC${sourceTag}`;
    
    const lbSelect = document.getElementById("lookback-select");
    const lbHours = parseInt(lbSelect ? lbSelect.value : "48");
    const lbLabel = lbSelect ? lbSelect.options[lbSelect.selectedIndex].text : "";
    if (tf === "1m" && lbHours > 72 && c.count > 0) {
      infoText += ` • (Note: Exchange retains max ~5,000 1m candles [~3.5 days]. For full ${lbLabel} view, select 15m or 1h timeframe)`;
    }
    document.getElementById("aligned-bars-info").innerText = infoText;

    // Render 3 Charts (using high-performance Plotly)
    renderClosePricesChart("chart-close-prices", c.times, c.hl_close, c.mt5_close, p.hl_symbol, p.mt5_symbol);
    renderSpreadChart("chart-spread", c.times, c.spread, s);
    renderOracleBasisChart("chart-oracle-basis", c.times, c.oracle_basis);

    // Update Statistical Summary Table below Chart 2
    document.getElementById("stat-std").innerText = s.std !== undefined ? s.std.toFixed(4) : "--";
    document.getElementById("stat-mean").innerText = s.mean !== undefined ? s.mean.toFixed(4) : "--";
    document.getElementById("stat-u-1s-plus").innerText = s.u_plus_1s !== undefined ? s.u_plus_1s.toFixed(4) : "--";
    document.getElementById("stat-u-1s").innerText = s.u_minus_1s !== undefined ? s.u_minus_1s.toFixed(4) : "--";
    document.getElementById("stat-u-2s-plus").innerText = s.u_plus_2s !== undefined ? s.u_plus_2s.toFixed(4) : "--";
    document.getElementById("stat-u-2s-minus").innerText = s.u_minus_2s !== undefined ? s.u_minus_2s.toFixed(4) : "--";

    // Immediately restore reload button so user sees graphs and table without delay!
    reloadBtn.innerHTML = origBtnContent;
    reloadBtn.style.opacity = "1";
    reloadBtn.disabled = false;

    // Auto-populate default spread entry/exit levels for the updated window
    if (s.std > 0) {
      const buyEnt = s.mean - (1.0 * s.std);
      const buyEx = s.mean;
      const sellEnt = s.mean + (1.0 * s.std);
      const sellEx = s.mean;

      const formatLevel = (val) => {
        const absStd = Math.abs(s.std);
        if (absStd < 0.005) return Number(val.toFixed(6));
        if (absStd < 0.1) return Number(val.toFixed(4));
        if (absStd < 10.0) return Number(val.toFixed(2));
        return Math.round(val);
      };

      let bEnt = formatLevel(buyEnt);
      let bEx = formatLevel(buyEx);
      let sEnt = formatLevel(sellEnt);
      let sEx = formatLevel(sellEx);

      // Guard against precision collapse
      if (bEnt >= bEx) {
        bEnt = Number(buyEnt.toFixed(6));
        bEx = Number(buyEx.toFixed(6));
      }
      if (sEnt <= sEx) {
        sEnt = Number(sellEnt.toFixed(6));
        sEx = Number(sellEx.toFixed(6));
      }

      document.getElementById("bt-buy-entry").value = bEnt;
      document.getElementById("bt-buy-exit").value = bEx;
      document.getElementById("bt-sell-entry").value = sEnt;
      document.getElementById("bt-sell-exit").value = sEx;
    }

    // Do NOT run backtest automatically.
    // Timeframe and Lookback changes only load the 3 graphs.
    // Backtest runs ONLY when the user clicks 'Run Backtest'.
    resetBacktestState();

  } catch (err) {
    console.error("Failed to load pair analysis:", err);
  } finally {
    if (reloadBtn && reqId === currentPairLoadReqId) {
      reloadBtn.innerHTML = RELOAD_BTN_DEFAULT_HTML;
      reloadBtn.style.opacity = "1";
      reloadBtn.disabled = false;
    }
  }
}

// -----------------------------------------------------------------------------
// Backtester Functions (Image 5)
// -----------------------------------------------------------------------------

function resetBacktestState() {
  currentBacktestResult = null;
  const badge = document.getElementById("bt-status-badge");
  if (badge) {
    badge.innerHTML = `<span class="bt-summary-stats-text" style="color: var(--text-muted); font-style: italic;">Click "▶ Run Backtest" to simulate strategy</span>`;
  }
  const kpiIds = ["bt-kpi-trades", "bt-kpi-winrate", "bt-kpi-gross", "bt-kpi-comm", "bt-kpi-avg", "bt-kpi-dd"];
  kpiIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = "--";
  });
  const winrateSubEl = document.getElementById("bt-kpi-winrate-sub");
  if (winrateSubEl) winrateSubEl.innerText = "";

  const eqChart = document.getElementById("chart-equity-curve");
  if (eqChart && window.Plotly) {
    Plotly.purge(eqChart);
  }
  const stChart = document.getElementById("chart-spread-trades");
  if (stChart && window.Plotly) {
    Plotly.purge(stChart);
  }

  const tbody = document.getElementById("bt-trades-tbody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 22px;">Click "▶ Run Backtest" to simulate trades for the current window.</td></tr>`;
  }
  const pageInfo = document.getElementById("bt-page-info");
  if (pageInfo) pageInfo.innerText = "0 / 0";
}

async function applyCostEstimation() {
  const hlFeePct = parseFloat(document.getElementById("cost-hl-fee").value) || 0.01;
  const mt5Spread = parseFloat(document.getElementById("cost-mt5-spread").value) || 0.0;
  const mt5Fee = parseFloat(document.getElementById("cost-mt5-fee").value) || 0.0;
  const refPrice = parseFloat(document.getElementById("cost-ref-price").value) || 1.0;

  try {
    const res = await fetch("/api/cost-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hl_fee_pct: hlFeePct,
        reference_price: refPrice,
        mt5_avg_spread: mt5Spread,
        mt5_fee: mt5Fee
      })
    });
    const json = await res.json();
    if (json.success) {
      const d = json.data;
      // Exact formula format matching Image 5:
      // "Estimated cost / side = 4.5848 = HL fee 2.5848 + MT5 spread 2.0000 + MT5 fee 0.0000"
      document.getElementById("cost-formula-display").innerText = 
        `Estimated cost / side = ${d.total_cost_per_side.toFixed(4)} = HL fee ${d.hl_fee_cost.toFixed(4)} + MT5 spread ${d.mt5_half_spread.toFixed(4)} + MT5 fee ${d.mt5_fee.toFixed(4)}`;
      document.getElementById("bt-cost-side").value = d.total_cost_per_side.toFixed(4);
      Toast.success("Friction Applied", `Applied ${d.total_cost_per_side.toFixed(4)} spread units to Cost/side`);
    }
  } catch (err) {
    console.error("Cost estimation error:", err);
  }
}

async function runBacktest() {
  if (!selectedSymbol) return;

  const btn = document.querySelector(".btn-run-backtest");
  const origText = btn ? btn.innerHTML : "▶ Run Backtest";
  if (btn) {
    btn.innerHTML = `<svg class="spinner-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle></svg> Running...`;
    btn.disabled = true;
    btn.style.opacity = "0.75";
    btn.classList.add("running");
  }

  const tf = document.getElementById("timeframe-select").value;
  const lookback = parseInt(document.getElementById("lookback-select").value);

  const buyEntry = parseFloat(document.getElementById("bt-buy-entry").value);
  const buyExit = parseFloat(document.getElementById("bt-buy-exit").value);
  const sellEntry = parseFloat(document.getElementById("bt-sell-entry").value);
  const sellExit = parseFloat(document.getElementById("bt-sell-exit").value);
  const costSide = parseFloat(document.getElementById("bt-cost-side").value) || 0.0;

  try {
    const res = await fetch("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: selectedSymbol,
        timeframe: tf,
        lookback_hours: lookback,
        buy_entry: isNaN(buyEntry) ? null : buyEntry,
        buy_exit: isNaN(buyExit) ? null : buyExit,
        sell_entry: isNaN(sellEntry) ? null : sellEntry,
        sell_exit: isNaN(sellExit) ? null : sellExit,
        cost_per_side: costSide
      })
    });

    const json = await res.json();
    if (!json.success) {
      const badge = document.getElementById("bt-status-badge");
      if (badge) {
        badge.innerHTML = `<span class="badge-status badge-unprofitable" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444;">${json.error || 'Backtest failed'}</span>`;
      }
      document.querySelectorAll("#bt-buy-entry, #bt-buy-exit, #bt-sell-entry, #bt-sell-exit").forEach(inp => {
        inp.classList.add("input-shake");
        setTimeout(() => inp.classList.remove("input-shake"), 500);
      });
      Toast.error("Parameter Error", json.error || "Invalid entry/exit thresholds.");
      return;
    }

    currentBacktestResult = json;
    const s = json.summary;

    // Outcome Banner matching Image 5:
    // Green/Red pill + "285 trades | net +7204.0000 spread units (after +0.0000 commission)"
    const badge = document.getElementById("bt-status-badge");
    const netSign = s.net_pnl > 0 ? "+" : "";
    const commSign = s.total_commission >= 0 ? "+" : "";

    if (s.total_trades === 0) {
      badge.innerHTML = `
        <span class="badge-status" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155;">No trades</span>
        <span class="bt-summary-stats-text">0 trades triggered for specified threshold levels</span>
      `;
      Toast.info("Backtest Completed", "0 trades triggered for specified threshold levels.");
    } else if (s.is_profitable) {
      badge.innerHTML = `
        <span class="badge-status badge-profitable">Profitable</span>
        <span class="bt-summary-stats-text">${s.total_trades} trades | net ${netSign}${s.net_pnl.toFixed(4)} spread units (after ${commSign}${s.total_commission.toFixed(4)} commission)</span>
      `;
      Toast.success("Strategy Profitable", `${s.total_trades} trades executed • Net ${netSign}${s.net_pnl.toFixed(2)} spread units (${s.win_rate_pct}% win rate)`);
    } else {
      badge.innerHTML = `
        <span class="badge-status badge-unprofitable">Unprofitable</span>
        <span class="bt-summary-stats-text">${s.total_trades} trades | net ${netSign}${s.net_pnl.toFixed(4)} spread units (after ${commSign}${s.total_commission.toFixed(4)} commission)</span>
      `;
      Toast.warning("Strategy Unprofitable", `${s.total_trades} trades executed • Net ${s.net_pnl.toFixed(2)} spread units (costs exceeded edge)`);
    }

    // 6 Backtest KPI Cards matching Image 5
    document.getElementById("bt-kpi-trades").innerText = s.total_trades;

    // Win Rate with detail "(142 won / 143 lost / 0 fl)"
    document.getElementById("bt-kpi-winrate").innerText = `+${s.win_rate_pct.toFixed(1)}%`;
    const winrateSubEl = document.getElementById("bt-kpi-winrate-sub");
    if (winrateSubEl) {
      winrateSubEl.innerText = s.win_rate_detail || "";
    }

    // Return on Spread
    document.getElementById("bt-kpi-gross").innerText = s.gross_pnl !== undefined ? `${s.gross_pnl > 0 ? "+" : ""}${s.gross_pnl.toFixed(4)}` : "n/a (no limit units)";
    
    // Commission
    document.getElementById("bt-kpi-comm").innerText = `-${s.total_commission.toFixed(4)}`;

    // Avg / Trade
    document.getElementById("bt-kpi-avg").innerText = `${s.avg_trade_pnl > 0 ? "+" : ""}${s.avg_trade_pnl.toFixed(4)}`;

    // Max Drawdown
    document.getElementById("bt-kpi-dd").innerText = s.max_drawdown.toFixed(4);

    // Render Equity Curve Chart
    renderEquityCurveChart("chart-equity-curve", json.equity_curve);

    // Render Spread with Trades Chart (all 4 markers & levels)
    if (currentPairData && currentPairData.chart_data) {
      const c = currentPairData.chart_data;
      renderSpreadWithTradesChart(
        "chart-spread-trades",
        c.times,
        c.spread,
        { buy_entry: buyEntry, buy_exit: buyExit, sell_entry: sellEntry, sell_exit: sellExit },
        json.trades
      );
    }

    // Render Trades Table
    currentTradePage = 1;
    renderTradesTable();

  } catch (err) {
    console.error("Backtest execution failed:", err);
  } finally {
    if (btn) {
      btn.innerHTML = RUN_BACKTEST_DEFAULT_HTML;
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.classList.remove("running");
    }
  }
}

function renderTradesTable() {
  if (!currentBacktestResult || !currentBacktestResult.trades) return;
  const trades = currentBacktestResult.trades;
  const tbody = document.getElementById("bt-trades-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (trades.length === 0) {
    document.getElementById("bt-page-info").innerText = "0 / 0";
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 18px;">No trades triggered for the specified threshold levels.</td></tr>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(trades.length / TRADES_PER_PAGE));
  document.getElementById("bt-page-info").innerText = `${currentTradePage} / ${totalPages}`;

  const startIdx = (currentTradePage - 1) * TRADES_PER_PAGE;
  const pageTrades = trades.slice(startIdx, startIdx + TRADES_PER_PAGE);

  pageTrades.forEach(t => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.setAttribute("onclick", `openTradeModal(${t.trade_num})`);
    tr.setAttribute("title", "Click to inspect trade execution details");
    const netClass = t.net > 0 ? "pos" : (t.net < 0 ? "neg" : "");
    const grossClass = t.gross > 0 ? "pos" : (t.gross < 0 ? "neg" : "");
    const openTag = t.is_open ? "*" : "";

    const entryTimeStr = t.entry_time_display || t.entry_time;
    const exitTimeStr = t.exit_time_display || t.exit_time;

    tr.innerHTML = `
      <td>${t.trade_num}${openTag}</td>
      <td style="font-weight: 600; color: ${t.side === 'Long' ? '#10b981' : '#ef4444'};">${t.side}</td>
      <td class="num-cell">${entryTimeStr}</td>
      <td class="num-cell">${exitTimeStr}</td>
      <td class="num-cell">${t.entry_price > 0 ? "+" : ""}${t.entry_price.toFixed(4)}</td>
      <td class="num-cell">${t.exit_price > 0 ? "+" : ""}${t.exit_price.toFixed(4)}</td>
      <td class="num-cell ${grossClass}">${t.gross > 0 ? "+" : ""}${t.gross.toFixed(4)}</td>
      <td class="num-cell">-${t.commission.toFixed(4)}</td>
      <td class="num-cell ${netClass}">${t.net > 0 ? "+" : ""}${t.net.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function changeTradePage(delta) {
  if (!currentBacktestResult || !currentBacktestResult.trades) return;
  const totalPages = Math.ceil(currentBacktestResult.trades.length / TRADES_PER_PAGE);
  const newPage = currentTradePage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentTradePage = newPage;
    renderTradesTable();
  }
}

// -----------------------------------------------------------------------------
// Interactive Trade Details Popup Modal
// -----------------------------------------------------------------------------
function openTradeModal(tradeNum) {
  if (!currentBacktestResult || !currentBacktestResult.trades) return;
  const trade = currentBacktestResult.trades.find(t => t.trade_num === tradeNum);
  if (!trade) return;

  const backdrop = document.getElementById("trade-modal-backdrop");
  if (!backdrop) return;

  // Title and badges
  document.getElementById("modal-trade-title").innerText = `Trade #${trade.trade_num} Execution Details`;

  const sideTag = document.getElementById("modal-side-tag");
  sideTag.innerText = trade.side.toUpperCase();
  sideTag.className = `modal-side-tag ${trade.side === "Long" ? "tag-long" : "tag-short"}`;

  const statusTag = document.getElementById("modal-status-tag");
  if (trade.is_open) {
    statusTag.innerText = "OPEN (MARK-TO-MARKET)";
    statusTag.className = "modal-status-tag open-pos";
  } else {
    statusTag.innerText = "CLOSED";
    statusTag.className = "modal-status-tag";
  }

  // Net PnL Callout
  const netEl = document.getElementById("modal-net-pnl");
  netEl.innerText = `${trade.net > 0 ? "+" : ""}${trade.net.toFixed(4)}`;
  netEl.className = `modal-pnl-main ${trade.net > 0 ? "pos" : (trade.net < 0 ? "neg" : "")}`;

  // Breakdown chips
  const grossEl = document.getElementById("modal-gross-pnl");
  grossEl.innerText = `${trade.gross > 0 ? "+" : ""}${trade.gross.toFixed(4)}`;
  grossEl.className = `chip-val ${trade.gross > 0 ? "pos" : (trade.gross < 0 ? "neg" : "")}`;

  const commEl = document.getElementById("modal-friction-cost");
  commEl.innerText = `-${trade.commission.toFixed(4)}`;

  // Grid items
  document.getElementById("modal-entry-time").innerText = trade.entry_time_display || trade.entry_time || "--";
  document.getElementById("modal-exit-time").innerText = trade.exit_time_display || trade.exit_time || "--";
  document.getElementById("modal-entry-px").innerText = `${trade.entry_price > 0 ? "+" : ""}${trade.entry_price.toFixed(4)}`;
  document.getElementById("modal-exit-px").innerText = `${trade.exit_price > 0 ? "+" : ""}${trade.exit_price.toFixed(4)}`;

  // Holding duration calculation
  let durationStr = "--";
  try {
    const t0 = new Date(trade.entry_time).getTime();
    const t1 = new Date(trade.exit_time).getTime();
    if (!isNaN(t0) && !isNaN(t1)) {
      const diffSec = Math.max(0, Math.floor((t1 - t0) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      if (hours > 0) {
        durationStr = `${hours}h ${mins}m`;
      } else {
        durationStr = `${mins}m`;
      }
    }
  } catch (e) {
    durationStr = "--";
  }
  document.getElementById("modal-duration").innerText = durationStr;

  const levelInfo = `Static Mean-Reversion (${trade.side})`;
  document.getElementById("modal-level-info").innerText = levelInfo;

  // Spread execution pathway
  document.getElementById("modal-path-entry").innerText = `${trade.entry_price > 0 ? "+" : ""}${trade.entry_price.toFixed(4)}`;
  document.getElementById("modal-path-exit").innerText = `${trade.exit_price > 0 ? "+" : ""}${trade.exit_price.toFixed(4)}`;

  const delta = trade.side === "Long" ? (trade.exit_price - trade.entry_price) : (trade.entry_price - trade.exit_price);
  const deltaEl = document.getElementById("modal-path-delta");
  deltaEl.innerText = `${delta > 0 ? "+" : ""}${delta.toFixed(4)} pts`;
  deltaEl.className = `mpath-val ${delta > 0 ? "pos" : (delta < 0 ? "neg" : "")}`;

  backdrop.classList.remove("closing");
  backdrop.classList.add("open");
}

function closeTradeModal(e) {
  if (e && e.target && e.target.id !== "trade-modal-backdrop" && !e.target.closest(".modal-close-btn") && !e.target.classList.contains("btn-refresh")) {
    return;
  }
  const backdrop = document.getElementById("trade-modal-backdrop");
  if (backdrop) {
    backdrop.classList.add("closing");
    setTimeout(() => {
      backdrop.classList.remove("open", "closing");
    }, 220);
  }
}

// ---------------------------------------------------------------------------
// Venue Connections & Client Setup Modal
// ---------------------------------------------------------------------------
let connectionData = null;

async function checkVenueConnection() {
  try {
    const res = await fetch("/api/connection-status");
    if (!res.ok) return;
    const data = await res.json();
    connectionData = data;

    const dot = document.getElementById("conn-pill-dot");
    const text = document.getElementById("conn-pill-text");

    if (data.mt5 && data.mt5.connected) {
      if (dot) dot.className = "status-dot connected";
      if (text) {
        const srv = data.mt5.account ? data.mt5.account.server : "Active Terminal";
        text.innerText = `MT5: Connected (${srv})`;
      }
    } else if (data.mode === "remote_mt5") {
      if (dot) dot.className = "status-dot connected";
      if (text) text.innerText = "Live Remote MT5 Stream";
    } else {
      // Cloud Autonomous Mode: HyperLiquid Perps vs. Spot Oracle
      if (dot) dot.className = "status-dot connected";
      if (text) text.innerText = "Live Cloud Feed: HL & Spot Oracle";
    }
  } catch (e) {
    console.error("Failed to check connection status:", e);
  }
}

async function openVenueModal() {
  const modal = document.getElementById("venue-modal");
  if (!modal) return;
  modal.classList.remove("closing");
  modal.classList.add("open");

  const content = document.getElementById("venue-modal-content");
  content.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);"><svg class="spinner-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle></svg> Loading connection details...</div>`;

  await checkVenueConnection();
  renderVenueModalContent();
}

function closeVenueModal() {
  const modal = document.getElementById("venue-modal");
  if (!modal) return;
  modal.classList.add("closing");
  setTimeout(() => {
    modal.classList.remove("open", "closing");
  }, 220);
}

function renderVenueModalContent() {
  const content = document.getElementById("venue-modal-content");
  if (!content) return;

  const mt5 = connectionData && connectionData.mt5 ? connectionData.mt5 : null;
  const hl = connectionData && connectionData.hyperliquid ? connectionData.hyperliquid : null;
  const mt5Acc = mt5 && mt5.account ? mt5.account : null;
  const mt5Connected = mt5 && mt5.connected;

  let mt5Badge = "";
  let mt5DetailsHtml = "";

  if (mt5Connected && mt5Acc) {
    mt5Badge = `<span class="modal-badge-connected">● CONNECTED (LOCAL DESKTOP)</span>`;
    mt5DetailsHtml = `
      <div class="modal-grid">
        <div><span class="modal-field-label">Broker Server:</span> <span class="modal-field-value">${mt5Acc.server || "N/A"}</span></div>
        <div><span class="modal-field-label">Account Number:</span> <span class="modal-field-value">${mt5Acc.login || "N/A"}</span></div>
        <div><span class="modal-field-label">Account Currency:</span> <span class="modal-field-value">${mt5Acc.currency || "USD"}</span></div>
        <div><span class="modal-field-label">Leverage:</span> <span class="modal-field-value">1:${mt5Acc.leverage || "N/A"}</span></div>
        <div><span class="modal-field-label">Account Balance:</span> <span class="modal-field-value">$${Number(mt5Acc.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
        <div><span class="modal-field-label">Account Equity:</span> <span class="modal-field-value">$${Number(mt5Acc.equity || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      </div>
    `;
  } else if (connectionData && connectionData.mode === "remote_mt5") {
    mt5Badge = `<span class="modal-badge-connected">● CONNECTED (REMOTE STREAM)</span>`;
    mt5DetailsHtml = `
      <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">
        Receiving continuous live broker quotes and historical bars streamed from a remote MT5 publisher agent.
      </div>
    `;
  } else {
    mt5Badge = `<span class="modal-badge-connected" style="background:rgba(56,189,248,0.15); color:#38bdf8; border-color:rgba(56,189,248,0.3);">● CLOUD ORACLE MODE ACTIVE</span>`;
    mt5DetailsHtml = `
      <div style="font-size:12px; color:var(--text-muted); line-height:1.6; margin-bottom:8px;">
        <strong style="color:var(--text-main);">Zero Local Setup Required:</strong> The cloud screener and backtester are actively driven by institutional Pyth & Chainlink spot oracle feeds. Spreads represent true Perpetual Basis (HyperLiquid Perp vs. Cash Spot Index).
      </div>
      <div style="font-size:11px; color:#94a3b8; background:rgba(30,41,59,0.7); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
        💡 <strong>Want to connect your private broker?</strong> Download the client package (<code style="color:#38bdf8;">1.zip</code>) and launch <code style="color:#38bdf8;">start.bat</code> on your PC, or run <code style="color:#38bdf8;">python publish_agent.py --cloud-url [Render URL]</code>.
      </div>
    `;
  }

  const hlBadge = `<span class="modal-badge-connected">● CONNECTED (MAINNET L1)</span>`;

  content.innerHTML = `
    <!-- Venue 1: HyperLiquid -->
    <div class="modal-venue-card">
      <div class="modal-venue-header">
        <div class="modal-venue-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          HyperLiquid L1 Perp Engine
        </div>
        ${hlBadge}
      </div>
      <div class="modal-grid" style="margin-bottom:12px;">
        <div><span class="modal-field-label">API Endpoint:</span> <span class="modal-field-value">api.hyperliquid.xyz/info</span></div>
        <div><span class="modal-field-label">Builder DEX:</span> <span class="modal-field-value">xyz (TradFi Perps)</span></div>
        <div><span class="modal-field-label">Universe Pairs:</span> <span class="modal-field-value">137 Active Perpetual Markets</span></div>
        <div><span class="modal-field-label">Data Ingestion:</span> <span class="modal-field-value">Real-Time WebSocket & REST</span></div>
      </div>
    </div>

    <!-- Venue 2: Spot Oracle & MT5 -->
    <div class="modal-venue-card" style="margin-top:16px;">
      <div class="modal-venue-header">
        <div class="modal-venue-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          TradFi Spot Benchmark & MetaTrader 5
        </div>
        ${mt5Badge}
      </div>
      ${mt5DetailsHtml}
    </div>
  `;
}


