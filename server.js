// Polyfill for Node 18 environments lacking globalThis.File (required by undici)
if (typeof globalThis.File === 'undefined') {
    globalThis.File = class File extends Blob {
        constructor(fileBits, fileName, options) {
            super(fileBits, options);
            this.name = fileName;
            this.lastModified = options?.lastModified || Date.now();
        }
    };
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Headers to mimic a real browser to prevent blocking
const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive'
    },
    timeout: 10000,
    httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Bypass strict SSL certificate checks
        family: 4, // Force IPv4 resolution
        // OpenSSL 3.0 (Node 17+) strictness bypass for legacy government TLS
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
        ciphers: 'DEFAULT:@SECLEVEL=0'
    })
};

// Apply axios-retry to automatically handle ECONNRESET, timeouts, and 5xx errors
axiosRetry(axios, {
    retries: 3, // Number of retries
    retryDelay: (retryCount) => {
        console.log(`[Axios Retry] Attempt #${retryCount} waiting ${retryCount * 1000}ms...`);
        return retryCount * 1000; // Time between retries in ms
    },
    retryCondition: (error) => {
        // Retry on network errors like ECONNRESET or 5xx server errors
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
    }
});

async function scrapeFSC() {
    try {
        const response = await axios.get('https://www.fsc.go.kr/no010101', axiosConfig);
        const $ = cheerio.load(response.data);
        const articles = [];

        $('.board-list-wrap > ul > li').each((i, el) => {
            if (i >= 5) return false; // Get only top 5

            const titleEl = $(el).find('.subject a');
            const title = titleEl.text().trim();
            const relativeUrl = titleEl.attr('href');
            const url = `https://www.fsc.go.kr${relativeUrl}`;
            const date = $(el).find('.day').text().trim();
            const dept = $(el).find('.info span:first-child').text().replace('담당부서 :', '').trim();

            if (title && url) {
                articles.push({
                    title,
                    url,
                    date,
                    department: dept,
                    source: '금융위원회'
                });
            }
        });

        return articles;
    } catch (error) {
        console.error('======================================');
        console.error('[FSC 스크래핑 오류 발생]');
        console.error(`- 대상: https://www.fsc.go.kr/no010101`);
        console.error(`- 에러 코드: ${error.code || 'N/A'}`);
        console.error(`- 상세 메시지: ${error.message}`);
        console.error('======================================');
        return [];
    }
}

async function scrapePIPC() {
    try {
        const response = await axios.get('https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS074&mCode=C020010000', axiosConfig);
        const $ = cheerio.load(response.data);
        const articles = [];

        $('.boardArea table tbody tr').each((i, el) => {
            if (i >= 5) return false; // Get only top 5

            const titleEl = $(el).find('.boardTitle a');
            // Remove extra spacing/newlines from title
            const title = titleEl.text().replace(/\s+/g, ' ').trim();
            const relativeUrl = titleEl.attr('href');
            let url = '';
            if (relativeUrl && relativeUrl.startsWith('/np')) {
                url = `https://www.pipc.go.kr${relativeUrl}`;
            } else if (relativeUrl) {
                url = `https://www.pipc.go.kr/np/cop/bbs/${relativeUrl}`;
            }

            const date = $(el).find('td:nth-child(4)').text().trim();
            const dept = $(el).find('td:nth-child(3)').text().trim();

            if (title && url) {
                articles.push({
                    title,
                    url,
                    date,
                    department: dept,
                    source: '개인정보위원회'
                });
            }
        });

        return articles;
    } catch (error) {
        console.error('======================================');
        console.error('[PIPC 스크래핑 오류 발생]');
        console.error(`- 대상: https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do`);
        console.error(`- 에러 코드: ${error.code || 'N/A'}`);
        console.error(`- 상세 메시지: ${error.message}`);
        console.error('======================================');
        return [];
    }
}

async function scrapeNaver() {
    try {
        const response = await axios.get('https://search.naver.com/search.naver?where=news&query=%EA%B0%80%EB%AA%85%EC%A0%95%EB%B3%B4', axiosConfig);
        const $ = cheerio.load(response.data);
        const articles = [];

        $('.list_news._infinite_list a.fender-ui_228e3bd1.qWflZiHeQFq9pBzWximH').each((i, el) => {
            if (articles.length >= 5) return false;

            const title = $(el).text().trim();
            const articleUrl = $(el).attr('href');

            const parentBlock = $(el).closest('.sds-comps-vertical-layout.YWTMk0ahJUsxq4uCx9gX');
            let source = parentBlock.find('.sds-comps-profile-info-title-text').first().text().trim();
            if (!source) {
                source = $(el).closest('.sds-comps-base-layout.xvT8Dkgu7kecAh3TAkhb').find('.sds-comps-profile-info-title-text').first().text().trim();
            }

            let date = '';
            parentBlock.find('.sds-comps-profile-info-subtexts .sds-comps-profile-info-subtext span').each((idx, subtextEl) => {
                const text = $(subtextEl).text().trim();
                if (text.includes('전') || /^\d{4}\.\d{2}\.\d{2}/.test(text)) {
                    date = text;
                }
            });
            if (!date) {
                $(el).closest('.sds-comps-base-layout.xvT8Dkgu7kecAh3TAkhb').find('.sds-comps-profile-info-subtexts .sds-comps-profile-info-subtext span').each((idx, subtextEl) => {
                    const text = $(subtextEl).text().trim();
                    if (text.includes('전') || /^\d{4}\.\d{2}\.\d{2}/.test(text)) {
                        date = text;
                    }
                });
            }

            if (title && articleUrl) {
                articles.push({
                    title,
                    url: articleUrl,
                    date: date || '최신',
                    department: source || '네이버 뉴스',
                    source: '네이버 뉴스'
                });
            }
        });

        return articles;
    } catch (error) {
        console.error('======================================');
        console.error('[Naver 스크래핑 오류 발생]');
        console.error(`- 대상: https://search.naver.com/search.naver?where=news&query=가명정보`);
        console.error(`- 에러 코드: ${error.code || 'N/A'}`);
        console.error(`- 상세 메시지: ${error.message}`);
        console.error('======================================');
        return [];
    }
}

app.get('/api/articles', async (req, res) => {
    try {
        const source = req.query.source;

        if (source === 'fsc') {
            const fscArticles = await scrapeFSC();
            return res.json({ fsc: fscArticles });
        } else if (source === 'pipc') {
            const pipcArticles = await scrapePIPC();
            return res.json({ pipc: pipcArticles });
        } else if (source === 'naver') {
            const naverArticles = await scrapeNaver();
            return res.json({ naver: naverArticles });
        }

        // Fetch all if no specific source is requested
        const [fscArticles, pipcArticles, naverArticles] = await Promise.all([
            scrapeFSC(),
            scrapePIPC(),
            scrapeNaver()
        ]);
        res.json({
            fsc: fscArticles,
            pipc: pipcArticles,
            naver: naverArticles
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch articles' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
