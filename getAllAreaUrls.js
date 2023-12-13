const axios = require('axios');

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
const stepLat = Math.abs(topLeft.lat1 - topLeft.lat2); // 영역의 평균 높이를 단계로 사용
const stepLng = Math.abs(topLeft.lng2 - topLeft.lng1); // 영역의 평균 너비를 단계로 사용

console.log("최소 위도:", minLat);
console.log("최대 위도:", maxLat);
console.log("최소 경도:", minLng);
console.log("최대 경도:", maxLng);
console.log("단계 위도:", stepLat);
console.log("단계 경도:", stepLng);
console.log("URL 생성 중...");

// URL 생성 및 요청 보내기 함수
const sendRequest = async (url) => {
    try {
        const response = await axios.get(url);
        console.log(`Request to ${url} successful. Status: ${response.status}`);
    } catch (error) {
        console.error(`Error making request to ${url}:`, error);
    }
};

// URL 큐 생성
const urlQueue = [];

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
    console.log("URL 생성 완료. 총 URL 개수:", urlQueue.length);
};

// 2분마다 URL 요청 보내기
setInterval(() => {
    if (urlQueue.length > 0) {
        const url = urlQueue.shift(); // 큐에서 URL 하나를 꺼냄
        console.log("Sending request to:", url);
        sendRequest(url);
    } else {
        console.log("모든 URL 처리 완료.");
    }
}, 60000); // 60,000 밀리초 == 1분

// URL 생성 및 큐에 저장
generateUrls(minLat, maxLat, minLng, maxLng, stepLat, stepLng);

const url = urlQueue.shift(); // 큐에서 URL 하나를 꺼냄
console.log("Sending request to:", url);
sendRequest(url);