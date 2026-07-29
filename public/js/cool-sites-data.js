/** 网址导航目录（按用途重排）。 */
window.COOL_SITES_DATA = [
  {
    id: 'tools',
    title: '效率工具',
    icon: 'fas fa-toolbox',
    groups: [
      {
        name: '国内',
        items: [
          { title: 'Linux 命令大全', desc: 'Linux 命令搜索引擎', url: 'https://wangchujiang.com/linux-command/', icon: 'fas fa-terminal', isFontIcon: true },
          { title: '蓝奏云', desc: '好用的云盘，下载不限速', url: 'https://www.lanzou.com/', icon: 'fas fa-cloud-download-alt', isFontIcon: true }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'iLoveIMG', desc: '在线图像编辑、压缩、转换工具', url: 'https://www.iloveimg.com/zh-cn', icon: 'fas fa-images', isFontIcon: true },
          { title: 'PDF24 Tools', desc: '免费好用的在线 PDF 工具箱', url: 'https://tools.pdf24.org/zh', icon: 'fas fa-file-pdf', isFontIcon: true },
          { title: 'TinyPNG', desc: '智能 WebP、PNG、JPEG 图片压缩', url: 'https://tinypng.com/', icon: 'https://tinypng.com/images/apple-touch-icon.png' },
          { title: 'Table Convert', desc: '在线表格转换与生成工具', url: 'https://tableconvert.com/', icon: 'fas fa-table', isFontIcon: true },
          { title: 'Greasy Fork', desc: '用户脚本的聚集地', url: 'https://greasyfork.org/zh-CN', icon: 'fas fa-code-branch', isFontIcon: true },
          { title: 'PassMark', desc: 'CPU/GPU 性能基准测试查询', url: 'https://www.cpubenchmark.net/', icon: 'fas fa-chart-bar', isFontIcon: true }
        ]
      }
    ]
  },
  {
    id: 'develop',
    title: '开发资源',
    icon: 'fas fa-code',
    groups: [
      {
        name: '国内',
        items: [
          { title: 'Vue.js', desc: '渐进式 JavaScript 框架', url: 'https://cn.vuejs.org/', icon: 'fab fa-vuejs', isFontIcon: true },
          { title: 'React', desc: '构建 Web 和原生交互界面的库', url: 'https://zh-hans.react.dev/', icon: 'fab fa-react', isFontIcon: true },
          { title: 'Tailwind CSS', desc: '实用优先的 CSS 框架', url: 'https://www.tailwindcss.cn/', icon: 'https://www.tailwindcss.cn/favicon-32x32.png' },
          { title: 'Element Plus', desc: '基于 Vue 3 的组件库', url: 'https://element-plus.org/zh-CN/', icon: 'https://element-plus.org/images/element-plus-logo-small.svg' },
          { title: 'Cocos Creator', desc: '高效轻量 3D/2D 游戏引擎', url: 'https://www.cocos.com/creator', icon: 'https://www.cocos.com/favicon.ico' }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'Can I Use', desc: '前端浏览器兼容性查询', url: 'https://caniuse.com/', icon: 'https://caniuse.com/img/favicon-128.png' },
          { title: 'CodePen', desc: '前端代码构建、测试与分享', url: 'https://codepen.io/', icon: 'fab fa-codepen', isFontIcon: true },
          { title: 'StackBlitz', desc: '即时在线全栈 IDE', url: 'https://stackblitz.com/', icon: 'https://stackblitz.com/favicon.ico' }
        ]
      }
    ]
  },
  {
    id: 'cloud',
    title: '云与托管',
    icon: 'fas fa-cloud',
    groups: [
      {
        name: '国内',
        items: [
          { title: '腾讯云', desc: '产业智变，云启未来', url: 'https://cloud.tencent.com/', icon: 'https://cloud.tencent.com/favicon.ico' },
          { title: '阿里云', desc: '云计算与云服务平台', url: 'https://www.aliyun.com/', icon: 'https://img.alicdn.com/tfs/TB1_ZXuNcfpK1RjSZFOXXa6nFXa-32-32.ico' },
          { title: 'Gitee', desc: 'Gitee 工作台 / 代码托管', url: 'https://gitee.com/', icon: 'https://gitee.com/favicon.ico' }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'GitHub', desc: '全球最大的代码托管平台', url: 'https://github.com', icon: 'https://github.com/fluidicon.png' },
          { title: 'GitHub Trending', desc: '查看 GitHub 上的热门项目', url: 'https://github.com/trending', icon: 'fab fa-github-alt', isFontIcon: true },
          { title: 'Vercel', desc: '前端部署与协作平台', url: 'https://vercel.com/', icon: 'https://assets.vercel.com/image/upload/front/favicon/vercel/favicon.ico' }
        ]
      }
    ]
  },
  {
    id: 'ai',
    title: '人工智能',
    icon: 'fas fa-brain',
    groups: [
      {
        name: '国内',
        items: [
          { title: 'DeepSeek', desc: '深度求索，探索通用人工智能', url: 'https://www.deepseek.com/', icon: 'fas fa-search', isFontIcon: true },
          { title: 'Kimi (月之暗面)', desc: '支持长文本处理的智能助手', url: 'https://kimi.moonshot.cn/', icon: 'fas fa-robot', isFontIcon: true },
          { title: '通义千问', desc: '阿里云推出的超大规模语言模型', url: 'https://tongyi.aliyun.com/', icon: 'fas fa-comments', isFontIcon: true },
          { title: '豆包', desc: '字节跳动旗下的 AI 智能助手', url: 'https://www.doubao.com/', icon: 'fas fa-comment-dots', isFontIcon: true },
          { title: '智谱清言', desc: '基于 ChatGLM 的高效率 AI 助手', url: 'https://chatglm.cn/', icon: 'fas fa-brain', isFontIcon: true },
          { title: '文心一言', desc: '百度知识增强大语言模型', url: 'https://yiyan.baidu.com/', icon: 'https://yiyan.baidu.com/favicon.ico' },
          { title: '秘塔AI搜索', desc: '没有广告，直达结果', url: 'https://metaso.cn/', icon: 'fas fa-bolt', isFontIcon: true },
          { title: '即梦 (Jimeng)', desc: '字节跳动推出的 AI 创作平台', url: 'https://jimeng.jianying.com/', icon: 'fas fa-image', isFontIcon: true },
          { title: '可灵 (Kling)', desc: '快手推出的视频生成大模型', url: 'https://kling.kuaishou.com/', icon: 'fas fa-video', isFontIcon: true },
          { title: '腾讯混元 3D', desc: '腾讯推出的 3D 生成大模型', url: 'https://hunyuan.tencent.com/', icon: 'fab fa-qq', isFontIcon: true },
          { title: 'LiblibAI', desc: '国内知名的 AI 绘画模型分享站', url: 'https://www.liblib.art/', icon: 'fas fa-paint-brush', isFontIcon: true },
          { title: 'RunningHub', desc: '高可用云端 ComfyUI，在线创作', url: 'https://www.runninghub.cn/', icon: 'fas fa-cloud', isFontIcon: true }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'ChatGPT', desc: 'OpenAI 开发的对话式 AI', url: 'https://chat.openai.com/', icon: 'https://openai.com/favicon.ico' },
          { title: 'Claude', desc: 'Anthropic 开发的 AI 助手，擅长写作', url: 'https://claude.ai/', icon: 'fas fa-robot', isFontIcon: true },
          { title: 'Gemini', desc: 'Google 通用 AI 模型', url: 'https://gemini.google.com/', icon: 'https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030da8.png' },
          { title: 'Google AI Studio', desc: 'Google 官方生成式 AI 开发平台', url: 'https://aistudio.google.com/', icon: 'https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030da8.png' },
          { title: 'Midjourney', desc: '强大的 AI 绘画工具', url: 'https://www.midjourney.com/', icon: 'fas fa-palette', isFontIcon: true },
          { title: 'ComfyUI', desc: '节点式 AI 绘图后端', url: 'https://github.com/comfyanonymous/ComfyUI', icon: 'https://github.com/fluidicon.png' },
          { title: 'Civitai', desc: '开源生成式 AI 模型社区', url: 'https://civitai.com/', icon: 'https://civitai.com/favicon.ico' },
          { title: 'Hugging Face', desc: 'AI 社区，模型托管与共享', url: 'https://huggingface.co/', icon: 'https://huggingface.co/favicon.ico' },
          { title: 'LiveBench', desc: 'AI 大模型排行榜与基准测评', url: 'https://livebench.ai/#/', icon: 'fas fa-trophy', isFontIcon: true },
          { title: 'Poe', desc: '聚合多种 AI 模型的问答平台', url: 'https://poe.com/', icon: 'https://poe.com/favicon.ico' },
          { title: 'Meshy', desc: '3D AI 模型生成工具', url: 'https://www.meshy.ai/', icon: 'https://www.meshy.ai/favicon.ico' },
          { title: 'Tripo AI', desc: '快速生成 3D 模型的 AI 工具', url: 'https://www.tripo3d.ai/', icon: 'https://www.tripo3d.ai/favicon.ico' },
          { title: 'Rodin', desc: 'HyperHuman 推出的 AI 3D 生成器', url: 'https://hyperhuman.deemos.com/rodin', icon: 'fas fa-cube', isFontIcon: true }
        ]
      }
    ]
  },
  {
    id: 'community',
    title: '社区学习',
    icon: 'fas fa-users',
    groups: [
      {
        name: '国内',
        items: [
          { title: '掘金', desc: '帮助开发者成长的社区', url: 'https://juejin.cn/', icon: 'https://lf3-cdn-tos.bytescm.com/obj/static/xitu_juejin_web/static/favicons/favicon-32x32.png' },
          { title: '少数派', desc: '高效工作，品质生活', url: 'https://sspai.com/', icon: 'https://sspai.com/favicon.ico' },
          { title: 'V2EX', desc: '创意工作者们的社区', url: 'https://www.v2ex.com/', icon: 'https://www.v2ex.com/static/img/v2ex@2x.png' },
          { title: '菜鸟教程', desc: '学的不仅是技术，更是梦想', url: 'https://www.runoob.com/', icon: 'https://static.runoob.com/images/favicon.ico' },
          { title: 'HelloGitHub', desc: '分享有趣、入门级的开源项目', url: 'https://hellogithub.com/', icon: 'https://hellogithub.com/favicon.ico' },
          { title: 'CSDN', desc: '专业开发者社区', url: 'https://www.csdn.net/', icon: 'https://g.csdnimg.cn/static/logo/favicon32.ico' },
          { title: 'LeetCode', desc: '算法与技术成长平台', url: 'https://leetcode.cn/', icon: 'https://leetcode.cn/favicon.ico' },
          { title: 'InfoQ', desc: '软件开发领域知识与创新', url: 'https://www.infoq.cn/', icon: 'https://static001.infoq.cn/static/infoq/img/logo-32.png' },
          { title: '吾爱破解', desc: '软件安全与逆向分析社区', url: 'https://www.52pojie.cn/', icon: 'https://www.52pojie.cn/favicon.ico' }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'Google', desc: '全球搜索引擎', url: 'https://www.google.com', icon: 'https://www.google.com/favicon.ico' },
          { title: 'MDN Web Docs', desc: 'Web 开发者权威指南', url: 'https://developer.mozilla.org/zh-CN/', icon: 'fab fa-firefox', isFontIcon: true },
          { title: 'Stack Overflow', desc: '全球最大的技术问答社区', url: 'https://stackoverflow.com/', icon: 'https://stackoverflow.com/favicon.ico' },
          { title: 'Hacker News', desc: '极客新闻聚合', url: 'https://news.ycombinator.com/', icon: 'https://news.ycombinator.com/favicon.ico' },
          { title: 'Reddit', desc: '主题社区与讨论', url: 'https://www.reddit.com/', icon: 'https://www.reddit.com/favicon.ico' }
        ]
      }
    ]
  },
  {
    id: 'design',
    title: '设计灵感',
    icon: 'fas fa-pen-nib',
    groups: [
      {
        name: '国内',
        items: [
          { title: 'Iconfont', desc: '阿里巴巴矢量图标库', url: 'https://www.iconfont.cn/', icon: 'fas fa-icons', isFontIcon: true }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'Figma', desc: '在线协作界面设计工具', url: 'https://www.figma.com/', icon: 'https://static.figma.com/app/icon/1/favicon.ico' },
          { title: 'Dribbble', desc: '设计师灵感分享平台', url: 'https://dribbble.com/', icon: 'fab fa-dribbble', isFontIcon: true },
          { title: 'Behance', desc: 'Adobe 旗下的设计师展示平台', url: 'https://www.behance.net/', icon: 'fab fa-behance', isFontIcon: true },
          { title: 'Pinterest', desc: '创意灵感与图片发现', url: 'https://www.pinterest.com/', icon: 'fab fa-pinterest', isFontIcon: true },
          { title: 'Unsplash', desc: '免费高质量图片素材', url: 'https://unsplash.com/', icon: 'fab fa-unsplash', isFontIcon: true },
          { title: 'Font Awesome', desc: '流行的图标集和工具包', url: 'https://fontawesome.com/', icon: 'fab fa-font-awesome', isFontIcon: true },
          { title: 'Google Fonts', desc: '免费开源字体库', url: 'https://fonts.google.com/', icon: 'fab fa-google', isFontIcon: true },
          { title: 'itch.io', desc: '独立游戏托管与发现平台', url: 'https://itch.io/', icon: 'fab fa-itch-io', isFontIcon: true }
        ]
      }
    ]
  },
  {
    id: 'office',
    title: '办公协作',
    icon: 'fas fa-briefcase',
    groups: [
      {
        name: '国内',
        items: [
          { title: '飞书', desc: '企业协作与管理平台', url: 'https://www.feishu.cn/', icon: 'https://lf3-static.bytednsdoc.com/obj/eden-cn/hbeh7_km/favicon.ico' },
          { title: '金山文档', desc: '多人实时协作的在线 Office', url: 'https://www.kdocs.cn/', icon: 'https://www.kdocs.cn/favicon.ico' },
          { title: '腾讯文档', desc: '可多人协作的在线文档', url: 'https://docs.qq.com/', icon: 'https://docs.qq.com/favicon.ico' }
        ]
      },
      {
        name: '国外',
        items: [
          { title: 'Notion', desc: '多合一工作空间', url: 'https://www.notion.so/', icon: 'https://www.notion.so/images/favicon.ico' },
          { title: 'Slack', desc: '企业团队协作工具', url: 'https://slack.com/', icon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png' }
        ]
      }
    ]
  }
];
