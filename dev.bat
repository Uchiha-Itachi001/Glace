@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
npx tauri dev
