const axios = require('axios');


// URL 큐 생성
const urlQueue = [];

// URL 처리 상태 표시를 위한 변수
let totalUrls = 0;
let processedUrls = 1;

// Define the coordinates of the four corners
const topLeftUrl = "https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=37.72323943557199&lat2=37.78288884527683&lng1=126.52385262394026&lng2=126.63680707556247&map_level=6";
const topRightUrl = "https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=37.86220887888556&lat2=37.9196986198796&lng1=128.734433861587&lng2=128.84931701308585&map_level=6";
const bottomRightUrl = "https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=35.001919778472356&lat2=35.05919373564475&lng1=129.11676227403254&lng2=129.22765992426346&map_level=6";
const bottomLeftUrl = "https://www.serve.co.kr/map_new/data/get_map_agency.asp?lat1=34.34540487380353&lat2=34.405486900071004&lng1=126.03443918440303&lng2=126.14233279529881&map_level=6";

const getCoordinateRange = (url) => {
    const match = url.match(/lat1=(.+)&lat2=(.+)&lng1=(.+)&lng2=(.+)/);
    return {
        lat1: parseFloat(match[1]),
        lat2: parseFloat(match[2]),
        lng1: parseFloat(match[3]),
        lng2: parseFloat(match[4])
    };
};

// 네 영역의 좌표 추출
const topLeft = getCoordinateRange(topLeftUrl);
const topRight = getCoordinateRange(topRightUrl);
const bottomLeft = getCoordinateRange(bottomLeftUrl);
const bottomRight = getCoordinateRange(bottomRightUrl);

// 전체 지역의 최소 및 최대 위도, 경도 값 계산
const minLat = Math.min(topLeft.lat2, topRight.lat2, bottomLeft.lat2, bottomRight.lat2);
const maxLat = Math.max(topLeft.lat1, topRight.lat1, bottomLeft.lat1, bottomRight.lat1);
const minLng = Math.min(topLeft.lng1, topRight.lng1, bottomLeft.lng1, bottomRight.lng1);
const maxLng = Math.max(topLeft.lng2, topRight.lng2, bottomLeft.lng2, bottomRight.lng2);

// 절대값을 사용하여 단계 계산
const stepLat = 0.05521467008009;
const stepLng = 0.10657609410838;

console.log("최소 위도:", minLat);
console.log("최대 위도:", maxLat);
console.log("최소 경도:", minLng);
console.log("최대 경도:", maxLng);
console.log("단계 위도:", stepLat);
console.log("단계 경도:", stepLng);
console.log("URL 생성 중...");

// URL을 랜덤하게 꺼내는 함수
const getRandomUrl = () => {
    const randomIndex = Math.floor(Math.random() * urlQueue.length);
    console.log("[randomIndex]", randomIndex, "\t[totalUrls]", totalUrls);
    return urlQueue.splice(randomIndex, 1)[0];
};

// URL 요청 및 대기 시간 처리 함수
const sendRequest = async (url) => {
    try {
        const response = await axios.get(url);
        const addedCount = response.data.added;
        const processedCount = response.data.processed;
        const skippedCount = response.data.skipped;
        console.log("[", processedUrls, "/", totalUrls, "] Request to", url, "successful.Added: ", addedCount, "skippedCount:", skippedCount, "processedCount:", processedCount);

        // 대기 시간 계산 및 적용
        let waitTime = addedCount > 0 ? addedCount * 1000 : 10000; // 추가된 데이터 수 * 1초 또는 최소 10초
        await new Promise(resolve => setTimeout(resolve, waitTime));
    } catch (error) {
        console.error(`[${processedUrls}/${totalUrls}] Error making request to ${url}:`, error);
    }
};

// URL 생성 함수
const generateUrls = (minLat, maxLat, minLng, maxLng, stepLat, stepLng) => {
    for (let lat = maxLat; lat > minLat; lat -= stepLat) {
        for (let lng = minLng; lng < maxLng; lng += stepLng) {
            let lat2 = Math.max(lat - stepLat, minLat);
            let lng2 = Math.min(lng + stepLng, maxLng);
            let dataUrl = `http://localhost:3000/inputdata?lat1=${lat}&lat2=${lat2}&lng1=${lng}&lng2=${lng2}`;
            urlQueue.push(dataUrl); // URL을 큐에 추가
        }
    }
    totalUrls = urlQueue.length; // 총 URL 개수 설정
    console.log("URL 생성 완료. 총 URL 개수:", totalUrls);
};

// URL 요청 로직
setInterval(() => {
    if (urlQueue.length > 0) {
        const url = getRandomUrl(); // 랜덤 URL 추출
        processedUrls++;
        //console.log(`[${processedUrls}/${totalUrls}] Sending request to: ${url}`);
        sendRequest(url);
    } else {
        console.log("모든 URL 처리 완료.");
    }
}, 10000); // 10초 간격

// URL 생성 및 큐에 저장
generateUrls(minLat, maxLat, minLng, maxLng, stepLat, stepLng);

// 첫 번째 URL 요청
if (urlQueue.length > 0) {
    const url = getRandomUrl();
    //const url ="http://localhost:3000/inputdata?lat1=37.52267862370599&lat2=37.581728389111795&lng1=127.15188002553454&lng2=127.26503169171971";
    //console.log(`[${processedUrls}/${totalUrls}] Sending request to: ${url}`);
    sendRequest(url);
}