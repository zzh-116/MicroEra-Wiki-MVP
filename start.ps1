# Start MicroEra Wiki Backend
$pythonDir = "C:\Users\CAIHUI\AppData\Local\Programs\Python\Python312"
$scriptsDir = "$pythonDir\Scripts"

# Add Python to PATH for this session
$env:PATH = "$pythonDir;$scriptsDir;$env:PATH"

Write-Host "[OK] Python: $(& $pythonDir\python.exe --version)"
Write-Host "[OK] Docling: $(& $scriptsDir\docling.exe --version)" -NoNewline
Write-Host ""
Write-Host "Starting backend..."
npx tsx backend/main.ts
