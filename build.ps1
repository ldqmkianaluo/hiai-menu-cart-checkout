$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$buildDir = Join-Path $projectRoot "build\packages\$buildStamp"

Push-Location (Join-Path $projectRoot 'frontend')
try {
    if (Test-Path -LiteralPath 'package-lock.json') {
        npm ci
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
} finally {
    Pop-Location
}

Push-Location (Join-Path $projectRoot 'backend')
try {
    mvn clean package "-Dhiai.build.directory=$buildDir"
    if ($LASTEXITCODE -ne 0) { throw '后端打包失败' }
} finally {
    Pop-Location
}

$jar = Join-Path $buildDir 'hiai-menu-cart-checkout-1.0.0.jar'
$latestPointer = Join-Path $projectRoot 'build\latest.txt'
Set-Content -LiteralPath $latestPointer -Value $jar -Encoding utf8
Write-Host "打包完成：$jar"
