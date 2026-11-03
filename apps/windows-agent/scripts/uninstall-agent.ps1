#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Stops and removes the Beacon Ads agent scheduled task. Use -RemoveData to also delete the stored
  credential, configuration and logs (revoke the credential in the dashboard as well).
#>
param(
  [string]$InstallDir = "$env:ProgramFiles\BpaAgent",
  [string]$TaskName = "BeaconAdsAgent",
  [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
$agentPath = Join-Path $InstallDir "agent.cjs"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  if (Test-Path $agentPath) {
    # Graceful stop: the agent stops advertising and sends a final heartbeat before exiting.
    & node $agentPath stop | Out-Null
    Start-Sleep -Seconds 6
  }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task $TaskName"
}

if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force $InstallDir
  Write-Host "Removed $InstallDir"
}

if ($RemoveData) {
  $dataDir = Join-Path $env:ProgramData "BpaAgent"
  if (Test-Path $dataDir) {
    Remove-Item -Recurse -Force $dataDir
    Write-Host "Removed $dataDir"
  }
}
