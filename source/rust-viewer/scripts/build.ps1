$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = [IO.Path]::GetFullPath((Join-Path $appRoot '../..'))
$version = (Get-Content -LiteralPath (Join-Path $appRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).version
Push-Location $appRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
    cargo test --locked --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed.' }
    npm run build -- --ci -- --locked
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    $destination = Join-Path $projectRoot 'output/rust'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $versionedExecutable = Join-Path $destination "MarkUp-Viewer-$version.exe"
    Copy-Item -LiteralPath (Join-Path $appRoot 'src-tauri/target/release/markup-viewer.exe') -Destination $versionedExecutable -Force
    try { Copy-Item -LiteralPath $versionedExecutable -Destination (Join-Path $destination 'MarkUp-Viewer.exe') -Force }
    catch { Write-Warning 'The running executable could not be replaced. Use the new versioned executable.' }
    $installer = Get-ChildItem -LiteralPath (Join-Path $appRoot 'src-tauri/target/release/bundle/nsis') -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) { throw 'Setup executable was not created.' }
    Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $destination "MarkUp-Viewer-$version-x64-setup.exe") -Force
    & (Join-Path $PSScriptRoot 'verify.ps1') -Executable $versionedExecutable
    if ($LASTEXITCODE -ne 0) { throw 'Application verification failed.' }
    Get-ChildItem -LiteralPath $destination -Filter '*.exe' | Get-FileHash -Algorithm SHA256 | Select-Object Hash,Path
} finally {
    Pop-Location
}
