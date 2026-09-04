// XPTV Spider for huangguo.video (黄果剧场)
// Type 3 JavaScript spider

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const SITE = 'https://huangguo.video'

var _cheerioInstance = null
function getCheerio() {
    if (!_cheerioInstance && typeof createCheerio === 'function') {
        _cheerioInstance = createCheerio()
    }
    return _cheerioInstance
}

// ============ Extension Info ============
async function getLocalInfo() {
    return jsonify({
        name: '黄果剧场',
        ver: '20260828',
        type: 3,
        api: 'huangguo_theater',
        description: '黄果剧场短剧/MV/连续剧源',
    })
}

// ============ HTTP Helper ============
async function fetchPage(url, opts) {
    opts = opts || {}
    var headers = Object.assign({
        'User-Agent': UA,
        'Referer': SITE + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }, opts.headers || {})

    var resp = await $fetch.get(url, { headers: headers })
    return (resp && (resp.data || resp.body)) ? (resp.data || resp.body) : ''
}

// ============ Image Helper ============
function resolveImg(src) {
    if (!src) return ''
    if (src.startsWith('http://') || src.startsWith('https://')) return src
    if (src.startsWith('//')) return 'https:' + src
    if (src.startsWith('/')) return SITE + src
    return SITE + '/' + src
}

// ============ Site Tabs Config ============
const appConfig = {
    ver: 20260828,
    title: '黄果剧场',
    site: SITE,
    tabs: [
        { name: '首页推荐', ext: { path: '/', type: 'home' } },
        { name: '连续剧', ext: { path: '/series', type: 'series' } },
        { name: 'MV/音乐剧', ext: { path: '/mv', type: 'mv' } },
        { name: '短片', ext: { path: '/short', type: 'short' } },
        { name: '片段', ext: { path: '/clip', type: 'clip' } },
        { name: '角色', ext: { path: '/role', type: 'role' } }
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

// ============ 核心：提取页面中的结构化视频列表 ============
function extractItemsFromData(data, currentPath) {
    var cards = []

    // 1. 尝试直接解析 JSON 返回
    if (typeof data === 'object') {
        var list = data.list || data.data || data.items || data.records || (data.data && data.data.list) || []
        if (Array.isArray(list)) {
            list.forEach(function (item) {
                var id = item.id || item.vod_id || item._id || item.slug || ''
                var title = item.title || item.name || item.vod_name || ''
                var cover = item.cover || item.poster || item.pic || item.vod_pic || item.thumb || ''
                var remark = item.tag || item.episodes_count || item.duration || item.remark || ''
                if (id && title) {
                    cards.push({
                        vod_id: String(id),
                        vod_name: title,
                        vod_pic: resolveImg(cover),
                        vod_remarks: String(remark || ''),
                        ext: { id: id, url: SITE + '/detail/' + id },
                    })
                }
            })
            if (cards.length > 0) return cards
        }
    }

    // 2. 如果是 HTML 字符串，提取 Next.js / Nuxt / 全局 State 数据
    if (typeof data === 'string') {
        // Next.js 数据匹配
        var nextMatch = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
        if (nextMatch) {
            try {
                var nextData = JSON.parse(nextMatch[1])
                var pageProps = (nextData.props && nextData.props.pageProps) || {}
                var rawList = pageProps.list || pageProps.videos || pageProps.dramas || (pageProps.data && pageProps.data.list) || []
                if (Array.isArray(rawList)) {
                    rawList.forEach(function (item) {
                        cards.push({
                            vod_id: String(item.id || item._id),
                            vod_name: item.title || item.name,
                            vod_pic: resolveImg(item.cover || item.poster || item.pic),
                            vod_remarks: String(item.tag || item.episodes || ''),
                            ext: { id: item.id || item._id, url: SITE + '/detail/' + (item.id || item._id) },
                        })
                    })
                    if (cards.length > 0) return cards
                }
            } catch (e) {}
        }

        // 通用 JSON 变量正则提取
        var stateMatch = data.match(/(?:window\.__INITIAL_STATE__|var\s+pageData)\s*=\s*({[\s\S]*?});/)
        if (stateMatch) {
            try {
                var stateData = JSON.parse(stateMatch[1])
                var sList = stateData.list || (stateData.data && stateData.data.list) || []
                if (Array.isArray(sList)) {
                    sList.forEach(function (item) {
                        cards.push({
                            vod_id: String(item.id),
                            vod_name: item.title || item.name,
                            vod_pic: resolveImg(item.cover || item.pic),
                            vod_remarks: String(item.tag || ''),
                            ext: { id: item.id, url: SITE + '/detail/' + item.id },
                        })
                    })
                    if (cards.length > 0) return cards
                }
            } catch (e) {}
        }

        // 3. Cheerio DOM 解析兜底
        var cheerio = getCheerio()
        if (cheerio) {
            var $ = cheerio.load(data)
            
            // 抓取所有包含链接和图片的卡片元素
            $('a').each(function (_, el) {
                var $a = $(el)
                var href = $a.attr('href') || ''
                if (!href || href === '/' || href.startsWith('javascript:') || href.includes('login') || href.includes('user')) return

                var cover = $a.find('img').attr('data-src') || $a.find('img').attr('src') || ''
                var title = $a.find('.title, .name, h3, h4, p').first().text().trim() || $a.attr('title') || $a.text().trim()
                var remark = $a.find('.tag, .badge, .duration, span').last().text().trim()

                // 只保留带有图片且标题合理的卡片
                if (cover && title && title.length < 40 && title.length > 1) {
                    cards.push({
                        vod_id: href,
                        vod_name: title,
                        vod_pic: resolveImg(cover),
                        vod_remarks: remark || '',
                        ext: { url: href.startsWith('http') ? href : SITE + href },
                    })
                }
            })
        }
    }

    return cards
}

// ============ Get Video List ============
async function getCards(ext) {
    ext = argsify(ext)
    var path = ext.path || '/'
    var page = ext.page || 1

    try {
        // 先抓取目标页面
        var url = SITE + path
        if (page > 1) {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page
        }

        var data = await fetchPage(url)
        var cards = extractItemsFromData(data, path)

        // 若首页/页面抓取为空，尝试请求站内通用的 API 端点
        if (cards.length === 0) {
            var apiUrl = SITE + '/api' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page
            var apiData = await fetchPage(apiUrl)
            cards = extractItemsFromData(apiData, path)
        }

        return jsonify({ list: cards })
    } catch (error) {
        if (typeof $print === 'function') $print('getCards error: ' + error)
        return jsonify({ list: [] })
    }
}

// ============ Get Tracks (Episodes) ============
async function getTracks(ext) {
    ext = argsify(ext)
    var tracks = []
    var url = ext.url || (SITE + '/detail/' + ext.id)

    try {
        var data = await fetchPage(url)
        var episodeList = []

        if (typeof data === 'string') {
            var cheerio = getCheerio()
            if (cheerio) {
                var $ = cheerio.load(data)
                
                // 查找选集
                $('a[href*="/play/"], a[href*="/watch/"], a[href*="/video/"], .episode-item, .anthology-item').each(function (idx, ep) {
                    var $ep = $(ep)
                    var href = $ep.attr('href') || ''
                    var name = $ep.text().trim() || ('第 ' + (idx + 1) + ' 集')
                    if (href && !href.startsWith('javascript:')) {
                        episodeList.push({
                            name: name,
                            pan: '',
                            ext: { url: href.startsWith('http') ? href : SITE + href },
                        })
                    }
                })
            }
        }

        // 如果没有选集列表，直接以当前页面作为单集正片
        if (episodeList.length === 0) {
            episodeList.push({
                name: '正片',
                pan: '',
                ext: { url: url },
            })
        }

        tracks.push({
            title: '黄果播放源',
            tracks: episodeList
        })
    } catch (error) {
        if (typeof $print === 'function') $print('getTracks error: ' + error)
    }

    return jsonify({ list: tracks })
}

// ============ Get Play URL ============
async function getPlayinfo(ext) {
    ext = argsify(ext)
    var url = ext.url

    try {
        var data = await fetchPage(url)
        if (!data) return jsonify({ urls: [] })

        if (typeof data === 'string') {
            // 1. 匹配 HTML5 标签
            var cheerio = getCheerio()
            if (cheerio) {
                var $ = cheerio.load(data)
                var videoSrc = $('video').attr('src') || $('video source').attr('src')
                if (videoSrc) {
                    return jsonify({
                        urls: [videoSrc.startsWith('http') ? videoSrc : SITE + videoSrc],
                        headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }],
                    })
                }
            }

            // 2. 正则查找 m3u8 / mp4 地址
            var streamMatch = data.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/)
            if (streamMatch) {
                return jsonify({
                    urls: [streamMatch[0]],
                    headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }],
                })
            }
        }
    } catch (error) {
        if (typeof $print === 'function') $print('getPlayinfo error: ' + error)
    }

    return jsonify({ urls: [] })
}

// ============ Search ============
async function search(ext) {
    ext = argsify(ext)
    var keyword = ext.text || ''
    var page = ext.page || 1

    if (!keyword) return jsonify({ list: [] })

    try {
        var searchUrl = SITE + '/search?q=' + encodeURIComponent(keyword) + '&page=' + page
        var data = await fetchPage(searchUrl)
        var cards = extractItemsFromData(data, '/search')

        return jsonify({ list: cards })
    } catch (error) {
        if (typeof $print === 'function') $print('search error: ' + error)
        return jsonify({ list: [] })
    }
}
