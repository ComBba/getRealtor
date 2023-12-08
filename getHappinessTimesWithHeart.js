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

// Axios에 쿠키 지원을 추가
wrapper(axios);
const cookieJar = new CookieJar();

const axiosInstance = axios.create({
    withCredentials: true,
    jar: cookieJar // 쿠키 저장소 연결
});

async function login(username, password) {
    console.log('로그인 시도 중...');
    const loginUrl = 'https://www.happinesscc.com/mobile/login_ok.asp';
    const loginData = {
        memb_inet_no: username,
        memb_inet_pass: password,
        id_mem: 1,
        pass_mem: 1
    };

    try {
        const response = await axiosInstance.post(loginUrl, qs.stringify(loginData));
        console.log('로그인 응답 상태:', response.status);

        // 응답 본문에서 리디렉션 URL 추출 (해당 사이트의 실제 동작에 따라 조정 필요)
        const redirectRegex = /location\.replace\('(.+?)'\);/;
        const redirectMatch = response.data.match(redirectRegex);
        if (redirectMatch && redirectMatch[1]) {
            let redirectPath = redirectMatch[1];
            console.log('추출된 리디렉션 경로:', redirectPath);

            // 상대 경로를 절대 URL로 변환
            const redirectUrl = `https://www.happinesscc.com/${redirectPath}`;
            console.log('변환된 리디렉션 URL:', redirectUrl);

            // 리디렉션 URL로 요청
            await axiosInstance.get(redirectUrl);
            console.log('리디렉션 완료');
        }
    } catch (error) {
        console.error('로그인 중 에러 발생:', error);
    }
}

async function fetchData() {
    console.log('데이터 추출 시작...');
    // 날짜 및 랜덤 번호 생성
    const date = new Date();
    date.setDate(date.getDate() + 30);
    const dateString = date.toISOString().split('T')[0].replace(/-/g, '');
    const randomNumber = Math.floor(Math.random() * 100000);

    try {
        // 데이터 추출 페이지 요청
        const response = await axiosInstance.get(`https://www.happinesscc.com/mobile/reserve01_step1.asp?book_date=${dateString}&repnum=${randomNumber}`);
        const $ = cheerio.load(response.data);

        // '오늘은' 날짜 정보 추출
        const todayInfo = $("#container > div.today > span").text().trim();
        console.log('오늘의 날짜:', todayInfo);

        // 시간 데이터 추출
        const times = [];
        $("#re_step1 > table > tbody > tr > td:nth-child(4) > ul > li").each(function () {
            const timeText = $(this).text().trim();
            const timeMatch = timeText.match(/^\d{2}:\d{2}/); // 'HH:MM' 형식의 시간만 매칭
            if (timeMatch) {
                times.push(timeMatch[0]);
            }
        });

        console.log('데이터 추출 완료:', times);
        return { todayInfo, times };
    } catch (error) {
        console.error('데이터 추출 중 에러 발생:', error);
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
        res.send(`
        <h1>로그인 성공</h1>
        <p>추출된 데이터:</p>
        <pre>${JSON.stringify(data, null, 2)}</pre>
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
