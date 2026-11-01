# Regenerates the Copilot (.github) and Antigravity (.agents) folders from .claude.
# .claude is the source of truth: edit there, then run:
#   powershell -ExecutionPolicy Bypass -File scripts\sync-agent-folders.ps1   (from the ShipCheck folder)
# Kept per agent (never overwritten): mcps/README.md (each agent configures MCP differently).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root '.claude'
$utf8 = New-Object Text.UTF8Encoding $false

$targets = @(
  @{ name = 'copilot'; dir = '.github'; ctx = 'instructions'; ext = '.instructions.md'
     ctxFrontmatter = "---`napplyTo: `"**`"`n---`n`n"
     mainPath = 'copilot-instructions.md'; mainTitle = '# Copilot Instructions'; mainFrontmatter = ''
     mainCtx = 'instructions/'; mainUp = ''; skillsWord = 'Copilot agent skills'
     ctxLine = '**`instructions/`**: background, applied to every request (`applyTo: "**"`).' },
  @{ name = 'antigravity'; dir = '.agents'; ctx = 'rules'; ext = '.md'
     ctxFrontmatter = "---`ntrigger: always_on`n---`n`n"
     mainPath = 'rules/GEMINI.md'; mainTitle = '# GEMINI.md'; mainFrontmatter = "---`ntrigger: always_on`n---`n`n"
     mainCtx = ''; mainUp = '../'; skillsWord = 'Antigravity skills'
     ctxLine = '**`rules/`**: this file plus background context, all always-on workspace rules.' }
)

function Read-Text($p) { [IO.File]::ReadAllText($p) }
function Write-Text($p, $t) { New-Item -ItemType Directory -Force (Split-Path -Parent $p) | Out-Null; [IO.File]::WriteAllText($p, $t, $utf8) }
$ctxNames = Get-ChildItem "$src\context\*.md" | ForEach-Object { $_.BaseName }

foreach ($t in $targets) {
  $dst = Join-Path $root $t.dir

  # 1. skills: replace wholesale, then rewrite links to context files
  if (Test-Path "$dst\skills") { Remove-Item "$dst\skills" -Recurse -Force }
  Copy-Item "$src\skills" "$dst\skills" -Recurse
  Get-ChildItem "$dst\skills" -Recurse -Filter *.md | ForEach-Object {
    $x = Read-Text $_.FullName
    foreach ($n in $ctxNames) { $x = $x.Replace("../../context/$n.md", "../../$($t.ctx)/$n$($t.ext)") }
    Write-Text $_.FullName $x
  }

  # 2. mcps: copy everything except the per-agent README
  Get-ChildItem "$src\mcps" -File | Where-Object { $_.Name -ne 'README.md' } | ForEach-Object { Copy-Item $_.FullName "$dst\mcps\$($_.Name)" -Force }

  # 3. context -> instructions/ or rules/ (remove stale generated context files first)
  foreach ($old in Get-ChildItem "$dst\$($t.ctx)" -File -ErrorAction SilentlyContinue) {
    if ($old.Name -ne 'GEMINI.md') { Remove-Item $old.FullName }
  }
  foreach ($n in $ctxNames) {
    $x = Read-Text "$src\context\$n.md"
    foreach ($m in $ctxNames) { $x = $x.Replace("]($m.md)", "]($m$($t.ext))") }
    Write-Text "$dst\$($t.ctx)\$n$($t.ext)" ($t.ctxFrontmatter + $x)
  }

  # 4. main instructions file, generated from CLAUDE.md
  $x = Read-Text "$src\CLAUDE.md"
  $x = $x.Replace('# CLAUDE.md', $t.mainTitle)
  $x = $x.Replace('**`context/`**: background, always loaded (imported below).', $t.ctxLine)
  $x = $x.Replace('Claude Code skills', $t.skillsWord)
  $x = $x.Replace('## Context (always loaded)', '## Context (always applied)')
  $x = $x.Replace('(imported below)', '(always applied)')
  foreach ($n in $ctxNames) {
    $file = "$($t.mainCtx)$n$($t.ext)"
    $x = $x.Replace("@context/$n.md", "See [$file]($file).")
    $x = $x.Replace("](context/$n.md)", "]($file)")
    $x = $x.Replace("[context/$n.md]", "[$file]")
    $x = $x.Replace("``context/$n.md``", "``$file``")
  }
  # '../' first: the skills/mcps rewrite below adds '../' for Antigravity and must not be prefixed twice
  $x = $x.Replace('](../', "]($($t.mainUp)../")
  $x = $x.Replace('](skills/', "]($($t.mainUp)skills/").Replace('](mcps/', "]($($t.mainUp)mcps/")
  Write-Text (Join-Path $dst $t.mainPath) ($t.mainFrontmatter + $x)
  Write-Host "$($t.name): synced to $($t.dir)"
}

# 5. verify every relative link in all three trees
$bad = @()
foreach ($tree in '.claude', '.github', '.agents') {
  Get-ChildItem (Join-Path $root $tree) -Recurse -Filter *.md | ForEach-Object {
    $dir = $_.DirectoryName; $txt = Read-Text $_.FullName
    [regex]::Matches($txt, '\]\(([^)#\s]+)\)') | ForEach-Object {
      $l = $_.Groups[1].Value
      if ($l -notmatch '^https?:' -and -not (Test-Path (Join-Path $dir $l))) { $bad += "$tree :: $($_.Value)" }
    }
    if ($tree -ne '.claude' -and $txt -match '(?m)^@context/') { $bad += "$tree :: leftover @import in $($_.Name)" }
  }
}
if ($bad) { Write-Host "BROKEN LINKS:"; $bad | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host 'All links resolve in .claude, .github and .agents.'

# 6. Antigravity rules are reported to be capped at 12,000 characters each
Get-ChildItem (Join-Path $root '.agents\rules') -File | ForEach-Object {
  if ($_.Length -gt 12000) { Write-Host "WARNING: $($_.Name) is $($_.Length) bytes (Antigravity rule cap is ~12,000 characters)" }
}
