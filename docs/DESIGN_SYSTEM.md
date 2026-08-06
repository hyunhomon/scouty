# Scouty 디자인 시스템

## 1. 역할

이 문서는 Scouty의 시각 언어와 컴포넌트 기본 규격을 정의한다. 디자인 시스템은 화면을 획일화하는 규칙집이 아니라 반복되는 판단을 줄이고 제품의 핵심 경험에 더 집중하게 하는 공용 언어다.

값은 구현 시 CSS 변수와 shadcn/ui 토큰으로 연결한다. 기능 코드에서 색상·간격·radius를 직접 하드코딩하지 않는다.

## 2. 브랜드 자산

### 2.1 확정 자산

| 자산 | 용도 | 규격 |
|---|---|---|
| [scouty.png](./assets/brand/scouty.png) | 앱 아이콘, 밝은 배경의 대표 이미지 | 400×400 PNG |
| [scouty.svg](./assets/brand/scouty.svg) | Primary·어두운 배경 위 반전 심볼 | 321×260 SVG, 흰색 path |

![Scouty 앱 아이콘](./assets/brand/scouty.png)

- 로고에서 추출한 Brand Primary는 `#6155F5`다.
- PNG의 흰색 라운드 사각형과 보라색 심볼 조합을 앱 아이콘 원본으로 취급한다.
- SVG는 흰색 심볼만 포함하므로 흰색 또는 밝은 배경에 단독 사용하지 않는다.
- 별도 워드마크 에셋이 생기기 전에는 심볼 옆에 `SCOUTY` 텍스트를 Pretendard 800으로 조합한다.

### 2.2 사용 규칙

- 심볼의 종횡비를 바꾸거나 회전·외곽선·그림자·그라데이션을 추가하지 않는다.
- 심볼 내부에 문자나 다른 아이콘을 넣지 않는다.
- 최소 여백은 심볼 높이의 20% 이상으로 둔다.
- 앱 아이콘은 최소 32px, 단독 심볼은 최소 20px에서 사용한다.
- 사진이나 프로젝트 커버 위에 직접 올리지 않고 단색 배경 또는 충분한 대비의 컨테이너를 사용한다.
- 로고는 장식이 아니라 브랜드 식별이 필요한 앱 헤더, 로그인, 공유 이미지에 제한적으로 사용한다.

## 3. 컬러

### 3.1 Brand palette

| Token | Value | 용도 |
|---|---|---|
| `brand-50` | `#F4F3FF` | 선택 배경, 정보 강조 배경 |
| `brand-100` | `#EAE8FF` | hover 배경, 배지 배경 |
| `brand-200` | `#D8D4FF` | 비활성 강조 경계 |
| `brand-300` | `#BDB6FF` | 장식·그래프 보조색 |
| `brand-400` | `#988CFF` | 어두운 배경의 보조 강조 |
| `brand-500` | `#7568FA` | 강조 |
| `brand-600` | `#6155F5` | Primary |
| `brand-700` | `#4F43DA` | Primary hover |
| `brand-800` | `#4239B3` | Primary active |
| `brand-900` | `#39358F` | 진한 브랜드 텍스트 |
| `brand-950` | `#211F53` | 어두운 브랜드 배경 |

`brand-600` 위 흰색 텍스트의 대비는 약 `5.09:1`로 일반 텍스트의 WCAG AA 기준을 만족한다.

### 3.2 Semantic tokens

| Token | Light | 용도 |
|---|---|---|
| `background` | `#F8F9FB` | 앱 배경 |
| `surface` | `#FFFFFF` | 카드·시트·입력 배경 |
| `foreground` | `#17171C` | 기본 텍스트 |
| `muted-foreground` | `#6B7280` | 보조 텍스트 |
| `border` | `#E5E7EB` | 구분선·입력 경계 |
| `primary` | `#6155F5` | Primary CTA·선택 상태 |
| `primary-hover` | `#4F43DA` | hover |
| `success` | `#16855B` | 완료·정상 |
| `warning` | `#B85C00` | 주의·대기 |
| `danger` | `#DC2626` | 파괴적 행동·오류 |
| `info` | `#2563EB` | 중립 정보 |

- Semantic color는 의미로 사용하고 특정 기능명으로 토큰을 만들지 않는다.
- 상태는 색과 함께 아이콘·텍스트·형태 중 하나 이상을 제공한다.
- 프로젝트 이미지 위 텍스트에는 불투명 surface 또는 검증된 overlay를 사용한다.
- 다크 모드 토큰은 준비하되 MVP에서 토글을 제공하지 않는다.

## 4. 타이포그래피

기본 서체는 self-hosted `Pretendard Variable`이다.

```css
font-family: "Pretendard Variable", Pretendard, -apple-system,
  BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
```

| Style | Size / Line height | Weight | 용도 |
|---|---|---:|---|
| `display` | 32 / 40 | 700 | 핵심 랜딩 메시지 |
| `title-1` | 28 / 36 | 700 | 페이지 제목 |
| `title-2` | 24 / 32 | 700 | 주요 섹션 제목 |
| `headline` | 20 / 28 | 600 | 카드·시트 제목 |
| `body-1` | 16 / 24 | 400 | 기본 본문·입력 |
| `body-2` | 14 / 20 | 400 | 보조 본문 |
| `label` | 14 / 20 | 600 | 버튼·필드 라벨 |
| `caption` | 12 / 18 | 400 | 메타데이터·도움말 |

- 본문은 14px보다 작게 만들지 않는다.
- 문단 너비는 데스크톱에서도 약 40~70자로 제한한다.
- 숫자 비교가 중요한 통계에는 tabular numbers를 사용한다.
- 굵기만으로 모든 위계를 만들지 않고 크기·간격·색을 함께 조절한다.

## 5. 공간과 형태

### 5.1 Spacing

4px 단위를 기본으로 한다.

| Token | Value | 대표 용도 |
|---|---:|---|
| `space-1` | 4px | 아이콘 내부 간격 |
| `space-2` | 8px | 짧은 인라인 간격 |
| `space-3` | 12px | 작은 컴포넌트 padding |
| `space-4` | 16px | 기본 화면 gutter·카드 padding |
| `space-5` | 20px | 카드 그룹 간격 |
| `space-6` | 24px | 섹션 내부 간격 |
| `space-8` | 32px | 섹션 간격 |
| `space-12` | 48px | 큰 화면 구획 |

모바일 화면의 좌우 gutter는 16px, 768px 이상은 24px를 기본으로 한다. 프로젝트 상세의 읽기 영역은 최대 720px, 일반 폼은 최대 560px로 제한한다.

### 5.2 Radius와 elevation

| Token | Value | 용도 |
|---|---:|---|
| `radius-sm` | 8px | 배지·작은 컨트롤 |
| `radius-md` | 12px | 버튼·입력 |
| `radius-lg` | 16px | 카드 |
| `radius-xl` | 24px | 시트·대형 미디어 |
| `radius-full` | 9999px | 아바타·pill |

- 구획은 우선 배경색·간격·경계로 나누고 그림자는 최소화한다.
- 클릭 가능한 카드만 hover elevation을 사용한다.
- 한 화면에서 radius 종류를 과도하게 섞지 않는다.

## 6. 아이콘과 이미지

- 아이콘은 `lucide-react`를 사용한다.
- 기본 크기는 20px, 보조 아이콘은 16px, 주요 독립 액션은 24px다.
- 기본 stroke width는 2다.
- 아이콘만 있는 버튼은 시각적 tooltip과 접근 가능한 이름을 제공한다.
- PDF 커버·페이지 이미지는 원본 비율을 유지하고 임의로 crop하지 않는다.
- 아바타만 원형 crop을 허용한다.
- 프로젝트 이미지가 로고나 UI 장식보다 먼저 보이게 한다.

## 7. 컴포넌트 원칙

### Button

- 한 화면 또는 한 시트에 Primary 버튼은 하나만 둔다.
- 파괴적 행동은 danger 스타일과 확인 문맥을 사용한다.
- 로딩 중에는 폭을 유지하고 중복 실행을 막는다.
- 최소 높이와 터치 영역은 44px다.

### Input

- placeholder를 label 대신 사용하지 않는다.
- 필수·선택 여부와 글자 수 제한을 입력 전에 알 수 있게 한다.
- 오류는 필드 가까이에 원인과 해결 방법을 함께 표시한다.
- 검증은 입력을 방해하지 않되 제출 시 서버에서 다시 확인한다.

### Project card

- PDF 커버를 카드의 주 요소로 사용한다.
- 제목, 작성자, 역할, 태그 순으로 위계를 둔다.
- 역할은 최대 2개, 태그는 최대 3개만 노출하고 나머지는 `+N`으로 줄인다.
- 저장 버튼과 카드 전체 이동 영역이 충돌하지 않게 이벤트와 포커스를 분리한다.

### Feedback

- 2초 안에 사라져도 되는 가벼운 확인만 toast로 알린다.
- 사용자의 결정이나 복구가 필요한 내용은 inline alert 또는 dialog를 사용한다.
- 빈 상태는 상황 설명과 가능한 다음 행동 하나를 제공한다.
- skeleton은 실제 콘텐츠 구조와 비슷하게 만든다.

### Navigation

- 모바일 하단 탭은 `피드 · 스카우트 · 채팅 · 제안 · 프로필` 순서를 유지한다.
- 현재 탭은 색뿐 아니라 아이콘·라벨 상태로 구분한다.
- 뒤로 가기와 딥링크에서 필터·스크롤·작성 중 상태를 가능한 범위에서 복원한다.

## 8. 모션

| Token | Duration | 용도 |
|---|---:|---|
| `motion-fast` | 120ms | hover·press |
| `motion-base` | 180ms | 작은 상태 전환 |
| `motion-slow` | 240ms | 시트·화면 전환 |

- 모션은 상태 변화와 공간 관계를 설명할 때만 사용한다.
- 영상과 프로젝트 카드는 자동 재생하거나 자동 전환하지 않는다.
- `prefers-reduced-motion`에서는 이동·확대 모션을 제거하거나 단순 fade로 바꾼다.
- 로딩 애니메이션은 완료 시간을 과장하거나 사용자를 붙잡는 데 쓰지 않는다.

## 9. 구현 연결

- shadcn/ui의 CSS variables를 이 문서의 semantic token에 매핑한다.
- Tailwind utility는 semantic token을 우선하고 임의 hex 사용을 금지한다.
- 컴포넌트 variant는 의미(`primary`, `secondary`, `danger`)로 이름 짓는다.
- 새 토큰은 기존 토큰으로 표현할 수 없는 반복 패턴이 확인된 뒤 추가한다.
- 컴포넌트 문서에는 사용 시점, 피해야 할 사용, 상태, 접근성, 실제 예시를 함께 둔다.

## 10. 참고

- [디자인 시스템 다시 생각해보기](https://toss.tech/article/44097)
- [제품이 커지면 디자인 시스템 가이드는 어떻게 개선돼야 할까?](https://toss.tech/article/toss-design-system-guide)
- [shadcn/ui Astro 설치 가이드](https://ui.shadcn.com/docs/installation/astro)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
