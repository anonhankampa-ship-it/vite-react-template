$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$secureToken = Read-Host 'วาง Cloudflare token สำหรับ my-it-works (ตัวอักษรจะถูกซ่อน)' -AsSecureString
if ($secureToken.Length -eq 0) {
    throw 'ไม่ได้ใส่ Cloudflare API token'
}

$tokenPointer = [IntPtr]::Zero
try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $env:CLOUDFLARE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    & (Join-Path $PSScriptRoot 'node_modules\.bin\wrangler.cmd') deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler deploy failed with exit code $LASTEXITCODE"
    }
} finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    $secureToken.Dispose()
}
