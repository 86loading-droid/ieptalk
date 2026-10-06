// IEP톡 서비스 워커: 앱 화면 파일(같은 주소의 html·css·js·아이콘)을 보관해 연결이 약할 때도 열리게 한다.
// 네트워크 우선: 새 판이 있으면 늘 새 판을 쓰고, 연결이 안 될 때만 보관본을 쓴다. 학생 자료는 여기서 보관하지 않는다.
const CACHE = 'ieptalk-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 파이어베이스·글꼴 등 다른 주소는 건드리지 않는다
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
