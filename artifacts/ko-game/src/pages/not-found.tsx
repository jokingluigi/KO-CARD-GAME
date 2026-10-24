import { Link } from 'wouter';
import { Map } from 'lucide-react';
export default function NotFound() {
  return <main className="min-h-dvh flex items-center bg-neutral-950 py-8">
    <section className="ko-state-panel">
      <Map size={32} className="text-amber-200" aria-hidden="true" />
      <p>KO CARD GAME / 404</p><h1>이 화면을 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나 사용할 수 없는 링크예요. 메인 메뉴에서 다시 이동해 주세요.</p>
      <Link href="/" className="ko-experience-action">메인 메뉴로</Link>
    </section>
  </main>;
}
