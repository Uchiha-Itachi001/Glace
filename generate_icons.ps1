Add-Type -AssemblyName System.Drawing

$sourcePath = 'd:\coding\Project\Glace\logo.png'
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

function Save-ResizedImage($img, $width, $height, $destPath) {
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $destImage = New-Object System.Drawing.Bitmap($width, $height)
    $destImage.SetResolution($img.HorizontalResolution, $img.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $graphics.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()

    $destImage.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImage.Dispose()
    Write-Host "Saved: $destPath"
}

# 1. Tauri Icons
$iconsDir = 'd:\coding\Project\Glace\src-tauri\icons'
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null }

Save-ResizedImage $srcImg 32 32 (Join-Path $iconsDir '32x32.png')
Save-ResizedImage $srcImg 128 128 (Join-Path $iconsDir '128x128.png')
Save-ResizedImage $srcImg 256 256 (Join-Path $iconsDir '128x128@2x.png')
Save-ResizedImage $srcImg 512 512 (Join-Path $iconsDir 'icon.png')
Save-ResizedImage $srcImg 30 30 (Join-Path $iconsDir 'Square30x30Logo.png')
Save-ResizedImage $srcImg 44 44 (Join-Path $iconsDir 'Square44x44Logo.png')
Save-ResizedImage $srcImg 71 71 (Join-Path $iconsDir 'Square71x71Logo.png')
Save-ResizedImage $srcImg 89 89 (Join-Path $iconsDir 'Square89x89Logo.png')
Save-ResizedImage $srcImg 107 107 (Join-Path $iconsDir 'Square107x107Logo.png')
Save-ResizedImage $srcImg 142 142 (Join-Path $iconsDir 'Square142x142Logo.png')
Save-ResizedImage $srcImg 150 150 (Join-Path $iconsDir 'Square150x150Logo.png')
Save-ResizedImage $srcImg 284 284 (Join-Path $iconsDir 'Square284x284Logo.png')
Save-ResizedImage $srcImg 310 310 (Join-Path $iconsDir 'Square310x310Logo.png')
Save-ResizedImage $srcImg 50 50 (Join-Path $iconsDir 'StoreLogo.png')

# 2. Public and Assets
$publicDir = 'd:\coding\Project\Glace\public'
if (-not (Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir -Force | Out-Null }
Save-ResizedImage $srcImg 512 512 (Join-Path $publicDir 'logo.png')
Save-ResizedImage $srcImg 32 32 (Join-Path $publicDir 'favicon.png')

$assetsDir = 'd:\coding\Project\Glace\src\assets'
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null }
Save-ResizedImage $srcImg 512 512 (Join-Path $assetsDir 'logo.png')

# 3. Create .ico file for Windows
function Create-Ico($img, $icoPath) {
    $sizes = @(16, 32, 48, 64, 128, 256)
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    
    # ICONDIR header
    $bw.Write([UInt16]0) # Reserved
    $bw.Write([UInt16]1) # Type: 1 = ICO
    $bw.Write([UInt16]$sizes.Count) # Count of images

    $imagesData = @()
    $offset = 6 + (16 * $sizes.Count)

    foreach ($size in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($img, 0, 0, $size, $size)
        $g.Dispose()

        $pngMs = New-Object System.IO.MemoryStream
        $bmp.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $pngMs.ToArray()
        $bmp.Dispose()
        $pngMs.Dispose()

        $imagesData += ,@($size, $bytes, $offset)
        $offset += $bytes.Length
    }

    foreach ($item in $imagesData) {
        $size = $item[0]
        $bytes = $item[1]
        $off = $item[2]

        $bWidth = if ($size -ge 256) { 0 } else { [byte]$size }
        $bHeight = if ($size -ge 256) { 0 } else { [byte]$size }

        $bw.Write([byte]$bWidth)
        $bw.Write([byte]$bHeight)
        $bw.Write([byte]0) # Color palette
        $bw.Write([byte]0) # Reserved
        $bw.Write([UInt16]1) # Color planes
        $bw.Write([UInt16]32) # Bits per pixel
        $bw.Write([UInt32]$bytes.Length) # Image size in bytes
        $bw.Write([UInt32]$off) # Image offset
    }

    foreach ($item in $imagesData) {
        $bytes = $item[1]
        $bw.Write($bytes)
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
    Write-Host "Created ICO: $icoPath"
}

Create-Ico $srcImg (Join-Path $iconsDir 'icon.ico')
Create-Ico $srcImg (Join-Path $publicDir 'favicon.ico')

$srcImg.Dispose()
Write-Host "All icons generated successfully!"
