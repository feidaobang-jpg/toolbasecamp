// Squad jobs are independent of the player's starting class.
export const SQUAD_ROLES={
  gunner:{name:'机枪兵',hp:130,speed:7,damage:10,rate:.18,range:28,hold:15,color:0x6ba8ef,price:400,brief:'厚甲持续扫射，守线压制',mark:'机'},
  assault:{name:'突击兵',hp:110,speed:8.5,damage:7,pellets:5,rate:.7,range:18,hold:9,color:0xf0ad57,price:450,brief:'近距离霰弹齐射，快速接敌',mark:'突'},
  medic:{name:'医疗兵',hp:90,speed:7.5,damage:6,rate:.45,range:24,hold:14,color:0x5de5a3,price:500,brief:'步行时治疗10米内一名伤员，每秒6生命',mark:'医'},
  engineer:{name:'工程兵',hp:110,speed:7,damage:7,rate:.35,range:24,hold:14,color:0xf0d66d,price:550,brief:'步行时维修10米内一座设施或载具，每秒14耐久',mark:'工'},
};
export const squadRoleId=value=>Object.hasOwn(SQUAD_ROLES,value)?value:'gunner';
