// ─── State ────────────────────────────────────────────────────────────────────
let currentPage = 1;
let totalPages  = 1;
let logsInterval = null;
let ws = null;

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const icon = document.getElementById('theme-icon');
    if (theme === 'light') {
        // Moon icon for light mode
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    } else {
        // Sun icon for dark mode
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigateTo(pageId) {
    document.querySelectorAll('[id^="page-"]').forEach(el => el.style.display = 'none');
    const target = document.getElementById('page-' + pageId);
    if (target) target.style.display = '';

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.page === pageId);
    });

    if (pageId === 'history') {
        currentPage = 1;
        loadStats();
        loadHistory(1);
    }
    if (pageId === 'logs') {
        loadLogs();
        clearInterval(logsInterval);
        logsInterval = setInterval(loadLogs, 5000);
    } else {
        clearInterval(logsInterval);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Restore theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);

    // Tab navigation
    document.querySelectorAll('.tab[data-page]').forEach(tab => {
        tab.addEventListener('click', () => navigateTo(tab.dataset.page));
    });

    // Theme toggle
    document.getElementById('theme-btn').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // Account dropdown
    const accountBtn = document.getElementById('account-btn');
    const dropdown   = document.getElementById('account-dropdown');

    accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = dropdown.classList.toggle('open');
        accountBtn.classList.toggle('open', open);
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('open');
        accountBtn.classList.remove('open');
    });

    // Filters
    document.getElementById('filter-coin').addEventListener('change', () => {
        currentPage = 1; loadHistory(1);
    });
    document.getElementById('filter-action').addEventListener('change', () => {
        currentPage = 1; loadHistory(1);
    });

    // Pagination
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentPage > 1) loadHistory(currentPage - 1);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
        if (currentPage < totalPages) loadHistory(currentPage + 1);
    });

    // Boot
    updateDashboard();
    updateClock();
    setInterval(updateDashboard, 5000);
    setInterval(updateClock, 1000);
    connectWS();
});

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
}

// ─── Overview ─────────────────────────────────────────────────────────────────
async function updateDashboard() {
    try {
        const res = await fetch('/api/data');
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();

        // Balance
        const balEl = document.getElementById('balance-total');
        balEl.textContent = '';
        balEl.appendChild(document.createTextNode(data.balance.total.toFixed(2)));
        const unit = document.createElement('span');
        unit.className = 'unit';
        unit.textContent = 'USDT';
        balEl.appendChild(unit);

        document.getElementById('balance-free').textContent = data.balance.free.toFixed(2);
        document.getElementById('stats-total').textContent  = data.stats.total_signals;

        // Sync timestamp
        const syncEl = document.getElementById('feed-sync');
        if (syncEl) {
            const now = new Date();
            syncEl.textContent = 'updated ' + now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        }

        // Feed table
        const tbody = document.getElementById('signals-tbody');
        tbody.innerHTML = '';
        (data.latest_signals || []).forEach(sig => {
            const row  = document.createElement('tr');
            const date = new Date(sig.timestamp);
            const time = date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

            const cells = [
                ['td-time',   time],
                ['td-asset',  sig.coin],
                ['td-action ' + sig.action, sig.action],
                ['td-score',  sig.total_score],
                ['td-news',   sig.news_title],
            ];
            cells.forEach(([cls, val]) => {
                const td = document.createElement('td');
                td.className = cls;
                td.textContent = val;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('DASHBOARD_ERROR:', err);
        const st = document.getElementById('system-status');
        if (st) st.textContent = 'Offline';
    }
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory(page) {
    currentPage = page;
    const coin   = document.getElementById('filter-coin').value;
    const action = document.getElementById('filter-action').value;
    const params = new URLSearchParams({page, limit: 20});
    if (coin)   params.set('coin', coin);
    if (action) params.set('action', action);

    try {
        const res  = await fetch('/api/signals?' + params);
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        totalPages = data.pages || 1;

        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';

        if (!data.signals || data.signals.length === 0) {
            const row = document.createElement('tr');
            const td  = document.createElement('td');
            td.colSpan = 5;
            td.style.cssText = 'text-align:center;color:var(--text-3);padding:32px';
            td.textContent = 'No signals found';
            row.appendChild(td);
            tbody.appendChild(row);
        } else {
            data.signals.forEach(sig => {
                const row  = document.createElement('tr');
                const date = new Date(sig.timestamp);
                const ds   = date.toLocaleDateString([], {month:'short', day:'numeric'});
                const ts   = date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

                const result  = sig.result || null;
                const resCls  = result ? 'td-result ' + result : 'td-result pending';
                const resText = result || '—';
                const pnl     = sig.pnl_usdt != null ? sig.pnl_usdt : null;
                const pnlCls  = pnl == null ? 'td-pnl' : (pnl >= 0 ? 'td-pnl pos' : 'td-pnl neg');
                const pnlText = pnl == null ? '—' : (pnl >= 0 ? '+' + pnl.toFixed(2) : pnl.toFixed(2)) + ' $';

                const cells = [
                    ['td-time',                 ds + ' ' + ts],
                    ['td-asset',                sig.coin],
                    ['td-action ' + sig.action, sig.action],
                    ['td-score',                sig.total_score],
                    [resCls,                    resText],
                    [pnlCls,                    pnlText],
                    ['td-news',                 sig.news_title],
                ];
                cells.forEach(([cls, val]) => {
                    const td = document.createElement('td');
                    td.className = cls;
                    td.textContent = val;
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
        }

        document.getElementById('pagination-info').textContent = 'Page ' + currentPage + ' of ' + totalPages;
        document.getElementById('btn-prev').disabled = currentPage <= 1;
        document.getElementById('btn-next').disabled = currentPage >= totalPages;

    } catch (err) { console.error('HISTORY_ERROR:', err); }
}

async function loadStats() {
    try {
        const res  = await fetch('/api/stats');
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();

        document.getElementById('hist-total-trades').textContent = data.total_trades ?? '—';
        document.getElementById('hist-win-rate').textContent =
            data.win_rate != null ? data.win_rate.toFixed(1) + '%' : '—';
        document.getElementById('hist-long-count').textContent  = data.long_count  ?? '—';
        document.getElementById('hist-short-count').textContent = data.short_count ?? '—';

        const wlEl = document.getElementById('hist-wl');
        if (wlEl) wlEl.textContent = (data.winning_trades ?? 0) + ' W / ' + (data.losing_trades ?? 0) + ' L';

        const pnlEl = document.getElementById('hist-total-pnl');
        if (pnlEl && data.total_pnl != null) {
            const p = data.total_pnl;
            pnlEl.textContent = (p >= 0 ? '+' : '') + p.toFixed(2) + ' $';
            pnlEl.style.color = p >= 0 ? 'var(--long)' : 'var(--short)';
        }

    } catch (err) { console.error('STATS_ERROR:', err); }
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
async function loadLogs() {
    try {
        const res = await fetch('/api/logs');
        if (!res.ok) return;
        const data = await res.json();
        const el = document.getElementById('log-output');
        if (el && data.lines) {
            el.textContent = data.lines.join('\n');
            el.scrollTop = el.scrollHeight;
        }
    } catch (_) {}
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/ws');

    ws.addEventListener('message', e => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'update') {
                updateDashboard();
                if (document.getElementById('page-history').style.display !== 'none') {
                    loadHistory(currentPage);
                    loadStats();
                }
            }
        } catch (_) {}
    });

    ws.addEventListener('close', () => setTimeout(connectWS, 3000));
    ws.addEventListener('error', () => ws.close());
}
