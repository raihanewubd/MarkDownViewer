param([string]$Executable)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if (-not $Executable) { $Executable = Join-Path $projectRoot 'output/rust/MarkUp-Viewer.exe' }
$reportPath = Join-Path $projectRoot ('output/rust-check-' + [Guid]::NewGuid().ToString('N') + '.json')
$samplePath = Join-Path $projectRoot 'source/sample.md'
$timer = [Diagnostics.Stopwatch]::StartNew()
$testProcess = Start-Process -FilePath $Executable -ArgumentList @('--self-test', ('"' + $reportPath + '"'), ('"' + $samplePath + '"')) -WindowStyle Hidden -PassThru
if (-not $testProcess.WaitForExit(60000)) {
    Stop-Process -Id $testProcess.Id -ErrorAction SilentlyContinue
    throw 'Viewer integration check timed out.'
}
$timer.Stop()
if ($testProcess.ExitCode -ne 0) { throw "Viewer exited with code $($testProcess.ExitCode)" }
if (-not (Test-Path -LiteralPath $reportPath)) { throw 'Viewer did not write a test report.' }
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
if ($report.status -ne 'passed') { throw 'Viewer reported a failed check.' }
$report | ConvertTo-Json
Write-Output ('Verified application initialization, document rendering, and process shutdown in ' + [Math]::Round($timer.Elapsed.TotalSeconds, 2) + ' seconds.')
