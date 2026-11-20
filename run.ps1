$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$jar = Join-Path $projectRoot 'build\backend\hiai-menu-cart-checkout-1.0.0.jar'
if (-not (Test-Path -LiteralPath $jar)) {
    throw '尚未找到打包产物，请先执行 .\build.ps1'
}
$java = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    Join-Path $env:JAVA_HOME 'bin\java.exe'
} else {
    'java'
}
& $java -jar $jar
