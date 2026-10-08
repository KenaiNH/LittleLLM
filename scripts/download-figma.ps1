$ErrorActionPreference = 'Stop'
$assetItems = Get-Content -Raw -LiteralPath 'docs/design/assets.json' | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path 'assets/figma' | Out-Null
foreach ($assetItem in $assetItems) {
  Invoke-WebRequest -Uri $assetItem.url -OutFile $assetItem.path -UseBasicParsing
}
Write-Output ('Downloaded ' + $assetItems.Count + ' Figma assets')
