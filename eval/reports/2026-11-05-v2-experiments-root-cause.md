# 검색 기법 실험 (v2, 오프라인)

- 날짜 2026-11-05, 코드 `42fa856`, 구성 96개
- 질의 분할: dev 177개 / test 174개 ((source, qtype)별 층화, qid 해시 순 교대 배정)
- 선택은 dev nDCG@10만 사용. 기준 구성(현재 프로덕션): `prod-ws-a0.7-c20` (dev 0.691 / test 0.700)
- 쿼리 확장(Claude)은 제외. 오프라인 벡터 검색은 정확한 코사인(프로덕션 S3 Vectors는 근사 검색)

## test 확인: dev에서 고른 구성 vs 현재 프로덕션 (nDCG@10, 질의별 쌍체)

| 구성 | 선택 근거 | 기준 | 후보 | Δ | 95% CI | p | 승/패/무 |
|---|---|---:|---:|---:|---|---:|---|
| `prod-ws-a0.9-c20` | A.prod-alpha 최고 | 0.700 | 0.726 | +0.025 | [+0.011, +0.040] | <0.001 | 56/33/85 |
| `doc-v2-notrade-vector` | G.doc-vector 최고 | 0.700 | 0.686 | -0.014 | [-0.048, +0.018] | 0.402 | 67/70/37 |
| `doc-v2-bm25` | G.doc-bm25 최고 | 0.700 | 0.738 | +0.037 | [+0.002, +0.074] | 0.045 | 69/64/41 |
| `doc-v2-prod-a0.7-c20` | G.doc-prod 최고 | 0.700 | 0.749 | +0.049 | [+0.022, +0.075] | <0.001 | 72/49/53 |
| `doc-legacy-full-a0.8` | H.full-convex-legacy 최고 | 0.700 | 0.736 | +0.035 | [+0.017, +0.054] | <0.001 | 68/46/60 |
| `doc-legacy-union-n100-a0.6` | I.union-legacy 최고 | 0.700 | 0.725 | +0.024 | [+0.006, +0.043] | 0.011 | 61/42/71 |
| `doc-v2-noalias-full-a0.6` | H.full-convex-v2-noalias 최고 | 0.700 | 0.751 | +0.050 | [+0.026, +0.077] | <0.001 | 75/45/54 |
| `doc-v2-noalias-union-n100-a0.6` | I.union-v2-noalias 최고 | 0.700 | 0.736 | +0.036 | [+0.010, +0.062] | 0.009 | 69/54/51 |
| `doc-v2-full-a0.6` | H.full-convex-v2 최고 | 0.700 | 0.778 | +0.078 | [+0.052, +0.106] | <0.001 | 91/36/47 |
| `doc-v2-union-n100-a0.5` | I.union-v2 최고 | 0.700 | 0.769 | +0.068 | [+0.041, +0.098] | <0.001 | 88/39/47 |
| `mix-bm25v2-veclegacy-full-a0.6` | J.mixed-bm25v2-veclegacy 최고 | 0.700 | 0.776 | +0.075 | [+0.050, +0.102] | <0.001 | 82/39/53 |
| `mix-bm25v2-veclegacy-union-n100-a0.6` | K.mixed-union-veclegacy 최고 | 0.700 | 0.766 | +0.065 | [+0.041, +0.090] | <0.001 | 81/39/54 |
| `mix-bm25v2-vecv2-notrade-full-a0.6` | J.mixed-bm25v2-vecv2-notrade 최고, 전체 최고 | 0.700 | 0.790 | +0.089 | [+0.063, +0.118] | <0.001 | 91/35/48 |
| `mix-bm25v2-vecv2-notrade-union-n100-a0.5` | K.mixed-union-vecv2-notrade 최고 | 0.700 | 0.775 | +0.075 | [+0.047, +0.105] | <0.001 | 87/39/48 |

여러 구성을 동시에 비교했으므로 p값 하나만으로 결론 내리지 않는다. CI와 승/패를 함께 본다.

## 전체 구성 (dev nDCG@10 순)

| 순위 | 구성 | 계열 | dev nDCG@10 | dev Recall@10 | dev MRR@10 | keyword | mixed | semantic | test nDCG@10 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `mix-bm25v2-vecv2-notrade-full-a0.6` | J.mixed-bm25v2-vecv2-notrade | 0.784 | 0.799 | 0.833 | 0.892 | 0.631 | 0.621 | 0.789 |
| 2 | `doc-v2-full-a0.6` | H.full-convex-v2 | 0.782 | 0.799 | 0.835 | 0.885 | 0.635 | 0.629 | 0.778 |
| 3 | `mix-bm25v2-veclegacy-union-n100-a0.6` | K.mixed-union-veclegacy | 0.779 | 0.788 | 0.846 | 0.883 | 0.636 | 0.618 | 0.766 |
| 4 | `mix-bm25v2-veclegacy-full-a0.6` | J.mixed-bm25v2-veclegacy | 0.778 | 0.786 | 0.840 | 0.885 | 0.633 | 0.615 | 0.776 |
| 5 | `mix-bm25v2-veclegacy-full-a0.5` | J.mixed-bm25v2-veclegacy | 0.778 | 0.788 | 0.842 | 0.884 | 0.641 | 0.610 | 0.772 |
| 6 | `mix-bm25v2-veclegacy-union-n100-a0.5` | K.mixed-union-veclegacy | 0.778 | 0.784 | 0.842 | 0.884 | 0.639 | 0.609 | 0.764 |
| 7 | `mix-bm25v2-vecv2-notrade-union-n100-a0.5` | K.mixed-union-vecv2-notrade | 0.777 | 0.791 | 0.837 | 0.882 | 0.634 | 0.615 | 0.775 |
| 8 | `mix-bm25v2-vecv2-notrade-full-a0.5` | J.mixed-bm25v2-vecv2-notrade | 0.776 | 0.790 | 0.830 | 0.879 | 0.641 | 0.613 | 0.782 |
| 9 | `mix-bm25v2-vecv2-notrade-union-n100-a0.6` | K.mixed-union-vecv2-notrade | 0.774 | 0.797 | 0.829 | 0.884 | 0.622 | 0.610 | 0.778 |
| 10 | `mix-bm25v2-veclegacy-full-a0.7` | J.mixed-bm25v2-veclegacy | 0.774 | 0.785 | 0.846 | 0.882 | 0.609 | 0.622 | 0.767 |
| 11 | `doc-v2-union-n100-a0.5` | I.union-v2 | 0.773 | 0.793 | 0.830 | 0.873 | 0.632 | 0.624 | 0.769 |
| 12 | `doc-v2-full-a0.5` | H.full-convex-v2 | 0.773 | 0.795 | 0.824 | 0.871 | 0.649 | 0.616 | 0.775 |
| 13 | `mix-bm25v2-vecv2-notrade-union-n50-a0.5` | K.mixed-union-vecv2-notrade | 0.773 | 0.795 | 0.835 | 0.880 | 0.623 | 0.613 | 0.771 |
| 14 | `mix-bm25v2-vecv2-notrade-full-a0.7` | J.mixed-bm25v2-vecv2-notrade | 0.773 | 0.798 | 0.825 | 0.885 | 0.615 | 0.605 | 0.784 |
| 15 | `mix-bm25v2-veclegacy-union-n50-a0.5` | K.mixed-union-veclegacy | 0.772 | 0.785 | 0.839 | 0.877 | 0.633 | 0.609 | 0.760 |
| 16 | `doc-v2-full-a0.7` | H.full-convex-v2 | 0.771 | 0.801 | 0.828 | 0.880 | 0.618 | 0.609 | 0.770 |
| 17 | `doc-v2-union-n100-a0.6` | I.union-v2 | 0.770 | 0.794 | 0.829 | 0.873 | 0.625 | 0.616 | 0.760 |
| 18 | `doc-v2-union-n50-a0.5` | I.union-v2 | 0.769 | 0.790 | 0.834 | 0.869 | 0.630 | 0.615 | 0.759 |
| 19 | `mix-bm25v2-veclegacy-union-n100-a0.7` | K.mixed-union-veclegacy | 0.766 | 0.775 | 0.846 | 0.879 | 0.617 | 0.587 | 0.753 |
| 20 | `mix-bm25v2-veclegacy-union-n50-a0.6` | K.mixed-union-veclegacy | 0.763 | 0.780 | 0.838 | 0.877 | 0.620 | 0.580 | 0.755 |
| 21 | `mix-bm25v2-veclegacy-full-a0.8` | J.mixed-bm25v2-veclegacy | 0.761 | 0.768 | 0.847 | 0.880 | 0.594 | 0.584 | 0.756 |
| 22 | `mix-bm25v2-vecv2-notrade-union-n100-a0.7` | K.mixed-union-vecv2-notrade | 0.756 | 0.786 | 0.812 | 0.874 | 0.609 | 0.564 | 0.763 |
| 23 | `mix-bm25v2-vecv2-notrade-union-n50-a0.6` | K.mixed-union-vecv2-notrade | 0.754 | 0.783 | 0.815 | 0.872 | 0.602 | 0.565 | 0.772 |
| 24 | `doc-v2-union-n50-a0.6` | I.union-v2 | 0.753 | 0.782 | 0.833 | 0.867 | 0.610 | 0.570 | 0.748 |
| 25 | `mix-bm25v2-vecv2-notrade-full-a0.8` | J.mixed-bm25v2-vecv2-notrade | 0.752 | 0.778 | 0.811 | 0.878 | 0.591 | 0.550 | 0.759 |
| 26 | `mix-bm25v2-veclegacy-union-n50-a0.7` | K.mixed-union-veclegacy | 0.752 | 0.761 | 0.839 | 0.872 | 0.593 | 0.562 | 0.745 |
| 27 | `doc-v2-union-n20-a0.5` | I.union-v2 | 0.751 | 0.776 | 0.823 | 0.862 | 0.581 | 0.597 | 0.753 |
| 28 | `doc-v2-union-n100-a0.7` | I.union-v2 | 0.751 | 0.782 | 0.819 | 0.864 | 0.609 | 0.570 | 0.744 |
| 29 | `doc-v2-prod-a0.7-c20` | G.doc-prod | 0.749 | 0.758 | 0.826 | 0.852 | 0.630 | 0.573 | 0.749 |
| 30 | `doc-v2-noalias-full-a0.6` | H.full-convex-v2-noalias | 0.748 | 0.750 | 0.804 | 0.841 | 0.624 | 0.605 | 0.751 |
| 31 | `mix-bm25v2-veclegacy-union-n100-a0.8` | K.mixed-union-veclegacy | 0.747 | 0.761 | 0.834 | 0.866 | 0.596 | 0.557 | 0.741 |
| 32 | `doc-v2-full-a0.8` | H.full-convex-v2 | 0.746 | 0.782 | 0.813 | 0.865 | 0.586 | 0.564 | 0.739 |
| 33 | `mix-bm25v2-vecv2-notrade-union-n50-a0.7` | K.mixed-union-vecv2-notrade | 0.741 | 0.769 | 0.804 | 0.867 | 0.585 | 0.537 | 0.745 |
| 34 | `doc-v2-noalias-full-a0.7` | H.full-convex-v2-noalias | 0.741 | 0.752 | 0.796 | 0.839 | 0.606 | 0.593 | 0.746 |
| 35 | `doc-v2-noalias-union-n100-a0.6` | I.union-v2-noalias | 0.740 | 0.749 | 0.804 | 0.832 | 0.610 | 0.604 | 0.736 |
| 36 | `doc-legacy-full-a0.8` | H.full-convex-legacy | 0.738 | 0.743 | 0.821 | 0.853 | 0.586 | 0.557 | 0.736 |
| 37 | `doc-v2-union-n20-a0.6` | I.union-v2 | 0.737 | 0.771 | 0.804 | 0.856 | 0.572 | 0.557 | 0.740 |
| 38 | `doc-legacy-union-n100-a0.6` | I.union-legacy | 0.736 | 0.736 | 0.814 | 0.840 | 0.605 | 0.570 | 0.725 |
| 39 | `mix-bm25v2-veclegacy-union-n50-a0.8` | K.mixed-union-veclegacy | 0.736 | 0.744 | 0.821 | 0.859 | 0.592 | 0.528 | 0.731 |
| 40 | `mix-bm25v2-vecv2-notrade-union-n100-a0.8` | K.mixed-union-vecv2-notrade | 0.736 | 0.765 | 0.791 | 0.866 | 0.565 | 0.532 | 0.738 |
| 41 | `doc-legacy-union-n100-a0.7` | I.union-legacy | 0.735 | 0.744 | 0.812 | 0.846 | 0.598 | 0.553 | 0.732 |
| 42 | `doc-legacy-full-a0.7` | H.full-convex-legacy | 0.735 | 0.730 | 0.812 | 0.844 | 0.596 | 0.559 | 0.742 |
| 43 | `doc-legacy-full-a0.6` | H.full-convex-legacy | 0.734 | 0.734 | 0.811 | 0.836 | 0.608 | 0.567 | 0.733 |
| 44 | `doc-v2-noalias-union-n100-a0.5` | I.union-v2-noalias | 0.733 | 0.742 | 0.796 | 0.824 | 0.610 | 0.593 | 0.729 |
| 45 | `doc-v2-noalias-full-a0.5` | H.full-convex-v2-noalias | 0.733 | 0.751 | 0.785 | 0.825 | 0.610 | 0.590 | 0.736 |
| 46 | `doc-v2-union-n50-a0.7` | I.union-v2 | 0.733 | 0.768 | 0.806 | 0.851 | 0.578 | 0.546 | 0.727 |
| 47 | `doc-legacy-union-n50-a0.6` | I.union-legacy | 0.730 | 0.738 | 0.806 | 0.840 | 0.604 | 0.543 | 0.721 |
| 48 | `doc-legacy-union-n100-a0.8` | I.union-legacy | 0.729 | 0.746 | 0.818 | 0.844 | 0.595 | 0.535 | 0.725 |
| 49 | `doc-v2-union-n20-a0.7` | I.union-v2 | 0.729 | 0.770 | 0.802 | 0.849 | 0.568 | 0.542 | 0.724 |
| 50 | `doc-v2-union-n100-a0.8` | I.union-v2 | 0.728 | 0.767 | 0.798 | 0.850 | 0.570 | 0.532 | 0.713 |
| 51 | `doc-v2-noalias-full-a0.8` | H.full-convex-v2-noalias | 0.727 | 0.744 | 0.793 | 0.837 | 0.577 | 0.560 | 0.731 |
| 52 | `doc-legacy-union-n100-a0.5` | I.union-legacy | 0.725 | 0.741 | 0.797 | 0.821 | 0.597 | 0.576 | 0.710 |
| 53 | `doc-v2-noalias-union-n100-a0.7` | I.union-v2-noalias | 0.725 | 0.742 | 0.794 | 0.831 | 0.575 | 0.567 | 0.726 |
| 54 | `doc-v2-noalias-union-n50-a0.6` | I.union-v2-noalias | 0.725 | 0.744 | 0.795 | 0.828 | 0.598 | 0.557 | 0.728 |
| 55 | `doc-legacy-union-n50-a0.7` | I.union-legacy | 0.725 | 0.735 | 0.810 | 0.838 | 0.586 | 0.539 | 0.723 |
| 56 | `mix-bm25v2-vecv2-notrade-union-n50-a0.8` | K.mixed-union-vecv2-notrade | 0.724 | 0.751 | 0.785 | 0.859 | 0.552 | 0.510 | 0.727 |
| 57 | `doc-v2-bm25` | G.doc-bm25 | 0.724 | 0.749 | 0.772 | 0.821 | 0.569 | 0.594 | 0.738 |
| 58 | `doc-v2-noalias-union-n50-a0.5` | I.union-v2-noalias | 0.723 | 0.736 | 0.787 | 0.817 | 0.589 | 0.584 | 0.721 |
| 59 | `doc-legacy-union-n50-a0.5` | I.union-legacy | 0.723 | 0.731 | 0.802 | 0.820 | 0.597 | 0.567 | 0.714 |
| 60 | `doc-legacy-full-a0.5` | H.full-convex-legacy | 0.722 | 0.736 | 0.790 | 0.820 | 0.601 | 0.559 | 0.714 |
| 61 | `prod-ws-a0.9-c20` | A.prod-alpha | 0.720 | 0.727 | 0.811 | 0.834 | 0.598 | 0.518 | 0.726 |
| 62 | `doc-legacy-full-a0.9` | H.full-convex-legacy | 0.719 | 0.732 | 0.805 | 0.844 | 0.568 | 0.511 | 0.717 |
| 63 | `doc-legacy-union-n50-a0.8` | I.union-legacy | 0.719 | 0.731 | 0.805 | 0.838 | 0.588 | 0.511 | 0.718 |
| 64 | `doc-v2-union-n50-a0.8` | I.union-v2 | 0.716 | 0.752 | 0.791 | 0.842 | 0.562 | 0.509 | 0.701 |
| 65 | `doc-legacy-union-n20-a0.7` | I.union-legacy | 0.716 | 0.735 | 0.804 | 0.828 | 0.578 | 0.531 | 0.712 |
| 66 | `doc-legacy-union-n100-a0.9` | I.union-legacy | 0.715 | 0.727 | 0.802 | 0.841 | 0.582 | 0.491 | 0.709 |
| 67 | `doc-v2-full-a0.9` | H.full-convex-v2 | 0.714 | 0.746 | 0.793 | 0.839 | 0.554 | 0.514 | 0.700 |
| 68 | `doc-legacy-union-n20-a0.6` | I.union-legacy | 0.714 | 0.730 | 0.798 | 0.824 | 0.575 | 0.533 | 0.713 |
| 69 | `doc-v2-noalias-union-n20-a0.5` | I.union-v2-noalias | 0.714 | 0.739 | 0.780 | 0.814 | 0.563 | 0.571 | 0.721 |
| 70 | `doc-legacy-union-n20-a0.5` | I.union-legacy | 0.713 | 0.727 | 0.803 | 0.808 | 0.582 | 0.568 | 0.708 |
| 71 | `doc-legacy-union-n50-a0.9` | I.union-legacy | 0.710 | 0.724 | 0.797 | 0.838 | 0.573 | 0.485 | 0.702 |
| 72 | `doc-v2-union-n20-a0.8` | I.union-v2 | 0.710 | 0.753 | 0.783 | 0.838 | 0.537 | 0.511 | 0.697 |
| 73 | `doc-legacy-union-n20-a0.8` | I.union-legacy | 0.709 | 0.719 | 0.803 | 0.831 | 0.564 | 0.503 | 0.706 |
| 74 | `doc-v2-noalias-union-n20-a0.6` | I.union-v2-noalias | 0.707 | 0.731 | 0.774 | 0.823 | 0.542 | 0.535 | 0.712 |
| 75 | `doc-v2-noalias-prod-a0.7-c20` | G.doc-prod | 0.707 | 0.728 | 0.770 | 0.799 | 0.597 | 0.550 | 0.705 |
| 76 | `doc-v2-noalias-union-n50-a0.7` | I.union-v2-noalias | 0.704 | 0.727 | 0.774 | 0.817 | 0.554 | 0.528 | 0.715 |
| 77 | `doc-v2-noalias-union-n100-a0.8` | I.union-v2-noalias | 0.704 | 0.718 | 0.780 | 0.823 | 0.560 | 0.508 | 0.707 |
| 78 | `doc-v2-union-n100-a0.9` | I.union-v2 | 0.704 | 0.739 | 0.782 | 0.830 | 0.544 | 0.499 | 0.685 |
| 79 | `doc-v2-noalias-full-a0.9` | H.full-convex-v2-noalias | 0.702 | 0.713 | 0.777 | 0.823 | 0.549 | 0.509 | 0.694 |
| 80 | `doc-legacy-union-n20-a0.9` | I.union-legacy | 0.701 | 0.714 | 0.788 | 0.830 | 0.553 | 0.479 | 0.697 |
| 81 | `doc-v2-union-n50-a0.9` | I.union-v2 | 0.699 | 0.733 | 0.778 | 0.827 | 0.531 | 0.495 | 0.683 |
| 82 | `doc-v2-noalias-union-n50-a0.8` | I.union-v2-noalias | 0.697 | 0.711 | 0.775 | 0.815 | 0.555 | 0.500 | 0.694 |
| 83 | `doc-v2-noalias-union-n20-a0.7` | I.union-v2-noalias | 0.694 | 0.725 | 0.763 | 0.810 | 0.541 | 0.512 | 0.706 |
| 84 | `doc-v2-union-n20-a0.9` | I.union-v2 | 0.694 | 0.724 | 0.772 | 0.822 | 0.527 | 0.489 | 0.674 |
| 85 | `prod-ws-a0.7-c20` | A.prod-alpha | 0.691 | 0.704 | 0.757 | 0.792 | 0.576 | 0.519 | 0.700 |
| 86 | `doc-legacy-prod-a0.7-c20` | G.doc-prod | 0.691 | 0.704 | 0.757 | 0.792 | 0.576 | 0.519 | 0.700 |
| 87 | `doc-v2-noalias-union-n20-a0.8` | I.union-v2-noalias | 0.688 | 0.712 | 0.767 | 0.810 | 0.535 | 0.487 | 0.685 |
| 88 | `doc-v2-noalias-union-n100-a0.9` | I.union-v2-noalias | 0.687 | 0.703 | 0.764 | 0.808 | 0.539 | 0.487 | 0.678 |
| 89 | `doc-v2-notrade-vector` | G.doc-vector | 0.686 | 0.716 | 0.759 | 0.824 | 0.512 | 0.464 | 0.686 |
| 90 | `doc-legacy-vector` | G.doc-vector | 0.685 | 0.702 | 0.765 | 0.822 | 0.528 | 0.452 | 0.690 |
| 91 | `doc-v2-noalias-union-n50-a0.9` | I.union-v2-noalias | 0.683 | 0.700 | 0.763 | 0.806 | 0.535 | 0.482 | 0.673 |
| 92 | `doc-v2-vector` | G.doc-vector | 0.677 | 0.703 | 0.758 | 0.809 | 0.509 | 0.466 | 0.661 |
| 93 | `doc-v2-noalias-union-n20-a0.9` | I.union-v2-noalias | 0.675 | 0.693 | 0.757 | 0.800 | 0.512 | 0.479 | 0.674 |
| 94 | `doc-v2-noalias-vector` | G.doc-vector | 0.665 | 0.688 | 0.746 | 0.791 | 0.505 | 0.462 | 0.667 |
| 95 | `doc-v2-noalias-bm25` | G.doc-bm25 | 0.639 | 0.635 | 0.688 | 0.698 | 0.533 | 0.571 | 0.649 |
| 96 | `doc-legacy-bm25` | G.doc-bm25 | 0.596 | 0.612 | 0.650 | 0.661 | 0.494 | 0.509 | 0.600 |
