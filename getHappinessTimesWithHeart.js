const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const qs = require('qs');
const bodyParser = require('body-parser');

const app = express();
const port = 3001;

app.use(bodyParser.urlencoded({ extended: true }));

wrapper(axios);
const cookieJar = new CookieJar();

const axiosInstance = axios.create({
    withCredentials: true,
    jar: cookieJar
});

async function retry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            const isLastAttempt = i === retries - 1;
            if (isLastAttempt) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function login(username, password) {
    const loginUrl = 'https://www.happinesscc.com/mobile/login_ok.asp';
    const loginData = {
        memb_inet_no: username,
        memb_inet_pass: password,
        id_mem: 1,
        pass_mem: 1
    };

    try {
        const response = await retry(() =>
            axiosInstance.post(loginUrl, qs.stringify(loginData))
        );

        if (response.status !== 200) {
            throw new Error(`로그인 요청 실패: 상태 코드 ${response.status}`);
        }

        // 리디렉션 URL 추출 및 처리
        const redirectRegex = /location\.replace\('(.+?)'\);/;
        const redirectMatch = response.data.match(redirectRegex);
        if (redirectMatch && redirectMatch[1]) {
            const redirectUrl = `https://www.happinesscc.com/${redirectMatch[1]}`;
            await axiosInstance.get(redirectUrl);
        }
    } catch (error) {
        console.error('로그인 중 에러 발생:', error);
        throw error;
    }
}

async function fetchData() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    const dateString = date.toISOString().split('T')[0].replace(/-/g, '');
    const randomNumber = Math.floor(Math.random() * 100000);
    const dataUrl = `https://www.happinesscc.com/mobile/reserve01_step1.asp?book_date=${dateString}&repnum=${randomNumber}`;

    try {
        const response = await retry(() => axiosInstance.get(dataUrl));

        if (response.status !== 200) {
            throw new Error(`데이터 추출 요청 실패: 상태 코드 ${response.status}`);
        }

        const $ = cheerio.load(response.data);
        const todayInfo = $("#container > div.today > span").text().trim();
        const courseData = {};

        //document.querySelector("#re_step1 > table > thead > tr:nth-child(2) > th:nth-child(1)")
        //document.querySelector("#re_step1 > table > thead > tr:nth-child(2) > th:nth-child(5)")
        // 코스 이름 추출
        $("#re_step1 > table > thead > tr:nth-child(2) > th").each(function (index) {
            if (index >= 0 && index < 5) { 
                const courseName = $(this).text().trim();
                courseData[courseName] = [];
            }
        });

        //document.querySelector("#re_step1 > table > tbody > tr > td:nth-child(1)")
        //document.querySelector("#re_step1 > table > tbody > tr > td:nth-child(5)")
        // 각 코스별 시간 추출
        $("#re_step1 > table > tbody > tr").each(function () {
            $(this).find('td').each(function (tdIndex) {
                if (tdIndex >= 0 && tdIndex < 5) { // 첫 번째 td는 제외하고 다섯 개의 코스만 고려
                    const courseName = Object.keys(courseData)[tdIndex];
                    $(this).find('ul > li').each(function () {
                        const timeText = $(this).text().trim();
                        const timeMatch = timeText.match(/^\d{2}:\d{2}/);
                        if (timeMatch) {
                            courseData[courseName].push(timeMatch[0]);
                        }
                    });
                }
            });
        });

        return { todayInfo, courseData };
    } catch (error) {
        console.error('데이터 추출 중 에러 발생:', error);
        throw error;
    }
}

app.get('/', (req, res) => {
    res.send(`
        <form action="/login" method="post">
            <input type="text" name="username" placeholder="Username" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit">Login</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        await login(username, password);
        const data = await fetchData();
        
        let tableHtml = '<table border="1"><tr><th>Course Name</th><th>Times</th></tr>';

        for (const [courseName, times] of Object.entries(data.courseData)) {
            tableHtml += `<tr><td>${courseName}</td><td>${times.join(', ')}</td></tr>`;
        }

        tableHtml += '</table>';

        res.send(`
            <h1>로그인 성공</h1>
            <p>${data.todayInfo}</p>
            <p>추출된 데이터:</p>
            ${tableHtml}
            <a href="/">돌아가기</a>
        `);
    } catch (error) {
        res.send(`
            <h1>로그인 실패</h1>
            <p>에러: ${error.message}</p>
            <a href="/">다시 시도</a>
        `);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
