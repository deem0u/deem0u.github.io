# Deploy Cloudflare Worker. Run from this directory: .\deploy.ps1
# Or from repo root: .\cloudflare-worker\deploy.ps1
Set-Location $PSScriptRoot
npx wrangler deploy
