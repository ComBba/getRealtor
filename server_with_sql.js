const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;
const db = new sqlite3.Database('./data.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// 데이터베이스 테이블 생성
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    representative TEXT,
    address TEXT,
    contact TEXT,
    UNIQUE(name, contact)
  )`);
});

// URL 및 CSS 선택자 설정
const DATA_URL = '...'; // 데이터 URL
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
        const details = {
            name: $(SELECTORS.name).text(),
            representative: $(SELECTORS.representative).text(),
            address: $(SELECTORS.address).text().replace(/지번주소/g, '').trim(),
            contact: $(SELECTORS.contact).text().trim()
        };

        // '010-'으로 시작하지 않는 연락처 제외
        if (!details.contact.startsWith('010-')) {
            return null;
        }

        return details;
    } catch (error) {
        console.error('Error scraping details:', error);
        return null;
    }
}

// 데이터베이스에 데이터 저장 함수
function saveToDatabase(details) {
    db.get("SELECT id FROM agencies WHERE name = ? AND contact = ?", [details.name, details.contact], (err, row) => {
        if (err) {
            console.error(err.message);
        } else if (!row) {
            db.run(`INSERT INTO agencies (name, representative, address, contact) VALUES (?, ?, ?, ?)`,
                [details.name, details.representative, details.address, details.contact],
                (err) => {
                    if (err) {
                        console.error(err.message);
                    } else {
                        console.log(`A row has been inserted with rowid ${this.lastID}`);
                    }
                });
        } else {
            console.log(`Duplicate found. Skipping insert.`);
        }
    });
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
app.get('/', (req, res) => {
    let offset = req.query.offset ? parseInt(req.query.offset) : 0;
    let limit = 100; // 한 페이지에 표시할 데이터 수

    db.all(`SELECT * FROM agencies LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
        if (err) {
            res.status(500).send('Server Error');
            console.error(err.message);
        } else {
            res.send(createHtmlTable(rows));
        }
    });
});

// 데이터 수집 및 저장 시작
async function fetchAndScrape() {
    const homepages = await fetchHomePageLinks();
    for (const homepage of homepages) {
        const details = await scrapeDetails(homepage);
        if (details) {
            saveToDatabase(details);
        }
    }
}

// 데이터 수집 및 저장 시작
fetchAndScrape();

// 서버 시작
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
