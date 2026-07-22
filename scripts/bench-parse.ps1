# ============================================================
# Document Parsing Benchmark
# Measures document → text/markdown extraction performance.
# Does NOT measure chunking, embedding, vector DB, or LLM.
# ============================================================
param(
    [string]$BaseUrl = "http://localhost:3001",
    [int]$Runs = 10,
    [switch]$SkipNative,
    [switch]$SkipDocling
)

$ErrorActionPreference = "Continue"

# ---- Resolve paths ----
$benchDir = Join-Path $PSScriptRoot "..\backend\data\tmp\bench"
if (-not (Test-Path $benchDir)) {
    Write-Host "ERROR: bench directory not found: $benchDir" -ForegroundColor Red
    Write-Host "Run: node scripts/generate-bench-files.js first" -ForegroundColor Yellow
    exit 1
}
$benchDir = (Resolve-Path $benchDir).Path

# ---- Environment info ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Document Parsing Benchmark" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Health check
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/pipeline/health" -Method Get -TimeoutSec 5
} catch {
    Write-Host "ERROR: Cannot connect to $BaseUrl" -ForegroundColor Red
    exit 1
}

$chatModel    = $health.pipeline.chatModel
$embedModel   = $health.pipeline.embeddingModel
$vectorStore  = $health.pipeline.vectorStore

# Parser capabilities
$formatsResp  = Invoke-RestMethod -Uri "$BaseUrl/api/pipeline/formats" -Method Get -TimeoutSec 5
$supportedExt = $formatsResp.formats | ForEach-Object { $_.extensions } | ForEach-Object { $_ }

Write-Host "Chat Model:       $chatModel" -ForegroundColor Yellow
Write-Host "Embedding Model:  $embedModel" -ForegroundColor Yellow
Write-Host "Vector Store:     $vectorStore" -ForegroundColor Yellow
Write-Host ""
Write-Host "Parser:" -ForegroundColor Yellow
Write-Host "  - Native Parser   (TXT / MD / CSV)" -ForegroundColor DarkGray
Write-Host "  - Docling CLI     (PDF / DOCX / PPTX / HTML / Images)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Runs per document: $Runs" -ForegroundColor Yellow

# ---- Collect test files ----
$testFiles = @()

# Native parser files from bench dir (exclude previous results)
Get-ChildItem $benchDir -File | Where-Object {
    $_.Name -ne 'bench_results.csv'
} | Sort-Object Length | ForEach-Object {
    $ext = $_.Extension.ToLower()
    $parser = if (@('.txt', '.md', '.csv') -contains $ext) { 'Native Parser' } else { 'Docling CLI' }
    $testFiles += [PSCustomObject]@{
        Path   = $_.FullName
        Name   = $_.Name
        Ext    = $ext -replace '^\.', ''
        Size   = $_.Length
        Parser = $parser
    }
}

# ---- Benchmark function ----
function Invoke-Parse($filePath) {
    $body = @{ filePath = $filePath } | ConvertTo-Json -Compress
    try {
        $result = Invoke-RestMethod -Uri "$BaseUrl/api/pipeline/parse" `
            -Method Post -Body $body -ContentType "application/json" -TimeoutSec 120
        return [PSCustomObject]@{
            Success  = $true
            WallMs   = $result.timing.wallMs
            ParseMs  = $result.timing.parseMs
            TotalMs  = $result.timing.totalMs
            Format   = $result.format
            CharCount = $result.fullLength
            Error    = $null
        }
    } catch {
        $errBody = ""
        try {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            $reader.Close()
        } catch { }
        return [PSCustomObject]@{
            Success  = $false
            WallMs   = 0
            ParseMs  = 0
            TotalMs  = 0
            Format   = ""
            CharCount = 0
            Error    = if ($errBody) { $errBody } else { $_.Exception.Message }
        }
    }
}

# Time formatter: show ms or s depending on magnitude
function Format-Time($ms) {
    if ($ms -ge 1000) { return "{0,8:n2} s" -f ($ms / 1000) }
    return "{0,8:n2} ms" -f $ms
}

# ---- Run benchmarks ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Running..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allResults = @()
$skippedNative = 0
$skippedDocling = 0

foreach ($file in $testFiles) {
    if ($SkipNative -and $file.Parser -eq 'Native Parser') { $skippedNative++; continue }
    if ($SkipDocling -and $file.Parser -eq 'Docling CLI') { $skippedDocling++; continue }

    $sizeLabel = if ($file.Size -lt 1024) { "$($file.Size) B" }
                 elseif ($file.Size -lt 1048576) { "$([math]::Round($file.Size/1024,1)) KB" }
                 else { "$([math]::Round($file.Size/1048576,1)) MB" }

    Write-Host ""
    Write-Host ">> $($file.Ext.ToUpper()) | $sizeLabel | Parser: $($file.Parser)" -ForegroundColor Green

    $runResults = @()
    for ($i = 1; $i -le $Runs; $i++) {
        $r = Invoke-Parse $file.Path
        $runResults += $r
        if ($r.Success) {
            Write-Host ("  [{0,2}/{1}] {2,10:n2} ms" -f $i, $Runs, $r.WallMs)
        } else {
            $errPreview = if ($r.Error.Length -gt 120) { $r.Error.Substring(0, 120) + "..." } else { $r.Error }
            Write-Host ("  [{0,2}/{1}] FAIL: {2}" -f $i, $Runs, $errPreview) -ForegroundColor Red
        }
    }

    # @(...) forces array — prevents scalar unwrapping when count=1
    $successRuns = @($runResults | Where-Object { $_.Success }).Count
    $failRuns    = @($runResults | Where-Object { -not $_.Success }).Count
    $wallTimes   = @($runResults | Where-Object { $_.Success } | ForEach-Object { $_.WallMs })

    if ($wallTimes.Count -eq 0) { $wallTimes = @(0) }
    $avg    = [math]::Round(($wallTimes | Measure-Object -Average).Average, 2)
    $min    = [math]::Round(($wallTimes | Measure-Object -Minimum).Minimum, 2)
    $max    = [math]::Round(($wallTimes | Measure-Object -Maximum).Maximum, 2)
    $stddev = 0
    if ($wallTimes.Count -gt 1) {
        $sumSq = 0
        foreach ($v in $wallTimes) { $sumSq += [math]::Pow($v - $avg, 2) }
        $stddev = [math]::Round([math]::Sqrt($sumSq / $wallTimes.Count), 2)
    }

    # Determine output type
    $outputType = if ($runResults[0].Format -match '^(txt|csv)$') { 'Text' } else { 'Markdown' }

    $allResults += [PSCustomObject]@{
        Format     = $file.Ext.ToUpper()
        SizeBytes  = $file.Size
        SizeLabel  = $sizeLabel
        Parser     = $file.Parser
        Output     = $outputType
        Runs       = $Runs
        Success    = $successRuns
        Fail       = $failRuns
        Avg        = $avg
        Min        = $min
        Max        = $max
        StdDev     = $stddev
        WallTimes  = $wallTimes
        CharCount  = if ($runResults[0].Success) { $runResults[0].CharCount } else { 0 }
    }
}

# ---- Results Table ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($allResults.Count -eq 0) {
    Write-Host "  No results. Check --SkipNative / --SkipDocling flags." -ForegroundColor Yellow
} else {
    $allResults | Sort-Object Parser, SizeBytes | Format-Table -Property `
        @{N='Format'; E={$_.Format}; Width=8},
        @{N='Size';     E={$_.SizeLabel}; Width=10},
        @{N='Parser';   E={$_.Parser}; Width=8},
        @{N='Output';   E={$_.Output}; Width=9},
        @{N='Runs';     E={$_.Runs}; Width=5},
        @{N='Avg';      E={Format-Time $_.Avg}; Width=12; Align='Right'},
        @{N='Min';      E={Format-Time $_.Min}; Width=12; Align='Right'},
        @{N='Max';      E={Format-Time $_.Max}; Width=12; Align='Right'},
        @{N='StdDev';   E={Format-Time $_.StdDev}; Width=12; Align='Right'},
        @{N='Success';  E={"{0}/{1}" -f $_.Success, $_.Runs}; Width=8} -AutoSize
}

# ---- Summary ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalRuns   = ($allResults | Measure-Object -Property Runs -Sum).Sum
$totalSucc   = ($allResults | Measure-Object -Property Success -Sum).Sum
$totalFail   = ($allResults | Measure-Object -Property Fail -Sum).Sum
$nativeFiles = ($allResults | Where-Object { $_.Parser -eq 'Native Parser' }).Count
$doclingFiles= ($allResults | Where-Object { $_.Parser -eq 'Docling CLI' }).Count

Write-Host "Files Tested : $($allResults.Count)"
Write-Host "Runs/File    : $Runs"
Write-Host "Total Runs   : $totalRuns"
Write-Host ""
Write-Host "Successful   : $totalSucc"
Write-Host "Failed       : $totalFail"
Write-Host ""

if ($nativeFiles -gt 0) {
    Write-Host "Average Parse Time" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Native Parser" -ForegroundColor DarkGray
    # Group by format, average across sizes
    $allResults | Where-Object { $_.Parser -eq 'Native Parser' } |
        Group-Object -Property Format |
        Sort-Object Name |
        ForEach-Object {
            $avgMs = ($_.Group | Measure-Object -Property Avg -Average).Average
            $timeStr = if ($avgMs -ge 1000) { "{0:n2} s" -f ($avgMs / 1000) } else { "{0:n2} ms" -f $avgMs }
            Write-Host ("  {0,-6} : {1,10}" -f $_.Name, $timeStr)
        }
}

if ($doclingFiles -gt 0) {
    Write-Host ""
    Write-Host "  Docling CLI" -ForegroundColor DarkGray
    $allResults | Where-Object { $_.Parser -eq 'Docling CLI' } |
        Group-Object -Property Format |
        Sort-Object Name |
        ForEach-Object {
            $avgMs = ($_.Group | Measure-Object -Property Avg -Average).Average
            $timeStr = if ($avgMs -ge 1000) { "{0:n2} s" -f ($avgMs / 1000) } else { "{0:n2} ms" -f $avgMs }
            Write-Host ("  {0,-6} : {1,10}" -f $_.Name, $timeStr)
        }
}

# Overall Average across all files
$overallAvg = ($allResults | Measure-Object -Property Avg -Average).Average
$overallStr = if ($overallAvg -ge 1000) { "{0:n2} s" -f ($overallAvg / 1000) } else { "{0:n2} ms" -f $overallAvg }
Write-Host ""
Write-Host ("  Overall Average : {0,10}" -f $overallStr) -ForegroundColor Cyan

# ---- Scope ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Benchmark Scope" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This benchmark measures document parsing performance only."
Write-Host ""
Write-Host "Included:" -ForegroundColor Green
Write-Host "  $([char]0x2713) File type detection"
Write-Host "  $([char]0x2713) Native Parser (TXT / MD / CSV)"
Write-Host "  $([char]0x2713) Docling Parser (PDF / DOCX / PPTX / HTML / Images)"
Write-Host "  $([char]0x2713) Text / Markdown extraction"
Write-Host ""
Write-Host "Excluded:" -ForegroundColor Red
Write-Host "  $([char]0x2717) Chunking"
Write-Host "  $([char]0x2717) Embedding"
Write-Host "  $([char]0x2717) Vector Database"
Write-Host "  $([char]0x2717) Indexing"
Write-Host "  $([char]0x2717) LLM inference"
Write-Host "  $([char]0x2717) RAG Retrieval"
Write-Host ""

# ---- Environment ----
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Collect env info from server
try {
    $status = Invoke-RestMethod -Uri "$BaseUrl/api/pipeline/status" -Method Get -TimeoutSec 5
} catch { $status = $null }

Write-Host "Server:" -ForegroundColor Yellow
Write-Host "  Chat Model      : $chatModel"
Write-Host "  Embedding Model : $embedModel"
Write-Host "  Vector Store    : $vectorStore"

# Docling version
$doclingVer = ""
try {
    $v = & docling --version 2>&1 | Select-Object -First 1
    if ($v -match '[\d.]+') {
        $doclingVer = $matches[0]
        Write-Host "  Docling Version : $doclingVer"
    }
} catch { }

# System info
$os   = (Get-CimInstance Win32_OperatingSystem).Caption
$cpu  = (Get-CimInstance Win32_Processor).Name -replace '\s+', ' '
$mem  = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)

Write-Host ""
Write-Host "System:" -ForegroundColor Yellow
Write-Host "  Node.js         : $(node --version)"
Write-Host "  OS              : $os"
Write-Host "  CPU             : $cpu"
Write-Host "  Memory          : $mem GB"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Benchmark Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- Export CSV ----
$csvPath = Join-Path $benchDir "bench_results.csv"
$allResults | Select-Object Format,SizeLabel,Parser,Output,Runs,Success,Fail,Avg,Min,Max,StdDev,CharCount |
    Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Host "Raw data saved: $csvPath" -ForegroundColor DarkGray

# ---- Export Report (mirrors console output) ----
$reportPath = Join-Path $benchDir "bench_results.txt"
$report = @()

$report += "=" * 50
$report += "  Document Parsing Benchmark"
$report += "=" * 50
$report += ""
$report += "Chat Model:       $chatModel"
$report += "Embedding Model:  $embedModel"
$report += "Vector Store:     $vectorStore"
$report += ""
$report += "Parser:"
$report += "  - Native Parser   (TXT / MD / CSV)"
$report += "  - Docling CLI     (PDF / DOCX / PPTX / HTML / Images)"
$report += ""
$report += "Runs per document: $Runs"
$report += ""
$report += "=" * 50
$report += "  RESULTS"
$report += "=" * 50
$report += ""
$report += ($allResults | Sort-Object Parser, SizeBytes | Format-Table -Property `
    @{N='Format'; E={$_.Format}; Width=8},
    @{N='Size';   E={$_.SizeLabel}; Width=10},
    @{N='Parser'; E={$_.Parser}; Width=14},
    @{N='Output'; E={$_.Output}; Width=9},
    @{N='Runs';   E={$_.Runs}; Width=5},
    @{N='Avg';    E={Format-Time $_.Avg}; Width=12; Align='Right'},
    @{N='Min';    E={Format-Time $_.Min}; Width=12; Align='Right'},
    @{N='Max';    E={Format-Time $_.Max}; Width=12; Align='Right'},
    @{N='StdDev'; E={Format-Time $_.StdDev}; Width=12; Align='Right'},
    @{N='Success';E={"{0}/{1}" -f $_.Success, $_.Runs}; Width=8} -AutoSize | Out-String -Width 160)

$report += ""
$report += "=" * 50
$report += "  Summary"
$report += "=" * 50
$report += ""
$report += "Files Tested : $($allResults.Count)"
$report += "Runs/File    : $Runs"
$report += "Total Runs   : $totalRuns"
$report += ""
$report += "Successful   : $totalSucc"
$report += "Failed       : $totalFail"
$report += ""

if ($nativeFiles -gt 0) {
    $report += "Average Parse Time"
    $report += ""
    $report += "  Native Parser"
    $allResults | Where-Object { $_.Parser -eq 'Native Parser' } |
        Group-Object -Property Format | Sort-Object Name | ForEach-Object {
            $avgMs = ($_.Group | Measure-Object -Property Avg -Average).Average
            $timeStr = if ($avgMs -ge 1000) { "{0:n2} s" -f ($avgMs / 1000) } else { "{0:n2} ms" -f $avgMs }
            $report += ("  {0,-6} : {1,10}" -f $_.Name, $timeStr)
        }
}

if ($doclingFiles -gt 0) {
    $report += ""
    $report += "  Docling CLI"
    $allResults | Where-Object { $_.Parser -eq 'Docling CLI' } |
        Group-Object -Property Format | Sort-Object Name | ForEach-Object {
            $avgMs = ($_.Group | Measure-Object -Property Avg -Average).Average
            $timeStr = if ($avgMs -ge 1000) { "{0:n2} s" -f ($avgMs / 1000) } else { "{0:n2} ms" -f $avgMs }
            $report += ("  {0,-6} : {1,10}" -f $_.Name, $timeStr)
        }
}

$report += ""
$report += ("  Overall Average : {0,10}" -f $overallStr)
$report += ""
$report += "=" * 50
$report += "  Benchmark Scope"
$report += "=" * 50
$report += ""
$report += "This benchmark measures document parsing performance only."
$report += ""
$report += "Included:"
$report += "  + File type detection"
$report += "  + Native Parser (TXT / MD / CSV)"
$report += "  + Docling Parser (PDF / DOCX / PPTX / HTML / Images)"
$report += "  + Text / Markdown extraction"
$report += ""
$report += "Excluded:"
$report += "  - Chunking"
$report += "  - Embedding"
$report += "  - Vector Database"
$report += "  - Indexing"
$report += "  - LLM inference"
$report += "  - RAG Retrieval"
$report += ""
$report += "=" * 50
$report += "  Environment"
$report += "=" * 50
$report += ""
$report += "Server:"
$report += "  Chat Model      : $chatModel"
$report += "  Embedding Model : $embedModel"
$report += "  Vector Store    : $vectorStore"
if ($doclingVer) {
    $report += "  Docling Version : $doclingVer"
}
$report += ""
$report += "System:"
$report += "  Node.js         : $(node --version)"
$report += "  OS              : $os"
$report += "  CPU             : $cpu"
$report += "  Memory          : $mem GB"
$report += ""

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "Report saved  : $reportPath" -ForegroundColor DarkGray
Write-Host ""
