"""1세대 전기차 제원 표 (평가용 합성 코퍼스의 기반 데이터).

값은 공개 자료를 참고한 근사치이며 검증된 제원이 아니다. 검색 평가에 필요한 것은
"차종·용량·양극재·출력 같은 속성이 서로 일관되게 연결되어 있는가"이지 정확한 수치가 아니다.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BatteryOption:
    kwh: float
    cathode: str  # shared/types CathodeType
    cell_maker: str
    voltage: int


@dataclass(frozen=True)
class MotorOption:
    position: str  # rear | front
    power_kw: int
    torque_nm: int
    motor_type: str  # PMSM | IM | WRSM


@dataclass(frozen=True)
class Vehicle:
    key: str
    maker: str  # OEM 브랜드 키
    maker_ko: str
    maker_en: str
    names: tuple[str, ...]  # 표기 변형 (한글, 영문, 띄어쓰기)
    years: tuple[int, int]
    batteries: tuple[BatteryOption, ...]
    motors: tuple[MotorOption, ...]
    semiconductor: str  # SiC | IGBT
    voltage_class: int  # 400 | 800
    inverter_maker: str
    obc_kw: float
    inlet: str  # CCS1 | CCS2 | CHAdeMO | NACS
    body_material: str = "steel"  # 대표 차체 소재
    notes: tuple[str, ...] = field(default_factory=tuple)


VEHICLES: tuple[Vehicle, ...] = (
    Vehicle(
        "ioniq5", "hyundai", "현대", "Hyundai", ("아이오닉5", "아이오닉 5", "IONIQ 5"), (2021, 2023),
        (BatteryOption(58.0, "NCM Ni 80%", "SK온", 522), BatteryOption(72.6, "NCM Ni 80%", "SK온", 653),
         BatteryOption(77.4, "NCM Ni 80%", "SK온", 697)),
        (MotorOption("rear", 160, 350, "PMSM"), MotorOption("front", 70, 255, "PMSM")),
        "SiC", 800, "현대모비스", 10.9, "CCS1",
    ),
    Vehicle(
        "ev6", "kia", "기아", "Kia", ("EV6", "이브이식스"), (2021, 2023),
        (BatteryOption(58.0, "NCM Ni 80%", "SK온", 522), BatteryOption(77.4, "NCM Ni 80%", "SK온", 697)),
        (MotorOption("rear", 168, 350, "PMSM"), MotorOption("front", 74, 255, "PMSM")),
        "SiC", 800, "현대모비스", 10.9, "CCS1",
    ),
    Vehicle(
        "kona", "hyundai", "현대", "Hyundai", ("코나 일렉트릭", "코나EV", "Kona Electric"), (2018, 2021),
        (BatteryOption(39.2, "NCM Ni 60%", "LG화학", 327), BatteryOption(64.0, "NCM Ni 60%", "LG화학", 356)),
        (MotorOption("front", 150, 395, "PMSM"),),
        "IGBT", 400, "현대모비스", 7.2, "CCS1",
    ),
    Vehicle(
        "ioniq_ev", "hyundai", "현대", "Hyundai", ("아이오닉 일렉트릭", "아이오닉EV", "IONIQ Electric"), (2016, 2019),
        (BatteryOption(28.0, "NCM Ni 33%", "LG화학", 360),),
        (MotorOption("front", 88, 295, "PMSM"),),
        "IGBT", 400, "현대모비스", 6.6, "CCS1",
    ),
    Vehicle(
        "niro_ev", "kia", "기아", "Kia", ("니로 EV", "니로EV", "Niro EV"), (2019, 2021),
        (BatteryOption(64.0, "NCM Ni 60%", "SK이노베이션", 356),),
        (MotorOption("front", 150, 395, "PMSM"),),
        "IGBT", 400, "현대모비스", 7.2, "CCS1",
    ),
    Vehicle(
        "soul_ev", "kia", "기아", "Kia", ("쏘울 EV", "쏘울EV", "Soul EV"), (2014, 2018),
        (BatteryOption(27.0, "NCM Ni 33%", "SK이노베이션", 360), BatteryOption(30.0, "NCM Ni 33%", "SK이노베이션", 375)),
        (MotorOption("front", 81, 285, "PMSM"),),
        "IGBT", 400, "현대모비스", 6.6, "CHAdeMO",
    ),
    Vehicle(
        "sm3ze", "renault_samsung", "르노삼성", "Renault Samsung", ("SM3 Z.E.", "SM3 ZE", "에스엠쓰리 제트이"), (2013, 2019),
        (BatteryOption(22.0, "LMO", "LG화학", 360), BatteryOption(35.9, "NCM Ni 33%", "LG화학", 360)),
        (MotorOption("front", 70, 226, "WRSM"),),
        "IGBT", 400, "콘티넨탈", 6.6, "CCS1",
    ),
    Vehicle(
        "model_s", "tesla", "테슬라", "Tesla", ("모델S", "모델 S", "Model S"), (2013, 2016),
        (BatteryOption(60.0, "NCA", "파나소닉", 350), BatteryOption(85.0, "NCA", "파나소닉", 375)),
        (MotorOption("rear", 270, 440, "IM"),),
        "IGBT", 400, "테슬라", 10.0, "NACS", body_material="aluminum",
    ),
    Vehicle(
        "model3", "tesla", "테슬라", "Tesla", ("모델3", "모델 3", "Model 3"), (2019, 2022),
        (BatteryOption(55.0, "LFP", "CATL", 350), BatteryOption(75.0, "NCA", "파나소닉", 350)),
        (MotorOption("rear", 211, 420, "PMSM"), MotorOption("front", 147, 219, "IM")),
        "SiC", 400, "테슬라", 11.0, "CCS1",
    ),
    Vehicle(
        "model_y", "tesla", "테슬라", "Tesla", ("모델Y", "모델 Y", "Model Y"), (2021, 2023),
        (BatteryOption(60.0, "LFP", "CATL", 350), BatteryOption(75.0, "NCA", "LG에너지솔루션", 350)),
        (MotorOption("rear", 220, 440, "PMSM"),),
        "SiC", 400, "테슬라", 11.0, "CCS1",
    ),
    Vehicle(
        "leaf_ze0", "nissan", "닛산", "Nissan", ("리프", "리프 1세대", "Leaf"), (2011, 2015),
        (BatteryOption(24.0, "LMO", "AESC", 360),),
        (MotorOption("front", 80, 254, "PMSM"),),
        "IGBT", 400, "히타치", 3.3, "CHAdeMO",
    ),
    Vehicle(
        "leaf_ze1", "nissan", "닛산", "Nissan", ("리프 2세대", "뉴 리프", "Leaf ZE1"), (2018, 2021),
        (BatteryOption(40.0, "NCM Ni 60%", "AESC", 350), BatteryOption(62.0, "NCM Ni 60%", "AESC", 350)),
        (MotorOption("front", 110, 320, "PMSM"),),
        "IGBT", 400, "히타치", 6.6, "CHAdeMO",
    ),
    Vehicle(
        "bmw_i3", "bmw", "BMW", "BMW", ("i3", "BMW i3", "아이쓰리"), (2014, 2019),
        (BatteryOption(22.0, "NCM Ni 33%", "삼성SDI", 360), BatteryOption(33.0, "NCM Ni 33%", "삼성SDI", 353),
         BatteryOption(42.0, "NCM Ni 60%", "삼성SDI", 353)),
        (MotorOption("rear", 125, 250, "PMSM"),),
        "IGBT", 400, "BMW", 7.4, "CCS1", body_material="cfrp",
    ),
    Vehicle(
        "bolt", "chevrolet", "쉐보레", "Chevrolet", ("볼트 EV", "볼트EV", "Bolt EV"), (2017, 2021),
        (BatteryOption(60.0, "NCM Ni 60%", "LG화학", 350), BatteryOption(66.0, "NCM Ni 60%", "LG화학", 350)),
        (MotorOption("front", 150, 360, "PMSM"),),
        "IGBT", 400, "LG전자", 7.2, "CCS1",
    ),
    Vehicle(
        # '볼트'는 Bolt EV와 한글 표기가 같다 (동음이의어 평가용)
        "volt", "chevrolet", "쉐보레", "Chevrolet", ("볼트 PHEV", "볼트(Volt)", "Volt"), (2011, 2015),
        (BatteryOption(16.0, "LMO", "LG화학", 360),),
        (MotorOption("front", 111, 370, "PMSM"),),
        "IGBT", 400, "LG전자", 3.3, "CCS1",
    ),
    Vehicle(
        "zoe", "renault", "르노", "Renault", ("조에", "ZOE", "르노 조에"), (2020, 2022),
        (BatteryOption(52.0, "NCM Ni 60%", "LG화학", 400),),
        (MotorOption("front", 100, 245, "WRSM"),),
        "IGBT", 400, "콘티넨탈", 22.0, "CCS2",
    ),
    Vehicle(
        "egolf", "vw", "폭스바겐", "Volkswagen", ("e-골프", "이골프", "e-Golf"), (2017, 2020),
        (BatteryOption(35.8, "NCM Ni 33%", "삼성SDI", 323),),
        (MotorOption("front", 100, 290, "PMSM"),),
        "IGBT", 400, "보쉬", 7.2, "CCS2",
    ),
    Vehicle(
        "id4", "vw", "폭스바겐", "Volkswagen", ("ID.4", "아이디포", "ID4"), (2021, 2023),
        (BatteryOption(77.0, "NCM Ni 60%", "LG에너지솔루션", 400),),
        (MotorOption("rear", 150, 310, "PMSM"),),
        "IGBT", 400, "보쉬", 11.0, "CCS1",
    ),
    Vehicle(
        "etron", "audi", "아우디", "Audi", ("e-트론", "이트론", "e-tron"), (2019, 2021),
        (BatteryOption(95.0, "NCM Ni 60%", "LG화학", 396),),
        (MotorOption("front", 125, 247, "IM"), MotorOption("rear", 140, 314, "IM")),
        "IGBT", 400, "히타치", 11.0, "CCS1", body_material="aluminum",
    ),
    Vehicle(
        "taycan", "porsche", "포르쉐", "Porsche", ("타이칸", "Taycan", "포르쉐 타이칸"), (2020, 2022),
        (BatteryOption(93.4, "NCM Ni 60%", "LG화학", 723),),
        (MotorOption("rear", 335, 550, "PMSM"), MotorOption("front", 175, 300, "PMSM")),
        "IGBT", 800, "보쉬", 11.0, "CCS1", body_material="aluminum",
    ),
    Vehicle(
        "atto3", "byd", "BYD", "BYD", ("아토3", "아토 3", "Atto 3"), (2023, 2023),
        (BatteryOption(60.5, "LFP", "BYD", 403),),
        (MotorOption("front", 150, 310, "PMSM"),),
        "SiC", 400, "BYD", 7.0, "CCS1",
    ),
    Vehicle(
        "imiev", "mitsubishi", "미쓰비시", "Mitsubishi", ("아이미브", "i-MiEV", "아이 미브"), (2010, 2015),
        (BatteryOption(16.0, "LMO", "LEJ", 330),),
        (MotorOption("rear", 47, 180, "PMSM"),),
        "IGBT", 400, "미쓰비시전기", 3.3, "CHAdeMO",
    ),
)

VEHICLES_BY_KEY = {v.key: v for v in VEHICLES}

# 재질 물성 (근사치). recyclability는 재활용률(%)
MATERIALS: dict[str, dict] = {
    "6061": {"material": "aluminum", "primary": "알루미늄 6061-T6", "tensile": 310, "yield": 276, "elongation": 12,
             "density": 2.70, "recyclability": 95, "percentage": {"Al": 97.9, "Mg": 1.0, "Si": 0.6}},
    "6016": {"material": "aluminum", "primary": "알루미늄 6016-T4", "tensile": 235, "yield": 125, "elongation": 23,
             "density": 2.70, "recyclability": 95, "percentage": {"Al": 98.3, "Si": 1.2, "Mg": 0.4}},
    "5754": {"material": "aluminum", "primary": "알루미늄 5754-H22", "tensile": 245, "yield": 160, "elongation": 17,
             "density": 2.67, "recyclability": 95, "percentage": {"Al": 96.8, "Mg": 3.0}},
    "7075": {"material": "aluminum", "primary": "알루미늄 7075-T6", "tensile": 572, "yield": 503, "elongation": 11,
             "density": 2.81, "recyclability": 90, "percentage": {"Al": 90.0, "Zn": 5.6, "Mg": 2.5, "Cu": 1.6}},
    "7003": {"material": "aluminum", "primary": "알루미늄 7003-T6", "tensile": 350, "yield": 290, "elongation": 12,
             "density": 2.78, "recyclability": 90, "percentage": {"Al": 93.0, "Zn": 5.8, "Mg": 0.8}},
    "6082": {"material": "aluminum", "primary": "알루미늄 6082-T6", "tensile": 310, "yield": 260, "elongation": 10,
             "density": 2.70, "recyclability": 95, "percentage": {"Al": 97.0, "Si": 1.0, "Mg": 0.9, "Mn": 0.7}},
    "6063": {"material": "aluminum", "primary": "알루미늄 6063-T6", "tensile": 241, "yield": 214, "elongation": 12,
             "density": 2.69, "recyclability": 95, "percentage": {"Al": 98.9, "Mg": 0.7, "Si": 0.4}},
    "A356": {"material": "aluminum", "primary": "알루미늄 주조 A356-T6", "tensile": 262, "yield": 186, "elongation": 5,
             "density": 2.68, "recyclability": 90, "percentage": {"Al": 92.0, "Si": 7.0, "Mg": 0.35}},
    "DP980": {"material": "steel", "primary": "초고장력강 DP980", "tensile": 980, "yield": 650, "elongation": 10,
              "density": 7.85, "recyclability": 98, "percentage": {"Fe": 97.5, "Mn": 2.0}},
    "HPF1500": {"material": "steel", "primary": "핫스탬핑강 22MnB5 (1500MPa)", "tensile": 1500, "yield": 1100,
                "elongation": 6, "density": 7.85, "recyclability": 98, "percentage": {"Fe": 98.0, "Mn": 1.3, "B": 0.003}},
    "SPCC": {"material": "steel", "primary": "냉간압연강판 SPCC", "tensile": 270, "yield": 180, "elongation": 38,
             "density": 7.85, "recyclability": 98, "percentage": {"Fe": 99.5}},
    "CFRP": {"material": "cfrp", "primary": "탄소섬유강화플라스틱 CFRP", "tensile": 600, "yield": 600, "elongation": 1.5,
             "density": 1.55, "recyclability": 30, "percentage": {"C": 60.0, "Epoxy": 40.0}},
}
