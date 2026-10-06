/**
 * OmniConvert Studio - Image Converter Engine
 * PNG to JPG, WEBP, SVG, BMP, ICO with Quality & Scale Controls + Batch ZIP
 */

document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('imageDropzone');
    const fileInput = document.getElementById('imageFileInput');
    const targetFormatSelect = document.getElementById('targetFormatSelect');
    const qualitySlider = document.getElementById('imageQualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const scaleSelect = document.getElementById('scaleSelect');
    const bgColorPicker = document.getElementById('bgColorPicker');
    const bgColorHex = document.getElementById('bgColorHex');
    const bgColorControlGroup = document.getElementById('bgColorControlGroup');

    const actionsBar = document.getElementById('converterActionsBar');
    const filesCountBadge = document.getElementById('filesCountBadge');
    const totalSavingsBadge = document.getElementById('totalSavingsBadge');
    const convertAllBtn = document.getElementById('convertAllBtn');
    const downloadAllZipBtn = document.getElementById('downloadAllZipBtn');
    const clearAllBtn = document.getElementById('clearAllImagesBtn');
    const queueList = document.getElementById('imageQueueList');

    // State
    let fileQueue = []; // array of { id, file, name, size, type, convertedBlob, convertedSize, status, thumbUrl }

    // Quality slider update
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = `${qualitySlider.value}%`;
    });

    // Color picker label update
    bgColorPicker.addEventListener('input', () => {
        bgColorHex.textContent = bgColorPicker.value.toUpperCase();
    });

    // Show/hide background color based on target format
    targetFormatSelect.addEventListener('change', () => {
        const fmt = targetFormatSelect.value;
        if (fmt === 'jpeg' || fmt === 'bmp') {
            bgColorControlGroup.style.display = 'flex';
        } else {
            bgColorControlGroup.style.display = 'none';
        }
    });

    // Dropzone Events
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.name.endsWith('.svg'));
        if (files.length > 0) {
            handleImageFiles(files);
        }
    });

    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            handleImageFiles(files);
            fileInput.value = '';
        }
    });

    // Global file handler (also called from clipboard paste)
    window.handleImageFiles = function(files) {
        files.forEach(file => {
            const id = 'img_' + Math.random().toString(36).substr(2, 9);
            const thumbUrl = URL.createObjectURL(file);

            fileQueue.push({
                id,
                file,
                name: file.name || 'clipboard_image.png',
                size: file.size,
                type: file.type,
                convertedBlob: null,
                convertedSize: 0,
                status: 'waiting',
                thumbUrl
            });
        });

        renderQueue();
        window.showToast(`${files.length} görsel listeye eklendi.`, 'info');
    };

    // Render Queue
    function renderQueue() {
        queueList.innerHTML = '';
        const count = fileQueue.length;

        if (count === 0) {
            actionsBar.style.display = 'none';
            return;
        }

        actionsBar.style.display = 'flex';
        filesCountBadge.textContent = `${count} Görsel Seçildi`;

        // Check if any are converted
        const convertedCount = fileQueue.filter(f => f.status === 'done').length;
        if (convertedCount > 0) {
            downloadAllZipBtn.style.display = 'inline-flex';
            
            // Calculate total savings
            let origSum = 0;
            let convSum = 0;
            fileQueue.forEach(item => {
                if (item.status === 'done') {
                    origSum += item.size;
                    convSum += item.convertedSize;
                }
            });

            if (origSum > 0 && convSum > 0) {
                const diff = origSum - convSum;
                const pct = Math.round((diff / origSum) * 100);
                if (pct > 0) {
                    totalSavingsBadge.textContent = `Toplam Tasarruf: -%${pct} (${window.formatBytes(diff)})`;
                    totalSavingsBadge.style.display = 'inline-block';
                } else {
                    totalSavingsBadge.style.display = 'none';
                }
            }
        } else {
            downloadAllZipBtn.style.display = 'none';
            totalSavingsBadge.style.display = 'none';
        }

        fileQueue.forEach(item => {
            const card = document.createElement('div');
            card.className = 'queue-item-card';
            card.id = `card_${item.id}`;

            let statusHtml = '<span class="queue-status-tag status-waiting">Bekliyor</span>';
            if (item.status === 'converting') {
                statusHtml = '<span class="queue-status-tag status-converting">Dönüştürülüyor...</span>';
            } else if (item.status === 'done') {
                const diffPct = Math.round(((item.size - item.convertedSize) / item.size) * 100);
                const badgeColor = diffPct >= 0 ? '#10b981' : '#f59e0b';
                const sign = diffPct >= 0 ? '-' : '+';
                statusHtml = `
                    <span class="queue-status-tag status-done">Hazır (${window.formatBytes(item.convertedSize)})</span>
                    <span style="font-size: 0.72rem; color: ${badgeColor}; font-weight: 700;">${sign}%${Math.abs(diffPct)}</span>
                `;
            }

            card.innerHTML = `
                <div class="queue-file-info">
                    <img src="${item.thumbUrl}" alt="Önizleme" class="queue-thumb">
                    <div class="queue-meta">
                        <div class="queue-name" title="${item.name}">${item.name}</div>
                        <div class="queue-subtext">
                            <span>${window.formatBytes(item.size)}</span>
                            <span>•</span>
                            ${statusHtml}
                        </div>
                    </div>
                </div>

                <div class="queue-actions">
                    ${item.status === 'done' ? `
                        <button class="btn-success btn-sm download-single-btn" data-id="${item.id}" title="İndir">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            <span>İndir</span>
                        </button>
                    ` : `
                        <button class="btn-primary btn-sm convert-single-btn" data-id="${item.id}">Dönüştür</button>
                    `}
                    <button class="btn-secondary btn-sm remove-single-btn" data-id="${item.id}" title="Kaldır">✕</button>
                </div>
            `;

            queueList.appendChild(card);
        });

        // Attach action handlers
        document.querySelectorAll('.convert-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const target = fileQueue.find(f => f.id === id);
                if (target) convertSingleFile(target);
            });
        });

        document.querySelectorAll('.download-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const target = fileQueue.find(f => f.id === id);
                if (target && target.convertedBlob) {
                    downloadBlob(target.convertedBlob, target.outputName);
                }
            });
        });

        document.querySelectorAll('.remove-single-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                fileQueue = fileQueue.filter(f => f.id !== id);
                renderQueue();
            });
        });
    }

    // Helper: Trigger blob download in browser
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // Single File Conversion (Client-side Canvas + Server-side Pillow Fallback)
    async function convertSingleFile(item) {
        item.status = 'converting';
        renderQueue();

        const targetFmt = targetFormatSelect.value; // jpeg, png, webp, bmp, ico
        const quality = parseInt(qualitySlider.value, 10) / 100;
        const scale = parseFloat(scaleSelect.value);
        const bgColor = bgColorPicker.value;

        const baseName = item.name.replace(/\.[^/.]+$/, '');
        const ext = targetFmt === 'jpeg' ? 'jpg' : targetFmt;
        item.outputName = `${baseName}_converted.${ext}`;

        try {
            // Attempt 1: Fast in-browser Canvas 2D
            if (['jpeg', 'png', 'webp'].includes(targetFmt)) {
                const blob = await convertViaCanvas(item.file, targetFmt, quality, scale, bgColor);
                item.convertedBlob = blob;
                item.convertedSize = blob.size;
                item.status = 'done';
            } else {
                // For BMP, ICO or other formats -> send to server Pillow endpoint
                const blob = await convertViaServer(item.file, targetFmt, qualitySlider.value, scale, bgColor);
                item.convertedBlob = blob;
                item.convertedSize = blob.size;
                item.status = 'done';
            }
        } catch (err) {
            console.warn('Canvas conversion failed, falling back to server Pillow:', err);
            try {
                const blob = await convertViaServer(item.file, targetFmt, qualitySlider.value, scale, bgColor);
                item.convertedBlob = blob;
                item.convertedSize = blob.size;
                item.status = 'done';
            } catch (serverErr) {
                console.error('All conversion methods failed:', serverErr);
                item.status = 'waiting';
                window.showToast(`${item.name} dönüştürülürken hata oluştu.`, 'error');
            }
        }

        renderQueue();
    }

    // In-Browser HTML5 Canvas Converter (High performance & 100% offline)
    function convertViaCanvas(file, targetFmt, quality, scale, bgColor) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    try {
                        const targetW = Math.max(1, Math.round(img.width * scale));
                        const targetH = Math.max(1, Math.round(img.height * scale));

                        const canvas = document.createElement('canvas');
                        canvas.width = targetW;
                        canvas.height = targetH;
                        const ctx = canvas.getContext('2d');

                        // Fill background if JPEG
                        if (targetFmt === 'jpeg') {
                            ctx.fillStyle = bgColor || '#FFFFFF';
                            ctx.fillRect(0, 0, targetW, targetH);
                        }

                        ctx.drawImage(img, 0, 0, targetW, targetH);

                        const mime = `image/${targetFmt}`;
                        canvas.toBlob((blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error('Canvas toBlob returned null'));
                        }, mime, quality);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Server-side Pillow Converter Fallback
    async function convertViaServer(file, targetFmt, quality, scale, bgColor) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('target_format', targetFmt.toUpperCase());
        formData.append('quality', quality);
        formData.append('scale', scale);
        formData.append('bg_color', bgColor);

        const res = await fetch('/api/convert-image', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
        }

        return await res.blob();
    }

    // Convert All Action
    convertAllBtn.addEventListener('click', async () => {
        const waitingItems = fileQueue.filter(f => f.status === 'waiting');
        if (waitingItems.length === 0) {
            window.showToast('Dönüştürülecek yeni görsel bulunamadı.', 'info');
            return;
        }

        convertAllBtn.disabled = true;
        convertAllBtn.innerHTML = `<span class="spinner"></span> <span>Dönüştürülüyor...</span>`;

        for (let item of waitingItems) {
            await convertSingleFile(item);
        }

        convertAllBtn.disabled = false;
        convertAllBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Tümünü Dönüştür</span>
        `;
        window.showToast('Tüm görseller başarıyla dönüştürüldü!', 'success');
    });

    // Batch Download All as ZIP (using JSZip)
    downloadAllZipBtn.addEventListener('click', async () => {
        const doneItems = fileQueue.filter(f => f.status === 'done' && f.convertedBlob);
        if (doneItems.length === 0) return;

        if (typeof JSZip === 'undefined') {
            window.showToast('JSZip kütüphanesi yükleniyor, lütfen bekleyin...', 'info');
            return;
        }

        downloadAllZipBtn.disabled = true;
        downloadAllZipBtn.innerHTML = `<span class="spinner"></span> <span>ZIP Paketleniyor...</span>`;

        try {
            const zip = new JSZip();
            doneItems.forEach((item, index) => {
                // Ensure unique filenames
                const name = item.outputName || `image_${index + 1}.jpg`;
                zip.file(name, item.convertedBlob);
            });

            const zipContent = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipContent, 'OmniConvert_Gorseller.zip');
            window.showToast('Tüm dönüştürülen görseller ZIP olarak indirildi!', 'success');
        } catch (err) {
            console.error('ZIP creation error:', err);
            window.showToast('ZIP arşivi oluşturulurken hata meydana geldi.', 'error');
        } finally {
            downloadAllZipBtn.disabled = false;
            downloadAllZipBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Tümünü İndir (ZIP)</span>
            `;
        }
    });

    // Clear All Action
    clearAllBtn.addEventListener('click', () => {
        fileQueue = [];
        renderQueue();
        window.showToast('Görsel listesi temizlendi.', 'info');
    });
});
