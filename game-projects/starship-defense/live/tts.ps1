param([Parameter(Mandatory=$true)][string]$InputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$data=Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoice($data.voice)
  $synth.Rate=1
  $synth.SetOutputToWaveFile($data.output)
  $synth.Speak([string]$data.text)
} finally { $synth.Dispose() }
