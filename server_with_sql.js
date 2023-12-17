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
const SELECTORS = {
    name: 'body > div.wrap > header > div > h1',
    representative: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tit',
    address: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li:nth-child(2)',
    contact: 'body > div.wrap > section > form > article > div.agency-info-cont > ul > li.agency-info-box__tel > a:nth-child(2)'
};

// 주어진 URL에서 homepage 링크를 가져오는 함수
async function fetchHomePageLinks(lat1, lat2, lng1, lng2) {
    const url = `https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=${lat1}&lat2=${lat2}&lng1=${lng1}&lng2=${lng2}&map_level=6`;

    const axiosConfig = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Referer': 'https://www.serve.co.kr/map_new/index.asp?law_dnameno=4122000000&goodtype_code=1'
        }
    };

    try {
        const response = await axios.get(url, axiosConfig);
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
        let processedCount = 0, skippedCount = 0, addedCount = 0;

        for (const homepage of homepages) {
            processedCount++;
            const details = await scrapeDetails(homepage);
            if (details) {
                if (await saveToDatabase(details)) {
                    addedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }
        }

        console.log(`Processed ${processedCount} homepages, skipped ${skippedCount} and added ${addedCount} agencies to the database.`);
        res.json({
            message: 'Data processing completed',
            processed: processedCount,
            skipped: skippedCount,
            added: addedCount
        });
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
            return null;
        }
        return details;
    } catch (error) {
        console.error('Error scraping details:', error);
        return null;
    }
}

// 데이터베이스에 데이터 저장 함수
async function saveToDatabase(details) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO agencies (name, representative, address, contact, url) VALUES (?, ?, ?, ?, ?)`,
            [details.name, details.representative, details.address, details.contact, details.url],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        resolve(false); // 데이터가 중복되어 스킵됨
                    } else {
                        reject(err);
                    }
                } else {
                    console.log(`[ Data saved ] ${details.name}, ${details.representative}, ${details.contact}, ${details.url}`);
                    resolve(true); // 데이터가 추가됨
                }
            }
        );
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

            let csvData = 'Name,GivenName,AdditionalName,FamilyName,YomiName,GivenNameYomi,AdditionalNameYomi,FamilyNameYomi,NamePrefix,NameSuffix,Initials,Nickname,ShortName,MaidenName,Birthday,Gender,Location,BillingInformation,DirectoryServer,Mileage,Occupation,Hobby,Sensitivity,Priority,Subject,Notes,Language,Photo,GroupMembership,Phone1-Type,Phone1-Value\n';
            rows.forEach(row => {
                const givenName = `${row.name}${row.representative}`.replace(/\s/g, '');
                const name = `${familyName}H${givenName}`.replace(/\s/g, '');
                const emptyFields = Array(28).fill('').join(',');
                const contact = row.contact.replace(/\s/g, '');
                csvData += `${name},${givenName},,,${familyName}H,,,,,,,,,,,,,,,,,,,,,,,,${familyName},,${contact}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            const encodedFamilyName = encodeURIComponent(familyName);
            const filename = `attachment; filename="contacts_${encodedFamilyName}_${startId}-${endId}.csv"`;
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
