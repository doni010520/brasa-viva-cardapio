@echo off
title Impressao de comandas - Brasa Viva
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado neste computador.
  echo  Baixe em https://nodejs.org e instale, depois abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo  Falta o arquivo de configuracao.
  echo  Copie ".env.exemplo" para ".env" e preencha os dados.
  echo.
  pause
  exit /b 1
)

:rodar
node agente.mjs
echo.
echo  O agente parou. Reiniciando em 10 segundos... (feche a janela para cancelar)
timeout /t 10 >nul
goto rodar
