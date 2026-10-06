/**
 * OmniConvert Studio - Core Application Logic
 * Tab switching, toast notifications, clipboard shortcuts, health check
 */

// Global Toast System
window.showToast = function(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

// Global Format Bytes Helper
window.formatBytes = function(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation Tab Switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetTabId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    // 2. Backend Health Check
    fetch('/api/health')
        .then(res => res.json())
        .then(data => {
            const statusPill = document.getElementById('backendStatusPill');
            if (statusPill && data.status === 'online') {
                const text = statusPill.querySelector('.status-text');
                if (text) text.textContent = 'Motor Aktif';
            }
        })
        .catch(() => {
            const statusPill = document.getElementById('backendStatusPill');
            if (statusPill) {
                const dot = statusPill.querySelector('.status-dot');
                const text = statusPill.querySelector('.status-text');
                if (dot) dot.classList.remove('online');
                if (text) text.textContent = 'Çevrimdışı';
            }
        });

    // 3. Quick Paste from Clipboard
    const quickPasteBtn = document.getElementById('quickPasteBtn');
    if (quickPasteBtn) {
        quickPasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                    // Switch to social tab
                    document.getElementById('tabBtnSocial').click();
                    const input = document.getElementById('mediaUrlInput');
                    if (input) {
                        input.value = text.trim();
                        input.dispatchEvent(new Event('input'));
                        window.showToast('Bağlantı panodan yapıştırıldı!', 'success');
                        document.getElementById('fetchMediaBtn').click();
                    }
                } else {
                    window.showToast('Panoda geçerli bir web bağlantısı bulunamadı.', 'info');
                }
            } catch (err) {
                window.showToast('Panoya erişim izni verilmedi veya desteklenmiyor.', 'error');
            }
        });
    }

    // 4. Global Paste for Images
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let foundImage = false;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob && window.handleImageFiles) {
                    foundImage = true;
                    // Switch to image tab
                    document.getElementById('tabBtnImage').click();
                    window.handleImageFiles([blob]);
                    window.showToast('Görsel panodan aktarıldı!', 'success');
                }
            }
        }
    });
});
