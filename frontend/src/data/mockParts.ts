// 임시 부품 데이터
export const mockParts = [
  {
    id: '1',
    name: 'Tesla Model S 배터리 팩',
    image: '/image/batterypack_1.jpg',
    images: ['/image/batterypack_1.jpg'],
    manufacturer: 'Tesla',
    model: 'Model S',
    price: 15000000,
    quantity: 3,
    capacity: '85kWh',
    category: '배터리',
    year: 2018,
    description: 'Tesla Model S에서 사용되던 고품질 배터리 팩입니다. ESS(에너지 저장 시스템) 구축이나 대용량 전력 저장이 필요한 프로젝트에 적합합니다.',
    specifications: {
      capacity: '85kWh',
      voltage: '375V',
      cells: '7,104개 (18650 셀)',
      weight: '540kg',
      dimensions: '210cm × 150cm × 15cm',
      chemistry: 'NCA (Nickel Cobalt Aluminum)',
      cooling: '액체 냉각 시스템',
      bms: '내장 BMS',
      condition: '양호 (SOH 85% 이상)'
    },
    seller: {
      company: 'Tesla Parts Korea',
      contact: 'sales@teslaparts.kr',
      phone: '02-1234-5678',
      location: '서울특별시 강남구'
    },
    useCases: [
      {
        industry: '에너지 저장',
        application: 'ESS 구축',
        description: '태양광 발전과 연계한 가정용/상업용 에너지 저장 시스템'
      },
      {
        industry: '전기차 개조',
        application: '대형 전기차 전환',
        description: '기존 트럭이나 버스를 전기차로 개조하는 프로젝트'
      }
    ]
  },
  {
    id: '2',
    name: 'Nissan Leaf 구동 모터',
    image: '/image/motor1.jpg',
    images: ['/image/motor1.jpg'],
    manufacturer: 'Nissan',
    model: 'Leaf',
    price: 3500000,
    quantity: 5,
    power: '110kW',
    category: '모터',
    year: 2019,
    description: 'Nissan Leaf의 신뢰성 높은 구동 모터입니다. 전기차 개조 프로젝트나 산업용 기계에 활용 가능합니다.',
    specifications: {
      power: '110kW (150마력)',
      torque: '320Nm',
      type: '영구자석 동기 모터',
      voltage: '360V',
      maxRPM: '10,000rpm',
      weight: '58kg',
      cooling: '수냉식',
      efficiency: '95% 이상',
      condition: '저주행 (3만km 미만)'
    },
    seller: {
      company: 'EV Motors Inc',
      contact: 'info@evmotors.co.kr',
      phone: '031-987-6543',
      location: '경기도 성남시 분당구'
    },
    useCases: [
      {
        industry: '전기차 개조',
        application: '소형차 전환',
        description: '경차나 소형차를 전기차로 개조'
      },
      {
        industry: '산업 기계',
        application: '전동 지게차',
        description: '산업용 전동 지게차 모터 교체'
      }
    ]
  },
  {
    id: '3',
    name: 'BMW i3 인버터',
    image: '/image/inverter_1.png',
    images: ['/image/inverter_1.png'],
    manufacturer: 'BMW',
    model: 'i3',
    price: 2800000,
    quantity: 2,
    type: '3상 AC/DC',
    category: '인버터',
    year: 2017,
    description: 'BMW i3의 고효율 인버터입니다. 태양광 연계 ESS나 전력 변환 시스템에 적합합니다.',
    specifications: {
      type: '3상 AC/DC 인버터',
      inputVoltage: '360V DC',
      outputVoltage: '400V AC (3상)',
      maxPower: '125kW',
      efficiency: '97%',
      cooling: '수냉식',
      weight: '25kg',
      protection: 'IP65',
      condition: '우수'
    },
    seller: {
      company: 'Green Energy Solutions',
      contact: 'contact@greenenergy.kr',
      phone: '02-5555-7777',
      location: '서울특별시 송파구'
    },
    useCases: [
      {
        industry: '태양광 발전',
        application: 'ESS 인버터',
        description: '태양광 패널과 배터리를 연결하는 전력 변환'
      }
    ]
  },
  {
    id: '4',
    name: 'Chevrolet Bolt 구동 모터',
    image: '/image/motor2.jpg',
    images: ['/image/motor2.jpg'],
    manufacturer: 'Chevrolet',
    model: 'Bolt',
    price: 4200000,
    quantity: 4,
    power: '150kW',
    category: '모터',
    year: 2020,
    description: 'Chevrolet Bolt의 고성능 구동 모터입니다. 높은 출력이 필요한 전기차 개조나 산업용 애플리케이션에 적합합니다.',
    specifications: {
      power: '150kW (204마력)',
      torque: '360Nm',
      type: '영구자석 동기 모터',
      voltage: '400V',
      maxRPM: '8,810rpm',
      weight: '74kg',
      cooling: '수냉식',
      efficiency: '96%',
      condition: '우수 (1만km)'
    },
    seller: {
      company: 'Auto Electric Parts',
      contact: 'sales@autoelectric.com',
      phone: '031-123-4567',
      location: '경기도 수원시 영통구'
    },
    useCases: [
      {
        industry: '전기차 개조',
        application: '중형차 전환',
        description: '중형 세단이나 SUV를 전기차로 개조'
      },
      {
        industry: '레저',
        application: '전기 보트',
        description: '선박용 추진 모터로 활용'
      }
    ]
  },
  {
    id: '5',
    name: 'Hyundai Kona 차체 부품',
    image: '/image/car_body.jpg',
    images: ['/image/car_body.jpg'],
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    price: 5500000,
    quantity: 1,
    category: '차체',
    year: 2021,
    description: 'Hyundai Kona Electric의 차체 부품 세트입니다. 전기차 수리나 복원 프로젝트에 활용 가능합니다.',
    specifications: {
      includes: '프론트 범퍼, 리어 범퍼, 도어 패널, 트렁크',
      color: '흰색',
      condition: '미사용 (신품)',
      material: '고강도 강판 + 플라스틱',
      weight: '약 200kg (세트)'
    },
    seller: {
      company: 'Hyundai Parts Direct',
      contact: 'info@hyundaiparts.kr',
      phone: '02-8888-9999',
      location: '서울특별시 서초구'
    },
    useCases: [
      {
        industry: '자동차 수리',
        application: '차체 복원',
        description: '사고 차량 수리 및 복원'
      }
    ]
  },
  {
    id: '6',
    name: 'Renault Zoe 고성능 모터',
    image: '/image/motor3.jpg',
    images: ['/image/motor3.jpg'],
    manufacturer: 'Renault',
    model: 'Zoe',
    price: 3200000,
    quantity: 6,
    power: '92kW',
    category: '모터',
    year: 2019,
    description: 'Renault Zoe의 컴팩트한 고성능 모터입니다. 소형 전기차나 경량 전동 기기에 최적화되어 있습니다.',
    specifications: {
      power: '92kW (125마력)',
      torque: '225Nm',
      type: '권선형 동기 모터',
      voltage: '400V',
      maxRPM: '11,500rpm',
      weight: '47kg',
      cooling: '공랭식',
      efficiency: '94%',
      condition: '양호'
    },
    seller: {
      company: 'Euro EV Components',
      contact: 'sales@euroev.kr',
      phone: '031-777-8888',
      location: '경기도 용인시 기흥구'
    },
    useCases: [
      {
        industry: '전기차 개조',
        application: '경차 전환',
        description: '경차를 전기차로 개조'
      },
      {
        industry: '마이크로 모빌리티',
        application: '전동 스쿠터/카트',
        description: '소형 전동 모빌리티 제작'
      }
    ]
  }
];

export type Part = typeof mockParts[0];
