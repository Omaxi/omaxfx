@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo OmaxFX dependencies are missing.
  echo Run npm ci once while internet or the npm package cache is available.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Offline production build is missing.
  echo Run npm run build:offline once before starting offline.
  pause
  exit /b 1
)
echo Starting OmaxFX offline at http://localhost:4173
echo Keep this window open while using OmaxFX.
call npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
