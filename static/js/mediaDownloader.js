/**
 * OmniConvert Studio - Media Downloader Logic
 * Instagram Reels, Posts, YouTube Videos & Shorts with Advanced Quality Selection
 */

document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('mediaUrlInput');
    const clearBtn = document.getElementById('clearUrlBtn');
    const fetchBtn = document.getElementById('fetchMediaBtn');
    const resultArea = document.getElementById('mediaResultArea');
    const platformIcon = document.getElementById('detectedPlatformIcon');

    // Quality preference pills
    const preferredQualityPills = document.querySelectorAll('#preferredQualityGroup .q-pill');
    let preferredQuality = 'auto'; // 'auto', '1080p', '720p', '480p', '360p', 'audio'
    let currentFilter = 'all';

    // Result elements
    const mediaThumb = document.getElementById('mediaThumbnail');
    const platformTag = document.getElementById('mediaPlatformTag');
    const durationTag = document.getElementById('mediaDurationTag');
    const mediaTitle = document.getElementById('mediaTitle');
    const authorName = document.getElementById('mediaAuthorName');
    const formatButtonsGrid = document.getElementById('formatButtonsGrid');
    const mirrorLinksList = document.getElementById('mirrorLinksList');
    const togglePlayerBtn = document.getElementById('toggleInlinePlayerBtn');
    const inlinePlayerBox = document.getElementById('inlinePlayerBox');
    const resultQualityFilter = document.getElementById('resultQualityFilter');

    // Demo buttons
    const demoIgBtn = document.getElementById('demoIgBtn');
    const demoYtBtn = document.getElementById('demoYtBtn');

    let currentMediaData = null;
    let isPlayerOpen = false;

    // Quality preference selection
    preferredQualityPills.forEach(pill => {
        pill.addEventListener('click', () => {
            preferredQualityPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            preferredQuality = pill.getAttribute('data-q') || 'auto';
            
            // If results are already rendered, update the filter
            if (currentMediaData) {
                if (preferredQuality === 'auto') {
                    setResultFilter('all');
                } else if (preferredQuality === 'audio') {
                    setResultFilter('audio');
                } else if (preferredQuality === '1080p') {
                    setResultFilter('1080p');
                } else if (preferredQuality === '720p') {
                    setResultFilter('720p');
                } else {
                    setResultFilter('sd');
                }
            }
        });
    });

    // Helper: detect platform from input
    function detectPlatform(url) {
        url = url.toLowerCase();
        if (url.includes('instagram.com')) return 'instagram';
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
        if (url.includes('tiktok.com')) return 'tiktok';
        if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
        return 'generic';
    }

    // Update input icon and clear button based on text
    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        clearBtn.style.display = val ? 'block' : 'none';
        
        const platform = detectPlatform(val);
        if (platform === 'instagram') {
            platformIcon.innerHTML = `<span style="color: #ec4899; font-weight: 700;">IG</span>`;
        } else if (platform === 'youtube') {
            platformIcon.innerHTML = `<span style="color: #ef4444; font-weight: 700;">YT</span>`;
        } else if (platform === 'tiktok') {
            platformIcon.innerHTML = `<span style="color: #06b6d4; font-weight: 700;">TT</span>`;
        } else {
            platformIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
        }
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.style.display = 'none';
        resultArea.style.display = 'none';
        urlInput.focus();
    });

    // Enter key submits
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });

    // Demo link triggers
    if (demoIgBtn) {
        demoIgBtn.addEventListener('click', () => {
            urlInput.value = 'https://www.instagram.com/reel/C-gqjZpvi2g/';
            urlInput.dispatchEvent(new Event('input'));
            fetchBtn.click();
        });
    }

    if (demoYtBtn) {
        demoYtBtn.addEventListener('click', () => {
            urlInput.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            urlInput.dispatchEvent(new Event('input'));
            fetchBtn.click();
        });
    }

    // Fetch Media Info Action
    fetchBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            window.showToast('Lütfen geçerli bir Instagram Reels veya YouTube linki girin.', 'error');
            urlInput.focus();
            return;
        }

        // Show loading state
        const btnText = fetchBtn.querySelector('.btn-text');
        const spinner = fetchBtn.querySelector('.spinner');
        const arrow = fetchBtn.querySelector('svg');

        btnText.textContent = 'Analiz Ediliyor...';
        spinner.style.display = 'inline-block';
        if (arrow) arrow.style.display = 'none';
        fetchBtn.disabled = true;

        // Reset inline player
        inlinePlayerBox.innerHTML = '';
        inlinePlayerBox.style.display = 'none';
        isPlayerOpen = false;
        togglePlayerBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Tarayıcıda Canlı Oynat</span>
        `;

        try {
            const response = await fetch('/api/media-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, preferred_quality: preferredQuality })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'İçerik bilgileri alınamadı.');
            }

            renderMediaResult(result.data);
            window.showToast('Medya başarıyla analiz edildi!', 'success');
        } catch (err) {
            console.error('Media fetch error:', err);
            window.showToast(err.message || 'Bağlantı getirilirken bir hata oluştu.', 'error');
        } finally {
            btnText.textContent = 'İçeriği Getir';
            spinner.style.display = 'none';
            if (arrow) arrow.style.display = 'inline-block';
            fetchBtn.disabled = false;
        }
    });

    // Filter Buttons Listener
    if (resultQualityFilter) {
        resultQualityFilter.querySelectorAll('.filter-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter') || 'all';
                setResultFilter(filter);
            });
        });
    }

    function setResultFilter(filter) {
        currentFilter = filter;
        if (resultQualityFilter) {
            resultQualityFilter.querySelectorAll('.filter-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
            });
        }
        if (currentMediaData) {
            renderFormatButtons(currentMediaData);
        }
    }

    // Render result cards
    function renderMediaResult(data) {
        currentMediaData = data;
        resultArea.style.display = 'block';

        // Title & metadata
        mediaTitle.textContent = data.title || 'Medya İçeriği';
        authorName.textContent = data.author || (data.platform === 'instagram' ? 'Instagram Kullanıcısı' : 'Kanal / Yayıncı');
        platformTag.textContent = data.platform.toUpperCase();

        if (data.duration && data.duration > 0) {
            const mins = Math.floor(data.duration / 60);
            const secs = data.duration % 60;
            durationTag.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            durationTag.style.display = 'block';
        } else {
            durationTag.style.display = 'none';
        }

        // Thumbnail
        if (data.thumbnail) {
            mediaThumb.src = data.thumbnail;
            mediaThumb.style.display = 'block';
        } else {
            mediaThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200"><rect fill="%231e293b" width="340" height="200"/><text fill="%2364748b" x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="14">Görsel Önizleme</text></svg>';
        }

        // Set initial filter based on preferredQuality
        if (preferredQuality === '1080p') {
            currentFilter = '1080p';
        } else if (preferredQuality === '720p') {
            currentFilter = '720p';
        } else if (preferredQuality === 'audio') {
            currentFilter = 'audio';
        } else if (preferredQuality === '480p' || preferredQuality === '360p') {
            currentFilter = 'sd';
        } else {
            currentFilter = 'all';
        }

        if (resultQualityFilter) {
            resultQualityFilter.querySelectorAll('.filter-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === currentFilter);
            });
        }

        // Render Format Buttons
        renderFormatButtons(data);

        // Render Mirrors / 1-Click Alternate Links
        renderMirrors(data);

        // Scroll into view smoothly
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Render formats matching active filter
    function renderFormatButtons(data) {
        formatButtonsGrid.innerHTML = '';
        const formats = data.formats || [];

        // Filter formats based on currentFilter
        const filteredFormats = formats.filter(f => {
            if (currentFilter === 'all') return true;
            if (currentFilter === '1080p') return (f.quality_tag === '1080p' || f.quality >= 1080);
            if (currentFilter === '720p') return (f.quality_tag === '720p' || (f.quality >= 720 && f.quality < 1080));
            if (currentFilter === 'sd') return (f.quality_tag === '480p' || f.quality_tag === '360p' || f.quality_tag === '240p' || (f.quality > 0 && f.quality < 720));
            if (currentFilter === 'audio') return (f.type === 'audio' || f.quality_tag === 'audio');
            return true;
        });

        if (filteredFormats.length > 0) {
            filteredFormats.forEach(f => {
                const btn = document.createElement('a');
                btn.className = 'btn-format';
                
                const safeTitle = (data.title || 'video').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40);
                const qTag = f.quality_tag ? `_${f.quality_tag}` : '';
                const filename = `${safeTitle}${qTag}.${f.ext || 'mp4'}`;
                const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(f.url)}&filename=${encodeURIComponent(filename)}`;

                btn.href = proxyUrl;
                btn.setAttribute('download', filename);

                const icon = f.type === 'audio' ? '🎵' : '📥';
                const sizeText = f.filesize ? ` • ${window.formatBytes(f.filesize)}` : '';
                const qLabel = f.quality_label || (f.type === 'audio' ? 'MP3' : `${f.quality || 'HD'}p`);
                const isPreferred = (preferredQuality !== 'auto' && (
                    (preferredQuality === '1080p' && f.quality_tag === '1080p') ||
                    (preferredQuality === '720p' && f.quality_tag === '720p') ||
                    (preferredQuality === 'audio' && f.type === 'audio')
                ));

                if (isPreferred) {
                    btn.classList.add('preferred-format-highlight');
                }

                btn.innerHTML = `
                    <div class="fmt-label">
                        <div class="fmt-badge-row">
                            <span class="fmt-badge ${f.type === 'audio' ? 'badge-audio' : 'badge-video'}">${qLabel}</span>
                            ${isPreferred ? '<span class="badge-recommended">★ Tercihiniz</span>' : ''}
                        </div>
                        <span class="fmt-name">${icon} ${f.label}</span>
                        <span class="fmt-meta">Doğrudan İndir (${(f.ext || 'mp4').toUpperCase()}${sizeText})</span>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                `;
                formatButtonsGrid.appendChild(btn);
            });
        } else {
            // No direct formats for this specific filter
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'formats-empty-note';
            emptyMsg.innerHTML = `
                <div class="empty-filter-box">
                    <span>Bu kalite için (${currentFilter.toUpperCase()}) doğrudan akış bulunamadı.</span>
                    <button type="button" class="btn-sm btn-secondary" id="resetQualityFilterBtn">Tüm Kaliteleri Göster</button>
                    <span style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.35rem;">Aşağıdaki <strong>1 Tıkla İndirme Aynaları</strong> üzerinden 1080p / 720p / MP3 kalitesinde tek tıkla indirebilirsiniz.</span>
                </div>
            `;
            formatButtonsGrid.appendChild(emptyMsg);

            const resetBtn = emptyMsg.querySelector('#resetQualityFilterBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => setResultFilter('all'));
            }
        }
    }

    // Render Mirrors / 1-Click Alternate Links
    function renderMirrors(data) {
        mirrorLinksList.innerHTML = '';
        const fallbacks = data.fallback_links || {};
        
        for (let [key, mirrorUrl] of Object.entries(fallbacks)) {
            const link = document.createElement('a');
            link.className = 'mirror-btn';
            link.href = mirrorUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            let name = key.toUpperCase();
            if (key === 'snapinsta') name = '⚡ SnapInsta (HD İndir)';
            if (key === 'fastdl') name = '🚀 FastDL (1080p / HD)';
            if (key === 'ssyoutube_1080' || key === 'ssyoutube') name = '🎥 SSYouTube (1080p & 720p)';
            if (key === 'y2mate_1080' || key === 'y2mate') name = '💎 Y2Mate (1080p / 720p MP4)';
            if (key === 'y2mate_mp3') name = '🎵 Y2Mate (320kbps MP3 Ses)';
            if (key === 'savefrom') name = '📥 SaveFrom HD';
            if (key === 'yt1s') name = '⚡ YT1s Hızlı İndir';
            if (key === 'ddinstagram') name = '🔗 Direkt Video Linki';

            link.innerHTML = `<span>${name}</span> ↗`;
            mirrorLinksList.appendChild(link);
        }
    }

    // Inline Player Toggle
    togglePlayerBtn.addEventListener('click', () => {
        if (!currentMediaData) return;

        if (isPlayerOpen) {
            inlinePlayerBox.innerHTML = '';
            inlinePlayerBox.style.display = 'none';
            isPlayerOpen = false;
            togglePlayerBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Tarayıcıda Canlı Oynat</span>
            `;
        } else {
            inlinePlayerBox.style.display = 'block';
            
            if (currentMediaData.embed_url) {
                inlinePlayerBox.innerHTML = `
                    <iframe src="${currentMediaData.embed_url}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
                `;
            } else if (currentMediaData.direct_video_url) {
                inlinePlayerBox.innerHTML = `
                    <video src="${currentMediaData.direct_video_url}" controls autoplay playsinline></video>
                `;
            } else {
                inlinePlayerBox.innerHTML = `
                    <div style="padding: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                        Canlı oynatıcı bu platform için harici aynalarda mevcuttur.
                    </div>
                `;
            }

            isPlayerOpen = true;
            togglePlayerBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <span>Oynatıcıyı Kapat</span>
            `;
        }
    });
});
