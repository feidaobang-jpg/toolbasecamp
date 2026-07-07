/**
 * 简体中文文案（仅 toolbasecamp.com 主站）。
 * 新增 UI 文案时，请同步在 locales/en.js 添加相同 key。
 */
window.TB_LOCALES['zh-CN'] = {
    site: {
        name: 'Tool Basecamp',
        description: 'Tool Basecamp — 文档转换、媒体工具与开发者实用程序。PDF 转 Word、视频转图片、JSON 转 Java 等。',
        keywords: '效率工具, PDF 转换, JSON 转 Java, 开发者工具, 文档工具',
        footer: '保留所有权利。',
        pageTitleSuffix: 'Tool Basecamp'
    },
    nav: {
        tools: '工具',
        guestbook: '留言板',
        about: '关于'
    },
    lang: {
        switcher: '语言',
        en: 'EN',
        zh: '中文'
    },
    auth: {
        login: '登录',
        signup: '注册',
        logout: '退出',
        profile: '个人资料',
        account: '账户',
        backHome: '返回首页',
        welcomeBack: '欢迎回来',
        loginSubtitle: '登录以访问您的个人资料',
        email: '邮箱',
        password: '密码',
        emailPlaceholder: 'you@example.com',
        passwordPlaceholder: '您的密码',
        loginBtn: '登录',
        noAccount: '还没有账户？',
        hasAccount: '已有账户？',
        createAccount: '创建账户',
        registerSubtitle: '注册 Tool Basecamp 账户',
        registerBtn: '注册',
        changePassword: '修改密码',
        currentPassword: '当前密码',
        newPassword: '新密码',
        savePassword: '保存密码',
        openMenu: '打开账户菜单',
        closeMenu: '关闭'
    },
    hub: {
        portalsTitle: '子站入口',
        portalsSubtitle: 'Tool Basecamp 托管的扩展工具集合。',
        basecampTools: '主站工具',
        noTools: '暂无配置的工具。',
        open: '打开'
    },
    portals: {
        pdf: {
            title: 'PDF 工具箱',
            description: '50+ PDF 工具 — 合并、拆分、压缩、OCR、转 Word、签名等。托管于 pdf.toolbasecamp.com。',
            cta: '打开 PDF 工具箱'
        },
        dev: {
            title: '开发者工具箱',
            description: '120+ 浏览器端开发工具 — Base64、JWT、JSON、哈希、正则、UUID 等。数据留在本地浏览器。',
            cta: '打开开发者工具箱'
        },
        chef: {
            title: 'CyberChef',
            description: '网络安全瑞士军刀 — 编解码、加解密、压缩与数据分析，全部在浏览器本地运行，静态部署。',
            cta: '打开 CyberChef'
        },
        hoppscotch: {
            title: 'Hoppscotch',
            description: '轻量 API 客户端 — REST、GraphQL、WebSocket，支持集合与环境变量。自托管，适合日常接口调试。',
            cta: '打开 Hoppscotch'
        },
        translate: {
            title: 'LibreTranslate',
            description: '注重隐私的机器翻译（英 ↔ 中）。自托管；小内存 VPS 建议只加载 en、zh 语言包。',
            cta: '打开翻译'
        }
    },
    tools: {
        groups: {
            media: '媒体工具',
            document: '文档工具',
            diagram: '图表工具',
            developer: '开发者工具'
        },
        videoToImages: {
            title: '视频转图片',
            desc: '从视频中提取帧、预览，并将所选帧下载为 PNG/JPEG 或 ZIP。全部在浏览器本地处理。',
            dropTitle: '将视频拖放到此处',
            dropOr: '或',
            chooseVideo: '选择视频',
            privacy: '隐私：',
            privacyBody: '视频不会离开您的设备。支持的格式取决于浏览器（通常支持 MP4/WebM）。',
            videoPreview: '视频预览',
            extractionSettings: '提取设置',
            frameInterval: '帧间隔（毫秒）',
            clipLength: '片段时长（秒）',
            startAt: '起始时间（秒）',
            watermarkOptional: '水印 / 背景（可选）',
            cornerToClear: '清除角落',
            topLeft: '左上',
            topRight: '右上',
            bottomLeft: '左下',
            bottomRight: '右下',
            regionSize: '区域大小',
            bgSensitivity: '背景敏感度',
            extractFrames: '提取帧',
            clearCorner: '清除角落与背景',
            clearAll: '全部清除',
            extractedFrames: '已提取的帧',
            dedupe: '去除相似帧',
            selectAll: '全选',
            animationPreview: '动画预览',
            pause: '暂停',
            play: '播放',
            saveZip: '保存为 ZIP',
            saveImages: '保存图片'
        },
        pdfToWord: {
            title: 'PDF 转 Word',
            desc: '将 PDF 转换为可编辑的 Word 文档（.docx），尽量保留版式结构',
            dropTitle: '点击或拖拽 PDF 文件到此处',
            dropHint: '支持 .pdf，最大 50 MB',
            note: '说明：',
            noteBody: '复杂版式（表格、分栏、特殊字体）转换后可能略有差异，请检查输出结果。',
            convert: '转换',
            clear: '清除',
            remove: '移除',
            converting: '转换中...',
            conversionFailed: '转换失败',
            done: '完成',
            downloadWord: '下载 Word'
        },
        wordToPdf: {
            title: 'Word 转 PDF',
            desc: '将 Word 文档（.doc、.docx）转换为 PDF',
            dropTitle: '点击或拖拽 Word 文件到此处',
            dropHint: '支持 .doc 和 .docx，最大 50 MB',
            convert: '转换',
            clear: '清除',
            converting: '转换中...',
            conversionFailed: '转换失败',
            downloadPdf: '下载 PDF'
        },
        imagesToPdf: {
            title: '图片转 PDF',
            desc: '在浏览器中将多张图片合并为一个 PDF 文件',
            dropTitle: '点击或拖拽图片到此处',
            dropHint: '支持 JPG、PNG、WebP — 可多选',
            merge: '合并为 PDF',
            clear: '清除',
            downloadPdf: '下载 PDF'
        },
        jsonToJava: {
            title: 'JSON 转 Java',
            desc: '根据 JSON 数据生成 Java 实体类',
            inputLabel: 'JSON 输入',
            outputLabel: 'Java 输出',
            generate: '生成',
            clear: '清除',
            emptyJson: '请输入 JSON 数据',
            parseError: 'JSON 解析错误：{message}'
        },
        mindmap: {
            title: '思维导图',
            desc: '可视化思维导图 — 双击编辑，用工具栏或快捷键添加节点。',
            privacy: '导图仅在浏览器中编辑，不会上传到服务器。',
            tipsTitle: '操作提示：',
            tip1: '双击节点可编辑文字',
            tip2: 'Tab 添加子节点 · Enter 添加同级 · Delete 删除',
            tip3: '使用浮动工具栏缩放、展开/折叠或导出 PNG',
            newMap: '新建导图',
            exportPng: '导出 PNG',
            exportJson: '导出 JSON',
            importJson: '导入 JSON',
            newConfirm: '新建导图？未保存的内容将丢失。',
            exportError: '导出失败',
            importError: 'JSON 文件无效'
        },
        spreadsheet: {
            title: '在线表格',
            desc: '点击单元格编辑 — 工具栏支持格式、合并与公式。',
            privacy: '数据仅在浏览器中，导出 JSON 可本地保存。',
            tipsTitle: '操作提示：',
            tip1: '点击单元格输入 — 工具栏可设粗体、颜色、合并',
            tip2: '底部标签页可添加工作表（+ 号）',
            tip3: '导出 JSON 保存，导入 JSON 恢复',
            exportJson: '导出 JSON',
            importJson: '导入 JSON',
            clear: '清空',
            clearConfirm: '清空所有单元格？此操作不可撤销。',
            importError: 'JSON 文件无效'
        },
    },
    sidebar: {
        allTools: '全部工具'
    },
    guestbook: {
        title: '留言板',
        subtitle: '分享想法、反馈或打个招呼。无需登录即可留言；登录后以账户名发布。',
        writeTitle: '写留言',
        postingAs: '发布身份',
        displayName: '显示名称',
        guestPlaceholder: '访客',
        message: '留言内容',
        messagePlaceholder: '说点什么...',
        post: '发布留言',
        allMessages: '全部留言',
        loading: '加载中...',
        loadMore: '加载更多',
        empty: '暂无留言 — 来抢沙发吧！',
        badgeGuest: '访客',
        badgeUser: '已登录',
        deleteConfirm: '确定删除这条留言？',
        posted: '留言已发布',
        deleted: '留言已删除',
        enterMessage: '请输入留言内容',
        loadFailed: '加载留言失败，请稍后重试。',
        postFailed: '发布失败',
        deleteFailed: '删除失败'
    },
    about: {
        title: '关于 Tool Basecamp',
        lead: '面向全球用户的效率工具集 — 从文档转换起步，持续扩展开发者实用功能。',
        documentTitle: '文档工具',
        documentDesc: 'PDF 转 Word、Word 转 PDF、图片转 PDF — 快速简洁。',
        developerTitle: '开发者工具',
        developerDesc: 'JSON 转 Java 实体生成器等日常开发小工具。',
        privacyTitle: '注重隐私',
        privacyDesc: '客户端工具在浏览器中运行；服务端工具处理完文件后即丢弃。',
        builtTitle: '为所有人打造',
        builtDesc: '中英文界面，简洁无干扰 — 专注好用的工具。',
        questions: '有问题或建议？',
        visitGuestbook: '前往留言板'
    },
    common: {
        serviceUnavailable: '服务不可用',
        serviceUnavailableBody: 'API 服务无响应，请稍后重试。',
        ok: '确定',
        backToTop: '回到顶部',
        mainNav: '主导航',
        loading: '加载中...'
    }
};
