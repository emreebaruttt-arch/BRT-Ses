@echo off
if exist "%APPDATA%\Ses Odasi\log.txt" (notepad "%APPDATA%\Ses Odasi\log.txt") else (echo Kayit dosyasi yok. Program hic acilmamis olabilir. & pause)
