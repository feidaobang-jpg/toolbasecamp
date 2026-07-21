/**
 * Life (天行) feature catalog — 内容模块固定中文，不走 i18n。
 * field: [path, label] | { list, item: [[path,label],...] } | { path, label, html?, fmt? }
 */
(function (global) {
    'use strict';

    var F = {
        content: '内容',
        author: '作者',
        source: '出处',
        title: '标题',
        quest: '问题',
        answer: '答案',
        result: '结果',
        reason: '解释',
        transl: '译文',
        analyse: '解析',
        note: '翻译',
        pinyin: '拼音',
        strokes: '笔画',
        intro: '介绍',
        kind: '种类',
        tags: '标签',
        yiwen: '译文',
        chengyu: '成语',
        diangu: '典故',
        chuchu: '出处',
        fanli: '范例',
        jyc: '近义词',
        fyc: '反义词',
        shanglian: '上联',
        xialian: '下联',
        mrname: '名人',
        front: '上句',
        behind: '下句',
        type: '类型',
        desc: '说明',
        abbr: '提示',
        study: '详解',
        optionA: '选项 A',
        optionB: '选项 B',
        optionC: '选项 C',
        analytic: '解析',
        saying: '名言',
        riddle: '谜面'
    };

    var TITLES = {
        caihongpi: '彩虹屁',
        dujitang: '毒鸡汤',
        godreply: '神回复',
        joke: '笑话',
        pyqwenan: '朋友圈文案',
        saylove: '土味情话',
        sentence: '心灵鸡汤',
        shilian: '失恋文案',
        tiangou: '舔狗日记',
        wanan: '晚安心语',
        zaoan: '早安心语',
        msdl: '民俗对联',
        duilian: '经典对联',
        mingyan: '名人名言',
        lzmy: '励志名言',
        mgjuzi: '民国句子',
        qingshi: '古代情诗',
        verse: '优美诗句',
        dictum: '名言警句',
        duishici: '填对诗词',
        naowan: '脑筋急转弯',
        scwd: '诗词问答',
        proverb: '文化谚语',
        skl: '顺口溜',
        xiehou: '歇后语',
        rkl: '绕口令',
        moodpoetry: '情结诗句',
        decide: '判断题',
        mnpara: '迷你段子',
        wenda: '知识问答',
        riddleAll: '谜语大全',
        zimi: '字谜',
        slogan: '猜广告语',
        caichengyu: '猜成语',
        caizimi: '猜灯谜',
        cityriddle: '地名谜语',
        idiom: '成语典故',
        dailyEnglish: '每日英语',
        gjmj: '古籍名句',
        xhzd: '新华字典',
        enwords: '英汉词典',
        hotword: '网络流行语',
        jfwords: '近义词反义词',
        zmsc: '最美宋词',
        songci: '精选宋词',
        poetries: '唐诗三百首',
        poetry: '唐诗大全'
    };

    var PH = {
        keyword: '请输入关键字',
        hanzi: '请输入单个汉字',
        english: '请输入英语单词',
        titleAuthor: '可输入标题或作者'
    };

    function item(id, api, fields, extra) {
        var o = { id: id, api: api || id, title: TITLES[id] || id, fields: fields };
        if (extra) {
            Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
        }
        return o;
    }

    function c(path, label) { return [path, label]; }
    function L(listPath, pairs) { return { list: listPath, item: pairs }; }

    var catalog = {
        groups: [
            {
                id: 'innermost',
                title: '文案',
                items: [
                    item('caihongpi', 'caihongpi', [c('content', F.content)]),
                    item('dujitang', 'dujitang', [c('content', F.content)]),
                    item('godreply', 'godreply', [c('list.0.title', F.title), c('list.0.content', F.content)]),
                    item('pyqwenan', 'pyqwenan', [c('content', F.content)]),
                    item('saylove', 'saylove', [c('content', F.content)]),
                    item('sentence', 'sentence', [c('content', F.content)]),
                    item('shilian', 'hsjz', [c('content', F.content)]),
                    item('tiangou', 'tiangou', [c('content', F.content)]),
                    item('zaoan', 'zaoan', [c('content', F.content)]),
                    item('wanan', 'wanan', [c('content', F.content)])
                ]
            },
            {
                id: 'live',
                title: '语录',
                items: [
                    item('mingyan', 'mingyan', [c('list.0.content', F.content), c('list.0.author', F.author)]),
                    item('lzmy', 'lzmy', [c('saying', F.saying), c('transl', F.transl), c('source', F.source)]),
                    item('mgjuzi', 'mgjuzi', [c('content', F.content), c('author', F.author)]),
                    item('dictum', 'dictum', [L('list', [c('content', F.content), c('mrname', F.mrname)])]),
                    item('gjmj', 'gjmj', [c('content', F.content), c('source', F.source)])
                ]
            },
            {
                id: 'riddle',
                title: '谜语',
                items: [
                    item('riddleAll', 'riddle', [c('quest', F.quest), c('answer', F.answer)]),
                    item('zimi', 'zimi', [c('content', F.content), c('answer', F.answer), c('reason', F.reason)]),
                    item('slogan', 'slogan', [c('content', F.content), c('answer', F.answer)]),
                    item('caichengyu', 'caichengyu', [
                        c('question', F.quest), c('abbr', F.abbr), c('answer', F.answer),
                        c('pinyin', F.pinyin), c('source', F.source), c('study', F.study)
                    ]),
                    item('caizimi', 'caizimi', [
                        c('riddle', F.riddle), c('type', F.type), c('answer', F.answer), c('description', F.desc)
                    ]),
                    item('cityriddle', 'cityriddle', [c('quest', F.quest), c('result', F.answer)]),
                    item('naowan', 'naowan', [L('list', [c('quest', F.quest), c('result', F.answer)])])
                ]
            },
            {
                id: 'recreation',
                title: '趣玩',
                items: [
                    item('joke', 'joke', [L('list', [c('title', F.title), c('content', F.content)])]),
                    item('mnpara', 'mnpara', [c('content', F.content)]),
                    item('decide', 'decide', [
                        c('title', F.title),
                        { path: 'answer', label: F.answer, fmt: 'bool01' },
                        c('analyse', F.analyse)
                    ]),
                    item('wenda', 'wenda', [c('quest', F.quest), c('result', F.result)]),
                    item('duishici', 'duishici', [c('quest', F.quest), c('answer', F.answer), c('source', F.source)]),
                    item('scwd', 'scwd', [
                        c('question', F.quest), c('answer_a', F.optionA), c('answer_b', F.optionB),
                        c('answer_c', F.optionC), c('answer', F.answer), c('analytic', F.analytic)
                    ]),
                    item('moodpoetry', 'moodpoetry', [c('title', F.title), c('content', F.content), c('author', F.author)])
                ]
            },
            {
                id: 'study',
                title: '学习',
                items: [
                    item('idiom', 'chengyu', [
                        c('list.0.chengyu', F.chengyu), c('list.0.pinyin', F.pinyin),
                        c('list.0.diangu', F.diangu), c('list.0.chuchu', F.chuchu), c('list.0.fanli', F.fanli)
                    ], { input: { param: 'word', placeholder: PH.keyword } }),
                    item('xhzd', 'xhzd', [
                        c('list.0.pyyb', F.pinyin), c('list.0.bihua', F.strokes),
                        { path: 'list.0.content', label: F.content, html: true }
                    ], { input: { param: 'word', placeholder: PH.hanzi } }),
                    item('enwords', 'enwords', [
                        { path: 'content', label: F.content, html: true }
                    ], { input: { param: 'word', placeholder: PH.english } }),
                    item('jfwords', 'jfwords', [c('jyc', F.jyc), c('fyc', F.fyc)], {
                        input: { param: 'word', placeholder: PH.keyword }
                    }),
                    item('hotword', 'hotword', [
                        c('list.0.title', F.title), c('list.0.content', F.content)
                    ], { input: { param: 'word', placeholder: PH.keyword } }),
                    item('dailyEnglish', 'everyday', [c('content', F.content), c('note', F.note)]),
                    item('proverb', 'proverb', [c('front', F.front), c('behind', F.behind)]),
                    item('xiehou', 'xiehou', [c('list.0.quest', F.quest), c('list.0.result', F.result)]),
                    item('skl', 'skl', [c('content', F.content)]),
                    item('rkl', 'rkl', [{ path: 'list.0.content', label: F.content, html: true }]),
                    item('msdl', 'msdl', [L('list', [c('shanglian', F.shanglian), c('xialian', F.xialian)])]),
                    item('duilian', 'duilian', [c('content', F.content)]),
                    item('qingshi', 'qingshi', [c('content', F.content), c('source', F.source), c('author', F.author)]),
                    item('verse', 'verse', [c('list.0.content', F.content), c('list.0.source', F.source), c('list.0.author', F.author)]),
                    item('zmsc', 'zmsc', [c('content', F.content), c('source', F.source)]),
                    item('songci', 'songci', [
                        c('list.0.title', F.title), c('list.0.tags', F.tags), c('list.0.author', F.author),
                        { path: 'list.0.content', label: F.content, html: true },
                        c('list.0.yiwen', F.yiwen)
                    ], { input: { param: 'word', placeholder: PH.keyword } }),
                    item('poetries', 'poetries', [
                        L('list', [c('title', F.title), c('content', F.content), c('author', F.author)])
                    ], { input: { param: 'word', placeholder: PH.titleAuthor, optional: true } }),
                    item('poetry', 'poetry', [
                        L('list', [
                            c('title', F.title), c('content', F.content), c('intro', F.intro),
                            c('kind', F.kind), c('author', F.author)
                        ])
                    ], { input: { param: 'word', placeholder: PH.titleAuthor, optional: true } })
                ]
            }
        ]
    };

    function findById(id) {
        if (!id) return null;
        for (var g = 0; g < catalog.groups.length; g++) {
            var group = catalog.groups[g];
            for (var i = 0; i < group.items.length; i++) {
                if (group.items[i].id === id) {
                    return { group: group, item: group.items[i] };
                }
            }
        }
        return null;
    }

    function toHubGroups() {
        return catalog.groups.map(function (g) {
            return {
                id: g.id,
                title: g.title,
                items: g.items.map(function (it) {
                    return {
                        id: it.id,
                        title: it.title,
                        url: 'html/life/view.html?id=' + encodeURIComponent(it.id)
                    };
                })
            };
        });
    }

    function syncLifeConfig() {
        global.lifeConfig = { sectionTitle: '内容', groups: toHubGroups() };
    }

    global.LIFE_CATALOG = catalog;
    global.lifeFindById = findById;
    global.lifeToHubGroups = toHubGroups;
    syncLifeConfig();
})(window);
