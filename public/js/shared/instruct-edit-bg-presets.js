/**
 * 指令改图背景地点预设（与主站 instruct-edit.js applyBackgroundPreset 一致）
 */
(function (global) {
  function timePhrase(bgTime) {
    if (bgTime === 'dusk') return '黄昏金色光，电影感自然光';
    if (bgTime === 'night') return '夜景霓虹，低照度，电影感';
    return '白天晴朗，自然光，旅行摄影写实';
  }

  function applyBackgroundPreset(currentValue, place, bgTime) {
    if (!place) return currentValue || '';
    var snippet = '背景：' + place + '，写实旅游摄影，' + timePhrase(bgTime || 'day');
    var v = (currentValue || '').trim();
    var lines = v ? v.split(/\n/) : [];
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = (lines[i] || '').trim();
      if (!line) continue;
      if (line.indexOf('背景：') === 0) continue;
      out.push(line);
    }
    out.push(snippet);
    return out.join('\n');
  }

  global.InstructEditBgPresets = {
    timePhrase: timePhrase,
    apply: applyBackgroundPreset
  };
})(typeof window !== 'undefined' ? window : globalThis);
