# Draft-only narration with the built-in Windows voice (System.Speech, Microsoft Huihui Desktop).
# Used only to cut a picture sample while the Edge online voice is unavailable; never the final voice.
# Writes one wav per segment plus word boundaries with real audio positions (SpeakProgress events).
param([string]$Root)
Add-Type -AssemblyName System.Speech
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'narration.json') | ConvertFrom-Json
$out = Join-Path $Root 'audio\draft-sapi'
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($seg in $cfg.segments) {
    $wav = Join-Path $out ($seg.id + '.wav')
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SelectVoice('Microsoft Huihui Desktop')
    $synth.Rate = 2
    $marks = New-Object System.Collections.ArrayList
    $handler = [System.EventHandler[System.Speech.Synthesis.SpeakProgressEventArgs]] {
        param($s, $e)
        [void]$marks.Add(@{ offset = [int64]$e.AudioPosition.Ticks; chars = $e.CharacterCount; pos = $e.CharacterPosition; text = $e.Text })
    }
    $synth.add_SpeakProgress($handler)
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($seg.text)
    $synth.SetOutputToNull()
    $synth.Dispose()
    $list = @($marks | ForEach-Object { [pscustomobject]@{ offset = $_.offset; duration = 0; text = $_.text; pos = $_.pos; chars = $_.chars } })
    $json = [pscustomobject]@{ text = $seg.text; voice = 'Microsoft Huihui Desktop (SAPI, draft only)'; rate = 'Rate=2'; marks = $list } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $out ($seg.id + '.json')), $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Output ("{0} marks={1}" -f $seg.id, $list.Count)
}
