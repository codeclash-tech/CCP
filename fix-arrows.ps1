$files = Get-ChildItem "E:\My Works\Completed Products\coding-challenge-platform\frontend\src" -Recurse -Include *.jsx,*.js,*.css
$map = @{
  [char]0x00E2 + [char]0x2020 = [string][char]0x2192   # â† -> →
  [string][char]0x00E2 + [string][char]0x2020 + [string][char]0x0097 = [string][char]0x2197  # â†— -> ↗
  [string][char]0x00E2 + [string][char]0x2020 + [string][char]0x0093 = [string][char]0x2193  # â†“ -> ↓
  [string][char]0x00E2 + [string][char]0x2020 + [string][char]0x0091 = [string][char]0x2191  # â†‘ -> ↑
  [string][char]0x00E2 + [string][char]0x2020 + [string][char]0x0090 = [string][char]0x2190  # â† -> ←
  [string][char]0x00E2 + [string][char]0x20AC + [string][char]0x00A2 = [string][char]0x2022  # â€¢ -> •
  [string][char]0x00E2 + [string][char]0x20AC + [string][char]0x0093 = "—"                  # â€“ variant em dash
  [string][char]0x00E2 + [string][char]0x20AC + [string][char]0x0094 = "—"                  # â€” variant
}
foreach ($f in $files) {
  $c = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
  $orig = $c
  foreach ($k in $map.Keys) { $c = $c.Replace($k, $map[$k]) }
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, (New-Object System.Text.UTF8Encoding $false))
    Write-Output "fixed $($f.Name)"
  }
}
