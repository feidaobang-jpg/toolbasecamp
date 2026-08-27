/**
 * 指令改图风格预设（与 server/dashscope_image_edit.py INSTRUCT_EDIT_PRESETS 同步）
 * 主站 instruct-edit 与家里电脑 Qwen 图生图共用。
 */
(function (global) {
  var PROMPTS = {
    manga_to_real:
      '将这张图片从日式动漫/漫画风格转换为真实摄影人像风格。'
      + '保持人物面部特征、发型、服装、姿态、构图与主体身份一致。'
      + '使用真实皮肤质感、毛孔与自然光影，真实环境背景；'
      + '去掉赛璐璐平涂、夸张线稿与二次元阴影。'
      + '输出必须为全彩照片风格，禁止黑白或灰度。',
    real_to_manga:
      '将这张真人照片转换为日式动漫/漫画风格插画。'
      + '保持人物面部特征、发型、服装、姿态、构图与主体身份一致。'
      + '使用清晰线稿、彩色赛璐璐上色、干净阴影与动漫角色质感；'
      + '不要写成实摄影，不要过度写实。'
      + '输出必须为全彩上色插画，禁止纯黑白线稿、灰度素描或未上色线稿。',
    restore_old_photo:
      '修复这张老照片：去除折痕、污渍、霉斑、噪点与严重划痕，'
      + '补全破损边缘与轻微缺失区域，提升清晰度与细节。'
      + '保持人物五官、发型、服装与整体构图身份一致，不要换成另一个人。'
      + '修正曝光与对比度，恢复自然肤色与合理光影；'
      + '若原图为黑白或严重褪色，可自然上色为真实彩色照片；'
      + '避免过度磨皮、网红滤镜或塑料感；输出全彩修复成品。',
    id_photo_white:
      '将这张人像处理成标准证件照风格：'
      + '纯白色干净背景，无阴影杂物；正面或近正面半身/大头照构图，'
      + '人物居中，表情自然端正；保留真实五官与发型身份，不要换成他人。'
      + '光线均匀柔和，服装保持原样或整理为得体正装感；'
      + '禁止夸张美颜、网红滤镜与虚化背景；输出全彩证件照。',
    remove_watermark:
      '去除画面中的水印、Logo、字幕条、角标、日期戳与明显文字贴纸，'
      + '并清除无关杂物、污点与遮挡物；用周围纹理与内容自然填补。'
      + '保持主体人物或商品、构图、光影与风格一致，不要改脸或换人。'
      + '不要新增加其他水印或文字；输出干净全彩成品。',
    beauty_light:
      '对人像做轻度美颜修饰：均匀肤色、淡化明显瑕疵与黑眼圈，'
      + '略微提亮眼神与气色，保持真实皮肤质感与毛孔，'
      + '五官、脸型、发型与身份必须一致，禁止整容级改脸、过度磨皮、假睫毛夸张或塑料感。'
      + '背景与服装基本保持；输出自然全彩人像。',
    slim_body:
      '对人像做适度瘦身塑形：全身明显变瘦，收紧腰腹让肚子明显变小，'
      + '下巴更利落、下颌线更清晰，四肢与体态更纤细自然。'
      + '保持人物五官特征、发型、服装款式、姿态、构图与主体身份一致，不要换成另一个人；'
      + '不要过度整容、夸张抽脂感、畸形肢体或扭曲透视；背景基本保持；输出自然全彩人像。',
    colorize_bw:
      '将这张黑白、灰度或严重褪色的照片自然上色为真实彩色照片。'
      + '肤色、头发、服装与环境颜色要合理真实，光影与材质一致；'
      + '保持人物五官、姿态与构图身份不变，不要换成他人。'
      + '避免荧光假色与过度饱和；输出全彩照片。',
    product_white_bg:
      '将商品主体抠出并置于纯白简洁电商背景上，去除杂乱桌面与背景干扰。'
      + '保持商品外形、材质、颜色、Logo 与比例真实准确，不要变形或换款。'
      + '光线干净均匀，轻微自然投影即可，适合电商主图；'
      + '禁止添加多余道具或文字水印；输出全彩商品图。',
    lineart_colorize:
      '为这张线稿/草图进行全彩上色：保留清晰线稿结构，'
      + '填充合理的服装、肤色、头发与环境色彩，阴影干净分层。'
      + '保持角色设计与姿态一致；输出全彩上色插画，'
      + '禁止只输出未上色线稿或纯灰度。',
    expand_edges:
      '在保持主体与构图风格一致的前提下，自然补全画面破损边缘，'
      + '并适度向外扩展场景内容（外扩约 10%～20% 视野），'
      + '新生成的背景与光影要与原图连贯，不要改变人物身份或主体比例。'
      + '避免重复纹理与扭曲肢体；输出全彩完整画面。'
  };

  var IDS = [
    'manga_to_real',
    'real_to_manga',
    'restore_old_photo',
    'id_photo_white',
    'remove_watermark',
    'beauty_light',
    'slim_body',
    'colorize_bw',
    'product_white_bg',
    'lineart_colorize',
    'expand_edges'
  ];

  var LABEL_KEYS = {
    manga_to_real: 'tools.instructEdit.presetMangaToReal',
    real_to_manga: 'tools.instructEdit.presetRealToManga',
    restore_old_photo: 'tools.instructEdit.presetRestoreOldPhoto',
    id_photo_white: 'tools.instructEdit.presetIdPhotoWhite',
    remove_watermark: 'tools.instructEdit.presetRemoveWatermark',
    beauty_light: 'tools.instructEdit.presetBeautyLight',
    slim_body: 'tools.instructEdit.presetSlimBody',
    colorize_bw: 'tools.instructEdit.presetColorizeBw',
    product_white_bg: 'tools.instructEdit.presetProductWhiteBg',
    lineart_colorize: 'tools.instructEdit.presetLineartColorize',
    expand_edges: 'tools.instructEdit.presetExpandEdges'
  };

  var COLOR_HINT =
    '【画面要求】必须输出全彩上色成品（full color），'
    + '有自然肤色、服装色彩与环境色彩；'
    + '禁止黑白、灰度、单色、未上色线稿、纯线描、素描或只有轮廓的漫画线稿。';

  var MONO_MARKERS = [
    '黑白', '灰度', '单色', '线稿', '素描', '铅笔画', '炭笔', '墨线', '未上色',
    'black and white', 'black & white', 'b&w', 'bw ', 'grayscale', 'greyscale',
    'monochrome', 'line art', 'lineart', 'line-art', 'sketch only', 'pencil sketch'
  ];

  function wantsMonochrome(text) {
    var low = (text || '').toLowerCase();
    for (var i = 0; i < MONO_MARKERS.length; i++) {
      if (low.indexOf(MONO_MARKERS[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function applyColorHint(prompt) {
    var text = (prompt || '').trim();
    if (!text || wantsMonochrome(text)) return text;
    if (text.indexOf('全彩') !== -1 || text.indexOf('彩色') !== -1 || text.toLowerCase().indexOf('full color') !== -1) {
      return text;
    }
    if (text.indexOf('【画面要求】') !== -1) return text;
    return COLOR_HINT + '\n' + text;
  }

  function resolvePrompt(presetId, userText) {
    var text = (userText || '').trim();
    var key = (presetId || '').trim();
    if (key && PROMPTS[key]) {
      var base = PROMPTS[key];
      var hinted = applyColorHint(base);
      if (!text || text === base || text === hinted) return hinted;
      if (text.indexOf(base) !== -1) return applyColorHint(text);
      return applyColorHint(base + '\n补充要求：' + text);
    }
    return applyColorHint(text);
  }

  global.InstructEditPresets = {
    ids: IDS,
    prompts: PROMPTS,
    labelKey: function (id) { return LABEL_KEYS[id] || ''; },
    prompt: function (id) { return PROMPTS[id] || ''; },
    applyColorHint: applyColorHint,
    resolvePrompt: resolvePrompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
