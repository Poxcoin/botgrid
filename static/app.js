// ─── State ────────────────────────────────────────────────────────────────────
let currentPage = 1;
let totalPages = 1;
let ws = null;

// ─── SPA Navigation ──────────────────────────────────────────────────────────
const PAGE_TITLES = {
    overview: 'Market Overview',
    history:  'Trading History',
    keys:     'Exchange Keys',
    logs:     'System Logs',
};

function navigateTo(pageId) {
    // Hide all pages
    document.querySelectorAll('[id^="page-"]').forEach(el => {
        el.style.display = 'none';
    });

    // Show target page
    const target = document.getElementById('page-' + pageId);
    if (target) target.style.display = '';

    // Update sidebar active state
    document.querySelectorAll('.sidebar-links li').forEach(li => {
        li.classList.toggle('active', li.dataset.page === pageId);
    });

    // Update header title
    document.getElementById('page-title').textContent = PAGE_TITLES[pageId] || pageId;

    // Page-specific init
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

document.addEventListener('DOMContentLoaded', () => {
    // Attach sidebar click handlers
    document.querySelectorAll('.sidebar-links a[data-page]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    // Attach filter change handlers
    document.getElementById('filter-coin').addEventListener('change', () => {
        currentPage = 1;
        loadHistory(1);
    });
    document.getElementById('filter-action').addEventListener('change', () => {
        currentPage = 1;
        loadHistory(1);
    });

    // Pagination buttons
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentPage > 1) loadHistory(currentPage - 1);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
        if (currentPage < totalPages) loadHistory(currentPage + 1);
    });

    // Boot
    updateDashboard();
    updateClock();
    connectWS();
});

// ─── Overview ────────────────────────────────────────────────────────────────
async function updateDashboard() {
    try {
        const response = await fetch('/api/data');
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        const data = await response.json();

        document.getElementById('balance-total').innerHTML =
            `${data.balance.total.toFixed(2)} <span class="dim">USDT</span>`;
        document.getElementById('balance-free').innerText = data.balance.free.toFixed(2);
        document.getElementById('stats-total').innerText = data.stats.total_signals;

        const tbody = document.getElementById('signals-tbody');
        tbody.innerHTML = '';
        data.latest_signals.forEach(sig => {
            const row = document.createElement('tr');
            const date = new Date(sig.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            row.innerHTML = `
                <td>${timeStr}</td>
                <td class="asset-badge">${sig.coin}</td>
                <td><span class="action-label action-${sig.action}">${sig.action}</span></td>
                <td class="score-text">${sig.total_score}</td>
                <td class="analysis-text">${sig.news_title}</td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('DASHBOARD_SYNC_ERROR:', error);
        document.getElementById('system-status').innerText = 'Reconnecting...';
        document.getElementById('system-status').style.color = 'var(--short)';
    }
}

function updateClock() {
    document.getElementById('clock').innerText = new Date().toLocaleTimeString();
}

setInterval(updateDashboard, 5000);
setInterval(updateClock, 1000);

// ─── Trading History ─────────────────────────────────────────────────────────
async function loadHistory(page) {
    currentPage = page;

    const coin   = document.getElementById('filter-coin').value;
    const action = document.getElementById('filter-action').value;

    const params = new URLSearchParams({ page, limit: 20 });
    if (coin)   params.set('coin', coin);
    if (action) params.set('action', action);

    try {
        const res  = await fetch(`/api/signals?${params}`);
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }
        const data = await res.json();

        totalPages = data.pages || 1;

        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';

        if (!data.signals || data.signals.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-mid); padding:32px">No signals found</td></tr>`;
        } else {
            data.signals.forEach(sig => {
                const row = document.createElement('tr');
                const date = new Date(sig.timestamp);
                const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                row.innerHTML = `
                    <td style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--text-mid)">${dateStr} ${timeStr}</td>
                    <td class="asset-badge">${sig.coin}</td>
                    <td><span class="action-label action-${sig.action}">${sig.action}</span></td>
                    <td class="score-text">${sig.total_score}</td>
                    <td class="analysis-text">${sig.news_title}</td>
                `;
                tbody.appendChild(row);
            });
        }

        // Update pagination
        document.getElementById('pagination-info').textContent =
            `Page ${currentPage} of ${totalPages}`;
        document.getElementById('btn-prev').disabled = currentPage <= 1;
        document.getElementById('btn-next').disabled = currentPage >= totalPages;

    } catch (error) {
        console.error('HISTORY_LOAD_ERROR:', error);
    }
}

async function loadStats() {
    try {
        const res  = await fetch('/api/stats');
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }
        const data = await res.json();

        document.getElementById('hist-total-trades').textContent = data.total_trades ?? '—';
        document.getElementById('hist-win-rate').textContent =
            data.win_rate != null ? data.win_rate.toFixed(1) + '%' : '—';
        document.getElementById('hist-long-count').textContent  = data.long_count  ?? '—';
        document.getElementById('hist-short-count').textContent = data.short_count ?? '—';

        const winEl  = document.querySelector('#hist-win-rate').closest('.summary-card').querySelector('.sub-value');
        if (winEl) winEl.textContent = `${data.winning_trades ?? 0} W / ${data.losing_trades ?? 0} L`;

    } catch (error) {
        console.error('STATS_LOAD_ERROR:', error);
    }
}

// ─── System Logs ─────────────────────────────────────────────────────────────
let logsInterval = null;

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

// ─── WebSocket ───────────────────────────────────────────────────────────────
function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url   = `${proto}://${location.host}/ws`;

    ws = new WebSocket(url);

    ws.addEventListener('message', e => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'update') {
                // Refresh overview always; refresh history only if visible
                updateDashboard();
                if (document.getElementById('page-history').style.display !== 'none') {
                    loadHistory(currentPage);
                    loadStats();
                }
            }
        } catch (_) {}
    });

    ws.addEventListener('close', () => {
        // Reconnect after 3 s
        setTimeout(connectWS, 3000);
    });

    ws.addEventListener('error', () => {
        ws.close();
    });
}
