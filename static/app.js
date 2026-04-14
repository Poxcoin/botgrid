async function updateDashboard() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        // 1. Update Metrics
        document.getElementById('balance-total').innerHTML = `
            ${data.balance.total.toFixed(2)} <span class="dim">USDT</span>
        `;
        document.getElementById('balance-free').innerText = data.balance.free.toFixed(2);
        document.getElementById('stats-total').innerText = data.stats.total_signals;

        // 2. Update Table
        const tbody = document.getElementById('signals-tbody');
        tbody.innerHTML = '';

        data.latest_signals.forEach(sig => {
            const row = document.createElement('tr');
            
            const date = new Date(sig.timestamp);
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
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
        console.error("DASHBOARD_SYNC_ERROR:", error);
        document.getElementById('system-status').innerText = 'Reconnecting...';
        document.getElementById('system-status').style.color = 'var(--short)';
    }
}

function updateClock() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString();
}

setInterval(updateDashboard, 5000);
setInterval(updateClock, 1000);

document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
    updateClock();
});
