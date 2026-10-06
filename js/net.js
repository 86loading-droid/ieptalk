// 연결 상태 표시와 끊김 대비
// - 파이어베이스는 기기 안 저장소(로컬 캐시)에 먼저 쓰고, 연결되면 서버로 올린다(store.js의 persistentLocalCache).
// - 서비스 워커가 앱 화면 파일을 보관해, 연결이 약해도 앱이 열린다(네트워크 우선, 실패하면 보관본).
import { rerender } from './state.js';
import { toast } from './util.js';

export const online = () => navigator.onLine !== false;
export function netBanner() {
  return online() ? '' : '<div class="net-off" role="status">연결이 끊겼습니다. 지금 남기는 기록은 이 기기에 먼저 저장되고, 연결되면 저절로 올라갑니다.</div>';
}
window.addEventListener('offline', () => rerender());
window.addEventListener('online', () => { rerender(); toast('다시 연결되었습니다. 기기에 저장된 기록을 올립니다.'); });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
