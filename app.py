#!/usr/bin/env python3
"""
OmniConvert Studio - Flask Backend
Supports:
- Instagram Reels metadata & stream extraction
- YouTube video & audio extraction & stream downloading
- Server-side image conversion (Pillow) fallback
- Static UI delivery
"""

import os
import sys
import io
import re
import json
import uuid
import tempfile
import urllib.parse
import warnings

# Suppress urllib3 LibreSSL warning on macOS
warnings.filterwarnings('ignore')

from flask import Flask, request, jsonify, send_file, send_from_directory, render_template, Response
import requests
from PIL import Image

# yt-dlp import with safety fallback
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

# parth_dl for Instagram fallback
try:
    import parth_dl
except ImportError:
    parth_dl = None

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB max upload

DOWNLOAD_CACHE_DIR = os.path.join(tempfile.gettempdir(), 'omniconvert_cache')
os.makedirs(DOWNLOAD_CACHE_DIR, exist_ok=True)

# Helper: Detect platform from URL
def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if 'instagram.com' in url_lower:
        return 'instagram'
    elif 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'twitter'
    elif 'pinterest.com' in url_lower or 'pin.it' in url_lower:
        return 'pinterest'
    return 'generic'

def extract_instagram_shortcode(url: str):
    """Extract post/reel shortcode from Instagram URL"""
    patterns = [
        r'instagram\.com/(?:reel|reels|p|tv)/([a-zA-Z0-9_-]+)',
        r'instagram\.com/share/reel/([a-zA-Z0-9_-]+)'
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None

def extract_youtube_id(url: str):
    """Extract YouTube video ID"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'youtu\.be\/([0-9A-Za-z_-]{11})',
        r'youtube\.com\/shorts\/([0-9A-Za-z_-]{11})',
        r'youtube\.com\/embed\/([0-9A-Za-z_-]{11})'
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'online',
        'has_ytdlp': yt_dlp is not None,
        'has_pillow': True,
        'has_parthdl': parth_dl is not None
    })

@app.route('/api/media-info', methods=['POST'])
def media_info():
    """Extract media metadata and available download formats"""
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()

    if not url:
        return jsonify({'error': 'Geçerli bir URL giriniz.'}), 400

    platform = detect_platform(url)
    result = {
        'url': url,
        'platform': platform,
        'title': 'Medya İçeriği',
        'thumbnail': '',
        'duration': 0,
        'author': '',
        'formats': [],
        'direct_video_url': '',
        'embed_url': '',
        'fallback_links': {}
    }

    # 1. Instagram Processing
    if platform == 'instagram':
        shortcode = extract_instagram_shortcode(url)
        if shortcode:
            result['embed_url'] = f"https://www.instagram.com/p/{shortcode}/embed/"
            result['fallback_links'] = {
                'snapinsta': f"https://snapinsta.app/?url={urllib.parse.quote(url)}",
                'fastdl': f"https://fastdl.app/en?url={urllib.parse.quote(url)}",
                'saveclip': f"https://saveclip.app/en?url={urllib.parse.quote(url)}",
                'ddinstagram': f"https://ddinstagram.com/reel/{shortcode}"
            }

        # Try parth-dl first
        if parth_dl and shortcode:
            try:
                info = parth_dl.get_info(url)
                if info:
                    result['title'] = info.get('title') or info.get('caption') or f"Instagram Reel ({shortcode})"
                    result['thumbnail'] = info.get('thumbnail') or f"https://www.instagram.com/p/{shortcode}/media/?size=l"
                    result['author'] = info.get('author') or info.get('owner_username') or ''
                    formats = info.get('formats') or []
                    for f in formats:
                        if f.get('url'):
                            res = f.get('resolution') or 'HD'
                            is_hd = '1080' in str(res) or 'HD' in str(res).upper()
                            q_tag = '1080p' if is_hd else '720p'
                            result['formats'].append({
                                'format_id': 'mp4',
                                'label': f"{res} MP4 Video",
                                'ext': 'mp4',
                                'url': f.get('url'),
                                'type': 'video',
                                'quality': 1080 if is_hd else 720,
                                'quality_tag': q_tag,
                                'quality_label': '1080p Full HD' if is_hd else '720p HD'
                            })
                            if not result['direct_video_url']:
                                result['direct_video_url'] = f.get('url')
            except Exception as e:
                pass

        # Try yt-dlp if direct url not yet found
        if not result['direct_video_url'] and yt_dlp:
            try:
                ydl_opts = {
                    'quiet': True,
                    'skip_download': True,
                    'socket_timeout': 6
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        result['title'] = info.get('title') or result['title']
                        result['thumbnail'] = info.get('thumbnail') or result['thumbnail']
                        result['author'] = info.get('uploader') or result['author']
                        result['duration'] = info.get('duration') or 0
                        if info.get('url'):
                            result['direct_video_url'] = info.get('url')
                            result['formats'].append({
                                'format_id': 'direct_1080',
                                'label': '1080p Full HD MP4 Video',
                                'ext': 'mp4',
                                'url': info.get('url'),
                                'type': 'video',
                                'quality': 1080,
                                'quality_tag': '1080p',
                                'quality_label': '1080p Full HD'
                            })
                            result['formats'].append({
                                'format_id': 'direct_720',
                                'label': '720p HD MP4 Video (Hızlı)',
                                'ext': 'mp4',
                                'url': info.get('url'),
                                'type': 'video',
                                'quality': 720,
                                'quality_tag': '720p',
                                'quality_label': '720p HD'
                            })
            except Exception as e:
                pass

        # If direct video URL exists, also provide audio extraction format option
        if result['direct_video_url'] and not any(f.get('type') == 'audio' for f in result['formats']):
            result['formats'].append({
                'format_id': 'ig_audio',
                'label': 'MP3 Ses / Müzik (320 kbps)',
                'ext': 'mp3',
                'url': result['direct_video_url'],
                'type': 'audio',
                'quality': 320,
                'quality_tag': 'audio',
                'quality_label': 'MP3 Ses'
            })

        # If still no thumbnail, fallback to standard IG media thumbnail
        if not result['thumbnail'] and shortcode:
            result['thumbnail'] = f"https://www.instagram.com/p/{shortcode}/media/?size=l"
        if not result['title'] or result['title'] == 'Medya İçeriği':
            result['title'] = f"Instagram Reel ({shortcode or 'İçerik'})"

        return jsonify({'success': True, 'data': result})

    # 2. YouTube Processing
    elif platform == 'youtube':
        yt_id = extract_youtube_id(url)
        if yt_id:
            result['thumbnail'] = f"https://img.youtube.com/vi/{yt_id}/maxresdefault.jpg"
            result['embed_url'] = f"https://www.youtube-nocookie.com/embed/{yt_id}"
            result['fallback_links'] = {
                'ssyoutube_1080': f"https://ssyoutube.com/watch?v={yt_id}",
                'y2mate_1080': f"https://www.y2mate.com/youtube/{yt_id}",
                'y2mate_mp3': f"https://www.y2mate.com/youtube-mp3/{yt_id}",
                'savefrom': f"https://en.savefrom.net/1-youtube-video-downloader-384.html?url=https://www.youtube.com/watch?v={yt_id}",
                'yt1s': f"https://yt1s.com/en/youtube-to-mp4?q=https://www.youtube.com/watch?v={yt_id}"
            }

        # Use oembed for instant, 100% reliable title & author metadata
        try:
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={yt_id}&format=json"
            oembed_res = requests.get(oembed_url, timeout=4)
            if oembed_res.status_code == 200:
                oedata = oembed_res.json()
                result['title'] = oedata.get('title', result['title'])
                result['author'] = oedata.get('author_name', '')
                if not result['thumbnail'] or 'maxresdefault' in result['thumbnail']:
                    result['thumbnail'] = oedata.get('thumbnail_url', result['thumbnail'])
        except Exception:
            pass

        # Try yt-dlp to extract available video/audio streams with quality tagging
        if yt_dlp:
            try:
                ydl_opts = {
                    'quiet': True,
                    'skip_download': True,
                    'socket_timeout': 6,
                    'extractor_args': {'youtube': {'player_client': ['web', 'mweb']}}
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        result['title'] = info.get('title') or result['title']
                        result['author'] = info.get('uploader') or result['author']
                        result['duration'] = info.get('duration') or 0
                        formats = info.get('formats') or []
                        
                        seen_qualities = set()

                        # Collect combined audio+video formats and best audio
                        for f in formats:
                            url_stream = f.get('url')
                            if not url_stream or 'manifest' in url_stream:
                                continue
                            vcodec = f.get('vcodec', 'none')
                            acodec = f.get('acodec', 'none')
                            ext = f.get('ext', '')
                            height = f.get('height') or 0
                            filesize = f.get('filesize') or f.get('filesize_approx') or 0

                            # Determine quality tag
                            if height >= 1080:
                                q_tag = '1080p'
                                q_label = '1080p Full HD'
                            elif height >= 720:
                                q_tag = '720p'
                                q_label = '720p HD'
                            elif height >= 480:
                                q_tag = '480p'
                                q_label = '480p SD'
                            elif height >= 360:
                                q_tag = '360p'
                                q_label = '360p Standart'
                            elif height > 0:
                                q_tag = '240p'
                                q_label = f'{height}p'
                            else:
                                q_tag = 'audio'
                                q_label = 'MP3 / Ses'

                            if vcodec != 'none' and acodec != 'none':
                                q_key = f"video_{height}"
                                if q_key not in seen_qualities:
                                    seen_qualities.add(q_key)
                                    result['formats'].append({
                                        'format_id': f.get('format_id'),
                                        'label': f"MP4 {height}p (Video + Ses)",
                                        'ext': ext or 'mp4',
                                        'url': url_stream,
                                        'type': 'video',
                                        'filesize': filesize,
                                        'quality': height,
                                        'quality_tag': q_tag,
                                        'quality_label': q_label
                                    })
                            elif vcodec == 'none' and acodec != 'none':
                                q_key = f"audio_{f.get('abr', 128)}"
                                if q_key not in seen_qualities:
                                    seen_qualities.add(q_key)
                                    result['formats'].append({
                                        'format_id': f.get('format_id'),
                                        'label': f"Ses ({f.get('abr', 128)} kbps MP3/M4A)",
                                        'ext': ext or 'mp3',
                                        'url': url_stream,
                                        'type': 'audio',
                                        'filesize': filesize,
                                        'quality': f.get('abr', 128),
                                        'quality_tag': 'audio',
                                        'quality_label': f"MP3 {f.get('abr', 128)}k"
                                    })
            except Exception as e:
                pass

        return jsonify({'success': True, 'data': result})

    # 3. TikTok & Other Platforms (via yt-dlp)
    else:
        if yt_dlp:
            try:
                ydl_opts = {'quiet': True, 'skip_download': True, 'socket_timeout': 6}
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        result['title'] = info.get('title', 'Video')
                        result['thumbnail'] = info.get('thumbnail', '')
                        result['author'] = info.get('uploader', '')
                        result['duration'] = info.get('duration', 0)
                        if info.get('url'):
                            result['direct_video_url'] = info.get('url')
                            result['formats'].append({
                                'format_id': 'direct',
                                'label': 'HD MP4 Video',
                                'ext': 'mp4',
                                'url': info.get('url'),
                                'type': 'video'
                            })
            except Exception as e:
                pass

        return jsonify({'success': True, 'data': result})

@app.route('/api/proxy-download')
def proxy_download():
    """Proxy video or audio stream with Content-Disposition attachment for direct downloading"""
    target_url = request.args.get('url', '').strip()
    filename = request.args.get('filename', 'omniconvert_download.mp4').strip()

    if not target_url:
        return "URL parametresi eksik", 400

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': target_url
        }
        req = requests.get(target_url, headers=headers, stream=True, timeout=15)
        
        def generate():
            for chunk in req.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk

        response = Response(generate(), content_type=req.headers.get('content-type', 'video/mp4'))
        response.headers['Content-Disposition'] = f'attachment; filename="{urllib.parse.quote(filename)}"'
        if 'content-length' in req.headers:
            response.headers['Content-Length'] = req.headers['content-length']
        return response
    except Exception as e:
        return f"İndirme hatası: {str(e)}", 500

@app.route('/api/convert-image', methods=['POST'])
def convert_image():
    """Server-side image converter powered by Pillow"""
    if 'file' not in request.files:
        return jsonify({'error': 'Dosya yüklenmedi'}), 400

    file = request.files['file']
    target_format = request.form.get('target_format', 'JPEG').upper()
    quality = int(request.form.get('quality', 90))
    scale = float(request.form.get('scale', 1.0))
    bg_color = request.form.get('bg_color', '#FFFFFF')

    # Mapping
    format_map = {
        'JPG': 'JPEG',
        'JPEG': 'JPEG',
        'PNG': 'PNG',
        'WEBP': 'WEBP',
        'BMP': 'BMP',
        'GIF': 'GIF',
        'ICO': 'ICO'
    }
    pil_format = format_map.get(target_format, 'JPEG')
    ext = target_format.lower()
    if ext == 'jpeg':
        ext = 'jpg'

    try:
        img = Image.open(file.stream)
        
        # Scaling if requested
        if scale != 1.0 and scale > 0.05 and scale <= 4.0:
            new_w = max(1, int(img.width * scale))
            new_h = max(1, int(img.height * scale))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Handle RGBA / transparency for formats that don't support it (e.g. JPEG, BMP)
        if pil_format in ('JPEG', 'BMP') and img.mode in ('RGBA', 'LA', 'P'):
            # parse bg_color hex
            hex_clean = bg_color.lstrip('#')
            if len(hex_clean) == 6:
                r, g, b = tuple(int(hex_clean[i:i+2], 16) for i in (0, 2, 4))
            else:
                r, g, b = (255, 255, 255)
            
            background = Image.new('RGB', img.size, (r, g, b))
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB' and pil_format == 'JPEG':
            img = img.convert('RGB')

        output_io = io.BytesIO()
        save_kwargs = {}
        if pil_format in ('JPEG', 'WEBP'):
            save_kwargs['quality'] = max(10, min(100, quality))
            save_kwargs['optimize'] = True
        elif pil_format == 'PNG':
            save_kwargs['optimize'] = True
        elif pil_format == 'ICO':
            # ICO format needs small dimensions
            img.thumbnail((256, 256))

        img.save(output_io, format=pil_format, **save_kwargs)
        output_io.seek(0)

        original_filename = os.path.splitext(file.filename or 'image')[0]
        download_name = f"{original_filename}_converted.{ext}"

        mimetypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'gif': 'image/gif',
            'ico': 'image/x-icon'
        }

        return send_file(
            output_io,
            mimetype=mimetypes.get(ext, 'application/octet-stream'),
            as_attachment=True,
            download_name=download_name
        )
    except Exception as e:
        return jsonify({'error': f"Görsel dönüştürme başarısız: {str(e)}"}), 500

@app.route('/api/convert-document', methods=['POST'])
def convert_document():
    """
    Parse uploaded Word (.docx, .doc), Text (.txt), Markdown (.md), RTF (.rtf), or CSV (.csv)
    Returns structured document content for PDF generation or client viewing.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Dosya yüklenmedi'}), 400

    file = request.files['file']
    filename = file.filename or 'document.txt'
    ext = os.path.splitext(filename)[1].lower()

    try:
        content_data = {
            'filename': filename,
            'ext': ext,
            'title': os.path.splitext(filename)[0],
            'elements': [],
            'word_count': 0,
            'char_count': 0
        }

        # Handle DOCX (OpenXML ZIP)
        if ext == '.docx':
            import zipfile
            import xml.etree.ElementTree as ET
            
            file_bytes = io.BytesIO(file.read())
            with zipfile.ZipFile(file_bytes) as z:
                if 'word/document.xml' in z.namelist():
                    xml_content = z.read('word/document.xml')
                    root = ET.fromstring(xml_content)
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    body = root.find('w:body', ns)
                    if body is not None:
                        total_words = 0
                        for child in body:
                            tag = child.tag.split('}')[-1]
                            if tag == 'p':
                                p_style = child.find('.//w:pStyle', ns)
                                style_val = p_style.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', '') if p_style is not None else ''
                                
                                text_runs = []
                                for r in child.findall('.//w:r', ns):
                                    is_bold = r.find('.//w:b', ns) is not None
                                    is_italic = r.find('.//w:i', ns) is not None
                                    t = r.find('.//w:t', ns)
                                    txt = t.text if t is not None and t.text else ''
                                    if txt:
                                        text_runs.append({'text': txt, 'bold': is_bold, 'italic': is_italic})
                                
                                full_text = ''.join(r['text'] for r in text_runs).strip()
                                if full_text:
                                    is_heading = any(k in style_val.lower() for k in ['heading', 'baslik', 'title', 'subtitle'])
                                    heading_level = 1
                                    if '2' in style_val: heading_level = 2
                                    elif '3' in style_val: heading_level = 3
                                    
                                    total_words += len(full_text.split())
                                    content_data['elements'].append({
                                        'type': 'heading' if is_heading else 'paragraph',
                                        'level': heading_level if is_heading else None,
                                        'style': style_val,
                                        'text': full_text,
                                        'runs': text_runs
                                    })
                            elif tag == 'tbl':
                                rows_data = []
                                for row in child.findall('.//w:tr', ns):
                                    cells_data = []
                                    for cell in row.findall('.//w:tc', ns):
                                        cell_texts = [ct.text for ct in cell.findall('.//w:t', ns) if ct.text]
                                        cells_data.append(' '.join(cell_texts).strip())
                                    if cells_data:
                                        rows_data.append(cells_data)
                                if rows_data:
                                    content_data['elements'].append({
                                        'type': 'table',
                                        'rows': rows_data
                                    })
                        content_data['word_count'] = total_words

        # Handle TXT, MD, CSV, RTF, JSON
        elif ext in ('.txt', '.md', '.markdown', '.csv', '.rtf', '.json', '.html'):
            raw_bytes = file.read()
            text = ''
            for enc in ('utf-8', 'utf-8-sig', 'windows-1254', 'iso-8859-9', 'latin-1'):
                try:
                    text = raw_bytes.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            
            lines = text.splitlines()
            total_words = 0
            for line in lines:
                clean_line = line.strip()
                if not clean_line:
                    continue
                total_words += len(clean_line.split())
                is_heading = clean_line.startswith('#') or (clean_line.isupper() and len(clean_line) < 60)
                level = 1
                if clean_line.startswith('###'): level = 3
                elif clean_line.startswith('##'): level = 2
                elif clean_line.startswith('#'): level = 1
                
                content_data['elements'].append({
                    'type': 'heading' if is_heading else 'paragraph',
                    'level': level,
                    'text': clean_line.lstrip('#').strip(),
                    'runs': [{'text': clean_line.lstrip('#').strip(), 'bold': is_heading, 'italic': False}]
                })
            content_data['word_count'] = total_words
            content_data['char_count'] = len(text)
        else:
            return jsonify({'error': f'Desteklenmeyen dosya formatı ({ext}). Lütfen .docx, .txt veya .md dosyası yükleyin.'}), 400

        return jsonify({'success': True, 'data': content_data})
    except Exception as e:
        return jsonify({'error': f'Belge işlenirken hata oluştu: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5055))
    print(f"🚀 OmniConvert Studio başlatılıyor: http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
