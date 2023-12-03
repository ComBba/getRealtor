const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

const app = express();
const port = 3000; // 웹 서버 포트 설정

// URL 및 CSS 선택자 설정
// [평택] 고덕, 신장, 서정, 장당 const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=37.02947300676534&lat2=37.08883776579578&lng1=126.97977012219125&lng2=127.09205018911555&map_level=6';
// [평택] 비전동, 소사벌, 인근 전부 const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=36.97599000786321&lat2=37.0352806369354&lng1=127.05871541104052&lng2=127.17097789435108&map_level=6'; 
const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=36.78011754938916&lat2=36.83939535092694&lng1=127.07505545293552&lng2=127.18704334084441&map_level=6'; //천안 불당동 인접 15km
const SELECTORS = {
    name: 'body > div.wrap > header > div > h1',
    representative: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tit',
    address: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li:nth-child(2)',
    contact: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tel > a:nth-child(2)'
};

// 주어진 URL에서 homepage 링크를 가져오는 함수
async function fetchHomePageLinks() {
    try {
        const response = await axios.get(DATA_URL);
        const data = response.data;
        const regex = /homepage:"(http[^"]+)"/g;
        const homepages = [];
        let match;

        while ((match = regex.exec(data)) !== null) {
            homepages.push(match[1]);
        }

        return homepages;
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

// 각 homepage URL에서 필요한 상세 정보를 추출하는 함수
async function scrapeDetails(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        let address = $(SELECTORS.address).text();
        address = address.replace(/지번주소/g, '').trim(); // 지번주소 버튼 텍스트 제거

        // 연락처 정보 추출 및 검증
        let contact = $(SELECTORS.contact).text().trim();
        if (!contact.startsWith('010-')) { // '010-'으로 시작하지 않으면 제외
            contact = '';
        }

        const details = {
            name: $(SELECTORS.name).text(),
            representative: $(SELECTORS.representative).text(),
            address: address,
            contact: contact
        };

        return details;
    } catch (error) {
        console.error('Error scraping details:', error);
        return null;
    }
}

// 데이터를 가져오고 파싱하는 주 함수
async function fetchAndScrape() {
    const homepages = await fetchHomePageLinks();
    const detailsList = [];
    console.log("URL ", homepages.length, "를 처리중입니다.");
    let cntHomePage = 1;
    for (const homepage of homepages) {
        const details = await scrapeDetails(homepage);
        if (details && details.contact.length > 12) {
            console.log("[", cntHomePage++, "/", homepages.length, "]", details.name, details.representative, details.address, details.contact);
            detailsList.push(details);
        }
    }
    return detailsList;
}

// 데이터를 HTML 테이블 형태로 변환하는 함수
function createHtmlTable(data) {
    let html = '<table border="1"><tr><th>순번</th><th>상호명</th><th>대표자</th><th>주소</th><th>연락처</th></tr>';
    data.forEach((item, index) => {
        html += `<tr>
                    <td>${index + 1}</td>
                    <td>${item.name}</td>
                    <td>${item.representative}</td>
                    <td>${item.address}</td>
                    <td>${item.contact}</td>
                 </tr>`;
    });
    html += '</table>';
    return html;
}

// express 웹 서버 설정
app.get('/', async (req, res) => {
    try {
        const data = await fetchAndScrape();
        const htmlTable = createHtmlTable(data);
        res.send(htmlTable);
    } catch (error) {
        res.status(500).send('서버 오류 발생');
    }
});

// 서버 시작
app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
