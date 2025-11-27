export const mockParts = [
  {
    id: 'battery-001',
    name: '현대 아이오닉5 배터리 팩',
    image: '/image/batterypack_1.jpg',
    images: ["/image/batterypack_1.jpg"],
    manufacturer: '현대자동차',
    model: '아이오닉5',
    price: 4500000,
    quantity: 2,
    category: '배터리',
    year: 2022,
    description: '2022년식 아이오닉5 배터리 팩, 주행거리 30,000km',
    specifications: {},
    seller: {
      company: '현대자동차 Parts Korea',
      contact: 'sales@현대자동차.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-002',
    name: '테슬라 Model 3 배터리 모듈',
    image: '/image/batterypack_1.jpg',
    images: ["/image/batterypack_1.jpg"],
    manufacturer: 'Tesla',
    model: 'Model 3',
    price: 1800000,
    quantity: 5,
    category: '배터리',
    year: 2020,
    description: '2020년식 Model 3 배터리 모듈, SOH 75%',
    specifications: {},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-003',
    name: '기아 EV6 배터리 팩',
    image: '/image/batterypack_1.jpg',
    images: ["/image/batterypack_1.jpg"],
    manufacturer: '기아',
    model: 'EV6',
    price: 5200000,
    quantity: 1,
    category: '배터리',
    year: 2023,
    description: '2023년식 EV6 배터리 팩, 재생품',
    specifications: {},
    seller: {
      company: '기아 Parts Korea',
      contact: 'sales@기아.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-chassis-001',
    name: 'BMW i3 카본 프레임',
    image: '/image/car_body_1.jpg',
    images: ["/image/car_body_1.jpg"],
    manufacturer: 'BMW',
    model: 'i3',
    price: 1200000,
    quantity: 1,
    category: '차체',
    year: 2019,
    description: 'BMW i3 CFRP 카본 섀시 프레임',
    specifications: {
      "materialComposition": {
            "primary": "CFRP",
            "secondary": [
                  "Epoxy Resin",
                  "Carbon Fiber"
            ],
            "percentage": {
                  "Carbon Fiber": 60,
                  "Epoxy": 40
            },
            "tensileStrengthMPa": 3500,
            "yieldStrengthMPa": 3000,
            "elasticModulusGPa": 230,
            "elongationPercent": 1.5,
            "density": 1.6,
            "recyclability": 40
      },
      "dimensions": {
            "length": 2500,
            "width": 1500,
            "height": 400,
            "unit": "mm"
      },
      "weight": 45
},
    seller: {
      company: 'BMW Parts Korea',
      contact: 'sales@bmw.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-panel-001',
    name: '테슬라 Model S 알루미늄 후드',
    image: '/image/car_body_2.jpg',
    images: ["/image/car_body_2.jpg"],
    manufacturer: 'Tesla',
    model: 'Model S',
    price: 450000,
    quantity: 3,
    category: '차체',
    year: 2021,
    description: '알루미늄 6061 합금 후드 패널',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 6061"
            ],
            "percentage": {
                  "Al": 97.9,
                  "Mg": 1,
                  "Si": 0.6,
                  "Cu": 0.28,
                  "Cr": 0.2
            },
            "tensileStrengthMPa": 310,
            "yieldStrengthMPa": 276,
            "elasticModulusGPa": 68.9,
            "elongationPercent": 12,
            "hardness": "HB 95",
            "density": 2.7,
            "meltingPoint": 582,
            "alloyNumber": "6061",
            "recyclability": 95
      },
      "dimensions": {
            "length": 1400,
            "width": 1200,
            "height": 50,
            "unit": "mm"
      },
      "weight": 15
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-door-001',
    name: '아우디 e-tron 알루미늄 도어',
    image: '/image/car_body_3.png',
    images: ["/image/car_body_3.png"],
    manufacturer: 'Audi',
    model: 'e-tron',
    price: 680000,
    quantity: 2,
    category: '차체',
    year: 2020,
    description: '알루미늄 5754 합금 도어 패널',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 5754"
            ],
            "percentage": {
                  "Al": 95.4,
                  "Mg": 3.1,
                  "Mn": 0.5,
                  "Cr": 0.3
            },
            "tensileStrengthMPa": 220,
            "yieldStrengthMPa": 80,
            "elasticModulusGPa": 70,
            "elongationPercent": 27,
            "hardness": "HB 62",
            "density": 2.66,
            "meltingPoint": 607,
            "alloyNumber": "5754",
            "recyclability": 93
      },
      "dimensions": {
            "length": 1100,
            "width": 800,
            "height": 60,
            "unit": "mm"
      },
      "weight": 22
},
    seller: {
      company: 'Audi Parts Korea',
      contact: 'sales@audi.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-panel-002',
    name: '포르쉐 Taycan 알루미늄 루프',
    image: '/image/car_body_1.jpg',
    images: ["/image/car_body_1.jpg"],
    manufacturer: 'Porsche',
    model: 'Taycan',
    price: 950000,
    quantity: 1,
    category: '차체',
    year: 2022,
    description: '알루미늄 7075 고강도 루프 패널',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 7075"
            ],
            "percentage": {
                  "Al": 90,
                  "Zn": 5.6,
                  "Mg": 2.5,
                  "Cu": 1.6,
                  "Cr": 0.23
            },
            "tensileStrengthMPa": 572,
            "yieldStrengthMPa": 503,
            "elasticModulusGPa": 71.7,
            "elongationPercent": 11,
            "hardness": "HB 150",
            "density": 2.81,
            "meltingPoint": 477,
            "alloyNumber": "7075",
            "recyclability": 90
      },
      "dimensions": {
            "length": 1800,
            "width": 1300,
            "height": 40,
            "unit": "mm"
      },
      "weight": 18
},
    seller: {
      company: 'Porsche Parts Korea',
      contact: 'sales@porsche.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-004',
    name: '닛산 리프 배터리 팩 (재활용 등급)',
    image: '/image/batterypack_1.jpg',
    images: ["/image/batterypack_1.jpg"],
    manufacturer: 'Nissan',
    model: 'Leaf',
    price: 3200000,
    quantity: 2,
    category: '배터리',
    year: 2010,
    description: 'LMO 양극재, SOH 65%, ESS 전환용 추천',
    specifications: {
      "batterySoh": 65,
      "capacity": 24,
      "voltage": 360,
      "cathodeType": "LMO",
      "cycleCount": 1100,
      "warrantyMonths": 6
},
    seller: {
      company: 'Nissan Parts Korea',
      contact: 'sales@nissan.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-005',
    name: 'BMW i3 배터리 팩',
    image: '/image/batterypack_2.jpeg',
    images: ["/image/batterypack_2.jpeg"],
    manufacturer: 'BMW',
    model: 'i3',
    price: 5500000,
    quantity: 1,
    category: '배터리',
    year: 2013,
    description: 'NCM 양극재, SOH 72%, 재사용 가능',
    specifications: {
      "batterySoh": 72,
      "capacity": 33,
      "voltage": 360,
      "cathodeType": "NCM Ni 60%",
      "cycleCount": 850,
      "warrantyMonths": 12
},
    seller: {
      company: 'BMW Parts Korea',
      contact: 'sales@bmw.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-006',
    name: '쉐보레 스파크 EV 배터리',
    image: '/image/batterypack_2.jpeg',
    images: ["/image/batterypack_2.jpeg"],
    manufacturer: 'Chevrolet',
    model: 'Spark EV',
    price: 3800000,
    quantity: 1,
    category: '배터리',
    year: 2013,
    description: 'LMO 양극재, 소형차용 배터리',
    specifications: {
      "batterySoh": 68,
      "capacity": 19,
      "voltage": 327,
      "cathodeType": "LMO",
      "cycleCount": 920,
      "warrantyMonths": 6
},
    seller: {
      company: 'Chevrolet Parts Korea',
      contact: 'sales@chevrolet.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-007',
    name: 'Tesla Model S 85 배터리 팩 (재사용 최적)',
    image: '/image/batterypack_2.jpeg',
    images: ["/image/batterypack_2.jpeg"],
    manufacturer: 'Tesla',
    model: 'Model S 85',
    price: 14500000,
    quantity: 1,
    category: '배터리',
    year: 2014,
    description: 'NCA 양극재, SOH 88%, 213,000km 예측 주행 가능',
    specifications: {
      "batterySoh": 88,
      "capacity": 85,
      "voltage": 375,
      "cathodeType": "NCA",
      "cycleCount": 450,
      "warrantyMonths": 24
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-008',
    name: '르노 조에 Q210 배터리',
    image: '/image/batterypack_3.jpg',
    images: ["/image/batterypack_3.jpg"],
    manufacturer: 'Renault',
    model: 'Zoe Q210',
    price: 4200000,
    quantity: 1,
    category: '배터리',
    year: 2012,
    description: 'NCM 양극재, 105,000km 예측 주행',
    specifications: {
      "batterySoh": 78,
      "capacity": 22,
      "voltage": 360,
      "cathodeType": "NCM Ni 60%",
      "cycleCount": 780,
      "warrantyMonths": 12
},
    seller: {
      company: 'Renault Parts Korea',
      contact: 'sales@renault.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-009',
    name: '기아 쏘울 EV 배터리 (재생 완료)',
    image: '/image/batterypack_1.jpg',
    images: ["/image/batterypack_1.jpg"],
    manufacturer: 'Kia',
    model: 'Soul EV',
    price: 6800000,
    quantity: 2,
    category: '배터리',
    year: 2014,
    description: 'NCM Ni 33%, SOH 75%, 재생 처리 완료',
    specifications: {
      "batterySoh": 75,
      "capacity": 27,
      "voltage": 360,
      "cathodeType": "NCM Ni 33%",
      "cycleCount": 650,
      "warrantyMonths": 18
},
    seller: {
      company: 'Kia Parts Korea',
      contact: 'sales@kia.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'battery-010',
    name: '폭스바겐 e-골프 배터리',
    image: '/image/batterypack_3.jpg',
    images: ["/image/batterypack_3.jpg"],
    manufacturer: 'Volkswagen',
    model: 'e-Golf',
    price: 5100000,
    quantity: 1,
    category: '배터리',
    year: 2014,
    description: 'NCM 양극재, 67,000km 예측 주행',
    specifications: {
      "batterySoh": 71,
      "capacity": 24.2,
      "voltage": 323,
      "cathodeType": "NCM Ni 60%",
      "cycleCount": 720,
      "warrantyMonths": 12
},
    seller: {
      company: 'Volkswagen Parts Korea',
      contact: 'sales@volkswagen.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-001',
    name: '현대 아이오닉 Electric 모터',
    image: '/image/motor_3.jpg',
    images: ["/image/motor_3.jpg"],
    manufacturer: 'Hyundai',
    model: 'Ioniq Electric',
    price: 2800000,
    quantity: 1,
    category: '모터',
    year: 2016,
    description: '88kW PMSM 영구자석 동기 모터',
    specifications: {
      "powerOutputKW": 88,
      "torqueNm": 295,
      "rpmMax": 10500,
      "efficiency": 94.5,
      "coolingType": "liquid",
      "weight": 58
},
    seller: {
      company: 'Hyundai Parts Korea',
      contact: 'sales@hyundai.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-002',
    name: '기아 EV6 후륜 모터',
    image: '/image/motor_1.jpg',
    images: ["/image/motor_1.jpg"],
    manufacturer: 'Kia',
    model: 'EV6',
    price: 4200000,
    quantity: 1,
    category: '모터',
    year: 2022,
    description: '168kW PMSM, 재생 처리 완료',
    specifications: {
      "powerOutputKW": 168,
      "torqueNm": 350,
      "rpmMax": 13500,
      "efficiency": 95.8,
      "coolingType": "liquid",
      "weight": 72
},
    seller: {
      company: 'Kia Parts Korea',
      contact: 'sales@kia.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-003',
    name: 'Tesla Model 3 전륜 모터 (유도)',
    image: '/image/motor_2.jpg',
    images: ["/image/motor_2.jpg"],
    manufacturer: 'Tesla',
    model: 'Model 3',
    price: 3900000,
    quantity: 1,
    category: '모터',
    year: 2019,
    description: '147kW AC 유도 모터',
    specifications: {
      "powerOutputKW": 147,
      "torqueNm": 375,
      "rpmMax": 15000,
      "efficiency": 92.5,
      "coolingType": "liquid",
      "weight": 68
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-004',
    name: '닛산 리프 모터',
    image: '/image/motor_1.jpg',
    images: ["/image/motor_1.jpg"],
    manufacturer: 'Nissan',
    model: 'Leaf',
    price: 2500000,
    quantity: 2,
    category: '모터',
    year: 2018,
    description: '110kW PMSM 모터',
    specifications: {
      "powerOutputKW": 110,
      "torqueNm": 320,
      "rpmMax": 10390,
      "efficiency": 94,
      "coolingType": "liquid",
      "weight": 60
},
    seller: {
      company: 'Nissan Parts Korea',
      contact: 'sales@nissan.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-005',
    name: 'BMW i3 모터 유닛',
    image: '/image/motor_2.jpg',
    images: ["/image/motor_2.jpg"],
    manufacturer: 'BMW',
    model: 'i3',
    price: 3200000,
    quantity: 1,
    category: '모터',
    year: 2015,
    description: '125kW PMSM, 재생 처리',
    specifications: {
      "powerOutputKW": 125,
      "torqueNm": 250,
      "rpmMax": 11400,
      "efficiency": 93.8,
      "coolingType": "liquid",
      "weight": 55
},
    seller: {
      company: 'BMW Parts Korea',
      contact: 'sales@bmw.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'motor-006',
    name: '현대 코나 Electric 모터',
    image: '/image/motor_1.jpg',
    images: ["/image/motor_1.jpg"],
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    price: 3500000,
    quantity: 1,
    category: '모터',
    year: 2020,
    description: '150kW PMSM 모터',
    specifications: {
      "powerOutputKW": 150,
      "torqueNm": 395,
      "rpmMax": 11000,
      "efficiency": 95.2,
      "coolingType": "liquid",
      "weight": 65
},
    seller: {
      company: 'Hyundai Parts Korea',
      contact: 'sales@hyundai.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-001',
    name: '현대 아이오닉 5 인버터 (800V)',
    image: '/image/inverter_1.png',
    images: ["/image/inverter_1.png"],
    manufacturer: 'Hyundai',
    model: 'Ioniq 5',
    price: 1950000,
    quantity: 1,
    category: '인버터',
    year: 2022,
    description: '800V 고전압 SiC 인버터',
    specifications: {
      "voltageRating": 800,
      "currentRating": 400,
      "efficiency": 97.8,
      "coolingType": "liquid",
      "weight": 16
},
    seller: {
      company: 'Hyundai Parts Korea',
      contact: 'sales@hyundai.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-002',
    name: '기아 EV6 인버터 (800V)',
    image: '/image/inverter_3.png',
    images: ["/image/inverter_3.png"],
    manufacturer: 'Kia',
    model: 'EV6',
    price: 2650000,
    quantity: 2,
    category: '인버터',
    year: 2023,
    description: '800V 초고속충전 대응, 신품',
    specifications: {
      "voltageRating": 800,
      "currentRating": 450,
      "efficiency": 98.2,
      "coolingType": "liquid",
      "weight": 17
},
    seller: {
      company: 'Kia Parts Korea',
      contact: 'sales@kia.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-003',
    name: 'Tesla Model 3 인버터',
    image: '/image/inverter_3.png',
    images: ["/image/inverter_3.png"],
    manufacturer: 'Tesla',
    model: 'Model 3',
    price: 2100000,
    quantity: 1,
    category: '인버터',
    year: 2020,
    description: '400V SiC 인버터, 재생 완료',
    specifications: {
      "voltageRating": 400,
      "currentRating": 500,
      "efficiency": 96.9,
      "coolingType": "liquid",
      "weight": 18
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-004',
    name: '닛산 리프 인버터',
    image: '/image/inverter_3.png',
    images: ["/image/inverter_3.png"],
    manufacturer: 'Nissan',
    model: 'Leaf',
    price: 1400000,
    quantity: 1,
    category: '인버터',
    year: 2018,
    description: '360V 인버터 모듈',
    specifications: {
      "voltageRating": 360,
      "currentRating": 350,
      "efficiency": 95.5,
      "coolingType": "liquid",
      "weight": 14
},
    seller: {
      company: 'Nissan Parts Korea',
      contact: 'sales@nissan.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-005',
    name: 'BMW i3 인버터',
    image: '/image/inverter_2.jpg',
    images: ["/image/inverter_2.jpg"],
    manufacturer: 'BMW',
    model: 'i3',
    price: 1650000,
    quantity: 1,
    category: '인버터',
    year: 2016,
    description: '360V 인버터',
    specifications: {
      "voltageRating": 360,
      "currentRating": 380,
      "efficiency": 96.2,
      "coolingType": "liquid",
      "weight": 15
},
    seller: {
      company: 'BMW Parts Korea',
      contact: 'sales@bmw.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'inverter-006',
    name: '폭스바겐 ID.4 인버터',
    image: '/image/inverter_1.png',
    images: ["/image/inverter_1.png"],
    manufacturer: 'Volkswagen',
    model: 'ID.4',
    price: 1880000,
    quantity: 1,
    category: '인버터',
    year: 2021,
    description: '400V MEB 플랫폼 인버터',
    specifications: {
      "voltageRating": 400,
      "currentRating": 380,
      "efficiency": 96.7,
      "coolingType": "liquid",
      "weight": 15
},
    seller: {
      company: 'Volkswagen Parts Korea',
      contact: 'sales@volkswagen.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-chassis-002',
    name: 'Tesla Model S 서브프레임',
    image: '/image/car_body_1.jpg',
    images: ["/image/car_body_1.jpg"],
    manufacturer: 'Tesla',
    model: 'Model S',
    price: 2850000,
    quantity: 1,
    category: '차체',
    year: 2021,
    description: '알루미늄 7075 고강도 서브프레임',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 7075"
            ],
            "percentage": {
                  "Al": 90,
                  "Zn": 5.6,
                  "Mg": 2.5,
                  "Cu": 1.6,
                  "Cr": 0.23
            },
            "tensileStrengthMPa": 572,
            "yieldStrengthMPa": 503,
            "elasticModulusGPa": 71.7,
            "elongationPercent": 11,
            "hardness": "HB 150",
            "density": 2.81,
            "meltingPoint": 477,
            "alloyNumber": "7075",
            "recyclability": 90
      },
      "dimensions": {
            "length": 2200,
            "width": 700,
            "height": 250,
            "unit": "mm"
      },
      "weight": 125
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-chassis-003',
    name: '아우디 e-tron 알루미늄 스페이스 프레임',
    image: '/image/car_body_1.jpg',
    images: ["/image/car_body_1.jpg"],
    manufacturer: 'Audi',
    model: 'e-tron',
    price: 4500000,
    quantity: 1,
    category: '차체',
    year: 2020,
    description: 'ASF 알루미늄 6061 프레임',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 6061"
            ],
            "percentage": {
                  "Al": 97.9,
                  "Mg": 1,
                  "Si": 0.6,
                  "Cu": 0.28,
                  "Cr": 0.2
            },
            "tensileStrengthMPa": 310,
            "yieldStrengthMPa": 276,
            "elasticModulusGPa": 68.9,
            "elongationPercent": 12,
            "hardness": "HB 95",
            "density": 2.7,
            "meltingPoint": 582,
            "alloyNumber": "6061",
            "recyclability": 95
      },
      "dimensions": {
            "length": 2400,
            "width": 800,
            "height": 300,
            "unit": "mm"
      },
      "weight": 180
},
    seller: {
      company: 'Audi Parts Korea',
      contact: 'sales@audi.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-panel-003',
    name: '현대 아이오닉 5 후드',
    image: '/image/car_body_3.png',
    images: ["/image/car_body_3.png"],
    manufacturer: 'Hyundai',
    model: 'Ioniq 5',
    price: 780000,
    quantity: 1,
    category: '차체',
    year: 2022,
    description: '알루미늄 5754 후드, 재도색 완료',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 5754"
            ],
            "percentage": {
                  "Al": 95.5,
                  "Mg": 3.1,
                  "Mn": 0.5,
                  "Cr": 0.3,
                  "Fe": 0.4,
                  "Si": 0.2
            },
            "tensileStrengthMPa": 220,
            "yieldStrengthMPa": 80,
            "elasticModulusGPa": 70,
            "elongationPercent": 27,
            "hardness": "HB 62",
            "density": 2.66,
            "meltingPoint": 607,
            "alloyNumber": "5754",
            "recyclability": 93
      },
      "dimensions": {
            "length": 1650,
            "width": 1200,
            "height": 55,
            "unit": "mm"
      },
      "weight": 26
},
    seller: {
      company: 'Hyundai Parts Korea',
      contact: 'sales@hyundai.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-panel-004',
    name: 'BMW i4 트렁크 리드',
    image: '/image/car_body_3.png',
    images: ["/image/car_body_3.png"],
    manufacturer: 'BMW',
    model: 'i4',
    price: 650000,
    quantity: 1,
    category: '차체',
    year: 2022,
    description: '알루미늄 6061 트렁크',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 6061"
            ],
            "percentage": {
                  "Al": 97.9,
                  "Mg": 1,
                  "Si": 0.6,
                  "Cu": 0.28,
                  "Cr": 0.2
            },
            "tensileStrengthMPa": 310,
            "yieldStrengthMPa": 276,
            "elasticModulusGPa": 68.9,
            "elongationPercent": 12,
            "hardness": "HB 95",
            "density": 2.7,
            "meltingPoint": 582,
            "alloyNumber": "6061",
            "recyclability": 95
      },
      "dimensions": {
            "length": 1300,
            "width": 1100,
            "height": 50,
            "unit": "mm"
      },
      "weight": 20
},
    seller: {
      company: 'BMW Parts Korea',
      contact: 'sales@bmw.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-door-002',
    name: 'Tesla Model 3 운전석 도어',
    image: '/image/car_body_2.jpg',
    images: ["/image/car_body_2.jpg"],
    manufacturer: 'Tesla',
    model: 'Model 3',
    price: 980000,
    quantity: 1,
    category: '차체',
    year: 2020,
    description: '알루미늄 6061 도어',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 6061"
            ],
            "percentage": {
                  "Al": 97.9,
                  "Mg": 1,
                  "Si": 0.6,
                  "Cu": 0.28,
                  "Cr": 0.2
            },
            "tensileStrengthMPa": 310,
            "yieldStrengthMPa": 276,
            "elasticModulusGPa": 68.9,
            "elongationPercent": 12,
            "hardness": "HB 95",
            "density": 2.7,
            "meltingPoint": 582,
            "alloyNumber": "6061",
            "recyclability": 95
      },
      "dimensions": {
            "length": 1150,
            "width": 850,
            "height": 140,
            "unit": "mm"
      },
      "weight": 32
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-door-003',
    name: '기아 EV6 뒷좌석 도어',
    image: '/image/car_body_3.png',
    images: ["/image/car_body_3.png"],
    manufacturer: 'Kia',
    model: 'EV6',
    price: 1150000,
    quantity: 2,
    category: '차체',
    year: 2023,
    description: '알루미늄 5754 도어, 신품',
    specifications: {
      "materialComposition": {
            "primary": "Aluminum",
            "secondary": [
                  "Al 5754"
            ],
            "percentage": {
                  "Al": 95.5,
                  "Mg": 3.1,
                  "Mn": 0.5,
                  "Cr": 0.3,
                  "Fe": 0.4,
                  "Si": 0.2
            },
            "tensileStrengthMPa": 220,
            "yieldStrengthMPa": 80,
            "elasticModulusGPa": 70,
            "elongationPercent": 27,
            "hardness": "HB 62",
            "density": 2.66,
            "meltingPoint": 607,
            "alloyNumber": "5754",
            "recyclability": 93
      },
      "dimensions": {
            "length": 1050,
            "width": 800,
            "height": 130,
            "unit": "mm"
      },
      "weight": 28
},
    seller: {
      company: 'Kia Parts Korea',
      contact: 'sales@kia.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-window-001',
    name: 'Tesla Model 3 프론트 윈드쉴드',
    image: '/image/car_body_1.jpg',
    images: ["/image/car_body_1.jpg"],
    manufacturer: 'Tesla',
    model: 'Model 3',
    price: 450000,
    quantity: 1,
    category: '차체',
    year: 2021,
    description: '강화유리, UV 차단 코팅',
    specifications: {
      "dimensions": {
            "length": 1450,
            "width": 850,
            "height": 5,
            "unit": "mm"
      },
      "weight": 12
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-window-002',
    name: 'Tesla Model Y 파노라마 선루프',
    image: '/image/car_body_2.jpg',
    images: ["/image/car_body_2.jpg"],
    manufacturer: 'Tesla',
    model: 'Model Y',
    price: 850000,
    quantity: 1,
    category: '차체',
    year: 2022,
    description: '파노라마 글래스 루프',
    specifications: {
      "dimensions": {
            "length": 1400,
            "width": 1000,
            "height": 6,
            "unit": "mm"
      },
      "weight": 18
},
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@tesla.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  },
  {
    id: 'body-window-003',
    name: '현대 코나 Electric 프론트 윈드쉴드',
    image: '/image/car_body_2.jpg',
    images: ["/image/car_body_2.jpg"],
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    price: 520000,
    quantity: 2,
    category: '차체',
    year: 2021,
    description: '강화유리, UV/IR 차단 코팅, 신품',
    specifications: {
      "dimensions": {
            "length": 1380,
            "width": 820,
            "height": 5,
            "unit": "mm"
      },
      "weight": 11
},
    seller: {
      company: 'Hyundai Parts Korea',
      contact: 'sales@hyundai.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    }
  }
];
