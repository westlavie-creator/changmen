# Delegate to Node driver (avoids PowerShell CRLF on ssh stdin)
& node (Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\sync-telegram-env.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
