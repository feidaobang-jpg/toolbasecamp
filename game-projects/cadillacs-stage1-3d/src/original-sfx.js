// Original arcade recordings: source IDs / processing are in media-kit/releases/v0.7.0/audio-sources.json.
export const ORIGINAL_FILES = {
  punch: 'original-punch.wav', punchHeavy: 'original-punchHeavy.wav',
  kick: 'original-kick.wav', kickHeavy: 'original-kickHeavy.wav',
  'mega-jack': 'original-mega-jack.wav', 'mega-hannah': 'original-mega-hannah.wav',
  'mega-mustapha': 'original-mega-mustapha.wav', 'mega-mess': 'original-mega-mess.wav',
  go: 'original-go.wav'
};
export function originalCue(name, hero = 'jack') {
  const key = name === 'mega' ? 'mega-' + hero : name;
  return ORIGINAL_FILES[key] ? key : null;
}
