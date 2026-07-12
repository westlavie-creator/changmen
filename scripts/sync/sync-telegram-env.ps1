# Delegate to Node driver (avoids PowerShell CRLF on ssh stdin)
& node (Join-Path $PSScriptRoot "sync-telegram-env.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
