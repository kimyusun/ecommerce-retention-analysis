# GitHub 업로드 가이드

이 프로젝트는 GitHub에 새 레포지토리로 올릴 수 있도록 정리되어 있다.

## GitHub에 포함할 파일

GitHub에는 포트폴리오 설명, 재현 가능한 분석 코드, 파생 요약 데이터 중심으로 올린다.

- `README.md`
- `.gitignore`
- `.gitattributes`
- `data/raw/README.md`
- `docs/project_guide.md`
- `docs/github_upload_guide.md`
- `portfolio/README.md`
- `portfolio/dashboard/이커머스_성장_리텐션_대시보드.xlsx`
- `portfolio/data/*`
- `portfolio/previews/*_ko.png`
- `portfolio/scripts/*`
- `portfolio/sql/ecommerce_portfolio_analysis.sql`

## GitHub에서 제외한 파일

아래 파일은 로컬에는 보관하지만 공개 레포에는 올리지 않는다.

- `docs/bootcamp/`: 부트캠프 과제 설명, 정답, 예시 PDF
- `data/raw/ecommerce_data.csv`: 부트캠프 제공 원본 거래 데이터
- `submissions/`: 기존 과제 제출물과 연습 산출물
- `node_modules/`: Codex 런타임 패키지 연결 폴더

## GitHub CLI가 설치되어 있을 때

```powershell
git init
git add .
git commit -m "Add ecommerce retention portfolio project"
git branch -M main
gh repo create ecommerce-retention-analysis --public --source . --remote origin --push
```

## GitHub CLI가 없을 때

1. GitHub 웹사이트에서 새 레포지토리를 만든다.
2. 레포 이름 예시: `ecommerce-retention-analysis`
3. Public을 선택한다.
4. README는 이미 로컬에 있으므로 GitHub에서 README 생성 옵션은 끈다.
5. 아래 명령을 실행한다.

```powershell
git remote add origin https://github.com/<your-username>/ecommerce-retention-analysis.git
git branch -M main
git push -u origin main
```

## 권장 레포 설명

```text
이커머스 거래 데이터를 활용해 성장성, 코호트 리텐션, 비회원 고액 주문 기회를 분석한 데이터 분석 포트폴리오 프로젝트
```
