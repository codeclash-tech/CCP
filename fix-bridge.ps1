// Fix the broken rename: the Electron preload bridge must stay window.codeClashDesktop.
$files = Get-ChildItem "E:\My Works\Completed Products\coding-challenge-platform\frontend\src" -Recurse -Include *.jsx,*.js,*.css
foreach ($f in $files) {
  $c = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
  $orig = $c
  $c = $c.Replace("window.COGNICLASHDesktop", "window.codeClashDesktop")
  # editor preference storage/event keys must match the original too (they are data keys, not user-facing)
  $c = $c.Replace("COGNICLASH-editor-preferences", "codeclash-editor-preferences")
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, (New-Object System.Text.UTF8Encoding $false))
    Write-Output "fixed $($f.Name)"
  }
}
