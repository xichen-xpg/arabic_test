param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
foreach ($item in (Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    $metafile = [System.Drawing.Imaging.Metafile]::new($item.source)
    $bitmap = [System.Drawing.Bitmap]::new([int]$item.width, [int]$item.height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($metafile, 0, 0, $bitmap.Width, $bitmap.Height)
        $bitmap.Save($item.output, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
        $metafile.Dispose()
    }
}
