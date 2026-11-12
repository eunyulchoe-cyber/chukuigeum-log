import { Link } from "react-router-dom";
import { Atmosphere } from "../components/Atmosphere";

export function Privacy() {
  return (
    <div className="app-shell">
      <Atmosphere mark="축" />
      <header className="topbar">
        <div>
          <div className="kicker">축의금 로그</div>
          <h1 className="h2">개인정보 처리방침</h1>
        </div>
        <Link to="/" className="btn btn-ghost">홈</Link>
      </header>
      <article className="card privacy">
        <p className="muted">시행일: 2026년 11월 12일</p>
        <p>
          축의금 로그(이하 “서비스”)는 경조사 축의금·부의금 접수와 영상편지를 돕기 위한 웹 앱입니다.
          이 방침은 서비스를 이용하는 주최자(호스트)와 영상을 남기는 손님에게 적용됩니다.
        </p>
        <h2 className="h3">1. 처리하는 정보</h2>
        <p>
          손님의 이름, 관계, 축의금·부의금 금액, 메모, 이 태블릿에서 찍은 영상은 기본적으로 주최자가 사용하는
          기기(태블릿·휴대전화) 안의 IndexedDB에만 저장됩니다. 이 정보는 서비스 운영자의 서버로 전송되지 않습니다.
        </p>
        <p>
          주최자가 구글 드라이브를 연결한 경우에 한해, 손님이 QR로 보내는 영상 파일과 다음의 최소한의 중계 정보가
          운영자의 중계 서버(Supabase)와 주최자의 구글 드라이브에서 처리됩니다.
        </p>
        <ul>
          <li>주최자 구글 계정 이메일(연결 확인용)과 암호화된 드라이브 재발급 토큰</li>
          <li>행사 아이디, 행사 날짜, 드라이브 폴더 아이디</li>
          <li>손님 아이디(이름 없는 식별값)와 일회용 업로드 코드</li>
          <li>업로드된 영상의 드라이브 파일 아이디, 형식, 용량</li>
        </ul>
        <h2 className="h3">2. 이용 목적</h2>
        <p>
          중계 서버는 주최자를 대신해 구글 드라이브 업로드 권한을 확인하고, 행사 당일에만 유효한 일회용 업로드 코드를
          발급하며, 영상이 주최자의 드라이브에 도착했는지 태블릿이 확인할 수 있게 합니다. 마케팅에 이용하지 않습니다.
        </p>
        <h2 className="h3">3. 구글 드라이브 권한</h2>
        <p>
          서비스는 구글 OAuth 2.0으로 <code>https://www.googleapis.com/auth/drive.file</code> 범위만 요청합니다.
          이 권한은 서비스가 만든 파일과 폴더에만 접근하며, 주최자 드라이브의 다른 파일은 보지 않습니다.
          연결은 주최자가 언제든 앱에서 해제할 수 있습니다.
        </p>
        <h2 className="h3">4. 보관과 삭제</h2>
        <p>
          기기에 저장된 접수 기록과 영상은 주최자가 앱에서 삭제하거나 기기를 초기화할 때까지 기기에 남습니다.
          중계 서버의 업로드 코드는 만료 후 정리되며, 드라이브에 올라간 영상은 주최자의 구글 계정 정책에 따릅니다.
        </p>
        <h2 className="h3">5. 제3자 제공</h2>
        <p>
          손님 영상을 주최자가 연결한 구글 드라이브에 저장하는 것 외에, 개인정보를 제3자에게 판매하거나 제공하지 않습니다.
          인프라 제공자(Supabase, Google)는 각 사의 약관에 따라 처리에 관여할 수 있습니다.
        </p>
        <h2 className="h3">6. 문의</h2>
        <p>
          개인정보 관련 문의는 서비스를 제공하는 주최자 또는 앱 운영자에게 해 주세요. 본 방침은 법령이나 서비스 변경에 따라
          개정될 수 있으며, 이 페이지에서 안내합니다.
        </p>
      </article>
    </div>
  );
}
