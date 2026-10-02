// Art direction switch. Players asked for the first version's deep night palette back,
// so "dark" is the default; the rounded bright toy look stays available as an option.
export const THEME_KEY='chongchao-theme';
export function currentTheme(){
  const forced=new URLSearchParams(location.search).get('theme');
  if(forced==='dark'||forced==='toy')return forced;
  try{const saved=localStorage.getItem(THEME_KEY);if(saved==='dark'||saved==='toy')return saved;}catch{}
  return 'dark';
}
export function saveTheme(value){try{localStorage.setItem(THEME_KEY,value);}catch{}}

export const PALETTES={
  dark:{
    sky:0x0b1527,fog:0x111f36,fogNear:130,fogFar:430,
    ground:[0x2c4430,0x3b5634,0x4e6a3c],lane:0x5e5039,plateau:0x4d5965,ridge:0x5b5a4a,tunnelFloor:0x3a2c34,
    rock:0x5b6470,pebble:0x48505a,plant:0x46e6c8,plantGlow:true,
    fort:{cream:0x6f7b88,teal:0x2f8590,navy:0x1d2a37,stone:0x56616d,amber:0xd09a3c,mint:0x5fd6b4,mountainA:0x3b4552,mountainB:0x2f3945,cave:0x4a535e},
    hive:{shell:0x45293a,flesh:0x5c2a3c,glow:0xff5a3a,vein:0xc0306a,rock:0x33313a,fungus:0x58f0c8,spore:0xb36bff},
    beacon:0x5fd6ff,
  },
  toy:{
    sky:0xb5e3e6,fog:0xc5e3d9,fogNear:140,fogFar:400,
    ground:[0x4c9a70,0x6caf77,0x87ac62],lane:0xd4bd88,plateau:0xb4c8af,ridge:0xc1a779,tunnelFloor:0x9a8a7a,
    rock:0xc8b996,pebble:0xb8ab8a,plant:0x5eaa84,plantGlow:false,
    fort:{cream:0xf6dfae,teal:0x53b4ae,navy:0x365b6b,stone:0x809c91,amber:0xf5bf63,mint:0xa4e4cf,mountainA:0x92b4a0,mountainB:0x739f94,cave:0x93b09c},
    hive:{shell:0xb07a8e,flesh:0xd98aa0,glow:0xff9a6a,vein:0xe06a8a,rock:0x9c8e98,fungus:0x7fe0c4,spore:0xc79bff},
    beacon:0x6fd8ff,
  },
};
