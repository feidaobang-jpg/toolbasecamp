/**
 * 指令改图 · 背景地点分组（前台 instruct-edit + 家里电脑图生图共用）
 */
(function (global) {
  var GROUPS = [
    {
      title: '欧洲',
      places: [
        { value: '埃菲尔铁塔', label: '埃菲尔铁塔' },
        { value: '巴黎凯旋门', label: '巴黎凯旋门' },
        { value: '大本钟/伦敦眼', label: '大本钟/伦敦眼' },
        { value: '罗马斗兽场', label: '罗马斗兽场' },
        { value: '圣家堂（Sagrada Familia）', label: '圣家堂' },
        { value: '阿姆斯特丹运河', label: '阿姆斯特丹运河' },
        { value: '圣托里尼蓝顶教堂', label: '圣托里尼' }
      ]
    },
    {
      title: '非洲',
      places: [
        { value: '埃及吉萨金字塔', label: '埃及吉萨金字塔' },
        { value: '撒哈拉沙丘', label: '撒哈拉沙丘' },
        { value: '维多利亚瀑布', label: '维多利亚瀑布' },
        { value: '桌山（Table Mountain）', label: '桌山' },
        { value: '马赛马拉草原', label: '马赛马拉草原' }
      ]
    },
    {
      title: '亚洲',
      places: [
        { value: '中国长城', label: '中国长城' },
        { value: '日本富士山', label: '富士山' },
        { value: '印度泰姬陵', label: '泰姬陵' },
        { value: '东京浅草寺/浅草街景', label: '浅草寺' },
        { value: '京都伏见稻荷', label: '伏见稻荷' },
        { value: '泰国清迈古城', label: '清迈古城' }
      ]
    },
    {
      title: '美洲',
      places: [
        { value: '自由女神像', label: '自由女神像' },
        { value: '马丘比丘', label: '马丘比丘' },
        { value: '科罗拉多大峡谷', label: '科罗拉多大峡谷' },
        { value: '尼亚加拉大瀑布', label: '尼亚加拉瀑布' },
        { value: '旧金山金门大桥', label: '金门大桥' },
        { value: '里约基督像', label: '里约基督像' }
      ]
    },
    {
      title: '自然风光',
      places: [
        { value: '冰岛瀑布/黑沙滩', label: '冰岛瀑布/黑沙滩' },
        { value: '瑞士阿尔卑斯山', label: '阿尔卑斯山' },
        { value: '加拿大班夫湖', label: '班夫湖' },
        { value: '新西兰蒂卡波星空', label: '蒂卡波星空' },
        { value: '黄石间歇泉', label: '黄石间歇泉' },
        { value: '挪威峡湾', label: '挪威峡湾' }
      ]
    }
  ];

  function render(container) {
    if (!container) return;
    container.innerHTML = '';
    GROUPS.forEach(function (group) {
      var block = document.createElement('div');
      var title = document.createElement('div');
      title.className = 'instruct-bg-region-title';
      title.textContent = group.title;
      var row = document.createElement('div');
      row.className = 'instruct-preset-row instruct-bg-place-row';
      group.places.forEach(function (place) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rec-chip';
        btn.setAttribute('data-bg-place', place.value);
        btn.textContent = place.label;
        row.appendChild(btn);
      });
      block.appendChild(title);
      block.appendChild(row);
      container.appendChild(block);
    });
  }

  function flattenPlaces() {
    var out = [];
    GROUPS.forEach(function (g) {
      g.places.forEach(function (p) {
        out.push({ value: p.value, label: p.label, region: g.title });
      });
    });
    return out;
  }

  global.InstructEditBgGroups = {
    groups: GROUPS,
    render: render,
    flattenPlaces: flattenPlaces
  };
})(typeof window !== 'undefined' ? window : globalThis);
