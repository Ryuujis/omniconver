/**
 * OmniConvert Studio - Quick Tools Module
 * QR Code Generator, Color Code Converter, Base64 Encoder/Decoder
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // Tool 1: QR Code Generator
    // ----------------------------------------------------
    const qrTextInput = document.getElementById('qrTextInput');
    const qrCanvas = document.getElementById('qrcodeCanvas');
    const downloadQrPngBtn = document.getElementById('downloadQrPngBtn');
    const downloadQrJpgBtn = document.getElementById('downloadQrJpgBtn');

    let qrCodeInstance = null;

    function renderQr() {
        const text = qrTextInput.value.trim() || 'https://instagram.com';
        qrCanvas.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            qrCodeInstance = new QRCode(qrCanvas, {
                text: text,
                width: 180,
                height: 180,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    qrTextInput.addEventListener('input', () => {
        renderQr();
    });

    renderQr();

    downloadQrPngBtn.addEventListener('click', () => {
        const img = qrCanvas.querySelector('img') || qrCanvas.querySelector('canvas');
        if (!img) return;

        let dataUrl = img.src;
        if (img.tagName.toLowerCase() === 'canvas') {
            dataUrl = img.toDataURL('image/png');
        }

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'qrcode.png';
        a.click();
        window.showToast('QR kod PNG olarak indirildi!', 'success');
    });

    downloadQrJpgBtn.addEventListener('click', () => {
        const canvas = qrCanvas.querySelector('canvas');
        if (!canvas) {
            // Convert img to canvas
            const img = qrCanvas.querySelector('img');
            if (!img) return;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.naturalWidth || 180;
            tempCanvas.height = img.naturalHeight || 180;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(img, 0, 0);

            const a = document.createElement('a');
            a.href = tempCanvas.toDataURL('image/jpeg', 0.95);
            a.download = 'qrcode.jpg';
            a.click();
        } else {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const a = document.createElement('a');
            a.href = tempCanvas.toDataURL('image/jpeg', 0.95);
            a.download = 'qrcode.jpg';
            a.click();
        }
        window.showToast('QR kod JPG olarak indirildi!', 'success');
    });

    // ----------------------------------------------------
    // Tool 2: Color Code Converter
    // ----------------------------------------------------
    const interactiveColorPicker = document.getElementById('interactiveColorPicker');
    const colorBanner = document.getElementById('colorBanner');
    const hexInput = document.getElementById('hexInput');
    const rgbInput = document.getElementById('rgbInput');
    const hslInput = document.getElementById('hslInput');

    function hexToRgb(hex) {
        const clean = hex.replace('#', '');
        const bigint = parseInt(clean, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return { r, g, b };
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    function updateColorsFromHex(hex) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;

        colorBanner.style.backgroundColor = hex;
        interactiveColorPicker.value = hex;
        hexInput.value = hex.toUpperCase();

        const { r, g, b } = hexToRgb(hex);
        rgbInput.value = `rgb(${r}, ${g}, ${b})`;

        const { h, s, l } = rgbToHsl(r, g, b);
        hslInput.value = `hsl(${h}, ${s}%, ${l}%)`;
    }

    interactiveColorPicker.addEventListener('input', (e) => {
        updateColorsFromHex(e.target.value);
    });

    hexInput.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
            updateColorsFromHex(val);
        }
    });

    // Copy buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const el = document.getElementById(targetId);
            if (el) {
                navigator.clipboard.writeText(el.value);
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = originalText, 1500);
                window.showToast('Panoya kopyalandı!', 'success');
            }
        });
    });

    // ----------------------------------------------------
    // Tool 3: Base64 to Image
    // ----------------------------------------------------
    const base64TextArea = document.getElementById('base64TextArea');
    const copyBase64Btn = document.getElementById('copyBase64Btn');
    const renderBase64Btn = document.getElementById('renderBase64Btn');
    const base64PreviewCol = document.getElementById('base64PreviewCol');

    copyBase64Btn.addEventListener('click', () => {
        const text = base64TextArea.value.trim();
        if (!text) return;
        navigator.clipboard.writeText(text);
        window.showToast('Base64 metni kopyalandı!', 'success');
    });

    renderBase64Btn.addEventListener('click', () => {
        let text = base64TextArea.value.trim();
        if (!text) {
            window.showToast('Lütfen Base64 metni girin.', 'error');
            return;
        }

        if (!text.startsWith('data:image/')) {
            text = 'data:image/png;base64,' + text;
        }

        const img = new Image();
        img.onload = () => {
            base64PreviewCol.innerHTML = '';
            base64PreviewCol.appendChild(img);
            window.showToast('Görsel başarıyla çözüldü!', 'success');
        };
        img.onerror = () => {
            window.showToast('Geçersiz Base64 formatı.', 'error');
        };
        img.src = text;
    });
});
