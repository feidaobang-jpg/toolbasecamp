/** Baidu Translate helpers for Android string/file tools (browser JSONP). */
async function translateTo(text, to) {
	try {
		// 百度翻译API配置
		const appid = '20250819002434354'; // 替换为您的百度翻译APP ID
		const key = 'SH4ICcn61z4U0P2sRNUP'; // 替换为您的百度翻译密钥
		const salt = new Date().getTime();
		const from = 'auto';

		// 生成签名
		const str = appid + text + salt + key;
		const sign = md5(str);

		// 构建JSONP回调函数名
		const callbackName = 'baiduTranslateCallback_' + new Date().getTime();

		// 创建JSONP URL
		const url = `https://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=${from}&to=${to}&appid=${appid}&salt=${salt}&sign=${sign}&callback=${callbackName}`;

		// 创建Promise包装JSONP请求
		const data = await new Promise((resolve, reject) => {
			// 创建script标签
			const script = document.createElement('script');

			// 设置全局回调函数
			window[callbackName] = function(response) {
				// 清理回调函数和script标签
				delete window[callbackName];
				document.body.removeChild(script);
				resolve(response);
			};

			// 设置错误处理
			script.onerror = () => {
				delete window[callbackName];
				document.body.removeChild(script);
				reject(new Error('翻译请求失败'));
			};

			// 设置script标签的src并添加到页面
			script.src = url;
			document.body.appendChild(script);
		});

		if (data.trans_result && data.trans_result.length > 0) {
			return data.trans_result[0].dst;
		} else {
			throw new Error(data.error_msg || '翻译失败');
		}
	} catch (error) {
		console.error('翻译错误:', error);
		return text + '(untranslated)';
	}
}

/**
 * 使用百度翻译API将文本翻译为英文
 * @param {string} text 原文
 * @returns {Promise<string>} 英文翻译
 */
async function translateToEnglish(text) {
	return translateTo(text, 'en');
}

/**
 * 使用百度翻译API将文本翻译为日文
 * @param {string} text 原文
 * @returns {Promise<string>} 日文翻译
 */
async function translateToJapanese(text) {
	// 百度语种代码：日文为 'jp'
	return translateTo(text, 'jp');
}

/**
 * 计算MD5哈希值
 * @param {string} string 需要加密的字符串
 * @returns {string} MD5加密后的字符串
 */
function md5(string) {
    // 简单的MD5实现，用于百度翻译API签名
    function rotateLeft(value, amount) {
        return (value << amount) | (value >>> (32 - amount));
    }
    
    function addUnsigned(x, y) {
        const lsw = (x & 0xFFFF) + (y & 0xFFFF);
        const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    
    function md5cmn(q, a, b, x, s, t) {
        return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, q), addUnsigned(x, t)), s), b);
    }
    
    function md5ff(a, b, c, d, x, s, t) {
        return md5cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    
    function md5gg(a, b, c, d, x, s, t) {
        return md5cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    
    function md5hh(a, b, c, d, x, s, t) {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    
    function md5ii(a, b, c, d, x, s, t) {
        return md5cmn(c ^ (b | (~d)), a, b, x, s, t);
    }
    
    function convertToWordArray(string) {
        let wordArray = [];
        for (let i = 0; i < string.length * 8; i += 8) {
            wordArray[i >> 5] |= (string.charCodeAt(i / 8) & 0xFF) << (i % 32);
        }
        return wordArray;
    }
    
    function convertToHexString(wordArray) {
        let hexString = '';
        for (let i = 0; i < wordArray.length * 4; i++) {
            const byte = (wordArray[i >> 2] >> ((i % 4) * 8)) & 0xFF;
            hexString += ((byte >> 4) & 0xF).toString(16) + (byte & 0xF).toString(16);
        }
        return hexString;
    }
    
    // 转换为UTF-8
    const utf8String = unescape(encodeURIComponent(string));
    const wordArray = convertToWordArray(utf8String);
    const bitLength = utf8String.length * 8;
    
    // 添加填充
    wordArray[bitLength >> 5] |= 0x80 << (bitLength % 32);
    wordArray[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;
    
    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;
    
    for (let i = 0; i < wordArray.length; i += 16) {
        const olda = a;
        const oldb = b;
        const oldc = c;
        const oldd = d;
        
        a = md5ff(a, b, c, d, wordArray[i], 7, -680876936);
        d = md5ff(d, a, b, c, wordArray[i + 1], 12, -389564586);
        c = md5ff(c, d, a, b, wordArray[i + 2], 17, 606105819);
        b = md5ff(b, c, d, a, wordArray[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, wordArray[i + 4], 7, -176418897);
        d = md5ff(d, a, b, c, wordArray[i + 5], 12, 1200080426);
        c = md5ff(c, d, a, b, wordArray[i + 6], 17, -1473231341);
        b = md5ff(b, c, d, a, wordArray[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, wordArray[i + 8], 7, 1770035416);
        d = md5ff(d, a, b, c, wordArray[i + 9], 12, -1958414417);
        c = md5ff(c, d, a, b, wordArray[i + 10], 17, -42063);
        b = md5ff(b, c, d, a, wordArray[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, wordArray[i + 12], 7, 1804603682);
        d = md5ff(d, a, b, c, wordArray[i + 13], 12, -40341101);
        c = md5ff(c, d, a, b, wordArray[i + 14], 17, -1502002290);
        b = md5ff(b, c, d, a, wordArray[i + 15], 22, 1236535329);
        
        a = md5gg(a, b, c, d, wordArray[i + 1], 5, -165796510);
        d = md5gg(d, a, b, c, wordArray[i + 6], 9, -1069501632);
        c = md5gg(c, d, a, b, wordArray[i + 11], 14, 643717713);
        b = md5gg(b, c, d, a, wordArray[i], 20, -373897302);
        a = md5gg(a, b, c, d, wordArray[i + 5], 5, -701558691);
        d = md5gg(d, a, b, c, wordArray[i + 10], 9, 38016083);
        c = md5gg(c, d, a, b, wordArray[i + 15], 14, -660478335);
        b = md5gg(b, c, d, a, wordArray[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, wordArray[i + 9], 5, 568446438);
        d = md5gg(d, a, b, c, wordArray[i + 14], 9, -1019803690);
        c = md5gg(c, d, a, b, wordArray[i + 3], 14, -187363961);
        b = md5gg(b, c, d, a, wordArray[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, wordArray[i + 13], 5, -1444681467);
        d = md5gg(d, a, b, c, wordArray[i + 2], 9, -51403784);
        c = md5gg(c, d, a, b, wordArray[i + 7], 14, 1735328473);
        b = md5gg(b, c, d, a, wordArray[i + 12], 20, -1926607734);
        
        a = md5hh(a, b, c, d, wordArray[i + 5], 4, -378558);
        d = md5hh(d, a, b, c, wordArray[i + 8], 11, -2022574463);
        c = md5hh(c, d, a, b, wordArray[i + 11], 16, 1839030562);
        b = md5hh(b, c, d, a, wordArray[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, wordArray[i + 1], 4, -1530992060);
        d = md5hh(d, a, b, c, wordArray[i + 4], 11, 1272893353);
        c = md5hh(c, d, a, b, wordArray[i + 7], 16, -155497632);
        b = md5hh(b, c, d, a, wordArray[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, wordArray[i + 13], 4, 681279174);
        d = md5hh(d, a, b, c, wordArray[i], 11, -358537222);
        c = md5hh(c, d, a, b, wordArray[i + 3], 16, -722521979);
        b = md5hh(b, c, d, a, wordArray[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, wordArray[i + 9], 4, -640364487);
        d = md5hh(d, a, b, c, wordArray[i + 12], 11, -421815835);
        c = md5hh(c, d, a, b, wordArray[i + 15], 16, 530742520);
        b = md5hh(b, c, d, a, wordArray[i + 2], 23, -995338651);
        
        a = md5ii(a, b, c, d, wordArray[i], 6, -198630844);
        d = md5ii(d, a, b, c, wordArray[i + 7], 10, 1126891415);
        c = md5ii(c, d, a, b, wordArray[i + 14], 15, -1416354905);
        b = md5ii(b, c, d, a, wordArray[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, wordArray[i + 12], 6, 1700485571);
        d = md5ii(d, a, b, c, wordArray[i + 3], 10, -1894986606);
        c = md5ii(c, d, a, b, wordArray[i + 10], 15, -1051523);
        b = md5ii(b, c, d, a, wordArray[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, wordArray[i + 8], 6, 1873313359);
        d = md5ii(d, a, b, c, wordArray[i + 15], 10, -30611744);
        c = md5ii(c, d, a, b, wordArray[i + 6], 15, -1560198380);
        b = md5ii(b, c, d, a, wordArray[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, wordArray[i + 4], 6, -145523070);
        d = md5ii(d, a, b, c, wordArray[i + 11], 10, -1120210379);
        c = md5ii(c, d, a, b, wordArray[i + 2], 15, 718787259);
        b = md5ii(b, c, d, a, wordArray[i + 9], 21, -343485551);
        
        a = addUnsigned(a, olda);
        b = addUnsigned(b, oldb);
        c = addUnsigned(c, oldc);
        d = addUnsigned(d, oldd);
    }
    
    return convertToHexString([a, b, c, d]);
}

window.translateTo = translateTo;
window.translateToEnglish = translateToEnglish;
window.translateToJapanese = translateToJapanese;
window.md5 = md5;
