#!/bin/bash
# OmniConvert Studio Başlatma Scripti
PORT=${PORT:-5055}
echo "=========================================="
echo "⚡ OmniConvert Studio Başlatılıyor..."
echo "📍 Adres: http://localhost:$PORT"
echo "=========================================="
python3 app.py
