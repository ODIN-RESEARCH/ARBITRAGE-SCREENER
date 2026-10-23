Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  ODIN RESEARCH (odinresearch.com)" -ForegroundColor Yellow
Write-Host "  Cross-Venue Arbitrage Screener and Backtester" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

try {
    python -c "import fastapi, uvicorn, requests, pandas, numpy" 2>$null
} catch {
    Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt --quiet
}

Write-Host "Starting Arbitrage Screener..." -ForegroundColor Green
python server.py
