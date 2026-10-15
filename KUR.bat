@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ses Odasi - Windows programi olusturuluyor
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js gerekli. Acilan sayfadan "LTS" surumunu kurup bu dosyayi tekrar calistirin.
  start https://nodejs.org
  pause
  exit /b 1
)
echo [1/3] Bagimliliklar yukleniyor (ilk seferde birkac dakika surebilir)...
call npm install --no-audit --no-fund
if errorlevel 1 goto :err
echo [2/3] Program olusturuluyor...
call node prep.js
if errorlevel 1 goto :err
call node build.js
if errorlevel 1 goto :err
echo [3/3] Kuruluyor...
set "DST=%LOCALAPPDATA%\Programs\SesOdasi"
taskkill /f /im SesOdasi.exe >nul 2>nul
if exist "%DST%" rmdir /s /q "%DST%"
xcopy /e /i /y "dist\SesOdasi-win32-x64" "%DST%" >nul
if errorlevel 1 goto :err
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell;foreach($f in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){$s=$w.CreateShortcut((Join-Path $f 'Ses Odasi.lnk'));$s.TargetPath='%DST%\SesOdasi.exe';$s.WorkingDirectory='%DST%';$s.Save()}"
echo.
echo Tamam! Masaustunde "Ses Odasi" kisayolu olustu. Program: %DST%\SesOdasi.exe
start "" "%DST%\SesOdasi.exe"
timeout /t 4 >nul
exit /b 0
:err
echo.
echo BIR HATA OLUSTU. Yukaridaki mesaji kontrol edin (internet baglantisi gerekir).
pause
exit /b 1
