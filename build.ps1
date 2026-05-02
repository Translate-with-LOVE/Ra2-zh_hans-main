<#
.SYNOPSIS
    Red Alert 2 Chinese Language Pack Build Script

.DESCRIPTION
    This script builds the Chinese language pack for Red Alert 2 and Yuri's Revenge.
    Output will be placed in the 'pack' directory with two subdirectories:
    - with_audio: Language pack with Chinese audio
    - without_audio: Language pack without Chinese audio
#>

param(
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$PackDir = Join-Path $ScriptDir "pack"
$PackWithAudio = Join-Path $PackDir "with_audio"
$PackWithoutAudio = Join-Path $PackDir "without_audio"
$Ccmixar = Join-Path $ScriptDir ".github/bin/ccmixar/ccmixar.exe"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Convert-SubtitleEncoding {
    param([string]$FilePath)
    $Content = Get-Content -Path $FilePath -Encoding BigEndianUnicode -Raw
    $Content = $Content -replace '\r?\n', "`r`n"
    [System.IO.File]::WriteAllText($FilePath, $Content, [System.Text.Encoding]::Unicode)
}

Write-Host "Red Alert 2 Chinese Language Pack Builder" -ForegroundColor Green
Write-Host "=========================================="

Ensure-Directory $PackDir
Ensure-Directory $PackWithAudio
Ensure-Directory $PackWithoutAudio

Write-Step "Step 1: Convert JSON to CSF"
Push-Location ".github/scripts/convert-json-to-csf"
try {
    node index.js
}
catch {
    Write-Error "Failed to convert JSON to CSF: $_"
    exit 1
}
finally {
    Pop-Location
}

Write-Step "Step 2: Copy CSF files"
Copy-Item "./ra2.csf" -Destination "./_src_files/language/" -Force
Copy-Item "./ra2md.csf" -Destination "./_src_files/langmd/" -Force

Write-Step "Step 2.5: Convert subtitle encoding to UTF-16 LE BOM"
Convert-SubtitleEncoding "./subtitle/subtitle.txt"
Convert-SubtitleEncoding "./subtitle/subtitlemd.txt"

Write-Step "Step 3: Convert PNG to SHP (Cameos)"
Push-Location ".github/scripts/convert-png-to-shp"
try {
    if (-not $SkipNpmInstall) {
        & npm install
        & node index.js
    }
}
catch {
    Write-Error "Failed to convert PNG to SHP: $_"
    exit 1
}
finally {
    Pop-Location
}

Write-Step "Step 4: Copy and pack cameo files"
Copy-Item "./cameo/ra2/*.shp" -Destination "./_src_files/cameo/" -Force
Copy-Item "./cameo/yr/*.shp" -Destination "./_src_files/cameomd/" -Force
& $Ccmixar pack -game ra2 -dir "./_src_files/cameo" -mix "./_src_files/language/cameo.mix" -checksum -encrypt
& $Ccmixar pack -game ra2 -dir "./_src_files/cameomd" -mix "./_src_files/langmd/cameomd.mix" -checksum -encrypt

Write-Step "Step 5: Copy other files"
Copy-Item "./bik/ra2/*" -Destination "./_src_files/language/" -Force
Copy-Item "./bik/yr/*" -Destination "./_src_files/langmd/" -Force
Copy-Item "./credits/credits.txt" -Destination "./_src_files/language/" -Force
Copy-Item "./credits/creditsmd.txt" -Destination "./_src_files/langmd/" -Force
Copy-Item "./fnt/game.fnt" -Destination "./_src_files/language/" -Force
Copy-Item "./shp/grfxtxt.shp" -Destination "./_src_files/language/" -Force

Write-Step "Step 6: Pack audio.mix and audiomd.mix"
& $Ccmixar pack -game ra2 -dir "./_src_files/audio" -mix "./_src_files/language/audio.mix"
& $Ccmixar pack -game ra2 -dir "./_src_files/audiomd" -mix "./_src_files/langmd/audiomd.mix"

Write-Step "Step 7: Pack language.mix and langmd.mix (without audio)"
& $Ccmixar pack -game ra2 -dir "./_src_files/language" -mix "./language.mix" -checksum -encrypt
& $Ccmixar pack -game ra2 -dir "./_src_files/langmd" -mix "./langmd.mix" -checksum

Write-Step "Step 8: Create pack without Chinese audio"
$TauntsDir = Join-Path $ScriptDir "Taunts"
Ensure-Directory $TauntsDir
Copy-Item "./_src_files/taunts/*" -Destination "$TauntsDir/" -Force

$ZipWithoutAudio = Join-Path $PackWithoutAudio "RedAlert2-LanguagePack-zh_hans.zip"
if (Get-Command 7z -ErrorAction SilentlyContinue) {
    7z a -tzip "$ZipWithoutAudio" "Taunts" ".\subtitle\*" "language.mix" "langmd.mix" | Out-Null
}
elseif (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
    $TempDir = Join-Path $env:TEMP "ra2pack_noaudio"
    Ensure-Directory "$TempDir\Taunts"
    Copy-Item "$TauntsDir\*" -Destination "$TempDir\Taunts" -Recurse -Force
    Copy-Item ".\subtitle\*" -Destination "$TempDir" -Recurse -Force
    Copy-Item "language.mix" -Destination $TempDir -Force
    Copy-Item "langmd.mix" -Destination $TempDir -Force
    Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipWithoutAudio -Force
    Remove-Item $TempDir -Recurse -Force
}
else {
    Write-Error "Neither 7z nor Compress-Archive available. Please install 7-Zip."
    exit 1
}

Write-Step "Step 9: Pack Chinese audio into BAG files"
Push-Location ".github/scripts/pack-audio-bags"
try {
    if (-not $SkipNpmInstall) {
        & npm install --force | Write-Host
    }
    & node index.js
}
catch {
    Write-Error "Failed to pack audio BAG files: $_"
    exit 1
}
finally {
    Pop-Location
}

Write-Step "Step 10: Copy other Chinese audio to mix folders"
Copy-Item "./audio_inMIX/ra2/*" -Destination "./_src_files/audio/" -Force
Copy-Item "./audio_inMIX/yr/*" -Destination "./_src_files/audiomd/" -Force

Write-Step "Step 11: Pack language.mix and langmd.mix (with audio)"
& $Ccmixar pack -game ra2 -dir "./_src_files/language" -mix "./language.mix" -checksum -encrypt
& $Ccmixar pack -game ra2 -dir "./_src_files/langmd" -mix "./langmd.mix" -checksum

Write-Step "Step 12: Create pack with Chinese audio"
$ZipWithAudio = Join-Path $PackWithAudio "RedAlert2-LanguagePack-zh_hans.zip"
if (Get-Command 7z -ErrorAction SilentlyContinue) {
    7z a -tzip "$ZipWithAudio" "Taunts" ".\subtitle\*" "language.mix" "langmd.mix" | Out-Null
}
elseif (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
    $TempDir = Join-Path $env:TEMP "ra2pack_withaudio"
    Ensure-Directory "$TempDir\Taunts"
    Copy-Item "$TauntsDir\*" -Destination "$TempDir\Taunts" -Recurse -Force
    Copy-Item ".\subtitle\*" -Destination "$TempDir" -Recurse -Force
    Copy-Item "language.mix" -Destination $TempDir -Force
    Copy-Item "langmd.mix" -Destination $TempDir -Force
    Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipWithAudio -Force
    Remove-Item $TempDir -Recurse -Force
}

Write-Step "Build Complete!"
Write-Host ""
Write-Host "Output files:" -ForegroundColor Green
Write-Host "  With audio:    $PackWithAudio\RedAlert2-LanguagePack-zh_hans.zip"
Write-Host "  Without audio: $PackWithoutAudio\RedAlert2-LanguagePack-zh_hans.zip"