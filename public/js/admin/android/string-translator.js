/**
 * 中文翻译成string.xml的字符串工具
 */


document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const inputTextarea = document.getElementById('input');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');

    // 绑定事件
    convertBtn.addEventListener('click', convertText);
    clearBtn.addEventListener('click', clearAll);
    
    // 移除实时转换
    // inputTextarea.addEventListener('input', convertText);

    /**
     * 转换文本为string.xml格式
     */
    async function convertText() {
        const inputText = inputTextarea.value.trim();
        if (!inputText) {
            clearCodeContent(['chinese-output', 'english-output', 'japanese-output']);
            return;
        }

        const lines = inputText.split('\n').filter(line => line.trim());
        let chineseStrings = [];
        let englishStrings = [];
        let japaneseStrings = [];
        
        try {
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const trimmedLine = line.trim();
                let englishText;
                let japaneseText;
                let key;
                
                // 检查是否为英文输入
                if (isEnglish(trimmedLine)) {
                    // 如果是英文，直接使用输入作为英文文本和key
                    englishText = trimmedLine;
                    key = formatAsKey(trimmedLine);
                } else {
                    // 如果是中文，进行翻译
                    englishText = await translateToEnglish(trimmedLine);
                    japaneseText = await translateToJapanese(trimmedLine);
                    key = formatAsKey(englishText);
                }
                
                // 中文value
                const chineseValue = escapeXml(trimmedLine);
                
                // 英文value
                const englishValue = escapeXml(englishText);
                
                // 收集中文string元素
                chineseStrings.push(`<string name="${key}">${chineseValue}</string>`);
                
                // 收集英文string元素 - 不添加_en后缀
                englishStrings.push(`<string name="${key}">${englishValue}</string>`);
                
                // 日文value（若未翻译则尝试从英文二次翻译）
                if (!japaneseText) {
                    japaneseText = await translateToJapanese(trimmedLine);
                }
                const japaneseValue = escapeXml(japaneseText);
                japaneseStrings.push(`<string name="${key}">${japaneseValue}</string>`);
            }
            
            // 使用公共函数设置代码内容
            setCodeContent('chinese-output', chineseStrings.join('\n'));
            setCodeContent('english-output', englishStrings.join('\n'));
            setCodeContent('japanese-output', japaneseStrings.join('\n'));
        } catch (error) {
            showToast('翻译失败：' + error.message);
            return;
        }
    }

    // 使用base.js中的translateToEnglish函数

    /**
     * 将英文文本格式化为合法的key
     * @param {string} text 英文文本
     * @returns {string} 格式化后的key
     */
    function formatAsKey(text) {
        // 截取前n个单词
        const words = text.split(/\s+/).slice(0, 10).join(' ');
        
        return words
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // 只保留字母、数字和空格
            .trim()
            .replace(/\s+/g, '_'); // 空格替换为下划线
    }

    /**
     * 转义XML特殊字符
     * @param {string} text 原始文本
     * @returns {string} 转义后的文本
     */
    function escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'");
    }

    /**
     * 清空所有输入和输出
     */
    function clearAll() {
        inputTextarea.value = '';
        clearCodeContent(['chinese-output', 'english-output', 'japanese-output']);
    }

    /**
     * 显示提示消息
     * @param {string} message 消息内容
     */
    function showToast(message) {
        // 检查是否已存在toast元素，如果有则移除
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            document.body.removeChild(existingToast);
        }
        
        // 创建新的toast元素
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 显示toast
        setTimeout(() => {
            toast.classList.add('show');
            
            // 2秒后隐藏
            setTimeout(() => {
                toast.classList.remove('show');
                
                // 动画完成后移除元素
                setTimeout(() => {
                    if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }, 2000);
        }, 10);
    }

    /**
     * 检查文本是否为英文
     * @param {string} text 要检查的文本
     * @returns {boolean} 是否为英文
     */
    function isEnglish(text) {
        // 检查文本是否只包含英文字母、数字、空格和常见标点
        return /^[a-zA-Z0-9\s.,!?;:'"()\-]+$/.test(text);
    }
});