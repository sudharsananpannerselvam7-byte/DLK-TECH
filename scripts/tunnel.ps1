while ($true) {
    Write-Host "[SmartFlow Tunnel] Connecting to localtunnel on port 3000..."
    npx -y localtunnel --port 3000 --subdomain smartflow-dlk
    Start-Sleep -Seconds 3
}
