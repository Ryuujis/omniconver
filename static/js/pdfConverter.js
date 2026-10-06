/**
 * OmniConvert Studio - Complete PDF & Document Suite
 * Supports:
 * 1. Word (.docx, .doc), Text (.txt), Markdown (.md), RTF to PDF
 * 2. Multi-Image to PDF (JPG, PNG, WEBP, SVG)
 * 3. Quick Text / Petition / Meeting Notes to PDF
 * 4. Multi-File Combiner (Documents + Images into a single PDF)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Mode Switcher Elements
    const modeButtons = document.querySelectorAll('.pdf-mode-btn');
    const modeViews = {
        word: document.getElementById('pdfWordModeView'),
        image: document.getElementById('pdfImageModeView'),
        quicktext: document.getElementById('pdfQuickTextModeView'),
        combine: document.getElementById('pdfCombineModeView')
    };

    let activeMode = 'word';

    // Switch between PDF converter modes
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetMode = btn.getAttribute('data-mode');
            if (!targetMode || targetMode === activeMode) return;

            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            Object.entries(modeViews).forEach(([mode, view]) => {
                if (view) {
                    view.style.display = (mode === targetMode) ? 'block' : 'none';
                    if (mode === targetMode) {
                        view.classList.add('active');
                    } else {
                        view.classList.remove('active');
                    }
                }
            });

            activeMode = targetMode;
        });
    });

    // Helper: Clean text for jsPDF standard 14 fonts (safe glyph rendering)
    function sanitizeForPDF(text) {
        if (!text) return '';
        return String(text)
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ı/g, 'i').replace(/İ/g, 'I');
    }

    // =========================================================================
    // MODE 1: WORD & METİN BELGELERİNDEN PDF'E (DOCX, TXT, MD)
    // =========================================================================
    const wordDropzone = document.getElementById('wordDropzone');
    const wordFileInput = document.getElementById('wordFileInput');
    const wordSettingsBox = document.getElementById('wordSettingsBox');
    const wordPreviewWrapper = document.getElementById('wordPreviewWrapper');
    const previewFileBadge = document.getElementById('previewFileBadge');
    const previewStats = document.getElementById('previewStats');
    const wordPreviewContent = document.getElementById('wordPreviewContent');
    const wordActionBar = document.getElementById('wordActionBar');
    const wordDocBadge = document.getElementById('wordDocBadge');
    const clearWordBtn = document.getElementById('clearWordBtn');
    const generateWordPdfBtn = document.getElementById('generateWordPdfBtn');

    // Word settings
    const wordFontFamily = document.getElementById('wordFontFamily');
    const wordFontSize = document.getElementById('wordFontSize');
    const wordPageLayout = document.getElementById('wordPageLayout');
    const wordMargin = document.getElementById('wordMargin');
    const wordPageNumbers = document.getElementById('wordPageNumbers');
    const wordHeaderLine = document.getElementById('wordHeaderLine');
    const wordOutputDocName = document.getElementById('wordOutputDocName');

    let currentDocumentData = null; // { filename, title, elements: [], rawText, wordCount }

    // Dropzone events for Word
    if (wordDropzone && wordFileInput) {
        wordDropzone.addEventListener('click', () => wordFileInput.click());

        ['dragenter', 'dragover'].forEach(name => {
            wordDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                wordDropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            wordDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                wordDropzone.classList.remove('drag-over');
            });
        });

        wordDropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleWordFile(file);
        });

        wordFileInput.addEventListener('change', () => {
            const file = wordFileInput.files[0];
            if (file) {
                handleWordFile(file);
                wordFileInput.value = '';
            }
        });
    }

    // Process uploaded Word / Document file
    async function handleWordFile(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        window.showToast(`"${file.name}" analiz ediliyor...`, 'info');

        try {
            // Case 1: DOCX file (OpenXML)
            if (ext === '.docx') {
                const parsed = await parseDocxClientSide(file);
                if (parsed && parsed.elements.length > 0) {
                    renderDocumentPreview(parsed);
                    return;
                }
                // Fallback to server if client parse was empty
                await parseDocumentServerSide(file);
            }
            // Case 2: Plain text, Markdown, CSV
            else if (['.txt', '.md', '.markdown', '.csv', '.rtf', '.json', '.html'].includes(ext)) {
                const text = await file.text();
                const lines = text.split(/\r?\n/);
                const elements = [];
                let wordCount = 0;

                lines.forEach(line => {
                    const clean = line.trim();
                    if (!clean) return;
                    wordCount += clean.split(/\s+/).length;
                    const isHeading = clean.startsWith('#') || (clean === clean.toUpperCase() && clean.length > 3 && clean.length < 50);
                    let level = 1;
                    if (clean.startsWith('###')) level = 3;
                    else if (clean.startsWith('##')) level = 2;

                    elements.append ? elements.append : elements.push({
                        type: isHeading ? 'heading' : 'paragraph',
                        level: level,
                        text: clean.replace(/^#+\s*/, ''),
                        runs: [{ text: clean.replace(/^#+\s*/, ''), bold: isHeading, italic: false }]
                    });
                });

                const docData = {
                    filename: file.name,
                    title: file.name.replace(/\.[^/.]+$/, ''),
                    elements: elements,
                    rawText: text,
                    wordCount: wordCount
                };
                renderDocumentPreview(docData);
            }
            // Case 3: Other document types (.doc binary) -> Server
            else {
                await parseDocumentServerSide(file);
            }
        } catch (err) {
            console.error('Document parsing error:', err);
            window.showToast('Belge okunurken hata oluştu, sunucu ayrıştırıcısı deneniyor...', 'warning');
            await parseDocumentServerSide(file);
        }
    }

    // Client-side DOCX parser using JSZip + DOMParser
    async function parseDocxClientSide(file) {
        if (!window.JSZip) return null;

        const zip = await window.JSZip.loadAsync(file);
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) return null;

        const xmlString = await docXmlFile.async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

        const body = xmlDoc.getElementsByTagName('w:body')[0];
        if (!body) return null;

        const elements = [];
        let totalWords = 0;

        // Extract embedded images from word/media/
        const embeddedImages = {};
        for (let path of Object.keys(zip.files)) {
            if (path.startsWith('word/media/')) {
                try {
                    const b64 = await zip.file(path).async('base64');
                    const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    embeddedImages[path] = `data:${mime};base64,${b64}`;
                } catch (e) {}
            }
        }

        // Iterate body children in sequential order
        for (let i = 0; i < body.childNodes.length; i++) {
            const node = body.childNodes[i];
            const nodeName = node.nodeName.toLowerCase();

            // Paragraph
            if (nodeName === 'w:p') {
                const runs = [];
                const runNodes = node.getElementsByTagName('w:r');
                let fullText = '';

                // Check paragraph style / heading
                const pPr = node.getElementsByTagName('w:pPr')[0];
                let isHeading = false;
                let headingLevel = 1;
                if (pPr) {
                    const pStyle = pPr.getElementsByTagName('w:pStyle')[0];
                    if (pStyle) {
                        const val = (pStyle.getAttribute('w:val') || '').toLowerCase();
                        if (val.includes('heading') || val.includes('baslik') || val.includes('title')) {
                            isHeading = true;
                            if (val.includes('2')) headingLevel = 2;
                            if (val.includes('3')) headingLevel = 3;
                        }
                    }
                }

                for (let r = 0; r < runNodes.length; r++) {
                    const run = runNodes[r];
                    const isBold = run.getElementsByTagName('w:b').length > 0;
                    const isItalic = run.getElementsByTagName('w:i').length > 0;
                    
                    const textNodes = run.getElementsByTagName('w:t');
                    let rText = '';
                    for (let t = 0; t < textNodes.length; t++) {
                        rText += textNodes[t].textContent;
                    }

                    if (rText) {
                        runs.push({ text: rText, bold: isBold, italic: isItalic });
                        fullText += rText;
                    }
                }

                fullText = fullText.trim();
                if (fullText) {
                    totalWords += fullText.split(/\s+/).length;
                    elements.push({
                        type: isHeading ? 'heading' : 'paragraph',
                        level: headingLevel,
                        text: fullText,
                        runs: runs
                    });
                }
            }
            // Table
            else if (nodeName === 'w:tbl') {
                const rowsData = [];
                const rowNodes = node.getElementsByTagName('w:tr');
                for (let r = 0; r < rowNodes.length; r++) {
                    const cellNodes = rowNodes[r].getElementsByTagName('w:tc');
                    const cellTexts = [];
                    for (let c = 0; c < cellNodes.length; c++) {
                        const tNodes = cellNodes[c].getElementsByTagName('w:t');
                        let cText = '';
                        for (let t = 0; t < tNodes.length; t++) {
                            cText += ' ' + tNodes[t].textContent;
                        }
                        cellTexts.push(cText.trim());
                    }
                    if (cellTexts.length > 0) rowsData.push(cellTexts);
                }
                if (rowsData.length > 0) {
                    elements.push({
                        type: 'table',
                        rows: rowsData
                    });
                }
            }
        }

        return {
            filename: file.name,
            title: file.name.replace(/\.[^/.]+$/, ''),
            elements: elements,
            embeddedImages: embeddedImages,
            wordCount: totalWords
        };
    }

    // Server-side fallback parser (/api/convert-document)
    async function parseDocumentServerSide(file) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/convert-document', {
            method: 'POST',
            body: formData
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Sunucu belgeyi ayrıştıramadı.');
        }

        const data = json.data;
        const docData = {
            filename: data.filename,
            title: data.title,
            elements: data.elements,
            wordCount: data.word_count || 0
        };
        renderDocumentPreview(docData);
    }

    // Display parsed document preview in the UI
    function renderDocumentPreview(docData) {
        currentDocumentData = docData;
        wordPreviewWrapper.style.display = 'block';
        wordActionBar.style.display = 'flex';

        previewFileBadge.textContent = `📄 ${docData.filename}`;
        const estPages = Math.max(1, Math.ceil(docData.wordCount / 380));
        previewStats.textContent = `${docData.wordCount} Kelime • ~${estPages} Sayfa Tahmini`;
        wordDocBadge.textContent = `${docData.elements.length} Öğe Ayrıştırıldı`;

        // Update default doc name
        if (wordOutputDocName) {
            wordOutputDocName.value = `${docData.title}.pdf`;
        }

        // Render preview HTML
        let html = '';
        docData.elements.slice(0, 40).forEach(el => {
            if (el.type === 'heading') {
                html += `<h4 class="doc-prev-heading h${el.level || 1}">${escapeHtml(el.text)}</h4>`;
            } else if (el.type === 'paragraph') {
                let runsHtml = '';
                if (el.runs && el.runs.length > 0) {
                    el.runs.forEach(r => {
                        let t = escapeHtml(r.text);
                        if (r.bold) t = `<strong>${t}</strong>`;
                        if (r.italic) t = `<em>${t}</em>`;
                        runsHtml += t;
                    });
                } else {
                    runsHtml = escapeHtml(el.text);
                }
                html += `<p class="doc-prev-p">${runsHtml}</p>`;
            } else if (el.type === 'table') {
                html += `<div class="doc-prev-table-wrap"><table class="doc-prev-table">`;
                el.rows.slice(0, 8).forEach((row, ri) => {
                    html += `<tr>`;
                    row.forEach(cell => {
                        const tag = ri === 0 ? 'th' : 'td';
                        html += `<${tag}>${escapeHtml(cell)}</${tag}>`;
                    });
                    html += `</tr>`;
                });
                html += `</table></div>`;
            }
        });

        if (docData.elements.length > 40) {
            html += `<div class="doc-prev-more">+ ${docData.elements.length - 40} paragraf ve öğe daha mevcut...</div>`;
        }

        wordPreviewContent.innerHTML = html;
        window.showToast('Belge başarıyla okundu! Ayarlarınızı yapıp PDF olarak indirebilirsiniz.', 'success');
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    clearWordBtn.addEventListener('click', () => {
        currentDocumentData = null;
        wordPreviewWrapper.style.display = 'none';
        wordActionBar.style.display = 'none';
        wordPreviewContent.innerHTML = '';
        window.showToast('Belge listesi temizlendi.', 'info');
    });

    // Generate PDF from Word / Document
    generateWordPdfBtn.addEventListener('click', async () => {
        if (!currentDocumentData || currentDocumentData.elements.length === 0) {
            window.showToast('Lütfen önce dönüştürülecek bir Word veya metin belgesi yükleyin.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            window.showToast('PDF kütüphanesi yüklenemedi, lütfen sayfayı yenileyin.', 'error');
            return;
        }

        generateWordPdfBtn.disabled = true;
        generateWordPdfBtn.innerHTML = `<span class="spinner"></span> <span>PDF Oluşturuluyor...</span>`;

        try {
            const font = wordFontFamily.value || 'helvetica';
            const baseFontSize = parseInt(wordFontSize.value || '11', 10);
            const layoutVal = wordPageLayout.value || 'a4_portrait';
            const margin = parseInt(wordMargin.value || '15', 10);
            const addPageNums = wordPageNumbers.value === 'yes';
            const addHeader = wordHeaderLine.value === 'yes';

            const [pageSize, orientation] = layoutVal.split('_');

            const doc = new jsPDF({
                orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
                unit: 'mm',
                format: pageSize === 'letter' ? 'letter' : 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const usableWidth = pageWidth - (margin * 2);

            let cursorY = margin + (addHeader ? 12 : 5);
            const lineHeightFactor = 1.35;

            function checkPageBreak(neededSpace) {
                if (cursorY + neededSpace > pageHeight - margin - (addPageNums ? 12 : 5)) {
                    doc.addPage();
                    cursorY = margin + (addHeader ? 12 : 5);
                    return true;
                }
                return false;
            }

            // Draw document title header if requested
            if (addHeader) {
                doc.setFont(font, 'bold');
                doc.setFontSize(9);
                doc.setTextColor(130, 140, 160);
                const safeTitle = sanitizeForPDF(currentDocumentData.title.substring(0, 50));
                doc.text(safeTitle, margin, margin + 4);
                
                const today = new Date().toLocaleDateString('tr-TR');
                doc.text(today, pageWidth - margin, margin + 4, { align: 'right' });

                doc.setDrawColor(210, 220, 235);
                doc.setLineWidth(0.3);
                doc.line(margin, margin + 6, pageWidth - margin, margin + 6);
            }

            // Iterate and draw elements
            for (let el of currentDocumentData.elements) {
                if (el.type === 'heading') {
                    const headingSize = el.level === 1 ? baseFontSize + 5 : (el.level === 2 ? baseFontSize + 3 : baseFontSize + 1);
                    checkPageBreak(headingSize * 0.8 + 8);

                    cursorY += 4;
                    doc.setFont(font, 'bold');
                    doc.setFontSize(headingSize);
                    doc.setTextColor(24, 32, 54);

                    const safeHeading = sanitizeForPDF(el.text);
                    const headingLines = doc.splitTextToSize(safeHeading, usableWidth);
                    headingLines.forEach(hl => {
                        checkPageBreak(headingSize * 0.6);
                        doc.text(hl, margin, cursorY);
                        cursorY += headingSize * 0.45;
                    });
                    cursorY += 2;
                }
                else if (el.type === 'paragraph') {
                    doc.setFont(font, 'normal');
                    doc.setFontSize(baseFontSize);
                    doc.setTextColor(45, 55, 72);

                    const safeText = sanitizeForPDF(el.text);
                    const lines = doc.splitTextToSize(safeText, usableWidth);
                    const stepY = baseFontSize * 0.42 * lineHeightFactor;

                    lines.forEach(l => {
                        checkPageBreak(stepY);
                        doc.text(l, margin, cursorY);
                        cursorY += stepY;
                    });
                    cursorY += 3; // paragraph gap
                }
                else if (el.type === 'table') {
                    checkPageBreak(18);
                    cursorY += 2;
                    doc.setFont(font, 'normal');
                    doc.setFontSize(baseFontSize - 1);

                    const rows = el.rows;
                    const colCount = Math.max(...rows.map(r => r.length));
                    if (colCount > 0) {
                        const colWidth = usableWidth / colCount;
                        const cellHeight = 7.5;

                        rows.forEach((row, ri) => {
                            checkPageBreak(cellHeight + 2);
                            const isHeaderRow = (ri === 0);

                            if (isHeaderRow) {
                                doc.setFillColor(240, 244, 250);
                                doc.rect(margin, cursorY - 4.5, usableWidth, cellHeight, 'F');
                                doc.setFont(font, 'bold');
                                doc.setTextColor(30, 41, 59);
                            } else {
                                doc.setFont(font, 'normal');
                                doc.setTextColor(51, 65, 85);
                            }

                            doc.setDrawColor(215, 225, 240);
                            doc.setLineWidth(0.2);

                            row.forEach((cellText, ci) => {
                                const cellX = margin + (ci * colWidth);
                                doc.rect(cellX, cursorY - 4.5, colWidth, cellHeight, 'S');
                                const safeCell = sanitizeForPDF(cellText.substring(0, 35));
                                doc.text(safeCell, cellX + 2, cursorY, { maxWidth: colWidth - 4 });
                            });

                            cursorY += cellHeight;
                        });
                        cursorY += 4;
                    }
                }
            }

            // Add page numbers on all pages
            if (addPageNums) {
                const totalPages = doc.internal.getNumberOfPages();
                for (let p = 1; p <= totalPages; p++) {
                    doc.setPage(p);
                    doc.setFont(font, 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(140, 150, 170);
                    const pageText = `Sayfa ${p} / ${totalPages}`;
                    doc.text(pageText, pageWidth / 2, pageHeight - margin + 4, { align: 'center' });
                }
            }

            // Save PDF
            let docName = (wordOutputDocName.value.trim() || `${currentDocumentData.title}.pdf`);
            if (!docName.toLowerCase().endsWith('.pdf')) docName += '.pdf';

            doc.save(docName);
            window.showToast('Word belgeniz başarıyla PDF olarak oluşturuldu ve indirildi!', 'success');
        } catch (err) {
            console.error('Word to PDF generation error:', err);
            window.showToast('PDF oluşturulurken bir hata oluştu: ' + err.message, 'error');
        } finally {
            generateWordPdfBtn.disabled = false;
            generateWordPdfBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>PDF Olarak Dönüştür ve İndir</span>
            `;
        }
    });

    // =========================================================================
    // MODE 2: GÖRSELLERDEN PDF'E (JPG, PNG, WEBP)
    // =========================================================================
    const pdfDropzone = document.getElementById('pdfDropzone');
    const pdfFileInput = document.getElementById('pdfFileInput');
    const pdfThumbsList = document.getElementById('pdfThumbsList');
    const pdfActionBar = document.getElementById('pdfActionBar');
    const pdfFilesBadge = document.getElementById('pdfFilesBadge');
    const clearPdfBtn = document.getElementById('clearPdfFilesBtn');
    const generatePdfBtn = document.getElementById('generatePdfBtn');

    const pdfPageSize = document.getElementById('pdfPageSize');
    const pdfOrientation = document.getElementById('pdfOrientation');
    const pdfMargin = document.getElementById('pdfMargin');
    const pdfDocName = document.getElementById('pdfDocName');

    let pdfImages = []; // array of { id, file, url, width, height }

    if (pdfDropzone && pdfFileInput) {
        pdfDropzone.addEventListener('click', () => pdfFileInput.click());

        ['dragenter', 'dragover'].forEach(name => {
            pdfDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfDropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            pdfDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                pdfDropzone.classList.remove('drag-over');
            });
        });

        pdfDropzone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) handlePdfFiles(files);
        });

        pdfFileInput.addEventListener('change', () => {
            const files = Array.from(pdfFileInput.files);
            if (files.length > 0) {
                handlePdfFiles(files);
                pdfFileInput.value = '';
            }
        });
    }

    function handlePdfFiles(files) {
        files.forEach(file => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                pdfImages.push({
                    id: 'pdf_' + Math.random().toString(36).substr(2, 9),
                    file,
                    url,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
                renderPdfGrid();
            };
            img.src = url;
        });
        window.showToast(`${files.length} görsel PDF kuyruğuna eklendi.`, 'info');
    }

    function renderPdfGrid() {
        pdfThumbsList.innerHTML = '';
        const count = pdfImages.length;

        if (count === 0) {
            pdfActionBar.style.display = 'none';
            return;
        }

        pdfActionBar.style.display = 'flex';
        pdfFilesBadge.textContent = `${count} Görsel Eklendi`;

        pdfImages.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'pdf-thumb-item';
            card.innerHTML = `
                <img src="${item.url}" alt="Sayfa ${index + 1}">
                <div class="pdf-thumb-page">Sayfa ${index + 1}</div>
                <button class="pdf-item-remove-btn" data-id="${item.id}" title="Kaldır">✕</button>
            `;
            pdfThumbsList.appendChild(card);
        });

        document.querySelectorAll('.pdf-item-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                pdfImages = pdfImages.filter(f => f.id !== id);
                renderPdfGrid();
            });
        });
    }

    clearPdfBtn.addEventListener('click', () => {
        pdfImages = [];
        renderPdfGrid();
        window.showToast('PDF görsel listesi temizlendi.', 'info');
    });

    generatePdfBtn.addEventListener('click', async () => {
        if (pdfImages.length === 0) {
            window.showToast('Lütfen önce PDF için en az bir görsel yükleyin.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            window.showToast('PDF kütüphanesi hazır değil, lütfen sayfayı yenileyin.', 'error');
            return;
        }

        generatePdfBtn.disabled = true;
        generatePdfBtn.innerHTML = `<span class="spinner"></span> <span>PDF Oluşturuluyor...</span>`;

        try {
            const orientation = pdfOrientation.value;
            const format = pdfPageSize.value;
            const margin = parseInt(pdfMargin.value, 10);

            let doc;
            if (format === 'fit') {
                const first = pdfImages[0];
                const isWide = first.width > first.height;
                doc = new jsPDF({
                    orientation: isWide ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [first.width, first.height]
                });
            } else {
                doc = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: format
                });
            }

            for (let i = 0; i < pdfImages.length; i++) {
                if (i > 0) {
                    if (format === 'fit') {
                        const cur = pdfImages[i];
                        const isWide = cur.width > cur.height;
                        doc.addPage([cur.width, cur.height], isWide ? 'landscape' : 'portrait');
                    } else {
                        doc.addPage(format, orientation);
                    }
                }

                const item = pdfImages[i];
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                if (format === 'fit') {
                    doc.addImage(item.url, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
                } else {
                    const usableW = pageWidth - (margin * 2);
                    const usableH = pageHeight - (margin * 2);

                    const imgRatio = item.width / item.height;
                    const pageRatio = usableW / usableH;

                    let renderW = usableW;
                    let renderH = usableH;

                    if (imgRatio > pageRatio) {
                        renderW = usableW;
                        renderH = usableW / imgRatio;
                    } else {
                        renderH = usableH;
                        renderW = usableH * imgRatio;
                    }

                    const posX = margin + (usableW - renderW) / 2;
                    const posY = margin + (usableH - renderH) / 2;

                    doc.addImage(item.url, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
                }
            }

            let docName = (pdfDocName.value.trim() || 'gorseller_belgesi.pdf');
            if (!docName.toLowerCase().endsWith('.pdf')) docName += '.pdf';

            doc.save(docName);
            window.showToast('Görseller başarıyla PDF olarak oluşturuldu ve indirildi!', 'success');
        } catch (err) {
            console.error('PDF generation error:', err);
            window.showToast('PDF oluşturulurken bir hata oluştu.', 'error');
        } finally {
            generatePdfBtn.disabled = false;
            generatePdfBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>PDF Oluştur ve İndir</span>
            `;
        }
    });

    // =========================================================================
    // MODE 3: HIZLI METİN / NOT YAZARAK PDF
    // =========================================================================
    const quickDocTitle = document.getElementById('quickDocTitle');
    const quickDocAuthor = document.getElementById('quickDocAuthor');
    const quickDocBody = document.getElementById('quickDocBody');
    const quickTextWordCounter = document.getElementById('quickTextWordCounter');
    const clearQuickTextBtn = document.getElementById('clearQuickTextBtn');
    const generateQuickTextPdfBtn = document.getElementById('generateQuickTextPdfBtn');
    const templateButtons = document.querySelectorAll('.btn-template');

    // Presets
    const templates = {
        blank: '',
        petition: `T.C. İLGİLİ MAKAMINA\n\nKonu: Resmi Başvuru ve Talep Dilekçesi\n\nKurumunuz nezdinde yürütülmekte olan işlemler kapsamında, gerekli incelemelerin yapılarak tarafıma bilgi verilmesini saygılarımla arz ve talep ederim.\n\nEkler:\n1. Nüfus Cüzdanı Sureti\n2. İlgili Belge Fotokopisi\n\nAdres & İletişim:\nÖrnek Mahallesi, Atatürk Caddesi No: 12\nTelefon: 0555 123 45 67\nE-posta: ornek@email.com\n\nİmza: _______________________`,
        meeting: `PROJE DEĞERLENDİRME TOPLANTISI TUTANAĞI\n\nTarih: ${new Date().toLocaleDateString('tr-TR')}\nKatılımcılar: Yönetim Ekibi, Proje Yöneticisi, Yazılım Geliştiriciler\n\n1. GÜNDEM MADDELERİ\n- Yeni sürümün teslim takviminin gözden geçirilmesi\n- Medya dönüştürücü ve format entegrasyonları test sonuçları\n- Kullanıcı geri bildirimlerinin değerlendirilmesi\n\n2. ALINAN KARARLAR\n- Kalite seçme özelliği YouTube ve Instagram için devreye alınmıştır.\n- Word (.docx) ve çoklu belge dönüştürücü PDF motoruna eklenmiştir.\n\n3. SONRAKİ ADIMLAR\n- Performans testleri tamamlanacak ve canlıya alınacaktır.`,
        code: `// OMNICONVERT PROJE NOTLARI & KOD DÖKÜMÜ\n\nconst supportedFormats = {\n    documents: ['docx', 'doc', 'txt', 'md', 'rtf'],\n    media: ['youtube', 'instagram', 'tiktok'],\n    images: ['png', 'jpg', 'webp', 'bmp', 'svg']\n};\n\nfunction initializeConverters() {\n    console.log("OmniConvert Studio başlatıldı.");\n}\n\n// Sistem Durumu: Aktif & Çevrimdışı Çalışabilir`
    };

    templateButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            templateButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tmpl = btn.getAttribute('data-tmpl');
            if (templates[tmpl] !== undefined) {
                quickDocBody.value = templates[tmpl];
                updateQuickTextCounter();
            }
        });
    });

    if (quickDocBody) {
        quickDocBody.addEventListener('input', updateQuickTextCounter);
    }

    function updateQuickTextCounter() {
        const val = (quickDocBody.value || '').trim();
        const words = val ? val.split(/\s+/).length : 0;
        if (quickTextWordCounter) {
            quickTextWordCounter.textContent = `${words} Kelime`;
        }
    }

    if (clearQuickTextBtn) {
        clearQuickTextBtn.addEventListener('click', () => {
            quickDocBody.value = '';
            updateQuickTextCounter();
            window.showToast('Metin temizlendi.', 'info');
        });
    }

    if (generateQuickTextPdfBtn) {
        generateQuickTextPdfBtn.addEventListener('click', () => {
            const bodyText = (quickDocBody.value || '').trim();
            if (!bodyText) {
                window.showToast('Lütfen önce PDF için bir metin veya not girin.', 'error');
                return;
            }

            const { jsPDF } = window.jspdf || {};
            if (!jsPDF) {
                window.showToast('PDF kütüphanesi hazır değil.', 'error');
                return;
            }

            try {
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 15;
                const usableWidth = pageWidth - (margin * 2);

                const title = sanitizeForPDF(quickDocTitle.value.trim() || 'Belge');
                const author = sanitizeForPDF(quickDocAuthor.value.trim() || '');
                const today = new Date().toLocaleDateString('tr-TR');

                // Header
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.setTextColor(24, 32, 54);
                doc.text(title, margin, margin + 4);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(120, 130, 150);
                if (author) doc.text(author, margin, margin + 9);
                doc.text(today, pageWidth - margin, margin + 9, { align: 'right' });

                doc.setDrawColor(210, 220, 235);
                doc.setLineWidth(0.4);
                doc.line(margin, margin + 12, pageWidth - margin, margin + 12);

                // Body text
                let cursorY = margin + 20;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(40, 50, 70);

                const lines = bodyText.split(/\r?\n/);
                lines.forEach(line => {
                    const cleanLine = sanitizeForPDF(line);
                    const isSubheading = cleanLine.startsWith('#') || (cleanLine === cleanLine.toUpperCase() && cleanLine.length > 3 && cleanLine.length < 50);

                    if (isSubheading) {
                        cursorY += 3;
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(12);
                    } else {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(11);
                    }

                    const splitLines = doc.splitTextToSize(cleanLine.replace(/^#+\s*/, ''), usableWidth);
                    splitLines.forEach(l => {
                        if (cursorY > pageHeight - margin - 10) {
                            doc.addPage();
                            cursorY = margin + 10;
                        }
                        doc.text(l, margin, cursorY);
                        cursorY += 5.5;
                    });

                    if (cleanLine === '') cursorY += 3;
                });

                // Page numbering
                const totalPages = doc.internal.getNumberOfPages();
                for (let p = 1; p <= totalPages; p++) {
                    doc.setPage(p);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(140, 150, 170);
                    doc.text(`Sayfa ${p} / ${totalPages}`, pageWidth / 2, pageHeight - margin + 4, { align: 'center' });
                }

                doc.save(`${title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`);
                window.showToast('Hızlı metin PDF olarak indirildi!', 'success');
            } catch (err) {
                console.error('Quick text PDF error:', err);
                window.showToast('PDF oluşturulurken hata oluştu.', 'error');
            }
        });
    }

    // =========================================================================
    // MODE 4: ÇOKLU DOSYA BİRLEŞTİRİCİ (WORD + RESİMLER)
    // =========================================================================
    const combineDropzone = document.getElementById('combineDropzone');
    const combineFileInput = document.getElementById('combineFileInput');
    const combineQueueList = document.getElementById('combineQueueList');
    const combineActionBar = document.getElementById('combineActionBar');
    const combineFilesBadge = document.getElementById('combineFilesBadge');
    const clearCombineBtn = document.getElementById('clearCombineBtn');
    const generateCombinePdfBtn = document.getElementById('generateCombinePdfBtn');

    let combineItems = []; // { id, name, type: 'image'|'doc', data, file }

    if (combineDropzone && combineFileInput) {
        combineDropzone.addEventListener('click', () => combineFileInput.click());

        ['dragenter', 'dragover'].forEach(name => {
            combineDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                combineDropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            combineDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                combineDropzone.classList.remove('drag-over');
            });
        });

        combineDropzone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) handleCombineFiles(files);
        });

        combineFileInput.addEventListener('change', () => {
            const files = Array.from(combineFileInput.files);
            if (files.length > 0) {
                handleCombineFiles(files);
                combineFileInput.value = '';
            }
        });
    }

    async function handleCombineFiles(files) {
        for (let file of files) {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            const id = 'comb_' + Math.random().toString(36).substr(2, 9);

            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    combineItems.push({
                        id,
                        name: file.name,
                        type: 'image',
                        url,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        size: file.size
                    });
                    renderCombineList();
                };
                img.src = url;
            } else if (['.docx', '.doc', '.txt', '.md', '.rtf'].includes(ext)) {
                let parsed = null;
                if (ext === '.docx') {
                    parsed = await parseDocxClientSide(file);
                } else {
                    const text = await file.text();
                    parsed = {
                        title: file.name,
                        elements: text.split(/\r?\n/).filter(l => l.trim()).map(l => ({ type: 'paragraph', text: l }))
                    };
                }

                combineItems.push({
                    id,
                    name: file.name,
                    type: 'doc',
                    docData: parsed,
                    size: file.size
                });
                renderCombineList();
            }
        }
    }

    function renderCombineList() {
        if (!combineQueueList) return;
        combineQueueList.innerHTML = '';
        const count = combineItems.length;

        if (count === 0) {
            combineActionBar.style.display = 'none';
            return;
        }

        combineActionBar.style.display = 'flex';
        combineFilesBadge.textContent = `${count} Dosya Eklendi`;

        combineItems.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'queue-item-card';

            const icon = item.type === 'image' ? '🖼️' : '📄';
            const typeLabel = item.type === 'image' ? 'Görsel Sayfası' : 'Belge İçeriği';

            card.innerHTML = `
                <div class="queue-file-info">
                    <span style="font-size: 1.5rem;">${icon}</span>
                    <div class="queue-meta">
                        <div class="queue-name">${escapeHtml(item.name)}</div>
                        <div class="queue-subtext">
                            <span>Sıra #${index + 1}</span> • <span>${typeLabel}</span> • <span>${window.formatBytes(item.size)}</span>
                        </div>
                    </div>
                </div>
                <div class="queue-actions">
                    <button class="btn-icon remove-combine-btn" data-id="${item.id}" title="Kaldır">✕</button>
                </div>
            `;
            combineQueueList.appendChild(card);
        });

        document.querySelectorAll('.remove-combine-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                combineItems = combineItems.filter(item => item.id !== id);
                renderCombineList();
            });
        });
    }

    if (clearCombineBtn) {
        clearCombineBtn.addEventListener('click', () => {
            combineItems = [];
            renderCombineList();
            window.showToast('Birleştirici listesi temizlendi.', 'info');
        });
    }

    if (generateCombinePdfBtn) {
        generateCombinePdfBtn.addEventListener('click', async () => {
            if (combineItems.length === 0) {
                window.showToast('Lütfen önce birleştirilecek dosyalar ekleyin.', 'error');
                return;
            }

            const { jsPDF } = window.jspdf || {};
            if (!jsPDF) {
                window.showToast('PDF kütüphanesi hazır değil.', 'error');
                return;
            }

            generateCombinePdfBtn.disabled = true;
            generateCombinePdfBtn.innerHTML = `<span class="spinner"></span> <span>Birleştiriliyor...</span>`;

            try {
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 15;
                const usableWidth = pageWidth - (margin * 2);

                let isFirstPage = true;

                for (let item of combineItems) {
                    if (item.type === 'image') {
                        if (!isFirstPage) doc.addPage('a4', 'portrait');
                        isFirstPage = false;

                        const usableH = pageHeight - (margin * 2);
                        const imgRatio = item.width / item.height;
                        const pageRatio = usableWidth / usableH;

                        let renderW = usableWidth;
                        let renderH = usableH;
                        if (imgRatio > pageRatio) {
                            renderW = usableWidth;
                            renderH = usableWidth / imgRatio;
                        } else {
                            renderH = usableH;
                            renderW = usableH * imgRatio;
                        }

                        const posX = margin + (usableWidth - renderW) / 2;
                        const posY = margin + (usableH - renderH) / 2;
                        doc.addImage(item.url, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
                    } else if (item.type === 'doc') {
                        if (!isFirstPage) doc.addPage('a4', 'portrait');
                        isFirstPage = false;

                        let cursorY = margin + 10;
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(13);
                        doc.setTextColor(24, 32, 54);
                        doc.text(sanitizeForPDF(item.name), margin, cursorY);
                        cursorY += 6;

                        doc.setDrawColor(210, 220, 235);
                        doc.line(margin, cursorY, pageWidth - margin, cursorY);
                        cursorY += 6;

                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.setTextColor(45, 55, 72);

                        const elements = item.docData ? item.docData.elements : [];
                        for (let el of elements) {
                            if (el.text) {
                                const split = doc.splitTextToSize(sanitizeForPDF(el.text), usableWidth);
                                split.forEach(l => {
                                    if (cursorY > pageHeight - margin - 8) {
                                        doc.addPage('a4', 'portrait');
                                        cursorY = margin + 10;
                                    }
                                    doc.text(l, margin, cursorY);
                                    cursorY += 5;
                                });
                                cursorY += 2;
                            }
                        }
                    }
                }

                doc.save('birlestirilmis_belge.pdf');
                window.showToast('Tüm dosyalar başarıyla tek bir PDF içinde birleştirildi!', 'success');
            } catch (err) {
                console.error('Combine PDF error:', err);
                window.showToast('Birleştirme hatası: ' + err.message, 'error');
            } finally {
                generateCombinePdfBtn.disabled = false;
                generateCombinePdfBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Tümünü Birleştir & PDF İndir</span>
                `;
            }
        });
    }
});
