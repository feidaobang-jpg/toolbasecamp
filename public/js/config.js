const siteConfig = {
    siteNameKey: 'site.name',
    logoText: 'TB',
    title: 'Tools',
    homeUrl: 'index.html',
    toolsHubUrl: 'index.html',
    lifeHubUrl: 'life.html',
    gamesHubUrl: 'games.html',
    mainSiteOrigin: 'https://toolbasecamp.com',
    descriptionKey: 'site.description',
    keywordsKey: 'site.keywords',
    footerKey: 'site.footer',
    adminEmail: 'admin@toolbasecamp.com',
    adminPhone: '15859130726',
    devPortalUrl: 'https://dev.toolbasecamp.com',
    pdfPortalUrl: 'https://pdf.toolbasecamp.com',
    chefPortalUrl: 'https://chef.toolbasecamp.com',
    hoppscotchPortalUrl: 'https://hoppscotch.toolbasecamp.com',
    translatePortalUrl: 'https://translate.toolbasecamp.com',
    newsPortalUrl: 'https://news.toolbasecamp.com',
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
        url: 'https://news.toolbasecamp.com',
        ctaKey: 'portals.news.cta',
        theme: 'news'
    },
    {
        titleKey: 'portals.dev.title',
        descriptionKey: 'portals.dev.description',
        url: 'https://dev.toolbasecamp.com',
        ctaKey: 'portals.dev.cta',
        theme: 'dev'
    },
    {
        titleKey: 'portals.chef.title',
        descriptionKey: 'portals.chef.description',
        url: 'https://chef.toolbasecamp.com',
        ctaKey: 'portals.chef.cta',
        theme: 'chef'
    },
    {
        titleKey: 'portals.hoppscotch.title',
        descriptionKey: 'portals.hoppscotch.description',
        url: 'https://hoppscotch.toolbasecamp.com',
        ctaKey: 'portals.hoppscotch.cta',
        theme: 'hoppscotch'
    },
    {
        titleKey: 'portals.pdf.title',
        descriptionKey: 'portals.pdf.description',
        url: 'https://pdf.toolbasecamp.com',
        ctaKey: 'portals.pdf.cta',
        theme: 'pdf'
    },
    {
        titleKey: 'portals.translate.title',
        descriptionKey: 'portals.translate.description',
        url: 'https://translate.toolbasecamp.com',
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
                { titleKey: 'tools.cardScore.title', url: 'html/record/card-score.html' },
                { titleKey: 'tools.onlineCardScore.title', url: 'html/record/online-card-score.html', authRequired: true },
                { titleKey: 'tools.todoList.title', url: 'html/record/todo-list.html?v=4', authRequired: true },
                { titleKey: 'tools.k510Score.title', url: 'html/record/510k-score.html' },
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
                { titleKey: 'tools.removeBackground.title', url: 'html/media/remove-background.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.generalCutout.title', url: 'html/media/general-cutout.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.iconMaker.title', url: 'html/media/icon-maker.html' },
                { titleKey: 'tools.coverMaker.title', url: 'html/media/cover-maker.html' },
                { titleKey: 'tools.imageCollage.title', url: 'html/media/image-collage.html' },
                { titleKey: 'tools.imageToAnimation.title', url: 'html/media/image-to-animation.html', authRequired: true, paid: true },
                { titleKey: 'tools.idCardCopy.title', url: 'html/media/id-card-copy.html' },
                { titleKey: 'tools.imageEnhance.title', url: 'html/media/image-enhance.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.instructEdit.title', url: 'html/media/instruct-edit.html', authRequired: true, paid: true },
                { titleKey: 'tools.textToImage.title', url: 'html/media/text-to-image.html', authRequired: true, paid: true },
                { titleKey: 'tools.aiMusic.title', url: 'html/media/ai-music.html', authRequired: true, paid: true },
                { titleKey: 'tools.idPhoto.title', url: 'html/media/id-photo.html', authRequired: true, dailyLimit: true },
                { titleKey: 'tools.videoToImages.title', url: 'html/media/video-to-images.html' }
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
            titleKey: 'games.groups.polished',
            items: [
                { titleKey: 'tools.sudoku.title', url: 'html/game/sudoku.html?v=4' },
                { titleKey: 'tools.klotski.title', url: 'html/game/klotski.html?v=3' },
                { titleKey: 'tools.gomoku.title', url: 'html/game/gomoku.html?v=3' },
                { titleKey: 'tools.puzzle.title', url: 'html/game/puzzle.html?v=2' },
                { titleKey: 'tools.gemswap.title', url: 'html/game/gemswap.html?v=6' },
                { titleKey: 'tools.breakout.title', url: 'html/game/breakout.html?v=2' },
                { titleKey: 'tools.lianliankan.title', url: 'html/game/lianliankan.html' },
                { titleKey: 'tools.goldminer.title', url: 'html/game/goldminer.html?v=12' },
                { titleKey: 'tools.descent.title', url: 'html/game/descent.html?v=3' },
                { titleKey: 'tools.g2048.title', url: 'html/game/g2048.html?v=2' }
            ]
        },
        {
            titleKey: 'games.groups.draft',
            items: [
                { titleKey: 'tools.snake.title', url: 'html/game/snake.html?v=4' },
                { titleKey: 'tools.catcher.title', url: 'html/game/catcher.html?v=8' },
                { titleKey: 'tools.memory.title', url: 'html/game/memory.html?v=3' },
                { titleKey: 'tools.mines.title', url: 'html/game/mines.html?v=3' },
                { titleKey: 'tools.slots.title', url: 'html/game/slots.html?v=20' },
                { titleKey: 'tools.sheepstack.title', url: 'html/game/sheepstack.html?v=5' },
                { titleKey: 'tools.diverDave.title', url: 'html/game/diver-dave.html?v=2' },
                { titleKey: 'tools.gardenDefense.title', url: 'html/game/garden-defense.html?v=2' },
                { titleKey: 'tools.blitzRun3d.title', url: 'html/game/blitz-run.html?v=13' },
                { titleKey: 'tools.tankBattle.title', url: 'html/game/tank_battle.html?v=9' },
                { titleKey: 'tools.starSerpent.title', url: 'html/game/star-serpent.html?v=3' },
                { titleKey: 'tools.fishFeast.title', url: 'html/game/fish-feast.html?v=3' }
            ]
        }
    ]
};

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
        }
    ]
};

window.privateToolsConfig = privateToolsConfig;
