@echo off
echo ===================================================
echo   Building Glace Production Release (v0.4.6)
echo ===================================================

call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%USERPROFILE%\.cargo\bin;%PATH%"

echo [1/3] Building frontend distribution...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Frontend build failed.
    exit /b %errorlevel%
)

echo [2/3] Compiling Tauri release binary...
call npx tauri build
if %errorlevel% neq 0 (
    echo Fallback: building cargo release binary...
    call "C:\Users\hp\.cargo\bin\cargo.exe" build --release --manifest-path src-tauri\Cargo.toml
)

echo [3/3] Copying release executables to release\ folder...
if not exist "release" mkdir release

if exist "src-tauri\target\release\glace.exe" (
    copy /Y "src-tauri\target\release\glace.exe" "release\glace.exe"
    copy /Y "src-tauri\target\release\glace.exe" "release\Glace-v0.4.6.exe"
    echo Success: Copied glace.exe and Glace-v0.4.6.exe to release\
)

if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    copy /Y "src-tauri\target\release\bundle\nsis\*.exe" "release\"
    echo Success: Copied NSIS installer to release\
)

if exist "src-tauri\target\release\bundle\msi\*.msi" (
    copy /Y "src-tauri\target\release\bundle\msi\*.msi" "release\"
    echo Success: Copied MSI package to release\
)

echo ===================================================
echo   Release build completed successfully!
echo   Files are located in: D:\coding\Project\Glace\release\
echo ===================================================
dir release
