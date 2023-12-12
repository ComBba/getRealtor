const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;
const db = new sqlite3.Database('./data.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        representative TEXT,
        address TEXT,
        contact TEXT,
        url TEXT UNIQUE
    )`);
});

// URL 및 CSS 선택자 설정
//const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=37.02947300676534&lat2=37.08883776579578&lng1=126.97977012219125&lng2=127.09205018911555&map_level=6'; // [평택] 고덕, 신장, 서정, 장당 
//const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=36.97599000786321&lat2=37.0352806369354&lng1=127.05871541104052&lng2=127.17097789435108&map_level=6'; // [평택] 비전동, 소사벌, 인근 전부 
//const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=36.78011754938916&lat2=36.83939535092694&lng1=127.07505545293552&lng2=127.18704334084441&map_level=6'; //천안 불당동 인접 5km
const DATA_URL = 'https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=37.118878461588885&lat2=37.17821219231768&lng1=127.01136454334328&lng2=127.12380139567965&map_level=6'; //오산역 인근 5km

const SELECTORS = {
    name: 'body > div.wrap > header > div > h1',
    representative: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tit',
    address: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li:nth-child(2)',
    contact: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tel > a:nth-child(2)'
};

// 주어진 URL에서 homepage 링크를 가져오는 함수
async function fetchHomePageLinks(lat1, lat2, lng1, lng2) {
    const url = `https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=${lat1}&lat2=${lat2}&lng1=${lng1}&lng2=${lng2}&map_level=6`;

    try {
        const response = await axios.get(url);
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

// 데이터 수집 및 저장 시작
app.get('/inputdata', async (req, res) => {
    const { lat1, lat2, lng1, lng2 } = req.query;

    if (!lat1 || !lat2 || !lng1 || !lng2) {
        return res.status(400).send('Missing required query parameters: lat1, lat2, lng1, lng2');
    }

    try {
        const homepages = await fetchHomePageLinks(lat1, lat2, lng1, lng2);
        const totalUrls = homepages.length;
        let currentUrlIndex = 0;

        for (const homepage of homepages) {
            currentUrlIndex++;
            const details = await scrapeDetails(homepage);
            if (details) {
                saveToDatabase(details, currentUrlIndex, totalUrls);
            }
        }

        console.log(`${currentUrlIndex}개의 데이터 처리가 완료되었습니다.`);
        res.send(`${currentUrlIndex}개의 데이터 처리가 완료되었습니다.`);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Server Error');
    }
});


// 각 homepage URL에서 필요한 상세 정보를 추출하는 함수
async function scrapeDetails(url) {
    // URL이 이미 처리되었는지 확인
    const exists = await new Promise((resolve, reject) => {
        db.get("SELECT id FROM agencies WHERE url = ?", [url], (err, row) => {
            if (err) reject(err);
            resolve(!!row);
        });
    });

    if (exists) {
        console.log(`URL already processed: ${url}`);
        return null; // 이미 처리된 URL이면 null 반환
    }

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const details = {
            name: $(SELECTORS.name).text(),
            representative: $(SELECTORS.representative).text(),
            address: $(SELECTORS.address).text().replace(/지번주소/g, '').trim(),
            contact: $(SELECTORS.contact).text().trim(),
            url: url // URL 항상 추가
        };

        // '010-'으로 시작하지 않는 연락처 제외
        if (!details.contact.startsWith('010-')) {
            return details;
        }

        return details;
    } catch (error) {
        console.error('Error scraping details:', error);
        return null;
    }
}

// 데이터베이스에 데이터 저장 함수
function saveToDatabase(details, currentUrlIndex, totalUrls) {
    db.run(`INSERT INTO agencies (name, representative, address, contact, url) VALUES (?, ?, ?, ?, ?)`,
        [details.name, details.representative, details.address, details.contact, details.url],
        function (err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log(`[${currentUrlIndex}/${totalUrls}] A row has been inserted with rowid ${this.lastID} \t Details:\tName: ${details.name}\tRepresentative: ${details.representative}\tAddress: ${details.address}\tContact: ${details.contact}\tURL: ${details.url}`);
            }
        });
}

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
});

app.get('/data', (req, res) => {
    const draw = req.query.draw ? parseInt(req.query.draw) : 0;
    const start = req.query.start ? parseInt(req.query.start) : 0;
    const length = req.query.length ? parseInt(req.query.length) : 10;
    const searchValue = typeof req.query.search === 'object' && req.query.search !== null && 'value' in req.query.search
        ? req.query.search.value
        : '';

    // 데이터 필터링을 위한 WHERE 절 구성
    let whereClause = '';
    if (searchValue) {
        whereClause = `WHERE name LIKE '%${searchValue}%' OR representative LIKE '%${searchValue}%' OR address LIKE '%${searchValue}%' OR contact LIKE '%${searchValue}%'`;
    }

    // 전체 레코드 수
    db.get(`SELECT COUNT(*) AS total FROM agencies`, [], (err, totalRow) => {
        if (err) {
            res.status(500).send('Server Error');
            return console.error(err.message);
        }

        // 필터링된 레코드 수
        db.get(`SELECT COUNT(*) AS filteredTotal FROM agencies ${whereClause}`, [], (err, filteredTotalRow) => {
            if (err) {
                res.status(500).send('Server Error');
                return console.error(err.message);
            }

            // 데이터 조회 쿼리
            db.all(`SELECT * FROM agencies ${whereClause} LIMIT ? OFFSET ?`, [length, start], (err, rows) => {
                if (err) {
                    res.status(500).send('Server Error');
                    console.error(err.message);
                } else {
                    res.json({
                        "draw": draw,
                        "recordsTotal": totalRow.total,
                        "recordsFiltered": filteredTotalRow.filteredTotal,
                        "data": rows
                    });
                }
            });
        });
    });
});

app.get('/api/csv', async (req, res) => {
    const { startId, endId, familyName } = req.query;

    try {
        // 데이터베이스에서 최소 및 최대 ID 조회
        const rangeSql = 'SELECT MIN(id) as minId, MAX(id) as maxId FROM agencies';
        const { minId, maxId } = await new Promise((resolve, reject) => {
            db.get(rangeSql, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        // 필수 매개변수가 누락된 경우 또는 범위가 잘못된 경우 안내 페이지 반환
        if (!startId || !endId || !familyName || startId < minId || endId > maxId) {
            return res.send(`
                <html>
                    <head><title>CSV Export Instructions</title></head>
                    <body>
                        <h2>CSV Export Instructions</h2>
                        <p>To export data to a CSV file, please provide the following query parameters within the ID range of ${minId} to ${maxId}:</p>
                        <ul>
                            <li><b>startId</b>: Starting ID of the range (minimum: ${minId})</li>
                            <li><b>endId</b>: Ending ID of the range (maximum: ${maxId})</li>
                            <li><b>familyName</b>: Family name to be used in the CSV file</li>
                        </ul>
                        <p>Example: <code>/api/csv?startId=${minId}&endId=${maxId}&familyName=Smith</code></p>
                    </body>
                </html>
            `);
        }

        // 데이터베이스에서 범위 내 데이터 조회 및 CSV 데이터 생성
        const dataSql = 'SELECT * FROM agencies WHERE id BETWEEN ? AND ?';
        db.all(dataSql, [startId, endId], (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Server Error');
            }

            let csvData = 'Name,Given Name,Additional Name,Family Name,Yomi Name,Given Name Yomi,Additional Name Yomi,Family Name Yomi,Name Prefix,Name Suffix,Initials,Nickname,Short Name,Maiden Name,Birthday,Gender,Location,Billing Information,Directory Server,Mileage,Occupation,Hobby,Sensitivity,Priority,Subject,Notes,Language,Photo,Group Membership,Phone 1 - Type,Phone 1 - Value\n';
            rows.forEach(row => {
                const givenName = `${row.name}${row.representative}`;
                const name = `${familyName}H${givenName}`;
                const emptyFields = Array(28).join(','); // 28 empty fields
                csvData += `${name},${givenName},,${familyName},H,,,,,,,,,,,,,,,,,,,,,,,,${familyName},,${row.contact}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            const encodedFamilyName = encodeURIComponent(familyName);
            const filename = `attachment; filename="contacts_${encodedFamilyName}_${startId}-${endId}.csv"`;
            console.log("filename: ", filename); // 출력 예시: attachment; filename="contacts_Smith_1-100.csv")
            res.setHeader('Content-Disposition', filename);
            res.send(csvData);
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Server Error');
    }
});

// 서버 시작
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
