# Shrinks photos for the app with Windows' built-in imaging (System.Drawing); no downloads needed.
# Called by tools/add-photos.mjs with a JSON list of { src, dst } pairs.
param(
  [Parameter(Mandatory = $true)][string]$ListFile,
  [int]$Size = 720,
  [int]$Quality = 82
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$jobs = Get-Content -Raw -Encoding UTF8 $ListFile | ConvertFrom-Json
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

foreach ($job in $jobs) {
  $img = [System.Drawing.Image]::FromFile($job.src)
  try {
    # Phones store photos sideways and record the turn in EXIF (tag 0x0112); apply it.
    if ($img.PropertyIdList -contains 0x0112) {
      switch ([int]$img.GetPropertyItem(0x0112).Value[0]) {
        2 { $img.RotateFlip('RotateNoneFlipX') }
        3 { $img.RotateFlip('Rotate180FlipNone') }
        4 { $img.RotateFlip('Rotate180FlipX') }
        5 { $img.RotateFlip('Rotate90FlipX') }
        6 { $img.RotateFlip('Rotate90FlipNone') }
        7 { $img.RotateFlip('Rotate270FlipX') }
        8 { $img.RotateFlip('Rotate270FlipNone') }
      }
    }
    $scale = [Math]::Min(1.0, $Size / [Math]::Max($img.Width, $img.Height))
    $w = [int][Math]::Round($img.Width * $scale)
    $h = [int][Math]::Round($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = 'HighQualityBicubic'
      $g.SmoothingMode = 'HighQuality'
      $g.PixelOffsetMode = 'HighQuality'
      $g.CompositingQuality = 'HighQuality'
      $g.Clear([System.Drawing.Color]::White)
      $g.DrawImage($img, 0, 0, $w, $h)
      $g.Dispose()
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $job.dst) | Out-Null
      $bmp.Save($job.dst, $jpeg, $params)
    } finally {
      $bmp.Dispose()
    }
    Write-Output ('{0}  {1}x{2}' -f (Split-Path -Leaf $job.dst), $w, $h)
  } finally {
    $img.Dispose()
  }
}
