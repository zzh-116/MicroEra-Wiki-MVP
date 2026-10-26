# Start MiqroEra Wiki Backend.
#
# Resolves the Python 3.12 + Docling environment WITHOUT depending on any one
# user's absolute install path. Resolution order:
#   1. DOCLING_CMD / DOCLING_PYTHON already set in the shell.
#   2. `py -3.12` launcher (Windows py launcher, preferred for 3.12).
#   3. `docling` / `python` on PATH (version-checked for 3.10–3.12).
#   4. Common per-user install locations.
# The resolved values are exported as DOCLING_CMD + DOCLING_PYTHON so the
# backend worker (backend/parser/docling.ts) resolves them identically.
#
# A missing Python/Docling is a WARNING, not a hard failure: the backend still
# starts and reports a clear DEPENDENCY_MISSING error at parse time.

$ErrorActionPreference = "SilentlyContinue"

function Resolve-DoclingEnv {
    # -- Docling CLI (DOCLING_CMD) --
    if (-not $env:DOCLING_CMD) {
        $docling = Get-Command docling -ErrorAction SilentlyContinue
        if ($docling) { $env:DOCLING_CMD = $docling.Source }
    }

    # -- Python interpreter (DOCLING_PYTHON), 3.12 preferred --
    if (-not $env:DOCLING_PYTHON) {
        $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
        if ($pyLauncher) {
            $env:DOCLING_PYTHON = (& py -3.12 -c "import sys; print(sys.executable)" 2>$null)
        }
    }
    if (-not $env:DOCLING_PYTHON) {
        $py = Get-Command python -ErrorAction SilentlyContinue
        if ($py) {
            $v = (& python --version 2>$null)
            if ($v -match "3\.(10|11|12)") { $env:DOCLING_PYTHON = $py.Source }
        }
    }
    if (-not $env:DOCLING_PYTHON) {
        foreach ($cand in @(
            "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
            "$env:ProgramFiles\Python312\python.exe",
            "C:\Python312\python.exe"
        )) {
            if (Test-Path $cand) { $env:DOCLING_PYTHON = $cand; break }
        }
    }

    # -- Derive the docling.exe next to the resolved Python if still unset --
    if (-not $env:DOCLING_CMD -and $env:DOCLING_PYTHON) {
        $pyDir = Split-Path $env:DOCLING_PYTHON -Parent
        $doclingExe = Join-Path $pyDir "Scripts\docling.exe"
        if (Test-Path $doclingExe) { $env:DOCLING_CMD = $doclingExe }
    }

    if ($env:DOCLING_PYTHON) {
        Write-Host "[OK] Python: $(& $env:DOCLING_PYTHON --version 2>&1)"
    } else {
        Write-Warning "Python 3.10-3.12 not found. Set DOCLING_PYTHON to its python.exe."
    }
    if ($env:DOCLING_CMD) {
        Write-Host "[OK] Docling: $((& $env:DOCLING_CMD --version 2>&1 | Select-Object -First 1))"
    } else {
        Write-Warning "Docling CLI not found. Set DOCLING_CMD to docling.exe, or `python -m pip install docling==2.111.0`."
    }
}

Resolve-DoclingEnv
Write-Host "Starting backend..."
npx tsx server/index.ts
