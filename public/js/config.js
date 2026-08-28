const siteConfig = {
    siteNameKey: 'site.name',
    logoText: 'TB',
    title: 'Tools',
    homeUrl: 'index.html',
    toolsHubUrl: 'index.html',
    lifeHubUrl: 'life.html',
    gamesHubUrl: 'games.html',
    imagesHubUrl: 'images.html',
    musicHubUrl: 'music.html',
    mainSiteOrigin: 'https://zhengxiaohui.cn',
    descriptionKey: 'site.description',
    keywordsKey: 'site.keywords',
    footerKey: 'site.footer',
    /** ICP filing number shown in site footer (link to MIIT). */
    icpBeianNumber: '闽ICP备2025116294号-2',
    icpBeianUrl: 'https://beian.miit.gov.cn/',
    adminEmail: 'admin@zhengxiaohui.cn',
    adminPhone: '15859130726',
    devPortalUrl: 'https://dev.zhengxiaohui.cn',
    pdfPortalUrl: 'https://pdf.zhengxiaohui.cn',
    chefPortalUrl: 'https://chef.zhengxiaohui.cn',
    hoppscotchPortalUrl: 'https://hoppscotch.zhengxiaohui.cn',
    translatePortalUrl: 'https://translate.zhengxiaohui.cn',
    newsPortalUrl: 'https://news.zhengxiaohui.cn',
    /** 家里电脑 ComfyUI API（Cloudflare Tunnel） */
    homePcApiBase: 'https://comfy.zhengxiaohui.cn',
    apiBase: (function () {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8001';
        }
        return `${window.location.origin}/api`;
    })(),
    nav: [
        { nameKey: 'nav.tools', url: 'index.html' },
        { nameKey: 'nav.life', url: 'life.html' },
        { nameKey: 'nav.games', url: 'games.html' },
        { nameKey: 'nav.images', url: 'images.html' },
        { nameKey: 'nav.music', url: 'music.html' },
        { nameKey: 'nav.sites', url: 'cool-sites.html' },
        { nameKey: 'nav.guestbook', url: 'guestbook.html' },
        { nameKey: 'nav.topUp', url: 'top-up.html' },
        { nameKey: 'nav.about', url: 'about.html' }
    ]
};

/** Self-hosted portals (same brand, separate deploy) */
const portalsConfig = [
    {
        titleKey: 'portals.news.title',
        descriptionKey: 'portals.news.description',
        url: 'https://news.zhengxiaohui.cn',
        ctaKey: 'portals.news.cta',
        theme: 'news'
    },
    {
        titleKey: 'portals.dev.title',
        descriptionKey: 'portals.dev.description',
        url: 'https://dev.zhengxiaohui.cn',
        ctaKey: 'portals.dev.cta',
        theme: 'dev'
    },
    {
        titleKey: 'portals.chef.title',
        descriptionKey: 'portals.chef.description',
        url: 'https://chef.zhengxiaohui.cn',
        ctaKey: 'portals.chef.cta',
        theme: 'chef'
    },
    {
        titleKey: 'portals.hoppscotch.title',
        descriptionKey: 'portals.hoppscotch.description',
        url: 'https://hoppscotch.zhengxiaohui.cn',
        ctaKey: 'portals.hoppscotch.cta',
        theme: 'hoppscotch'
    },
    {
        titleKey: 'portals.pdf.title',
        descriptionKey: 'portals.pdf.description',
        url: 'https://pdf.zhengxiaohui.cn',
        ctaKey: 'portals.pdf.cta',
        theme: 'pdf'
    },
    {
        titleKey: 'portals.translate.title',
        descriptionKey: 'portals.translate.description',
        url: 'https://translate.zhengxiaohui.cn',
        ctaKey: 'portals.translate.cta',
        theme: 'translate'
    }
];

const toolsConfig = {
    sectionTitleKey: 'hub.basecampTools',
    groups: [
        {
            titleKey: 'tools.groups.calc',
            items: [
                { titleKey: 'tools.age.title', url: 'html/calc/age.html' },
                { titleKey: 'tools.bmi.title', url: 'html/calc/bmi.html' },
                { titleKey: 'tools.loan.title', url: 'html/calc/loan.html' },
                { titleKey: 'tools.k510Reward.title', url: 'html/calc/510k-reward.html' },
                { titleKey: 'tools.taxCn.title', url: 'html/calc/tax-cn.html' },
                { titleKey: 'tools.billSplit.title', url: 'html/calc/bill-split.html' },
                { titleKey: 'tools.fuelCost.title', url: 'html/calc/fuel-cost.html' },
                { titleKey: 'tools.dateDiff.title', url: 'html/calc/date-diff.html' }
            ]
        },
        {
            titleKey: 'tools.groups.convert',
            items: [
                { titleKey: 'tools.rmbUppercase.title', url: 'html/convert/rmb-uppercase.html' },
                { titleKey: 'tools.unitConvert.title', url: 'html/convert/unit-convert.html' },
                { titleKey: 'tools.currencyConvert.title', url: 'html/convert/currency-convert.html' },
                { titleKey: 'tools.timestampTimezone.title', url: 'html/convert/timestamp-timezone.html' },
                { titleKey: 'tools.percentDiscount.title', url: 'html/convert/percent-discount.html' }
            ]
        },
        {
            titleKey: 'tools.groups.food',
            items: [
                { titleKey: 'tools.aiRecipe.title', url: 'html/life/ai-recipe.html', dailyLimit: true }
            ]
        },
        {
            titleKey: 'tools.groups.lifePlans',
            items: [
                { titleKey: 'tools.weightLossPlan.title', url: 'html/life/weight-loss-plan.html', dailyLimit: true },
                { titleKey: 'tools.studyPlan.title', url: 'html/life/study-plan.html', dailyLimit: true },
                { titleKey: 'tools.roadTripPlan.title', url: 'html/life/road-trip-plan.html', dailyLimit: true },
                { titleKey: 'tools.dayTripPlan.title', url: 'html/life/day-trip-plan.html', dailyLimit: true },
                { titleKey: 'tools.pcUpgradePlan.title', url: 'html/life/pc-upgrade-plan.html', dailyLimit: true },
                { titleKey: 'tools.savingsPlan.title', url: 'html/life/savings-plan.html', dailyLimit: true },
                { titleKey: 'tools.interviewPlan.title', url: 'html/life/interview-plan.html', dailyLimit: true },
                { titleKey: 'tools.seasonalFoodPlan.title', url: 'html/life/seasonal-food-plan.html', dailyLimit: true },
                { titleKey: 'tools.familyMealPlan.title', url: 'html/life/family-meal-plan.html', dailyLimit: true },
                { titleKey: 'tools.outfitPlan.title', url: 'html/life/outfit-plan.html', dailyLimit: true },
                { titleKey: 'tools.travelPackPlan.title', url: 'html/life/travel-pack-plan.html', dailyLimit: true },
                { titleKey: 'tools.holidayStockPlan.title', url: 'html/life/holiday-stock-plan.html', dailyLimit: true },
                { titleKey: 'tools.partyHostPlan.title', url: 'html/life/party-host-plan.html', dailyLimit: true },
                { titleKey: 'tools.kidsWeekendPlan.title', url: 'html/life/kids-weekend-plan.html', dailyLimit: true },
                { titleKey: 'tools.emergencyKitPlan.title', url: 'html/life/emergency-kit-plan.html', dailyLimit: true },
                { titleKey: 'tools.officeLunchPlan.title', url: 'html/life/office-lunch-plan.html', dailyLimit: true },
                { titleKey: 'tools.fitnessWeekPlan.title', url: 'html/life/fitness-week-plan.html', dailyLimit: true },
                { titleKey: 'tools.lowOilWeekPlan.title', url: 'html/life/low-oil-week-plan.html', dailyLimit: true },
                { titleKey: 'tools.jobApplyWeekPlan.title', url: 'html/life/job-apply-week-plan.html', dailyLimit: true },
                { titleKey: 'tools.dateNightPlan.title', url: 'html/life/date-night-plan.html', dailyLimit: true },
                { titleKey: 'tools.petTravelPlan.title', url: 'html/life/pet-travel-plan.html', dailyLimit: true }
            ]
        },
        {
            titleKey: 'tools.groups.record',
            items: [
                // 普通 → 需登录 → 日限 → 收费（组内由 sortToolsByAccessBadge 再统一排）
                { titleKey: 'tools.cardScore.title', url: 'html/record/card-score.html' },
                { titleKey: 'tools.k510Score.title', url: 'html/record/510k-score.html' },
                { titleKey: 'tools.onlineCardScore.title', url: 'html/record/online-card-score.html', authRequired: true },
                { titleKey: 'tools.todoList.title', url: 'html/record/todo-list.html?v=4', authRequired: true },
                { titleKey: 'tools.importantDays.title', url: 'html/record/important-days.html', authRequired: true },
                { titleKey: 'tools.dailyClock.title', url: 'html/record/daily-clock.html', authRequired: true },
                { titleKey: 'tools.deposit.title', url: 'html/record/deposit.html', authRequired: true },
                { titleKey: 'tools.rent.title', url: 'html/record/rent.html', authRequired: true },
                { titleKey: 'tools.goods.title', url: 'html/record/goods.html', authRequired: true }
            ]
        },
        {
            titleKey: 'tools.groups.media',
            items: [
                { titleKey: 'tools.qrCode.title', url: 'html/media/qr-code.html' },
                { titleKey: 'tools.imageResize.title', url: 'html/media/image-resize.html' },
                { titleKey: 'tools.watermarkRemoval.title', url: 'html/media/watermark-removal.html' },
                { titleKey: 'tools.watermarkRemovalAdvanced.title', url: 'html/media/watermark-removal-advanced.html' },
                { titleKey: 'tools.addMosaic.title', url: 'html/media/add-mosaic.html' },
                { titleKey: 'tools.addWatermark.title', url: 'html/media/add-watermark.html' },
                { titleKey: 'tools.addBackground.title', url: 'html/media/add-background.html' },
                { titleKey: 'tools.iconMaker.title', url: 'html/media/icon-maker.html' },
                { titleKey: 'tools.coverMaker.title', url: 'html/media/cover-maker.html' },
                { titleKey: 'tools.imageCollage.title', url: 'html/media/image-collage.html' },
                { titleKey: 'tools.idCardCopy.title', url: 'html/media/id-card-copy.html' },
                { titleKey: 'tools.videoToImages.title', url: 'html/media/video-to-images.html' },
                { titleKey: 'tools.aiMusic.title', url: 'html/media/ai-music.html', authRequired: true },
                { titleKey: 'tools.removeBackground.title', url: 'html/media/remove-background.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.generalCutout.title', url: 'html/media/general-cutout.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.imageEnhance.title', url: 'html/media/image-enhance.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.idPhoto.title', url: 'html/media/id-photo.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.imageUnderstand.title', url: 'html/media/image-understand.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.speechTts.title', url: 'html/media/speech-tts.html', authRequired: true, paid: true },
                { titleKey: 'tools.imageToAnimation.title', url: 'html/media/image-to-animation.html', authRequired: true, paid: true },
                { titleKey: 'tools.imageToSprites.title', url: 'html/media/image-to-sprites.html', authRequired: true, paid: true },
                { titleKey: 'tools.textToVideo.title', url: 'html/media/text-to-video.html', authRequired: true, paid: true },
                { titleKey: 'tools.refToVideo.title', url: 'html/media/ref-to-video.html', authRequired: true, paid: true },
                { titleKey: 'tools.videoEdit.title', url: 'html/media/video-edit.html', authRequired: true, paid: true },
                { titleKey: 'tools.instructEdit.title', url: 'html/media/instruct-edit.html', authRequired: true, paid: true },
                { titleKey: 'tools.textToImage.title', url: 'html/media/text-to-image.html', authRequired: true, paid: true }
            ]
        },
        {
            titleKey: 'tools.groups.document',
            items: [
                { titleKey: 'tools.pdfToWord.title', url: 'html/docs/pdf-to-word.html' },
                { titleKey: 'tools.wordToPdf.title', url: 'html/docs/word-to-pdf.html' },
                { titleKey: 'tools.imagesToPdf.title', url: 'html/docs/images-to-pdf.html' },
                { titleKey: 'tools.imagesToPdfAdvanced.title', url: 'html/media/images-to-pdf-advanced.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.ocrText.title', url: 'html/media/ocr-text.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.ocrTable.title', url: 'html/media/ocr-table.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.drugLabel.title', url: 'html/docs/drug-label.html', authRequired: true, dailyLimit: true }
            ]
        },
        {
            titleKey: 'tools.groups.diagram',
            items: [
                { titleKey: 'tools.mindmap.title', url: 'html/diagram/mindmap.html' },
                { titleKey: 'tools.spreadsheet.title', url: 'html/diagram/spreadsheet.html' }
            ]
        },
        {
            titleKey: 'tools.groups.android',
            items: [
                { titleKey: 'tools.layoutConverter.title', url: 'html/dev/layout-converter.html' },
                { titleKey: 'tools.stringTranslator.title', url: 'html/android/string-translator.html' },
                { titleKey: 'tools.folderTranslator.title', url: 'html/android/folder-translator.html' },
                { titleKey: 'tools.mvpConverter.title', url: 'html/android/mvp-converter.html' },
                { titleKey: 'tools.adapterGenerator.title', url: 'html/android/adapter-generator.html' },
                { titleKey: 'tools.refreshPageGenerator.title', url: 'html/android/refresh-page-generator.html' }
            ]
        },
        {
            titleKey: 'tools.groups.ladder',
            items: [
                { titleKey: 'tools.pcBuilds.title', url: 'html/ladder/pc-builds.html' },
                { titleKey: 'tools.ladderCpuRank.title', url: 'html/ladder/cpu_rank.html' },
                { titleKey: 'tools.ladderGpuRank.title', url: 'html/ladder/gpu_rank.html' },
                { titleKey: 'tools.ladderSocRank.title', url: 'html/ladder/soc_rank.html' },
                { titleKey: 'tools.ladderNbCpuRank.title', url: 'html/ladder/nb_cpu_rank.html' },
                { titleKey: 'tools.ladderNbGpuRank.title', url: 'html/ladder/nb_gpu_rank.html' }
            ]
        },
        {
            titleKey: 'tools.groups.developer',
            items: [
                { titleKey: 'tools.jsonToJava.title', url: 'html/dev/json-to-java.html' },
                { titleKey: 'tools.base64Url.title', url: 'html/dev/base64-url.html' },
                { titleKey: 'tools.regexTester.title', url: 'html/dev/regex-tester.html' },
                { titleKey: 'tools.jwtDecode.title', url: 'html/dev/jwt-decode.html' },
                { titleKey: 'tools.jsonFormat.title', url: 'html/dev/json-format.html' }
            ]
        }
    ]
};

/** Top-level games hub (peer to tools) */
const gamesConfig = {
    sectionTitleKey: 'hub.gamesTitle',
    groups: [
        {
            titleKey: 'games.groups.action',
            items: [
                { titleKey: 'tools.roadRash.title', url: 'html/game/road_rash.html?v=6' },
                { titleKey: 'tools.fishFeast.title', url: 'html/game/fish-feast.html?v=10' },
                { titleKey: 'tools.bomberman.title', url: 'html/game/bomberman.html?v=9' },
                { titleKey: 'tools.diving.title', url: 'html/game/diving.html?v=7' },
                { titleKey: 'tools.journeyWest.title', url: 'html/game/journey_west.html?v=3' },
                { titleKey: 'tools.tankBattle.title', url: 'html/game/tank_battle.html?v=54' },
                { titleKey: 'tools.starshipDefense.title', url: 'html/game/starship_defense.html?v=3' }
            ]
        },
        {
            titleKey: 'games.groups.puzzle',
            items: [
                { titleKey: 'tools.klotski.title', url: 'html/game/klotski.html?v=3' },
                { titleKey: 'tools.gomoku.title', url: 'html/game/gomoku.html?v=3' },
                { titleKey: 'tools.puzzle.title', url: 'html/game/puzzle.html?v=4' },
                { titleKey: 'tools.gemswap.title', url: 'html/game/gemswap.html?v=10' },
                { titleKey: 'tools.lianliankan.title', url: 'html/game/lianliankan.html' },
                { titleKey: 'tools.slots.title', url: 'html/game/slots.html?v=20' },
                { titleKey: 'tools.bubbleDragon.title', url: 'html/game/bubble_dragon.html?v=6' },
                { titleKey: 'tools.flyBird.title', url: 'html/game/fly_bird.html?v=3' },
                { titleKey: 'tools.frogZuma.title', url: 'html/game/frog_zuma.html?v=6' },
                { titleKey: 'tools.hundredFloors.title', url: 'html/game/hundred_floors.html?v=6' },
                { titleKey: 'tools.worms.title', url: 'html/game/worms.html?v=7' },
                { titleKey: 'tools.brickBreaker.title', url: 'html/game/brick_breaker.html?v=7' },
                { titleKey: 'tools.sheepstack.title', url: 'html/game/sheepstack.html?v=10' },
                { titleKey: 'tools.pvz.title', url: 'html/game/pvz.html?v=7' }
            ]
        }
    ]
};

/** Hub / sidebar order within each group: plain → sign-in → daily limit → paid */
function toolAccessBadgeRank(item) {
    if (!item) return 0;
    if (item.paid) return 3;
    if (item.dailyLimit) return 2;
    if (item.authRequired) return 1;
    return 0;
}
function sortToolsByAccessBadge(config) {
    if (!config || !config.groups) return config;
    config.groups.forEach(function (group) {
        if (!group || !Array.isArray(group.items)) return;
        group.items = group.items.slice().sort(function (a, b) {
            return toolAccessBadgeRank(a) - toolAccessBadgeRank(b);
        });
    });
    return config;
}
sortToolsByAccessBadge(toolsConfig);

window.siteConfig = siteConfig;
window.portalsConfig = portalsConfig;
window.toolsConfig = toolsConfig;
window.gamesConfig = gamesConfig;

/** Admin-only personal tools (not shown in public hub). */
const privateToolsConfig = {
    sectionTitleKey: 'privateHub.title',
    groups: [
        {
            titleKey: 'privateHub.groups.ops',
            items: [
                {
                    titleKey: 'privateHub.ops.siteStatsTitle',
                    descriptionKey: 'privateHub.ops.siteStatsDesc',
                    url: 'html/admin/site-stats.html'
                },
                {
                    titleKey: 'privateHub.ops.refreshTitle',
                    descriptionKey: 'privateHub.ops.refreshDesc',
                    url: 'html/admin/private/ladder-update.html'
                },
                {
                    titleKey: 'privateHub.ops.walletTitle',
                    descriptionKey: 'privateHub.ops.walletDesc',
                    url: 'html/admin/private/ai-wallet.html'
                },
                {
                    titleKey: 'privateHub.ops.chatInboxTitle',
                    descriptionKey: 'privateHub.ops.chatInboxDesc',
                    url: 'html/admin/private/chat-inbox.html'
                },
                {
                    titleKey: 'privateHub.ops.tradMusicTitle',
                    descriptionKey: 'privateHub.ops.tradMusicDesc',
                    url: 'html/admin/private/traditional-music.html'
                },
                {
                    titleKey: 'privateHub.ops.stickersTitle',
                    descriptionKey: 'privateHub.ops.stickersDesc',
                    url: 'html/admin/private/stickers.html'
                }
            ]
        },
        {
            titleKey: 'privateHub.groups.stock',
            items: [
                {
                    titleKey: 'privateHub.stock.picksTitle',
                    descriptionKey: 'privateHub.stock.picksDesc',
                    url: 'html/admin/private/stock-picks.html'
                }
            ]
        },
        {
            titleKey: 'privateHub.groups.homePc',
            items: [
                {
                    titleKey: 'privateHub.homePc.removeBgTitle',
                    descriptionKey: 'privateHub.homePc.removeBgDesc',
                    url: 'html/admin/private/home-pc/remove-background.html'
                },
                {
                    titleKey: 'privateHub.homePc.txt2imgTitle',
                    descriptionKey: 'privateHub.homePc.txt2imgDesc',
                    url: 'html/admin/private/home-pc/text-to-image.html'
                },
                {
                    titleKey: 'privateHub.homePc.img2imgTitle',
                    descriptionKey: 'privateHub.homePc.img2imgDesc',
                    url: 'html/admin/private/home-pc/image-to-image.html'
                },
                {
                    titleKey: 'privateHub.homePc.describeCutoutTitle',
                    descriptionKey: 'privateHub.homePc.describeCutoutDesc',
                    url: 'html/admin/private/home-pc/describe-cutout.html'
                },
                {
                    titleKey: 'privateHub.homePc.textToImagesTitle',
                    descriptionKey: 'privateHub.homePc.textToImagesDesc',
                    url: 'html/admin/private/home-pc/text-to-images.html'
                },
                {
                    titleKey: 'privateHub.homePc.textToVideoTitle',
                    descriptionKey: 'privateHub.homePc.textToVideoDesc',
                    url: 'html/admin/private/home-pc/text-to-video.html'
                }
            ]
        }
    ]
};

window.privateToolsConfig = privateToolsConfig;

/** ICP filing footer — shared by base.js (tool pages) and common_ui.js (hub pages). */
function tbIcpBeianNumber() {
    if (typeof siteConfig !== 'undefined' && siteConfig.icpBeianNumber) {
        return String(siteConfig.icpBeianNumber).trim();
    }
    return '';
}

function tbIcpBeianUrl() {
    if (typeof siteConfig !== 'undefined' && siteConfig.icpBeianUrl) {
        return String(siteConfig.icpBeianUrl).trim();
    }
    return 'https://beian.miit.gov.cn/';
}

function tbRenderIcpFooter() {
    if (document.body && document.body.getAttribute('data-no-icp-footer') === '1') return;
    var number = tbIcpBeianNumber();
    if (!number && typeof t === 'function') {
        number = t('site.icpBeian');
    }
    if (!number || number === 'site.icpBeian') return;

    var footer = document.getElementById('site-icp-footer');
    if (!footer) {
        footer = document.createElement('footer');
        footer.id = 'site-icp-footer';
        footer.className = 'site-icp-footer';
        footer.setAttribute('role', 'contentinfo');
        document.body.appendChild(footer);
    }

    var href = tbIcpBeianUrl();
    footer.innerHTML = '';
    var a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = number;
    footer.appendChild(a);
}

window.tbRenderIcpFooter = tbRenderIcpFooter;
