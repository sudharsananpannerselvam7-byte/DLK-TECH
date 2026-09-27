# SmartFlow Development Cluster Launcher
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Starting SmartFlow Production Services       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Start Backend
Write-Host "`n[1/2] Launching Flask API Backend on http://localhost:5000..." -ForegroundColor Yellow
$BackendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'd:\DLK PROJECT\backend'; python run.py" -PassThru

# Start Frontend
Write-Host "[2/2] Launching Next.js Frontend on http://localhost:3000..." -ForegroundColor Yellow
$FrontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'd:\DLK PROJECT\frontend'; npm run start" -PassThru

Write-Host "`nCluster services running!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "Backend:  http://localhost:5000" -ForegroundColor White
Write-Host "Health:   http://localhost:5000/api/v1/health" -ForegroundColor White
