# 홀드아웃 확인 (v4, vehicle-intent)

- 날짜 2026-11-06, 코드 `5559bb3`, 질의 160개 전부 test
- 기준 구성: `prod3-bigram-qu-p0.8`. 구성을 여기서 고르지 않는다. 해석은 결정 기록에 사전 등록한 구성에만 한다

| 구성 | 계열 | nDCG@10 | Δ | 95% CI | p | 승/패/무 |
|---|---|---:|---:|---|---:|---|
| `prod3-bigram-qu-p0.8` | A.current | 0.878 | +0.000 | [+0.000, +0.000] | 1.000 | 0/0/160 |
| `veh-p0.5` | V.vehicle-same | 0.885 | +0.007 | [-0.004, +0.017] | 0.191 | 32/18/110 |
| `veh-p0.8` | V.vehicle-same | 0.888 | +0.011 | [+0.001, +0.020] | 0.026 | 30/13/117 |
| `veh-weak-v0.1` | V.vehicle-weak | 0.880 | +0.002 | [-0.001, +0.005] | 0.202 | 14/4/142 |
| `veh-weak-v0.1-cat-all` | VC.vehicle-weak+category-all | 0.879 | +0.001 | [-0.005, +0.006] | 0.737 | 15/5/140 |
| `veh-weak-v0.2` | V.vehicle-weak | 0.882 | +0.004 | [+0.001, +0.008] | 0.013 | 21/5/134 |
| `veh-weak-v0.2-cat-all` | VC.vehicle-weak+category-all | 0.882 | +0.004 | [-0.001, +0.009] | 0.143 | 21/6/133 |
| `veh-weak-v0.3` | V.vehicle-weak | 0.884 | +0.006 | [+0.002, +0.011] | 0.004 | 23/7/130 |
| `veh-weak-v0.3-cat-all` | VC.vehicle-weak+category-all | 0.884 | +0.006 | [+0.001, +0.012] | 0.031 | 23/8/129 |
| `veh-weak-v0.5` | V.vehicle-weak | 0.888 | +0.010 | [+0.004, +0.017] | 0.002 | 26/8/126 |
| `veh-weak-v0.5-cat-all` | VC.vehicle-weak+category-all | 0.887 | +0.009 | [+0.002, +0.017] | 0.011 | 26/9/125 |
| `cat-all` | C.category-all | 0.876 | -0.002 | [-0.009, +0.003] | 0.751 | 1/2/157 |
| `wsbigram` | T.ws+bigram | 0.873 | -0.005 | [-0.012, +0.000] | 0.101 | 19/24/117 |
| `joined` | T.bigram-joined | 0.881 | +0.004 | [-0.003, +0.012] | 0.413 | 28/13/119 |
| `joined-veh-weak-v0.2-cat-all` | J.joined+vehicle-weak+category-all | 0.885 | +0.007 | [-0.002, +0.017] | 0.130 | 39/17/104 |
| `joined-veh-weak-v0.3-cat-all` | J.joined+vehicle-weak+category-all | 0.888 | +0.010 | [+0.000, +0.020] | 0.049 | 41/18/101 |
| `veh-cat-all-bigram-p0.5` | VC.vehicle+category-all | 0.885 | +0.007 | [-0.003, +0.017] | 0.181 | 31/19/110 |
| `veh-cat-all-bigram-p0.8` | VC.vehicle+category-all | 0.887 | +0.010 | [+0.000, +0.019] | 0.053 | 30/14/116 |
| `veh-cat-all-ws+bigram-p0.5` | VC.vehicle+category-all | 0.883 | +0.006 | [-0.005, +0.017] | 0.325 | 39/32/89 |
| `veh-cat-all-ws+bigram-p0.8` | VC.vehicle+category-all | 0.886 | +0.008 | [-0.002, +0.018] | 0.145 | 38/27/95 |
