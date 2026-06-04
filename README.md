# Prime Career 이커머스 데이터 분석 포트폴리오

이 폴더는 Prime Career 데이터 애널리스트 실무 과제에서 진행한 이커머스 분석 프로젝트를 포트폴리오용으로 정리한 작업 공간이다.

## 빠른 확인

최종 제출물은 아래 두 파일을 먼저 보면 된다.

- `portfolio/README.md`: 분석 배경, 전처리 기준, 핵심 인사이트, 실행 제안
- `portfolio/dashboard/이커머스_성장_리텐션_대시보드.xlsx`: 한글 대시보드 최종본

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `data/raw/` | 원본 CSV 배치 위치. 부트캠프 제공 원본 데이터는 공개 레포에 포함하지 않음 |
| `docs/bootcamp/` | 부트캠프 과제 설명, 정답, 예시 PDF |
| `submissions/excel/` | 기존 과제 제출/연습 Excel 산출물 |
| `submissions/pdf/` | 기존 과제 제출 PDF 산출물 |
| `submissions/images/` | 기존 그래프, 결론 페이지, BigQuery 화면 이미지 |
| `portfolio/` | 포트폴리오용 최종 문서, 대시보드, SQL, 재현 스크립트 |

참고: `node_modules`는 대시보드 생성 스크립트가 Codex 번들 런타임의 패키지를 읽기 위한 연결 폴더다. 분석 산출물은 아니므로 최종 포트폴리오에는 포함하지 않아도 된다.

## 재현 방법

원본 CSV에서 지표 데이터를 다시 계산한다. 실행 전 `data/raw/ecommerce_data.csv` 파일이 로컬에 있어야 한다.

```powershell
python portfolio/scripts/prepare_analysis_data.py
```

한글 대시보드 Excel을 다시 생성한다. 이 스크립트는 Codex 번들 스프레드시트 런타임의 `@oai/artifact-tool`을 사용한다.

```powershell
node portfolio/scripts/build_dashboard.mjs
```

## 분석 주제

- 성장성: 월별 일평균 매출, 고객 수, 주문 수 추이
- 리텐션: 최초 관측 구매월 기준 코호트별 재구매율
- 회원화 기회: 비회원 주문 비중, 비회원 매출 비중, 비회원 주문당 평균 매출
- 실행안: 4분기 사전 주문 캠페인, 고액 비회원 회원화, 7/21/30일 재구매 유도
