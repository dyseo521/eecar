"""평가용 부품 코퍼스 생성기.

시드를 고정해 같은 입력이면 항상 같은 코퍼스를 만든다. 각 레코드는
- part:  검색 시스템이 보는 문서 (shared/types의 Part 형태)
- attrs: 정답 판정에만 쓰는 구조화 속성 (검색 시스템에는 전달하지 않음)
으로 이루어진다.

차종별 핵심 부품(배터리 옵션, 모터, 인버터)은 최소 1개씩 보장하고 나머지는 무작위로 채운다.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any

from .vehicles import MATERIALS, VEHICLES, Vehicle

SEED = 20261105
REFERENCE_YEAR = 2026
CREATED_AT_BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)

TARGET_COUNTS = {
    "battery": 70,
    "motor": 45,
    "inverter": 35,
    "charger": 25,
    "electronics": 25,
    "body-chassis-frame": 25,
    "body-panel": 30,
    "body-door": 20,
    "body-window": 10,
    "interior": 10,
    "other": 5,
}

ID_PREFIX = {
    "battery": "bat",
    "motor": "mot",
    "inverter": "inv",
    "charger": "chg",
    "electronics": "elc",
    "body-chassis-frame": "frm",
    "body-panel": "pnl",
    "body-door": "dor",
    "body-window": "win",
    "interior": "int",
    "other": "oth",
}

SUBTYPE_NAMES: dict[str, list[str]] = {
    "battery-tray": ["배터리 트레이", "배터리 하우징", "배터리 케이스 프레임"],
    "subframe": ["프론트 서브프레임", "리어 서브프레임"],
    "front-crash-beam": ["프론트 크래시 빔", "프론트 범퍼 빔", "범퍼 보강재"],
    "side-sill": ["사이드 실", "사이드 실 보강재"],
    "life-module": ["CFRP 라이프 모듈"],
    "hood": ["후드", "보닛"],
    "trunk-lid": ["트렁크 리드", "테일게이트"],
    "fender": ["프론트 펜더", "펜더 패널"],
    "roof-panel": ["루프 패널"],
    "door-assembly": ["프론트 도어 어셈블리", "리어 도어 어셈블리", "도어 ASSY"],
    "door-impact-beam": ["도어 임팩트 빔", "사이드 임팩트 빔"],
    "windshield": ["앞유리(윈드실드)", "프론트 윈드실드"],
    "panoramic-roof": ["파노라마 글라스 루프", "파노라믹 선루프 유리"],
    "side-glass": ["도어 사이드 글라스", "측면 유리"],
    "seat": ["운전석 전동 시트", "조수석 시트"],
    "dashboard": ["콕핏 모듈(대시보드)", "크래시패드 어셈블리"],
    "display": ["센터 디스플레이", "인포테인먼트 디스플레이"],
    "wheel": ["알로이 휠"],
}

REUSE_APPLICATIONS = ["ESS", "전동킥보드", "전기 지게차", "UPS", "캠핑카 전원"]


class CorpusBuilder:
    def __init__(self, seed: int = SEED) -> None:
        self.rng = random.Random(seed)
        self.records: list[dict[str, Any]] = []
        self.counters: dict[str, int] = {c: 0 for c in TARGET_COUNTS}

    # ------------------------------------------------------------------ helpers

    def _next_id(self, category: str) -> str:
        self.counters[category] += 1
        return f"{ID_PREFIX[category]}-{self.counters[category]:03d}"

    def _year(self, v: Vehicle) -> int:
        return self.rng.randint(v.years[0], v.years[1])

    def _vname(self, v: Vehicle) -> str:
        return self.rng.choice(v.names)

    def _add(self, category: str, part: dict[str, Any], attrs: dict[str, Any]) -> None:
        index = len(self.records)
        part_id = self._next_id(category)
        created = (CREATED_AT_BASE + timedelta(hours=index)).isoformat().replace("+00:00", "Z")
        full_part = {
            "partId": part_id,
            "category": category,
            "condition": "used",
            "quantity": self.rng.randint(1, 4),
            "sellerId": f"seller-{self.rng.randint(1, 12):02d}",
            "images": [],
            "createdAt": created,
            "updatedAt": created,
            **part,
        }
        self.records.append({
            "part": full_part,
            "attrs": {"category": category, "part_maker": full_part["manufacturer"], **attrs},
        })

    def _material_spec(self, alloy: str, weight: float) -> dict[str, Any]:
        m = MATERIALS[alloy]
        return {
            "materialComposition": {
                "primary": m["primary"],
                "percentage": m["percentage"],
                "tensileStrengthMPa": m["tensile"],
                "yieldStrengthMPa": m["yield"],
                "elongationPercent": m["elongation"],
                "density": m["density"],
                "alloyNumber": alloy,
                "recyclability": m["recyclability"],
            },
            "weight": weight,
        }

    # ------------------------------------------------------------------ battery

    def battery(self, v: Vehicle, option_index: int | None = None) -> None:
        rng = self.rng
        opt = v.batteries[option_index] if option_index is not None else rng.choice(v.batteries)
        year = self._year(v)
        age = REFERENCE_YEAR - year
        soh = round(min(99, max(55, 100 - age * rng.uniform(1.8, 4.0) + rng.gauss(0, 3))))
        cycles = int(age * rng.uniform(70, 140)) + rng.randint(10, 60)
        is_pack = rng.random() < 0.72
        if is_pack:
            kwh, voltage, form = opt.kwh, opt.voltage, "팩"
            price = int(opt.kwh * soh / 100 * rng.uniform(90_000, 140_000) / 10_000) * 10_000
        else:
            kwh = round(rng.uniform(1.8, 5.4), 1)
            voltage = rng.choice([44, 58, 60])
            form = "모듈"
            price = int(kwh * soh / 100 * rng.uniform(110_000, 160_000) / 10_000) * 10_000

        if soh >= 85:
            applications = ["EV 재사용", "ESS"]
        elif soh >= 70:
            applications = ["ESS"] + rng.sample(REUSE_APPLICATIONS[1:], rng.randint(1, 2))
        else:
            applications = ["습식 제련", "직접 재활용"]
        recommended = "reuse" if soh >= 70 else "recycle"
        vname = self._vname(v)
        use_sentence = "재사용이 가능합니다" if soh >= 70 else "재활용 공정 투입을 권장합니다"
        app_text = ", ".join(applications)
        templates = [
            f"{year}년식 {vname}에서 탈거한 {kwh}kWh 배터리 {form}입니다. {opt.cell_maker} 셀을 사용했고 양극재는 "
            f"{opt.cathode}입니다. SOH {soh}%, 충방전 {cycles}회 이력이 있습니다.",
            f"{v.maker_ko} {vname} 순정 배터리 {form}. 잔존용량(SOH) {soh}%로 {use_sentence}. 정격전압 {voltage}V.",
            f"폐차 차량에서 회수한 {vname}용 배터리 {form}으로 {opt.cathode} 계열 셀이 들어 있습니다. 진단 결과 SOH "
            f"{soh}%이며 {app_text} 용도로 활용할 수 있습니다.",
        ]
        self._add(
            "battery",
            {
                "name": f"{v.maker_ko} {vname} {kwh}kWh 배터리 {form}",
                "manufacturer": opt.cell_maker,
                "model": f"{v.names[-1]} {kwh}kWh",
                "year": year,
                "condition": "for-parts" if soh < 65 else "used",
                "price": max(price, 300_000),
                "description": rng.choice(templates),
                "specifications": {
                    "electricalProps": {"voltage": voltage, "capacity": round(kwh * 1000 / voltage, 1)},
                    "weight": round(kwh * (6.5 if is_pack else 7.0), 1),
                },
                "batteryHealth": {
                    "soh": soh,
                    "cycleCount": cycles,
                    "estimatedMileageKm": int(kwh * soh / 100 * 6.0) if is_pack else None,
                    "cathodeType": opt.cathode,
                    "manufacturer": opt.cell_maker,
                    "model": f"{v.names[-1]} {kwh}kWh",
                    "year": year,
                    "recommendedUse": recommended,
                    "suitableApplications": applications,
                },
            },
            {
                "subtype": "battery-pack" if is_pack else "battery-module",
                "vehicle": v.key,
                "maker": v.maker,
                "kwh": kwh,
                "pack_kwh": opt.kwh,
                "cathode": opt.cathode,
                "cell_maker": opt.cell_maker,
                "soh": soh,
                "applications": applications,
                "recommended_use": recommended,
                "voltage_class": v.voltage_class,
                "year": year,
            },
        )

    # ------------------------------------------------------------------ motor

    def motor(self, v: Vehicle, motor_index: int | None = None) -> None:
        rng = self.rng
        m = v.motors[motor_index] if motor_index is not None else rng.choice(v.motors)
        year = self._year(v)
        vname = self._vname(v)
        side = "후륜" if m.position == "rear" else "전륜"
        type_text = {
            "PMSM": rng.choice([
                "영구자석 동기모터(PMSM)로 네오디뮴(NdFeB) 자석이 들어 있어 희토류 회수 대상입니다.",
                "PMSM 타입.",
                "매입형 영구자석(IPM) 모터로 고효율 운전이 가능합니다.",
            ]),
            "IM": rng.choice([
                "유도전동기(인덕션 모터)로 희토류 자석을 사용하지 않습니다.",
                "3상 AC 인덕션 모터.",
            ]),
            "WRSM": rng.choice([
                "권선형 동기모터(WRSM)로 영구자석이 없어 희토류를 쓰지 않습니다.",
                "회전자 권선형 동기 전동기.",
            ]),
        }[m.motor_type]
        secondary = ["NdFeB 영구자석"] if m.motor_type == "PMSM" else ["구리 회전자 바" if m.motor_type == "IM" else "구리 회전자 권선"]
        self._add(
            "motor",
            {
                "name": f"{v.maker_ko} {vname} {side} 구동모터 {m.power_kw}kW",
                "manufacturer": v.maker_ko,
                "model": f"{v.names[-1]} {m.position} motor",
                "year": year,
                "condition": rng.choice(["used", "used", "refurbished"]),
                "price": int(m.power_kw * rng.uniform(9_000, 16_000) / 10_000) * 10_000,
                "description": f"{year}년식 {vname} {side} 구동모터입니다. 최고출력 {m.power_kw}kW, 최대토크 "
                f"{m.torque_nm}Nm. {type_text}",
                "specifications": {
                    "electricalProps": {"voltage": 350 if v.voltage_class == 400 else 697, "power": m.power_kw},
                    "materialComposition": {"primary": "전기강판·구리 권선", "secondary": secondary, "recyclability": 85},
                    "weight": round(m.power_kw * rng.uniform(0.25, 0.4), 1),
                },
            },
            {
                "subtype": f"motor-{m.position}",
                "vehicle": v.key,
                "maker": v.maker,
                "power_kw": m.power_kw,
                "torque_nm": m.torque_nm,
                "motor_type": m.motor_type,
                "rare_earth": m.motor_type == "PMSM",
                "voltage_class": v.voltage_class,
                "year": year,
            },
        )

    # ------------------------------------------------------------------ inverter

    def inverter(self, v: Vehicle) -> None:
        rng = self.rng
        year = self._year(v)
        vname = self._vname(v)
        power = int(max(m.power_kw for m in v.motors) * 1.1)
        semi_text = {
            "SiC": rng.choice(["실리콘카바이드(SiC) 전력반도체", "SiC MOSFET 파워모듈", "SiC 소자"]),
            "IGBT": rng.choice(["IGBT 파워모듈", "실리콘 IGBT 소자", "IGBT"]),
        }[v.semiconductor]
        name_suffix = rng.choice([f" ({v.semiconductor}, {v.voltage_class}V)", f" {v.voltage_class}V", ""])
        self._add(
            "inverter",
            {
                "name": f"{vname} 구동 인버터{name_suffix}",
                "manufacturer": v.inverter_maker,
                "model": f"{v.names[-1]} traction inverter",
                "year": year,
                "condition": rng.choice(["used", "used", "refurbished"]),
                "price": int(power * rng.uniform(5_000, 9_000) / 10_000) * 10_000,
                "description": f"{v.inverter_maker} 제조 {semi_text} 인버터로 {v.voltage_class}V 시스템용입니다. "
                f"최대 출력 {power}kW, {year}년식 {vname}에서 탈거.",
                "specifications": {
                    "electricalProps": {"voltage": v.voltage_class, "power": power},
                    "weight": round(rng.uniform(6, 14), 1),
                },
            },
            {
                "subtype": "inverter",
                "vehicle": v.key,
                "maker": v.maker,
                "power_kw": power,
                "semiconductor": v.semiconductor,
                "voltage_class": v.voltage_class,
                "year": year,
            },
        )

    # ------------------------------------------------------------------ charger

    def obc(self, v: Vehicle) -> None:
        year = self._year(v)
        vname = self._vname(v)
        self._add(
            "charger",
            {
                "name": f"{vname} 차량 탑재형 충전기(OBC) {v.obc_kw}kW",
                "manufacturer": v.maker_ko,
                "model": f"{v.names[-1]} OBC",
                "year": year,
                "price": int(v.obc_kw * self.rng.uniform(40_000, 70_000) / 10_000) * 10_000,
                "description": f"{vname} 완속 충전용 온보드 차저(OBC)입니다. 정격 {v.obc_kw}kW, AC 입력.",
                "specifications": {"electricalProps": {"voltage": 220, "power": v.obc_kw}},
            },
            {"subtype": "obc", "vehicle": v.key, "maker": v.maker, "power_kw": v.obc_kw, "year": year},
        )

    def inlet(self, v: Vehicle) -> None:
        year = self._year(v)
        vname = self._vname(v)
        dc = "급속(DC) 충전 지원" if v.inlet != "NACS" else "테슬라 전용 커넥터"
        self._add(
            "charger",
            {
                "name": f"{vname} 충전 인렛 ({v.inlet})",
                "manufacturer": v.maker_ko,
                "model": f"{v.names[-1]} charging inlet {v.inlet}",
                "year": year,
                "price": self.rng.randint(8, 25) * 10_000,
                "description": f"{vname} 충전구(인렛) 어셈블리. 규격 {v.inlet}, {dc}.",
            },
            {"subtype": "charging-inlet", "vehicle": v.key, "maker": v.maker, "connector": v.inlet, "year": year},
        )

    def portable_charger(self) -> None:
        rng = self.rng
        maker = rng.choice(["대영채비", "LS일렉트릭", "시그넷이브이"])
        kw = rng.choice([2.2, 3.0, 3.3])
        self._add(
            "charger",
            {
                "name": f"{maker} 휴대용 완속 충전기(ICCB) {kw}kW",
                "manufacturer": maker,
                "model": f"ICCB {kw}kW",
                "year": rng.randint(2018, 2023),
                "condition": rng.choice(["used", "new"]),
                "price": rng.randint(15, 35) * 10_000,
                "description": f"가정용 220V 콘센트에 꽂아 쓰는 휴대용 충전 케이블(ICCB)입니다. 출력 {kw}kW, 5핀 커넥터.",
                "specifications": {"electricalProps": {"voltage": 220, "power": kw}},
            },
            {"subtype": "portable-charger", "vehicle": None, "maker": None, "power_kw": kw},
        )

    # ------------------------------------------------------------------ electronics

    ELECTRONICS = {
        "bms": ("배터리 관리 시스템(BMS) 마스터 보드", "셀 전압·온도를 모니터링하고 SOC/SOH를 추정하는 BMS 제어기입니다."),
        "ldc": ("저전압 DC-DC 컨버터(LDC)", "고전압 배터리 전력을 12V로 변환하는 LDC입니다. 출력 1.8kW."),
        "vcu": ("차량 제어기(VCU)", "구동·회생제동·충전 모드를 통합 제어하는 전기차 차량 제어 유닛입니다."),
        "e-compressor": ("전동식 에어컨 컴프레서", "고전압으로 구동되는 전동 컴프레서로 배터리 열관리와 냉방에 사용됩니다."),
        "ptc-heater": ("고전압 PTC 히터", "실내 난방과 배터리 예열용 고전압 PTC 히터입니다."),
        "heat-pump": ("히트펌프 모듈", "폐열을 회수해 겨울철 주행거리 감소를 줄이는 히트펌프 시스템 모듈입니다."),
        "junction-box": ("고전압 정션 박스", "배터리와 인버터·충전기 사이의 고전압 배전과 릴레이를 담당하는 정션 박스입니다."),
    }

    def electronics(self, v: Vehicle, subtype: str) -> None:
        rng = self.rng
        title, body = self.ELECTRONICS[subtype]
        year = self._year(v)
        vname = self._vname(v)
        maker = "한온시스템" if subtype in ("e-compressor", "heat-pump") and v.maker in ("hyundai", "kia") else v.maker_ko
        self._add(
            "electronics",
            {
                "name": f"{vname} {title}",
                "manufacturer": maker,
                "model": f"{v.names[-1]} {subtype}",
                "year": year,
                "price": rng.randint(15, 90) * 10_000,
                "description": f"{year}년식 {vname}에서 탈거. {body}",
            },
            {"subtype": subtype, "vehicle": v.key, "maker": v.maker, "year": year},
        )

    # ------------------------------------------------------------------ body

    def body(self, category: str, subtype: str, v: Vehicle | None, alloy: str | None, extra: str = "") -> None:
        rng = self.rng
        name = rng.choice(SUBTYPE_NAMES[subtype])
        year = self._year(v) if v else rng.randint(2015, 2023)
        vname = self._vname(v) if v else ""
        material = MATERIALS[alloy]["material"] if alloy else "glass" if category == "body-window" else "mixed"
        weight = round(rng.uniform(4, 40), 1)
        spec = self._material_spec(alloy, weight) if alloy else {"weight": weight}
        material_text = MATERIALS[alloy]["primary"] if alloy else ""
        desc_parts = [f"{year}년식 {vname} {name}입니다." if v else f"{name}입니다."]
        if alloy:
            desc_parts.append(rng.choice([
                f"소재는 {material_text}이며 인장강도 {MATERIALS[alloy]['tensile']}MPa입니다.",
                f"{material_text} 사용, 재활용률 {MATERIALS[alloy]['recyclability']}%.",
                f"{material_text} 소재.",
            ]))
        if extra:
            desc_parts.append(extra)
        self._add(
            category,
            {
                "name": f"{vname} {name}".strip() if v else name,
                "manufacturer": v.maker_ko if v else rng.choice(["현대모비스", "KCC글라스", "현대트랜시스"]),
                "model": f"{v.names[-1]} {subtype}" if v else subtype,
                "year": year,
                "price": rng.randint(10, 200) * 10_000,
                "description": " ".join(desc_parts),
                "specifications": spec,
            },
            {
                "subtype": subtype,
                "vehicle": v.key if v else None,
                "maker": v.maker if v else None,
                "material": material,
                "alloy": alloy,
                "tensile": MATERIALS[alloy]["tensile"] if alloy else None,
                "year": year,
            },
        )


def _body_alloy(rng: random.Random, v: Vehicle, subtype: str) -> str:
    aluminum_body = v.body_material == "aluminum"
    if subtype == "battery-tray":
        return rng.choice(["6063", "6082"])
    if subtype == "subframe":
        return "6082" if aluminum_body else rng.choice(["SPCC", "DP980"])
    if subtype == "front-crash-beam":
        return rng.choice(["7003", "7003", "DP980"])
    if subtype == "side-sill":
        return "6082" if aluminum_body else "HPF1500"
    if subtype in ("hood", "trunk-lid", "fender"):
        if v.body_material == "cfrp":
            return "CFRP" if subtype == "trunk-lid" else "6016"
        return rng.choice(["6016", "6061"]) if aluminum_body or rng.random() < 0.35 else "SPCC"
    if subtype == "roof-panel":
        return "CFRP" if v.body_material == "cfrp" else ("6016" if aluminum_body else "SPCC")
    if subtype == "door-assembly":
        return rng.choice(["6016", "5754"]) if aluminum_body else "SPCC"
    if subtype == "door-impact-beam":
        return rng.choice(["HPF1500", "7075"])
    raise ValueError(subtype)


def build_corpus(seed: int = SEED) -> list[dict[str, Any]]:
    b = CorpusBuilder(seed)
    rng = b.rng
    vehicles = list(VEHICLES)

    # 배터리: 차종 x 배터리 옵션마다 1개 보장 후 무작위로 채움
    for v in vehicles:
        for i in range(len(v.batteries)):
            b.battery(v, i)
    while b.counters["battery"] < TARGET_COUNTS["battery"]:
        b.battery(rng.choice(vehicles))

    # 모터: 차종 x 모터마다 1개 보장
    for v in vehicles:
        for i in range(len(v.motors)):
            b.motor(v, i)
    while b.counters["motor"] < TARGET_COUNTS["motor"]:
        b.motor(rng.choice(vehicles))

    # 인버터: 차종마다 1개 보장
    for v in vehicles:
        b.inverter(v)
    while b.counters["inverter"] < TARGET_COUNTS["inverter"]:
        b.inverter(rng.choice(vehicles))

    # 충전: OBC, 인렛, 휴대용 충전기
    for v in rng.sample(vehicles, 12):
        b.obc(v)
    inlet_vehicles = [v for v in vehicles if v.inlet in ("CHAdeMO", "CCS2", "NACS")]
    for v in inlet_vehicles:
        b.inlet(v)
    while b.counters["charger"] < TARGET_COUNTS["charger"] - 3:
        b.inlet(rng.choice(vehicles))
    for _ in range(3):
        b.portable_charger()

    # 전장
    subtypes = list(CorpusBuilder.ELECTRONICS)
    for subtype in subtypes:
        b.electronics(rng.choice(vehicles), subtype)
    while b.counters["electronics"] < TARGET_COUNTS["electronics"]:
        b.electronics(rng.choice(vehicles), rng.choice(subtypes))

    # 차체 프레임
    i3 = next(v for v in vehicles if v.key == "bmw_i3")
    b.body("body-chassis-frame", "life-module", i3, "CFRP", "탄소섬유 승객실 구조체로 경량화를 위해 사용되었습니다.")
    frame_subtypes = ["battery-tray", "subframe", "front-crash-beam", "side-sill"]
    while b.counters["body-chassis-frame"] < TARGET_COUNTS["body-chassis-frame"]:
        v = rng.choice(vehicles)
        subtype = rng.choice(frame_subtypes)
        b.body("body-chassis-frame", subtype, v, _body_alloy(rng, v, subtype))

    # 외판
    for v in (vv for vv in vehicles if vv.body_material != "steel"):
        b.body("body-panel", "hood", v, _body_alloy(rng, v, "hood"))
    while b.counters["body-panel"] < TARGET_COUNTS["body-panel"]:
        v = rng.choice(vehicles)
        subtype = rng.choice(["hood", "trunk-lid", "fender", "roof-panel"])
        b.body("body-panel", subtype, v, _body_alloy(rng, v, subtype))

    # 도어
    while b.counters["body-door"] < TARGET_COUNTS["body-door"]:
        v = rng.choice(vehicles)
        subtype = rng.choice(["door-assembly", "door-assembly", "door-impact-beam"])
        b.body("body-door", subtype, v, _body_alloy(rng, v, subtype))

    # 유리
    glass_extra = {
        "windshield": "PVB 접합유리, 차음 필름 적용. HUD 대응 쐐기형 중간막.",
        "panoramic-roof": "UV·적외선 차단 코팅된 강화 접합유리.",
        "side-glass": "강화유리, 이중접합 차음 사양.",
    }
    while b.counters["body-window"] < TARGET_COUNTS["body-window"]:
        v = rng.choice(vehicles)
        subtype = rng.choice(list(glass_extra))
        b.body("body-window", subtype, v, None, glass_extra[subtype])

    # 실내
    interior_extra = {
        "seat": "열선·통풍 기능이 있는 전동 시트, 메모리 기능 포함.",
        "dashboard": "크래시패드와 에어벤트, 계기판 하우징이 포함된 콕핏 모듈.",
        "display": "터치 방식 인포테인먼트 디스플레이, 내비게이션 포함.",
    }
    while b.counters["interior"] < TARGET_COUNTS["interior"]:
        v = rng.choice(vehicles)
        subtype = rng.choice(list(interior_extra))
        b.body("interior", subtype, v, None, interior_extra[subtype])

    # 기타: 휠
    while b.counters["other"] < TARGET_COUNTS["other"]:
        v = rng.choice(vehicles)
        inch = rng.choice([17, 18, 19, 20])
        b.body("other", "wheel", v, "A356", f"{inch}인치 주조 알루미늄 휠.")

    return b.records
