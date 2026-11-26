$files = Get-ChildItem "E:\My Works\Completed Products\coding-challenge-platform\frontend\src" -Recurse -Include *.jsx,*.js,*.css
foreach ($f in $files) {
  $c = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
  $orig = $c
  $c = $c.Replace("COGNICLASH", "CogniClash")
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, (New-Object System.Text.UTF8Encoding $false))
    Write-Output "fixed $($f.Name)"
  }
}
