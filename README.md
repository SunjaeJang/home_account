# 두리 가계부

두 사람(선재·혜빈)이 함께 쓰는 가계부 PWA입니다. 거래 내역은 뱅크샐러드 엑셀 가져오기, 직접 입력, 엑셀 백업을 지원합니다. GitHub Pages는 정적 화면을 제공하고, Supabase Auth와 Postgres가 계정·공유 내역을 관리합니다.

## PC에서 실행

```powershell
pnpm install
pnpm dev
```

터미널에 표시된 localhost 주소를 엽니다. Supabase 환경변수가 없을 때에는 기기별 로컬 저장 모드로 동작합니다.

## 두 계정 동기화 설정

1. Supabase에서 프로젝트를 만들고 **Authentication → Users**에서 선재와 혜빈 계정을 만듭니다. 이메일/비밀번호 로그인만 사용하며 공개 회원 가입은 꺼 둡니다.
2. **Project Settings → API Keys**에서 Project URL과 publishable key를 복사합니다. 비밀키(`sb_secret_...` 또는 예전 `service_role`)는 이 앱에 넣지 마세요.
3. **SQL Editor**에서 [`supabase/setup.sql`](supabase/setup.sql)을 실행해 테이블과 RLS 정책을 만듭니다.
4. Authentication → Users에서 두 계정의 UUID를 복사합니다. `setup.sql` 끝의 주석 예시에서 `REPLACE_WITH_...` 두 값을 실제 UUID로 바꾼 뒤, 같은 household UUID와 함께 실행해 선재·혜빈을 장부 멤버로 등록합니다.
5. PC에서 `.env.example`을 `.env.local`로 복사하고 Supabase URL과 publishable key를 넣습니다. 로컬 동기화 모드를 확인하려면 개발 서버를 다시 시작하세요.
6. Supabase Auth의 **URL Configuration**에 로컬 주소와 GitHub Pages 주소(예: `https://계정.github.io/저장소/`)를 Site URL/Redirect URLs로 등록합니다.

테이블의 RLS 정책은 등록된 household 멤버만 해당 가계부 내역을 읽고 추가·삭제할 수 있도록 제한합니다. publishable key는 웹 번들에 공개되는 키이며, 안전성은 RLS 정책에 달려 있습니다. secret/service role 키는 브라우저나 GitHub 변수에 넣지 마세요.

## GitHub Pages 배포

1. 이 프로젝트를 GitHub 저장소에 올립니다. 기본 워크플로는 `main` 브랜치 푸시 때 배포합니다.
2. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. 저장소의 **Settings → Secrets and variables → Actions → Variables**에 다음 값을 추가합니다.
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key
4. `main`에 푸시하면 `.github/workflows/pages.yml`이 저장소 이름을 경로로 붙여 정적 사이트를 빌드하고 GitHub Pages에 게시합니다. Pages URL은 보통 `https://계정.github.io/저장소/` 형태입니다.
5. Android Chrome에서 HTTPS 페이지를 열고 **⋮ → 홈 화면에 추가**를 선택합니다.

GitHub Pages 사이트는 공개 URL로 제공됩니다. 누구나 로그인 화면과 클라이언트 코드를 볼 수 있지만, 가계부 내역은 Supabase 로그인과 RLS 정책으로 보호됩니다. 현재 화면에는 예시 거래가 없으며, 로그인 상태가 아니면 Supabase 모드에서 내역을 표시하지 않습니다.

## 뱅크샐러드 엑셀 합치기

1. 상단 멤버 필터에서 선재를 선택하고 엑셀을 가져옵니다.
2. 혜빈을 선택한 뒤 혜빈의 엑셀을 가져옵니다.
3. **엑셀로 저장**을 눌러 통합된 내역을 내려받습니다.

가져오기는 첫 번째 시트의 날짜·내용·금액 열을 찾고, 날짜·내용·금액·사용자가 같은 중복을 제외합니다.

## 백업

Supabase는 두 기기 간 장부를 동기화합니다. **엑셀로 저장**은 PC 보관용 백업으로 계속 사용할 수 있습니다.
