[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location "$PSScriptRoot\changmen\gamebet_backend"
& ".\electron\build-portable.ps1"
