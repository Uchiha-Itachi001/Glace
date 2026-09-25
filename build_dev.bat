@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
"C:\Users\hp\.cargo\bin\cargo.exe" build --manifest-path src-tauri\Cargo.toml
