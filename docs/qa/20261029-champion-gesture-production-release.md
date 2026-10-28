# 챔피언 움직임 운영 배포 — 2026-10-29

사용자의 명시적인 “배포해” 지시가 이번 릴리스의 기존 운영 배포 금지를 대체한다. main 병합 없이 기존 기능 브랜치의 검증 커밋 `2134adb`를 두 기존 Render 서비스에 수동 배포했다.

- 프런트 `dep-dbh1sj942hec73e8g2mg`: live, 정확한 릴리스 커밋 확인.
- API `dep-dbh1sj6i0phs73ages90`: live, 정확한 릴리스 커밋 확인.
- 새 스킨/세트별 움직임·감정표현 설정 검증 및 저장을 처리하도록 API도 같은 커밋을 사용한다.
- main과 자동 배포 설정을 변경하지 않았다. 점검은 기존 enabled=true/allowed=false를 유지했다.
- 스키마 마이그레이션, 운영 스프라이트 업로드/manifest 저장, 계정·카드·챔피언·덱 데이터 변경은 수행하지 않았다.

프런트/직접 API의 health와 server-status가 모두200이다. API 전환 중 첫 프런트 health 읽기는 타임아웃됐지만 두 배포가 live로 바뀐 뒤 재확인은200이었다.

새 HTML 진입점은 `/assets/index-51OgW6BS.js`를 참조한다. 운영에서 받은 `champion-sprite-visual-UHaIvuWm.js`와 `champion-sprite-visual-DSIu3eCB.css`는 검증한 로컬 빌드와 SHA-256이 일치한다. 상세 영수증은 [deployment JSON](20261029-champion-gesture-deployment.json) 참조.

이번 배포 검증은 버전·공개 응답·정적 파일 확인이다. 운영 관리자 설정 저장이나 실제 양측 전체 경기를 새로 수행한 것으로 보고하지 않는다. 실제 기능 검증 및 미검증 범위는 [구현 보고서](20261029-champion-gesture-review.md)에 있다.
