/**
 * Life (天行) feature catalog — one viewer page reads this config.
 * field: [path, labelKey] | { list, item: [[path,labelKey],...] } | { path, labelKey, html?, fmt? }
 */
(function (global) {
    'use strict';

    var F = {
        content: 'life.f.content',
        author: 'life.f.author',
        source: 'life.f.source',
        title: 'life.f.title',
        quest: 'life.f.quest',
        answer: 'life.f.answer',
        result: 'life.f.result',
        reason: 'life.f.reason',
        transl: 'life.f.transl',
        analyse: 'life.f.analyse',
        note: 'life.f.note',
        pinyin: 'life.f.pinyin',
        strokes: 'life.f.strokes',
        intro: 'life.f.intro',
        kind: 'life.f.kind',
        tags: 'life.f.tags',
        yiwen: 'life.f.yiwen',
        chengyu: 'life.f.chengyu',
        diangu: 'life.f.diangu',
        chuchu: 'life.f.chuchu',
        fanli: 'life.f.fanli',
        jyc: 'life.f.jyc',
        fyc: 'life.f.fyc',
        shanglian: 'life.f.shanglian',
        xialian: 'life.f.xialian',
        mrname: 'life.f.mrname',
        front: 'life.f.front',
        behind: 'life.f.behind',
        type: 'life.f.type',
        desc: 'life.f.desc',
        abbr: 'life.f.abbr',
        study: 'life.f.study',
        optionA: 'life.f.optionA',
        optionB: 'life.f.optionB',
        optionC: 'life.f.optionC',
        analytic: 'life.f.analytic',
        saying: 'life.f.saying',
        riddle: 'life.f.riddle'
    };

    function item(id, api, fields, extra) {
        var o = { id: id, api: api || id, titleKey: 'life.items.' + id, fields: fields };
        if (extra) {
            Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
        }
        return o;
    }

    function c(path, key) { return [path, key]; }
    function L(listPath, pairs) { return { list: listPath, item: pairs }; }

    var catalog = {
        groups: [
            {
                id: 'innermost',
                titleKey: 'life.groups.innermost',
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
                titleKey: 'life.groups.live',
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
                titleKey: 'life.groups.riddle',
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
                titleKey: 'life.groups.recreation',
                items: [
                    item('joke', 'joke', [L('list', [c('title', F.title), c('content', F.content)])]),
                    item('mnpara', 'mnpara', [c('content', F.content)]),
                    item('decide', 'decide', [
                        c('title', F.title),
                        { path: 'answer', labelKey: F.answer, fmt: 'bool01' },
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
                titleKey: 'life.groups.study',
                items: [
                    item('idiom', 'chengyu', [
                        c('list.0.chengyu', F.chengyu), c('list.0.pinyin', F.pinyin),
                        c('list.0.diangu', F.diangu), c('list.0.chuchu', F.chuchu), c('list.0.fanli', F.fanli)
                    ], { input: { param: 'word', placeholderKey: 'life.ph.keyword' } }),
                    item('xhzd', 'xhzd', [
                        c('list.0.pyyb', F.pinyin), c('list.0.bihua', F.strokes),
                        { path: 'list.0.content', labelKey: F.content, html: true }
                    ], { input: { param: 'word', placeholderKey: 'life.ph.hanzi' } }),
                    item('enwords', 'enwords', [
                        { path: 'content', labelKey: F.content, html: true }
                    ], { input: { param: 'word', placeholderKey: 'life.ph.english' } }),
                    item('jfwords', 'jfwords', [c('jyc', F.jyc), c('fyc', F.fyc)], {
                        input: { param: 'word', placeholderKey: 'life.ph.keyword' }
                    }),
                    item('hotword', 'hotword', [
                        c('list.0.title', F.title), c('list.0.content', F.content)
                    ], { input: { param: 'word', placeholderKey: 'life.ph.keyword' } }),
                    item('dailyEnglish', 'everyday', [c('content', F.content), c('note', F.note)]),
                    item('proverb', 'proverb', [c('front', F.front), c('behind', F.behind)]),
                    item('xiehou', 'xiehou', [c('list.0.quest', F.quest), c('list.0.result', F.result)]),
                    item('skl', 'skl', [c('content', F.content)]),
                    item('rkl', 'rkl', [{ path: 'list.0.content', labelKey: F.content, html: true }]),
                    item('msdl', 'msdl', [L('list', [c('shanglian', F.shanglian), c('xialian', F.xialian)])]),
                    item('duilian', 'duilian', [c('content', F.content)]),
                    item('qingshi', 'qingshi', [c('content', F.content), c('source', F.source), c('author', F.author)]),
                    item('verse', 'verse', [c('list.0.content', F.content), c('list.0.source', F.source), c('list.0.author', F.author)]),
                    item('zmsc', 'zmsc', [c('content', F.content), c('source', F.source)]),
                    item('songci', 'songci', [
                        c('list.0.title', F.title), c('list.0.tags', F.tags), c('list.0.author', F.author),
                        { path: 'list.0.content', labelKey: F.content, html: true },
                        c('list.0.yiwen', F.yiwen)
                    ], { input: { param: 'word', placeholderKey: 'life.ph.keyword' } }),
                    item('poetries', 'poetries', [
                        L('list', [c('title', F.title), c('content', F.content), c('author', F.author)])
                    ], { input: { param: 'word', placeholderKey: 'life.ph.titleAuthor', optional: true } }),
                    item('poetry', 'poetry', [
                        L('list', [
                            c('title', F.title), c('content', F.content), c('intro', F.intro),
                            c('kind', F.kind), c('author', F.author)
                        ])
                    ], { input: { param: 'word', placeholderKey: 'life.ph.titleAuthor', optional: true } })
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
                titleKey: g.titleKey,
                items: g.items.map(function (it) {
                    return {
                        id: it.id,
                        titleKey: it.titleKey,
                        url: 'html/life/view.html?id=' + encodeURIComponent(it.id)
                    };
                })
            };
        });
    }

    function syncLifeConfig() {
        global.lifeConfig = { sectionTitleKey: 'hub.lifeTitle', groups: toHubGroups() };
    }

    global.LIFE_CATALOG = catalog;
    global.lifeFindById = findById;
    global.lifeToHubGroups = toHubGroups;
    syncLifeConfig();
})(window);
