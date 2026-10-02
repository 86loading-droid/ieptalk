// IEP톡 설정 파일
// 학교 서버로 옮길 때는 이 파일만 바꾸면 된다(README의 「학교 DB 이식」 참고).

export const APP_NAME = 'IEP톡';

// Firebase 웹앱 설정값(공개용 식별값이며 비밀번호가 아니다). 비어 있으면 데모 모드로 실행된다.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAopAxRPaXhw1kCV-RRJJ8Sx6bdBt4upcU',
  authDomain: 'ieptalk.firebaseapp.com',
  projectId: 'ieptalk',
  storageBucket: 'ieptalk.firebasestorage.app',
  messagingSenderId: '62866074640',
  appId: '1:62866074640:web:b1668c8a0283b1d51a6e95'
};

// 학교 구분값. 학교마다 다른 값을 쓰면 자료가 학교별로 완전히 나뉜다.
export const SCHOOL_ID = 'demo-school';

// 처음 관리자(다른 사람을 초대하는 사람). firestore.rules의 같은 목록과 반드시 일치해야 한다.
export const OWNER_EMAILS = ['86loading@gmail.com', 'hschoi@uu.ac.kr'];

// 로컬 테스트용 에뮬레이터 사용 여부(주소에 ?emu=1)
export const USE_EMULATOR = new URLSearchParams(location.search).has('emu');
