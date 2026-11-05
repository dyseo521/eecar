"""평가 질의 세트 v1.

qtype
- keyword:  차종명, 합금 번호, 부품명처럼 문서에 그대로 나오는 단어로 찾는 질의
- semantic: 문서에 없는 표현(동의어, 용도, 상위 개념)으로 찾는 질의
- mixed:    키워드와 수치·의미 조건이 섞인 질의

일부러 넣은 어려운 경우
- 표기 변형: 아이오닉5 / 아이오닉 5 / IONIQ 5, 모델3 / Model 3
- 조사 결합: "니로EV 배터리를" 처럼 공백 토크나이저가 놓치는 형태
- 동음이의어: 볼트 EV(Bolt)와 볼트 PHEV(Volt)
- 문서에 없는 동의어: 리튬인산철(=LFP), 하이니켈(=NCM Ni 80%), 차데모(=CHAdeMO)
- 수치 조건: SOH 90% 이상, 200kW 이상처럼 텍스트 매칭으로는 풀기 어려운 조건
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Query:
    id: str
    text: str
    qtype: str
    difficulty: str
    must: dict[str, Any]
    should: dict[str, Any] = field(default_factory=dict)


def _q(i: int, text: str, qtype: str, difficulty: str, must: dict[str, Any], should: dict[str, Any] | None = None) -> Query:
    return Query(f"q{i:03d}", text, qtype, difficulty, must, should or {})


B, M, I, C, E = "battery", "motor", "inverter", "charger", "electronics"
FRAME, PANEL, DOOR, WIN = "body-chassis-frame", "body-panel", "body-door", "body-window"

QUERIES: tuple[Query, ...] = (
    # ---------------------------------------------------------------- 배터리
    _q(1, "아이오닉5 배터리 팩", "keyword", "easy", {"category": B, "vehicle": "ioniq5", "subtype": "battery-pack"}),
    _q(2, "IONIQ 5 battery", "keyword", "medium", {"category": B, "vehicle": "ioniq5"}),
    _q(3, "아이오닉 5 72.6kWh 배터리", "keyword", "medium", {"category": B, "vehicle": "ioniq5", "pack_kwh": 72.6}),
    _q(4, "EV6 77.4kWh 배터리 팩", "keyword", "easy",
       {"category": B, "vehicle": "ev6", "pack_kwh": 77.4, "subtype": "battery-pack"}),
    _q(5, "니로EV 배터리를 구합니다", "keyword", "medium", {"category": B, "vehicle": "niro_ev"}),
    _q(6, "코나 일렉트릭 64kWh 배터리", "keyword", "easy", {"category": B, "vehicle": "kona", "pack_kwh": 64.0}),
    _q(7, "닛산 리프 24kWh 배터리 모듈", "keyword", "medium", {"category": B, "vehicle": "leaf_ze0"},
       {"subtype": "battery-module"}),
    _q(8, "볼트 EV 배터리", "keyword", "hard", {"category": B, "vehicle": "bolt"}),
    _q(9, "쉐보레 볼트 PHEV 배터리 팩", "keyword", "hard", {"category": B, "vehicle": "volt"}),
    _q(10, "테슬라 모델3 LFP 배터리", "mixed", "medium", {"category": B, "vehicle": "model3", "cathode": "LFP"}),
    _q(11, "Model S 85kWh 배터리 팩", "keyword", "easy", {"category": B, "vehicle": "model_s", "pack_kwh": 85.0}),
    _q(12, "BMW i3 배터리", "keyword", "easy", {"category": B, "vehicle": "bmw_i3"}),
    _q(13, "LFP 배터리", "keyword", "easy", {"category": B, "cathode": "LFP"}),
    _q(14, "리튬인산철 배터리 팩", "semantic", "hard", {"category": B, "cathode": "LFP"}, {"subtype": "battery-pack"}),
    _q(15, "NCA 양극재 배터리", "keyword", "medium", {"category": B, "cathode": "NCA"}),
    _q(16, "LMO 계열 1세대 전기차 배터리", "mixed", "medium", {"category": B, "cathode": "LMO"}),
    _q(17, "하이니켈 NCM 배터리", "semantic", "hard", {"category": B, "cathode": "NCM Ni 80%"}),
    _q(18, "SOH 90% 이상 배터리", "mixed", "hard", {"category": B, "soh_min": 90}),
    _q(19, "잔존용량 85% 이상인 배터리 팩", "mixed", "hard", {"category": B, "soh_min": 85, "subtype": "battery-pack"}),
    _q(20, "ESS로 재사용할 수 있는 LFP 배터리", "mixed", "medium",
       {"category": B, "application": ["ESS"], "cathode": "LFP"}),
    _q(21, "전기 지게차에 쓸 중고 배터리 모듈", "semantic", "hard", {"category": B, "application": ["전기 지게차"]},
       {"subtype": "battery-module"}),
    _q(22, "재활용 공정으로 보내야 하는 노후 배터리", "semantic", "hard", {"category": B, "recommended_use": "recycle"}),
    _q(23, "삼성SDI 셀 배터리", "keyword", "medium", {"category": B, "cell_maker": "삼성SDI"}),
    _q(24, "SK온 배터리 팩", "keyword", "easy", {"category": B, "cell_maker": "SK온", "subtype": "battery-pack"}),
    _q(25, "800V 고전압 배터리 팩", "mixed", "hard", {"category": B, "voltage_class": 800, "subtype": "battery-pack"}),
    _q(26, "캠핑카 전원용 배터리", "semantic", "medium", {"category": B, "application": ["캠핑카 전원"]}),
    _q(27, "UPS 비상전원에 활용 가능한 배터리", "semantic", "medium", {"category": B, "application": ["UPS"]}),
    _q(28, "i-MiEV 배터리", "keyword", "medium", {"category": B, "vehicle": "imiev"}),
    _q(29, "아토3 블레이드 배터리", "keyword", "medium", {"category": B, "vehicle": "atto3"}),
    _q(30, "포르쉐 타이칸 배터리 팩", "keyword", "easy", {"category": B, "vehicle": "taycan"}),
    # ---------------------------------------------------------------- 모터
    _q(31, "아이오닉5 후륜 모터", "keyword", "easy", {"category": M, "vehicle": "ioniq5", "subtype": "motor-rear"}),
    _q(32, "EV6 front motor", "keyword", "medium", {"category": M, "vehicle": "ev6", "subtype": "motor-front"}),
    _q(33, "테슬라 모델S 인덕션 모터", "mixed", "medium", {"category": M, "vehicle": "model_s", "motor_type": "IM"}),
    _q(34, "희토류 회수가 가능한 150kW 이상 영구자석 모터", "semantic", "hard",
       {"category": M, "rare_earth": True, "power_min": 150}),
    _q(35, "희토류를 쓰지 않는 구동모터", "semantic", "hard", {"category": M, "rare_earth": False}),
    _q(36, "200kW 이상 고출력 구동모터", "mixed", "hard", {"category": M, "power_min": 200}),
    _q(37, "권선형 동기모터", "keyword", "medium", {"category": M, "motor_type": "WRSM"}),
    _q(38, "르노 조에 모터", "keyword", "easy", {"category": M, "vehicle": "zoe"}),
    _q(39, "아우디 e-tron 전륜 모터", "keyword", "medium", {"category": M, "vehicle": "etron", "subtype": "motor-front"}),
    _q(40, "모델3 구동모터", "keyword", "easy", {"category": M, "vehicle": "model3"}),
    _q(41, "Model 3 rear motor", "keyword", "medium", {"category": M, "vehicle": "model3", "subtype": "motor-rear"}),
    _q(42, "볼트 EV 구동 모터", "keyword", "hard", {"category": M, "vehicle": "bolt"}),
    _q(43, "소형 전기차용 저출력 모터", "semantic", "hard", {"category": M, "power_max": 90}),
    _q(44, "토크 400Nm 이상 모터", "mixed", "hard", {"category": M, "torque_min": 400}),
    # ---------------------------------------------------------------- 인버터
    _q(45, "SiC 인버터", "keyword", "easy", {"category": I, "semiconductor": "SiC"}),
    _q(46, "실리콘카바이드 전력반도체 인버터", "semantic", "medium", {"category": I, "semiconductor": "SiC"}),
    _q(47, "800V 인버터", "keyword", "medium", {"category": I, "voltage_class": 800}),
    _q(48, "800V 시스템용 SiC 인버터", "mixed", "medium", {"category": I, "voltage_class": 800, "semiconductor": "SiC"}),
    _q(49, "테슬라 모델3 인버터", "keyword", "easy", {"category": I, "vehicle": "model3"}),
    _q(50, "Model 3 inverter", "keyword", "medium", {"category": I, "vehicle": "model3"}),
    _q(51, "아이오닉 일렉트릭 IGBT 인버터", "keyword", "medium", {"category": I, "vehicle": "ioniq_ev"}),
    _q(52, "보쉬 인버터", "keyword", "medium", {"category": I, "part_maker": "보쉬"}),
    _q(53, "300kW급 고출력 인버터", "mixed", "hard", {"category": I, "power_min": 300}),
    _q(54, "히타치 리프 인버터", "keyword", "medium",
       {"category": I, "part_maker": "히타치", "vehicle": ["leaf_ze0", "leaf_ze1"]}),
    # ---------------------------------------------------------------- 충전
    _q(55, "차데모 충전 인렛", "keyword", "hard", {"category": C, "connector": "CHAdeMO"}),
    _q(56, "CHAdeMO 충전구", "keyword", "medium", {"category": C, "connector": "CHAdeMO"}),
    _q(57, "11kW 온보드 충전기", "mixed", "medium", {"category": C, "subtype": "obc", "power_min": 10.5}),
    _q(58, "OBC 차량 탑재 충전기", "keyword", "easy", {"category": C, "subtype": "obc"}),
    _q(59, "휴대용 충전 케이블", "semantic", "medium", {"category": C, "subtype": "portable-charger"}),
    _q(60, "가정용 콘센트로 충전하는 장비", "semantic", "hard", {"category": C, "subtype": "portable-charger"}),
    _q(61, "유럽형 CCS2 충전 인렛", "keyword", "medium", {"category": C, "connector": "CCS2"}),
    _q(62, "르노 조에 충전구", "keyword", "medium", {"category": C, "vehicle": "zoe"}),
    # ---------------------------------------------------------------- 전장
    _q(63, "BMS 보드", "keyword", "easy", {"category": E, "subtype": "bms"}),
    _q(64, "배터리 관리 시스템", "semantic", "easy", {"category": E, "subtype": "bms"}),
    _q(65, "12V 변환 DC-DC 컨버터", "keyword", "medium", {"category": E, "subtype": "ldc"}),
    _q(66, "전동 컴프레서", "keyword", "easy", {"category": E, "subtype": "e-compressor"}),
    _q(67, "겨울철 주행거리 개선용 히트펌프", "semantic", "medium", {"category": E, "subtype": "heat-pump"}),
    _q(68, "고전압 배전 릴레이 박스", "semantic", "hard", {"category": E, "subtype": "junction-box"}),
    _q(69, "한온시스템 에어컨 컴프레서", "keyword", "medium", {"category": E, "subtype": "e-compressor"},
       {"part_maker": "한온시스템"}),
    _q(70, "배터리 예열 히터", "semantic", "medium", {"category": E, "subtype": "ptc-heater"}),
    # ---------------------------------------------------------------- 차체 프레임
    _q(71, "알루미늄 배터리 트레이", "keyword", "easy", {"category": FRAME, "subtype": "battery-tray"}),
    _q(72, "6082 알루미늄 압출 프레임", "keyword", "medium", {"category": FRAME, "alloy": "6082"}),
    _q(73, "탄소섬유 차체 구조", "semantic", "medium", {"material": "cfrp"}),
    _q(74, "BMW i3 CFRP 라이프 모듈", "keyword", "easy", {"category": FRAME, "subtype": "life-module"}),
    _q(75, "1500MPa 핫스탬핑 사이드 실", "mixed", "medium",
       {"category": FRAME, "subtype": "side-sill", "alloy": "HPF1500"}),
    _q(76, "충돌 에너지 흡수용 범퍼 빔", "semantic", "hard", {"category": FRAME, "subtype": "front-crash-beam"}),
    _q(77, "7003 알루미늄 크래시 빔", "keyword", "medium",
       {"category": FRAME, "subtype": "front-crash-beam", "alloy": "7003"}),
    _q(78, "초고장력강 서브프레임", "mixed", "medium", {"category": FRAME, "subtype": "subframe", "alloy": "DP980"}),
    # ---------------------------------------------------------------- 외판·도어·유리
    _q(79, "알루미늄 6061 후드", "keyword", "easy", {"category": PANEL, "subtype": "hood", "alloy": "6061"}),
    _q(80, "6016 알루미늄 외판", "keyword", "medium", {"category": PANEL, "alloy": "6016"}),
    _q(81, "가벼운 알루미늄 보닛", "semantic", "medium", {"category": PANEL, "subtype": "hood", "material": "aluminum"}),
    _q(82, "테슬라 모델S 알루미늄 후드", "keyword", "medium",
       {"category": PANEL, "vehicle": "model_s", "material": "aluminum"}),
    _q(83, "인장강도 500MPa 이상 도어 보강재", "mixed", "hard",
       {"category": DOOR, "subtype": "door-impact-beam", "tensile_min": 500}),
    _q(84, "7075 사이드 임팩트 빔", "keyword", "medium", {"category": DOOR, "alloy": "7075"}),
    _q(85, "재활용률 높은 알루미늄 펜더", "semantic", "hard", {"category": PANEL, "subtype": "fender", "material": "aluminum"}),
    _q(86, "HUD 대응 앞유리", "mixed", "medium", {"category": WIN, "subtype": "windshield"}),
    _q(87, "파노라마 선루프 유리", "keyword", "easy", {"category": WIN, "subtype": "panoramic-roof"}),
    _q(88, "차음 접합유리", "semantic", "medium", {"category": WIN, "subtype": ["windshield", "side-glass"]}),
    # ---------------------------------------------------------------- 실내·기타
    _q(89, "통풍 시트", "keyword", "easy", {"category": "interior", "subtype": "seat"}),
    _q(90, "인포테인먼트 디스플레이", "keyword", "easy", {"category": "interior", "subtype": "display"}),
    _q(91, "알루미늄 주조 휠", "mixed", "medium", {"category": "other", "subtype": "wheel"}),
)
