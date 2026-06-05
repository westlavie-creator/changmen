@echo off
chcp 65001 >nul
title GameBet Build
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-portable.ps1"
