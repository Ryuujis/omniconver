/**
 * OmniConvert Studio - Video to Audio Extractor
 * Uses Web Audio API to decode video soundtracks into WAV audio directly in the browser
 */

document.addEventListener('DOMContentLoaded', () => {
    const audioDropzone = document.getElementById('audioDropzone');
    const videoInput = document.getElementById('videoForAudioInput');
    const resultCard = document.getElementById('audioResultCard');
    const fileNameEl = document.getElementById('audioFileName');
    const durationEl = document.getElementById('audioTrackDuration');
    const progressEl = document.getElementById('extractionProgressText');
    const audioPlayer = document.getElementById('extractedAudioPlayer');
    const downloadWavBtn = document.getElementById('downloadWavBtn');

    let extractedAudioBlob = null;
    let extractedAudioName = 'audio_track.wav';

    // Dropzone Events
    audioDropzone.addEventListener('click', () => videoInput.click());

    ['dragenter', 'dragover'].forEach(name => {
        audioDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            audioDropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        audioDropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            audioDropzone.classList.remove('drag-over');
        });
    });

    audioDropzone.addEventListener('drop', (e) => {
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('video/'));
        if (file) processVideoFile(file);
        else window.showToast('Lütfen geçerli bir video dosyası (MP4, WebM, MOV) bırakın.', 'error');
    });

    videoInput.addEventListener('change', () => {
        if (videoInput.files.length > 0) {
            processVideoFile(videoInput.files[0]);
            videoInput.value = '';
        }
    });

    async function processVideoFile(file) {
        resultCard.style.display = 'block';
        fileNameEl.textContent = file.name;
        durationEl.textContent = `Boyut: ${window.formatBytes(file.size)}`;
        progressEl.textContent = 'Video yükleniyor ve ses kanalı çözülüyor...';
        progressEl.style.color = '#38bdf8';
        audioPlayer.src = '';
        downloadWavBtn.disabled = true;

        const baseName = file.name.replace(/\.[^/.]+$/, '');
        extractedAudioName = `${baseName}_audio.wav`;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            progressEl.textContent = 'Ses akışı ayrıştırılıyor (PCM Decode)...';

            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            const dur = Math.round(audioBuffer.duration);
            const mins = Math.floor(dur / 60);
            const secs = dur % 60;
            durationEl.textContent = `Süre: ${mins}:${secs.toString().padStart(2, '0')} • ${audioBuffer.numberOfChannels} Kanal • ${audioBuffer.sampleRate} Hz`;

            progressEl.textContent = 'WAV formatına kodlanıyor...';

            // Convert AudioBuffer to WAV Blob
            const wavBlob = audioBufferToWav(audioBuffer);
            extractedAudioBlob = wavBlob;

            const audioUrl = URL.createObjectURL(wavBlob);
            audioPlayer.src = audioUrl;

            progressEl.textContent = `Hazır! (${window.formatBytes(wavBlob.size)})`;
            progressEl.style.color = '#34d399';
            downloadWavBtn.disabled = false;

            window.showToast('Ses başarıyla ayrıştırıldı!', 'success');
        } catch (err) {
            console.error('Audio extraction error:', err);
            progressEl.textContent = 'Hata: Videoda ses kanalı bulunamadı veya biçim desteklenmiyor.';
            progressEl.style.color = '#f87171';
            window.showToast('Videodan ses ayrıştırılamadı.', 'error');
        }
    }

    downloadWavBtn.addEventListener('click', () => {
        if (!extractedAudioBlob) return;
        const url = URL.createObjectURL(extractedAudioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = extractedAudioName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });

    // Helper: Encode standard 16-bit PCM WAV from AudioBuffer
    function audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        let interleaved;
        if (numChannels === 2) {
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            interleaved = interleave(left, right);
        } else {
            interleaved = buffer.getChannelData(0);
        }

        return encodeWAV(interleaved, numChannels, sampleRate, bitDepth);
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);
        let index = 0;
        let inputIndex = 0;

        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function encodeWAV(samples, numChannels, sampleRate, bitDepth) {
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
        const view = new DataView(buffer);

        /* RIFF identifier */
        writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + samples.length * bytesPerSample, true);
        /* RIFF type */
        writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, numChannels, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * blockAlign, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, blockAlign, true);
        /* bits per sample */
        view.setUint16(34, bitDepth, true);
        /* data chunk identifier */
        writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * bytesPerSample, true);

        // float to 16-bit PCM
        floatTo16BitPCM(view, 44, samples);

        return new Blob([view], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }
});
