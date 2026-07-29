/**
 * 文件批量翻译重命名工具
 */
// 全局变量
let filteredFiles = [];
let fileCountLabel;
let appendFilesCheckbox;

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    fileCountLabel = document.getElementById('file-count-label');
    appendFilesCheckbox = document.getElementById('append-files-checkbox');
    const clearBtn = document.getElementById('clear-btn');
    const generateBtn = document.getElementById('generate-btn');
    const prefixInput = document.getElementById('prefix-input');
    
    // 创建拖放区域
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.innerHTML = `
        <div class="drop-zone-text">
            <p>将文件拖放到此处</p>
            <p>或者</p>
            <button id="browse-btn-inner" class="browse-btn">选择文件</button>
            <input type="file" id="file-input" multiple style="display: none;">
        </div>
    `;
    
    // 将拖放区域插入到工具容器中
    const toolContainer = document.querySelector('.tool-container');
    toolContainer.insertBefore(dropZone, toolContainer.firstChild);
    
    // 获取新的文件输入元素
    const fileInput = document.getElementById('file-input');
    const browseBtnInner = document.getElementById('browse-btn-inner');

    // 绑定事件
    clearBtn.addEventListener('click', clearAll);
    generateBtn.addEventListener('click', generateFiles);
    browseBtnInner.addEventListener('click', () => fileInput.click());

    // 处理拖放事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drop-zone-hover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drop-zone-hover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone-hover');
        
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    // 处理文件选择
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handleFiles(files);
    });

    // 统一处理文件的函数
    function handleFiles(files) {
        if (files.length === 0) return;

        // 根据复选框状态决定是替换还是累加文件
        if (appendFilesCheckbox.checked) {
            // 累加模式：将新文件添加到现有文件列表
            filteredFiles = [...filteredFiles, ...Array.from(files)];
        } else {
            // 替换模式：用新文件替换现有文件列表
            filteredFiles = Array.from(files);
        }
        
        // 更新文件计数显示
        fileCountLabel.textContent = `已选择文件: ${filteredFiles.length}`;
        
        // 显示文件数量
        showToast(`已选择 ${filteredFiles.length} 个文件`);
    }

    /**
     * 翻译文件名
     * @param {string} fileName 文件名
     * @returns {Promise<string>} 翻译后的文件名
     */
    async function translateFileName(fileName) {
      try {
          // 提取文件名部分（不含扩展名）
          const extension = fileName.split('.').pop();
          const nameOnly = fileName.substring(0, fileName.length - extension.length - 1);
          
          // 如果文件名不包含中文，直接返回
          if (!/[\u4e00-\u9fa5]/.test(nameOnly)) return fileName;
          
          // 调用翻译API
          const translatedName = await translateToEnglish(nameOnly);
          
          // 格式化翻译结果为合法的文件名
          // 确保翻译后的文件名全部小写
          const formattedName = formatAsFileName(translatedName).toLowerCase();
          
          // 添加扩展名
          return formattedName + '.' + extension;
      } catch (error) {
          console.error('翻译文件名错误:', error);
          return `${fileName.toLowerCase()} (翻译失败)`;
      }
    }

    // 使用base.js中的translateToEnglish函数

    /**
     * 将翻译后的文本格式化为合法的文件名
     * @param {string} text 翻译后的文本
     * @returns {string} 格式化后的文件名
     */
    function formatAsFileName(text) {
        return text
            .replace(/[<>:"/\\|?*]/g, '_') // 替换Windows不允许的文件名字符
            .replace(/\s+/g, '_')         // 空格替换为下划线
            .replace(/_{2,}/g, '_');      // 多个连续下划线替换为单个
    }

    function clearAll() {
        fileCountLabel.textContent = '已选择文件: 0';
        filteredFiles = [];
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
     * 生成重命名后的文件到out目录
     */
    async function generateFiles() {
        if (filteredFiles.length === 0) {
            showToast('请先选择文件');
            return;
        }

        try {
            // 请求用户授权
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            
            // 创建out目录
            const outHandle = await dirHandle.getDirectoryHandle('out', { create: true });
            
            // 处理文件
            for (const file of filteredFiles) {
                // 翻译文件名
                const translatedName = await translateFileName(file.name);
                
                // 获取前缀并应用到文件名
                const prefix = prefixInput.value.trim();
                const finalName = (prefix ? prefix + '_' : '') + translatedName;
                
                // 创建新文件
                const newFileHandle = await outHandle.getFileHandle(finalName, { create: true });
                const writable = await newFileHandle.createWritable();
                
                // 写入文件内容
                await writable.write(await file.arrayBuffer());
                await writable.close();
            }
            
            showToast(`文件重命名并复制完成，共处理 ${filteredFiles.length} 个文件`);
        } catch (error) {
            console.error('生成文件错误:', error);
            showToast('生成失败: ' + error.message);
        }
    }
});
