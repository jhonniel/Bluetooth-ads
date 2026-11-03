#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs the Beacon Ads advertising agent as a Windows scheduled task that starts automatically.

.DESCRIPTION
  Copies dist\agent.cjs and dist\native\BpaBleHelper.exe to the install directory, restricts the
  data directory ACL, and registers a scheduled task that runs the agent in the background with
  automatic restart on failure.

  Enroll the agent first (or afterwards) with:
    node "<InstallDir>\agent.cjs" enroll --server https://ads.example.com --station STN-XXXX --token <token>

.PARAMETER RunAs
  System      - start at boot as LocalSystem (no user needs to sign in). Recommended for kiosks.
  CurrentUser - start when the current user signs in. Use this if the Bluetooth driver does not allow
                advertising from a non-interactive session (the station then reports WAITING or ERROR).
#>
param(
  [string]$InstallDir = "$env:ProgramFiles\BpaAgent",
  [ValidateSet("System", "CurrentUser")]
  [string]$RunAs = "System",
  [string]$TaskName = "BeaconAdsAgent"
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "..\dist"
$dataDir = Join-Path $env:ProgramData "BpaAgent"

$build = [System.Environment]::OSVersion.Version.Build
if ($build -lt 19041) { throw "Windows 10 version 2004 (build 19041) or later is required. This PC is build $build." }

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw "Node.js 20 or later must be installed and on PATH." }
$node = $nodeCommand.Source
$nodeMajor = [int]((& $node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { throw "Node.js 20 or later is required (found $(& $node --version))." }

foreach ($file in @("agent.cjs", "native\BpaBleHelper.exe")) {
  if (-not (Test-Path (Join-Path $source $file))) {
    throw "Missing $file in $source. Run 'npm run build' and 'npm run build:native' in apps/windows-agent first."
  }
}

Write-Host "Installing agent to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir, (Join-Path $InstallDir "native"), $dataDir | Out-Null
Copy-Item (Join-Path $source "agent.cjs") $InstallDir -Force
Copy-Item (Join-Path $source "agent.cjs.map") $InstallDir -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $source "native\*") (Join-Path $InstallDir "native") -Recurse -Force

# Data directory holds the DPAPI-protected credential: SYSTEM and Administrators only, plus the run-as user.
Write-Host "Restricting access to $dataDir"
& icacls.exe $dataDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
if ($RunAs -eq "CurrentUser") {
  & icacls.exe $dataDir /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)M" | Out-Null
}

$agentPath = Join-Path $InstallDir "agent.cjs"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$agentPath`" run" -WorkingDirectory $InstallDir
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

if ($RunAs -eq "System") {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} else {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$($env:USERDOMAIN)\$($env:USERNAME)"
  $principal = New-ScheduledTaskPrincipal -UserId "$($env:USERDOMAIN)\$($env:USERNAME)" -LogonType Interactive -RunLevel Limited
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "Replacing existing task $TaskName"
  & $node $agentPath stop | Out-Null
  Start-Sleep -Seconds 5
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Beacon Ads Bluetooth advertising station agent" | Out-Null

if (Test-Path (Join-Path $dataDir "config.json")) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Agent installed and started. Logs: $dataDir\logs"
} else {
  Write-Host "Agent installed. Enroll it, then start the task:"
  Write-Host "  node `"$agentPath`" enroll --server <https-url> --station <STATION-ID> --token <token>"
  Write-Host "  Start-ScheduledTask -TaskName $TaskName"
}
