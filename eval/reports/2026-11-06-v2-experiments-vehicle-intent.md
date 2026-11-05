# 검색 기법 실험 (v2, 오프라인)

- 날짜 2026-11-06, 코드 `dc318e1-dirty`, 구성 20개
- 질의 분할: dev 177개 / test 174개 ((source, qtype)별 층화, qid 해시 순 교대 배정)
- 선택은 dev nDCG@10만 사용. 기준 구성(현재 프로덕션): `prod3-bigram-qu-p0.8` (dev 0.878 / test 0.874)
- 쿼리 확장(Claude)은 제외. 오프라인 벡터 검색은 정확한 코사인(프로덕션 S3 Vectors는 근사 검색)

## test 확인: dev에서 고른 구성 vs 현재 프로덕션 (nDCG@10, 질의별 쌍체)

| 구성 | 선택 근거 | 기준 | 후보 | Δ | 95% CI | p | 승/패/무 |
|---|---|---:|---:|---:|---|---:|---|
| `prod3-bigram-qu-p0.8` | A.current 최고 | 0.874 | 0.874 | +0.000 | [+0.000, +0.000] | 1.000 | 0/0/174 |
| `veh-p0.5` | V.vehicle-same 최고 | 0.874 | 0.857 | -0.017 | [-0.029, -0.005] | 0.005 | 9/40/125 |
| `veh-weak-v0.3` | V.vehicle-weak 최고 | 0.874 | 0.877 | +0.004 | [-0.002, +0.010] | 0.294 | 9/11/154 |
| `veh-weak-v0.3-cat-all` | VC.vehicle-weak+category-all 최고, 전체 최고 | 0.874 | 0.879 | +0.005 | [-0.001, +0.014] | 0.193 | 9/11/154 |
| `cat-all` | C.category-all 최고 | 0.874 | 0.875 | +0.002 | [+0.000, +0.005] | 1.000 | 1/0/173 |
| `wsbigram` | T.ws+bigram 최고 | 0.874 | 0.871 | -0.003 | [-0.008, +0.003] | 0.365 | 12/30/132 |
| `joined` | T.bigram-joined 최고 | 0.874 | 0.867 | -0.007 | [-0.015, +0.000] | 0.078 | 18/20/136 |
| `joined-veh-weak-v0.3-cat-all` | J.joined+vehicle-weak+category-all 최고 | 0.874 | 0.877 | +0.003 | [-0.005, +0.012] | 0.558 | 24/27/123 |
| `veh-cat-all-bigram-p0.5` | VC.vehicle+category-all 최고 | 0.874 | 0.858 | -0.015 | [-0.028, -0.002] | 0.019 | 9/40/125 |

여러 구성을 동시에 비교했으므로 p값 하나만으로 결론 내리지 않는다. CI와 승/패를 함께 본다.

## 전체 구성 (dev nDCG@10 순)

| 순위 | 구성 | 계열 | dev nDCG@10 | dev Recall@10 | dev MRR@10 | keyword | mixed | semantic | test nDCG@10 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `veh-weak-v0.3-cat-all` | VC.vehicle-weak+category-all | 0.882 | 0.852 | 0.907 | 0.951 | 0.895 | 0.692 | 0.879 |
| 2 | `joined-veh-weak-v0.3-cat-all` | J.joined+vehicle-weak+category-all | 0.882 | 0.847 | 0.907 | 0.952 | 0.890 | 0.692 | 0.876 |
| 3 | `joined-veh-weak-v0.2-cat-all` | J.joined+vehicle-weak+category-all | 0.881 | 0.844 | 0.907 | 0.951 | 0.890 | 0.692 | 0.877 |
| 4 | `veh-weak-v0.2-cat-all` | VC.vehicle-weak+category-all | 0.881 | 0.848 | 0.907 | 0.949 | 0.895 | 0.693 | 0.880 |
| 5 | `veh-weak-v0.5-cat-all` | VC.vehicle-weak+category-all | 0.880 | 0.852 | 0.907 | 0.948 | 0.893 | 0.692 | 0.875 |
| 6 | `veh-weak-v0.1-cat-all` | VC.vehicle-weak+category-all | 0.880 | 0.845 | 0.906 | 0.947 | 0.895 | 0.692 | 0.878 |
| 7 | `cat-all` | C.category-all | 0.880 | 0.845 | 0.905 | 0.948 | 0.895 | 0.691 | 0.875 |
| 8 | `veh-weak-v0.3` | V.vehicle-weak | 0.880 | 0.848 | 0.907 | 0.947 | 0.895 | 0.692 | 0.877 |
| 9 | `veh-weak-v0.1` | V.vehicle-weak | 0.879 | 0.844 | 0.906 | 0.945 | 0.895 | 0.692 | 0.877 |
| 10 | `prod3-bigram-qu-p0.8` | A.current | 0.878 | 0.844 | 0.905 | 0.945 | 0.895 | 0.691 | 0.874 |
| 11 | `veh-weak-v0.2` | V.vehicle-weak | 0.878 | 0.844 | 0.907 | 0.944 | 0.895 | 0.693 | 0.878 |
| 12 | `veh-weak-v0.5` | V.vehicle-weak | 0.878 | 0.848 | 0.907 | 0.944 | 0.893 | 0.692 | 0.874 |
| 13 | `joined` | T.bigram-joined | 0.877 | 0.844 | 0.897 | 0.944 | 0.890 | 0.691 | 0.867 |
| 14 | `wsbigram` | T.ws+bigram | 0.874 | 0.838 | 0.905 | 0.940 | 0.886 | 0.690 | 0.871 |
| 15 | `veh-cat-all-bigram-p0.5` | VC.vehicle+category-all | 0.864 | 0.855 | 0.911 | 0.928 | 0.869 | 0.694 | 0.859 |
| 16 | `veh-cat-all-bigram-p0.8` | VC.vehicle+category-all | 0.864 | 0.857 | 0.908 | 0.925 | 0.877 | 0.693 | 0.858 |
| 17 | `veh-p0.5` | V.vehicle-same | 0.862 | 0.852 | 0.911 | 0.924 | 0.869 | 0.694 | 0.857 |
| 18 | `veh-p0.8` | V.vehicle-same | 0.861 | 0.854 | 0.908 | 0.919 | 0.877 | 0.693 | 0.857 |
| 19 | `veh-cat-all-ws+bigram-p0.8` | VC.vehicle+category-all | 0.860 | 0.851 | 0.911 | 0.922 | 0.865 | 0.692 | 0.856 |
| 20 | `veh-cat-all-ws+bigram-p0.5` | VC.vehicle+category-all | 0.860 | 0.849 | 0.913 | 0.924 | 0.856 | 0.692 | 0.857 |
