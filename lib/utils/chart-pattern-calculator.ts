// chart-pattern-calculator.ts
// 일봉 기준 19개 차트 패턴 감지 엔진

export type ChartPatternType =
  | 'head_and_shoulders'
  | 'inverse_head_shoulders'
  | 'double_top'
  | 'double_bottom'
  | 'triple_top'
  | 'triple_bottom'
  | 'symmetrical_triangle_bull'
  | 'symmetrical_triangle_bear'
  | 'ascending_triangle'
  | 'descending_triangle'
  | 'rising_wedge'
  | 'falling_wedge'
  | 'bull_flag'
  | 'bear_flag'
  | 'bull_pennant'
  | 'bear_pennant'
  | 'rectangle_bull'
  | 'rectangle_bear'
  | 'cup_handle'
  | 'inverted_cup_handle';

export interface PatternGuide {
  visual: string;    // 차트가 어떻게 생겼는지 (그림으로 묘사)
  meaning: string;   // 이 패턴이 의미하는 것
  action: string;    // 실제 어떻게 대응하면 되는지
  caution: string;   // 주의할 점
  tip: string;       // 초보자를 위한 꿀팁
  sourceUrl?: string;
}

export const PATTERN_INFO: Record<
  ChartPatternType,
  { name: string; signal: 'buy' | 'sell'; description: string; category: string; guide: PatternGuide }
> = {
  head_and_shoulders: {
    name: '헤드 앤 숄더', signal: 'sell', category: '반전',
    description: '세 개의 봉이 형성되며 두 번째 봉이 가장 높습니다.',
    guide: {
      visual: '차트를 보면 봉우리가 세 개 나타나는데, 가운데 봉우리(머리)가 가장 높고 양쪽 봉우리(어깨)가 비슷한 높이에 있습니다. 마치 사람의 머리와 양쪽 어깨 모양처럼 보입니다.',
      meaning: '상승 추세가 끝나고 하락으로 전환될 가능성이 높은 신호입니다. 세 번 고점을 만들었지만 마지막에는 이전 고점을 넘지 못하면서 매수세가 약해지고 있음을 나타냅니다.',
      action: '두 어깨 사이 골짜기를 연결한 선(넥라인)을 종가가 이탈할 때 매도를 고려합니다. 목표가는 "머리 높이 - 넥라인" 만큼 넥라인 아래로 설정합니다.',
      caution: '거래량이 왼쪽 어깨 → 머리 → 오른쪽 어깨 순으로 줄어들어야 더 신뢰할 수 있습니다. 넥라인 이탈 전에 너무 서둘러 매도하지 않도록 주의하세요.',
      tip: '⭐ 넥라인을 명확히 그려보세요. 종가 기준으로 넥라인 아래 마감 시 신호가 확정됩니다. 단순히 모양이 비슷하다고 매도하면 손실을 볼 수 있어요.',
    },
  },
  inverse_head_shoulders: {
    name: '인버스 헤드 앤 숄더', signal: 'buy', category: '반전',
    description: '3개의 골짜기가 형성되며 두 번째 골짜기가 가장 깊습니다.',
    guide: {
      visual: '차트를 뒤집어 보면 머리어깨형과 똑같이 생겼습니다. 골짜기가 세 개인데 가운데 골짜기(머리)가 가장 깊고, 양쪽 골짜기(어깨)는 비슷한 깊이입니다.',
      meaning: '하락 추세가 끝나고 상승으로 전환될 가능성이 높은 강력한 매수 신호입니다. 하락 시도가 세 번 있었지만 갈수록 힘이 빠지고 있음을 나타냅니다.',
      action: '두 어깨 사이 고점을 연결한 넥라인을 종가가 돌파할 때 매수를 고려합니다. 목표가는 "넥라인 + (넥라인 - 머리 바닥)"으로 계산합니다.',
      caution: '거래량이 오른쪽 어깨에서 늘어나고 넥라인 돌파 시 폭발적으로 증가해야 더 신뢰성이 높습니다. 넥라인 돌파 후 다시 넥라인 위에서 지지받는지 확인하세요.',
      tip: '⭐ 역머리어깨형은 하락장에서 바닥을 잡는 가장 유명한 패턴 중 하나입니다. 인내심을 갖고 넥라인 돌파를 기다리는 것이 핵심입니다.',
    },
  },
  double_top: {
    name: '더블 탑', signal: 'sell', category: '반전',
    description: '두 개의 봉이 비슷한 높이에 형성된 후 하락합니다.',
    guide: {
      visual: '차트에서 비슷한 높이의 두 봉우리가 나타나며 영어 알파벳 "M" 모양처럼 보입니다. 첫 번째 고점 → 중간 골 → 두 번째 고점(첫 번째와 비슷한 높이) 순으로 형성됩니다.',
      meaning: '같은 가격대에서 두 번 저항을 받았다는 의미입니다. 매수세가 그 가격 위로 끌어올릴 힘이 없다는 신호로, 하락 반전 가능성이 높습니다.',
      action: '중간 골의 저점(넥라인)을 종가가 이탈할 때 매도를 고려합니다. 두 번째 고점에서 눌릴 때 소량 매도하고, 넥라인 이탈 시 추가 매도하는 전략도 유효합니다.',
      caution: '두 봉우리의 높이 차이가 3% 이내일 때 더 신뢰할 수 있습니다. 단순히 두 번 올랐다고 모두 쌍봉형은 아니며, 사이 골이 충분히 깊어야(5% 이상) 의미 있습니다.',
      tip: '⭐ 쌍봉형은 초보자도 쉽게 인식할 수 있는 패턴입니다. 하지만 넥라인을 이탈하기 전에 섣불리 매도하면 반등으로 손실을 볼 수 있으니 항상 확인 후 행동하세요.',
    },
  },
  double_bottom: {
    name: '더블 바텀', signal: 'buy', category: '반전',
    description: '두 개의 골짜기가 비슷한 깊이에 형성된 후 상승합니다.',
    guide: {
      visual: '차트에서 비슷한 깊이의 두 골짜기가 나타나며 영어 알파벳 "W" 모양처럼 보입니다. 첫 번째 저점 → 중간 반등 → 두 번째 저점(첫 번째와 비슷한 깊이) 순으로 형성됩니다.',
      meaning: '같은 가격대에서 두 번 지지를 받았다는 의미입니다. 매도세가 그 가격 아래로 끌어내릴 힘이 없다는 신호로, 상승 반전 가능성이 높습니다.',
      action: '중간 반등의 고점(넥라인)을 종가가 돌파할 때 매수를 고려합니다. 목표가는 "넥라인 + (넥라인 - 두 바닥 평균)"으로 계산합니다.',
      caution: '두 바닥의 깊이 차이가 3% 이내일 때 더 신뢰할 수 있습니다. 두 번째 바닥에서 매수하는 것은 위험하며, 넥라인 돌파를 확인한 후 진입하는 것이 안전합니다.',
      tip: '⭐ 넥라인 돌파 후 다시 넥라인 부근으로 되돌아오는 경우(눌림목)가 많습니다. 이때 지지받으면 추가 매수 기회가 될 수 있습니다.',
    },
  },
  triple_top: {
    name: '트리플 탑', signal: 'sell', category: '반전',
    description: '세 개의 고점이 비슷한 높이에서 형성된 뒤 넥라인 이탈을 노립니다.',
    guide: {
      visual: '비슷한 높이의 봉우리가 세 번 나타나며, 사이사이 두 번의 조정이 끼어 있는 형태입니다. 같은 저항대를 세 번 넘지 못한 모습으로 보입니다.',
      meaning: '저항대에서 매도 압력이 반복적으로 확인되며 상승 추세가 소진되고 있음을 뜻합니다. 세 번째 시도까지 실패하면 하락 반전 신호로 해석합니다.',
      action: '세 고점 사이 저점을 잇는 넥라인을 종가 기준으로 이탈할 때 매도를 고려합니다. 목표가는 평균 고점과 넥라인의 높이 차이만큼 아래로 봅니다.',
      caution: '세 번째 고점이 나오기 전에는 단순 박스권과 구분하기 어렵습니다. 넥라인 이탈과 거래량 증가를 같이 확인하세요.',
      tip: '⭐ 더블탑보다 시간이 오래 걸리는 만큼, 완성되면 신뢰도가 높은 편입니다. 마지막 고점에서 거래량이 약해지는지도 함께 보세요.',
    },
  },
  triple_bottom: {
    name: '트리플 바텀', signal: 'buy', category: '반전',
    description: '세 개의 저점이 비슷한 깊이에서 형성된 뒤 넥라인 돌파를 노립니다.',
    guide: {
      visual: '비슷한 깊이의 바닥이 세 번 반복되고, 그 사이에 두 번의 반등 고점이 형성됩니다. 같은 지지대를 세 번 확인하는 형태입니다.',
      meaning: '지지대에서 매수세가 반복적으로 유입되며 하락 추세가 끝나갈 가능성을 뜻합니다. 세 번째 바닥까지 지켜낸 뒤 상방 돌파가 나오면 강한 반전 패턴이 됩니다.',
      action: '중간 반등 고점을 이은 넥라인을 종가 기준으로 돌파할 때 매수를 고려합니다. 목표가는 넥라인과 평균 바닥 깊이 차이만큼 위로 계산합니다.',
      caution: '세 번째 바닥이 무너지면 오히려 큰 하락이 이어질 수 있습니다. 돌파 전 성급한 선매수는 피하는 편이 안전합니다.',
      tip: '⭐ 트리플 바텀은 긴 바닥 다지기 패턴이라 돌파 후 추세가 길게 이어질 때가 많습니다. 거래량 확장을 꼭 함께 확인하세요.',
    },
  },
  symmetrical_triangle_bull: {
    name: '트라이앵글 (강세)', signal: 'buy', category: '삼각형',
    description: '저항선이 하향하고 지지선이 상향하며 수렴합니다.',
    guide: {
      visual: '고점은 점점 낮아지고 저점은 점점 높아지면서 가격이 한 점으로 수렴하는 삼각형 모양입니다. 마치 가위가 닫히듯 위아래가 조여드는 형태입니다.',
      meaning: '매수세와 매도세가 균형을 이루며 에너지를 압축하고 있는 상태입니다. 상승 추세 이후에 나타나면 추세가 계속될 가능성이 높습니다(강세 신호).',
      action: '상단 저항선을 상향 돌파할 때 매수를 고려합니다. 삼각형이 좁아진 시점(수렴점)에 가까울수록 돌파 시 큰 움직임이 나올 수 있습니다.',
      caution: '삼각형 내에서는 매수/매도 모두 위험합니다. 반드시 어느 방향으로 돌파하는지 확인 후 진입하세요. 하향 이탈 시 하락 신호로 전환됩니다.',
      tip: '⭐ 거래량이 삼각형 안에서 점점 줄어들다가 돌파 시 급증하면 더 신뢰할 수 있습니다. 돌파 방향이 확인될 때까지 기다리는 인내심이 필요합니다.',
    },
  },
  symmetrical_triangle_bear: {
    name: '트라이앵글 (약세)', signal: 'sell', category: '삼각형',
    description: '수렴하는 삼각형이 하락 추세 후 나타납니다.',
    guide: {
      visual: '강세 이등변삼각형과 모양은 같지만, 하락 추세 이후에 나타납니다. 고점은 낮아지고 저점은 높아지며 삼각형을 형성합니다.',
      meaning: '하락 추세 중 잠시 숨을 고르는 구간입니다. 이 패턴 이후에는 하락 추세가 재개될 가능성이 높습니다.',
      action: '하단 지지선을 하향 이탈할 때 매도를 고려합니다. 반등 매도(고점에서 팔기) 전략보다는 이탈 확인 후 진입이 더 안전합니다.',
      caution: '이 패턴도 상승 돌파 가능성이 있으므로 방향이 확인되기 전에 미리 매도하는 것은 위험합니다.',
      tip: '⭐ 삼각형 내 거래량 감소 → 이탈 시 거래량 급증 패턴이 나타나면 신뢰도가 올라갑니다.',
    },
  },
  ascending_triangle: {
    name: '트라이앵글 (상승형)', signal: 'buy', category: '삼각형',
    description: '저항선이 수평이고 지지선이 상향합니다.',
    guide: {
      visual: '위쪽은 일정한 저항선(수평선)에서 계속 막히고, 아래쪽 저점은 점점 높아지는 패턴입니다. 마치 누군가가 계속 매물벽에 도전하는 모습입니다.',
      meaning: '매수세가 점점 강해지고 있다는 신호입니다. 저점이 높아진다는 것은 매도 압력이 줄고 매수 의지가 강화되고 있음을 의미합니다. 저항선 돌파 시 강한 상승이 예상됩니다.',
      action: '수평 저항선을 종가 기준으로 상향 돌파할 때 매수합니다. 목표가는 "저항선 + 삼각형 최대 높이"로 설정할 수 있습니다.',
      caution: '저항선 돌파 후 다시 저항선 아래로 내려오면(거짓 돌파) 손절하는 것이 좋습니다. 거래량이 돌파 시 증가하는지 반드시 확인하세요.',
      tip: '⭐ 상승삼각형은 가장 신뢰도 높은 강세 패턴 중 하나입니다. 저항선을 몇 번 테스트할수록 돌파 시 더 강한 상승이 나올 수 있습니다.',
    },
  },
  descending_triangle: {
    name: '트라이앵글 (하락형)', signal: 'sell', category: '삼각형',
    description: '지지선이 수평이고 저항선이 하향합니다.',
    guide: {
      visual: '아래쪽은 일정한 지지선(수평선)에서 계속 받치지만, 위쪽 고점은 점점 낮아지는 패턴입니다. 매수세가 점점 힘을 잃어가는 모습입니다.',
      meaning: '매도세가 점점 강해지고 있다는 신호입니다. 고점이 낮아진다는 것은 매수 의지가 줄고 있음을 의미합니다. 지지선 이탈 시 강한 하락이 예상됩니다.',
      action: '수평 지지선을 종가 기준으로 하향 이탈할 때 매도(또는 손절)합니다. 보유 중이라면 지지선 근처에서 매도 주문을 준비하는 것이 좋습니다.',
      caution: '지지선이 여러 번 지지에 성공한 이력이 있을수록 이탈 시 더 큰 하락이 올 수 있습니다. 반대로 거짓 이탈도 잦으니 종가 기준으로 판단하세요.',
      tip: '⭐ 하락삼각형에서 보유 중인 경우, 지지선 이탈 전에 비중을 줄이는 것이 현명합니다. 미리 손절 라인을 설정해 두세요.',
    },
  },
  rising_wedge: {
    name: '라이징 웻지', signal: 'sell', category: '쐐기',
    description: '저항선과 지지선 모두 상향하며 지지선 기울기가 더 큽니다.',
    guide: {
      visual: '위아래 선이 모두 위로 향하는 쐐기 모양입니다. 그런데 아래쪽(지지선)이 위쪽(저항선)보다 더 가파르게 올라가 두 선이 위에서 만나는 형태입니다.',
      meaning: '겉으로는 상승하는 것처럼 보이지만 실제로는 가격대가 좁아지고 있어 매수 모멘텀이 약해지고 있습니다. 거짓 상승으로 실제로는 하락 전환 가능성이 높습니다.',
      action: '하단 지지선을 하향 이탈하거나 거래량이 급감하면서 가격이 꺾일 때 매도를 고려합니다.',
      caution: '계속 오르고 있어 매도하기 심리적으로 어렵습니다. 하지만 이런 패턴에서 고점 매수는 위험합니다. 탐욕을 조심하세요.',
      tip: '⭐ 상승하는 차트에서 나타나는 함정 패턴입니다. "좋아 보인다"는 느낌이 들 때 오히려 조심해야 합니다. 거래량 감소를 동반하면 신뢰도가 높아집니다.',
    },
  },
  falling_wedge: {
    name: '폴링 웻지', signal: 'buy', category: '쐐기',
    description: '저항선과 지지선 모두 하향하며 저항선 기울기가 더 큽니다.',
    guide: {
      visual: '위아래 선이 모두 아래로 향하는 쐐기 모양입니다. 위쪽(저항선)이 아래쪽(지지선)보다 더 가파르게 내려가 두 선이 아래에서 만나는 형태입니다.',
      meaning: '겉으로는 계속 하락하는 것처럼 보이지만, 하락 속도가 점점 둔화되고 있습니다. 매도 압력이 약해지고 있어 상승 반전 가능성이 높은 강세 신호입니다.',
      action: '상단 저항선을 상향 돌파할 때 매수를 고려합니다. 돌파 후 저항선이 지지선으로 바뀌는지 확인하면 더 안전합니다.',
      caution: '하락 중에 매수하는 것이기 때문에 심리적으로 어렵습니다. 반드시 돌파가 확인된 후에 진입하고, 손절 라인을 미리 설정하세요.',
      tip: '⭐ 하향쐐기형은 하락장의 바닥을 알리는 반가운 신호입니다. 거래량이 줄어들다가 돌파 시 늘어나면 더욱 신뢰할 수 있습니다.',
    },
  },
  bull_flag: {
    name: '불리쉬 플래그', signal: 'buy', category: '깃발',
    description: '급격한 상승 후 횡보 구간이 나타나다가 추가 상승합니다.',
    guide: {
      visual: '깃대(급격한 상승)와 깃발(횡보 구간)로 구성됩니다. 빠르게 오르다가 잠시 숨을 고르는 박스권 횡보 후 다시 상승하는 모습입니다. 마치 깃대에 깃발이 달린 것처럼 보입니다.',
      meaning: '강력한 상승 모멘텀이 잠시 쉬어가는 단계입니다. 상승 추세가 건강하게 지속되고 있음을 나타내며, 횡보 구간을 벗어나면 이전 상승폭만큼 추가 상승할 수 있습니다.',
      action: '횡보 구간(깃발)의 위쪽을 돌파할 때 매수합니다. 목표가는 깃대의 길이만큼 위로 설정합니다.',
      caution: '횡보 구간이 너무 길거나(20일 이상) 하락폭이 너무 크면(깃대의 50% 이상) 패턴이 무효화됩니다. 깃대가 없는 깃발은 신뢰하기 어렵습니다.',
      tip: '⭐ 깃발 구간에서 거래량이 줄어드는 것이 중요합니다. 거래량이 줄면서 조정받다가 다시 거래량이 늘며 돌파하는 패턴이 가장 이상적입니다.',
    },
  },
  bear_flag: {
    name: '베어리쉬 플래그', signal: 'sell', category: '깃발',
    description: '급격한 하락 후 횡보 구간이 나타나다가 추가 하락합니다.',
    guide: {
      visual: '빠르게 하락(깃대)하다가 잠시 횡보(깃발)한 후 다시 하락하는 모습입니다. 하락하는 깃대에 깃발이 달린 형태입니다.',
      meaning: '강력한 하락 모멘텀이 잠시 쉬어가는 단계입니다. 보유 중인 투자자들이 잠깐 반등하는 틈에 매도할 준비를 하고 있을 수 있습니다.',
      action: '횡보 구간(깃발)의 아래쪽을 이탈할 때 매도(또는 손절)합니다. 목표가는 깃대의 길이만큼 아래로 설정합니다.',
      caution: '횡보 구간이 반등처럼 보일 수 있어 매수 유혹이 있습니다. 하지만 이것은 하락 전의 잠시 숨고르기일 수 있으니 주의하세요.',
      tip: '⭐ 보유 중인 종목에서 이 패턴이 나타나면 리스크를 줄이는 것을 고려하세요. 횡보 구간에서 반등할 때 매도 기회로 활용할 수 있습니다.',
    },
  },
  bull_pennant: {
    name: '불리쉬 페넌트', signal: 'buy', category: '깃발',
    description: '급격한 상승 후 삼각형 모양 수렴 구간이 나타납니다.',
    guide: {
      visual: '사각깃발형과 비슷하지만, 깃발 부분이 사각형이 아닌 삼각형(수렴)으로 나타납니다. 급상승 후 고점은 낮아지고 저점은 높아지면서 에너지를 압축합니다.',
      meaning: '급상승 후 매수세와 매도세가 팽팽하게 균형을 이루며 에너지를 압축하고 있습니다. 이 수렴 구간을 돌파하면 이전 상승 추세가 강하게 재개됩니다.',
      action: '수렴 삼각형의 위쪽을 돌파할 때 매수합니다. 사각깃발형과 마찬가지로 목표가는 깃대 길이만큼 위로 설정합니다.',
      caution: '수렴 구간이 지나치게 길거나 깃대 대비 수렴 폭이 너무 크면 신뢰도가 떨어집니다.',
      tip: '⭐ 거래량이 수렴 구간에서 감소하다가 돌파 시 폭발적으로 증가하면 가장 좋은 신호입니다. 이것이 확인되면 높은 확률의 매수 기회입니다.',
    },
  },
  bear_pennant: {
    name: '베어리쉬 페넌트', signal: 'sell', category: '깃발',
    description: '급격한 하락 후 삼각형 모양 수렴 구간이 나타납니다.',
    guide: {
      visual: '급하락 후 수렴하는 삼각형이 나타납니다. 하락하는 깃대 + 삼각형 수렴 구간의 조합입니다.',
      meaning: '하락 후 에너지를 압축하고 있는 상태로, 수렴 구간 이탈 시 하락 추세가 재개됩니다.',
      action: '수렴 삼각형의 아래쪽을 이탈할 때 매도합니다.',
      caution: '간혹 상방 돌파가 발생할 수 있으므로 방향이 확인될 때까지 기다리세요.',
      tip: '⭐ 하락삼각깃발형은 급락 이후 반등을 기대하며 매수하는 것이 위험하다는 것을 알려주는 패턴입니다.',
    },
  },
  rectangle_bull: {
    name: '렉탱글 (상승형)', signal: 'buy', category: '직사각형',
    description: '상승추세 중 직사각형 보합 구간이 나타난 후 상승합니다.',
    guide: {
      visual: '상승 추세 중 일정 가격대에서 박스권(직사각형)을 형성합니다. 위아래 경계가 수평선으로 명확하고, 여러 번 고점과 저점을 반복합니다.',
      meaning: '강한 상승 추세 중 이익을 실현하려는 매도와 계속 사려는 매수가 균형을 이루며 에너지를 충전하는 구간입니다. 박스권 상단 돌파 시 추세 재개로 볼 수 있습니다.',
      action: '박스권 상단을 종가가 명확히 돌파할 때 매수합니다. 목표가는 박스권 높이만큼 위로 설정합니다.',
      caution: '박스권 내에서 매매하는 것은 수수료 낭비가 될 수 있습니다. 돌파 방향을 확인한 후 진입하세요.',
      tip: '⭐ 박스권이 길게 유지될수록 돌파 시 더 강한 상승이 나올 수 있습니다. 거래량이 돌파 시 확연히 증가하는지 확인하세요.',
    },
  },
  rectangle_bear: {
    name: '렉탱글 (하락형)', signal: 'sell', category: '직사각형',
    description: '하락추세 중 직사각형 보합 구간이 나타난 후 하락합니다.',
    guide: {
      visual: '하락 추세 중 일정 가격대에서 박스권을 형성합니다. 상승직사각형과 모양은 같지만 하락 추세 중에 나타나 하락 지속 신호로 봅니다.',
      meaning: '하락 추세 중 잠시 숨고르는 구간입니다. 보유 물량이 정리되는 시간으로, 박스권 하단 이탈 시 하락 추세가 재개됩니다.',
      action: '박스권 하단을 종가가 이탈할 때 매도 또는 손절을 고려합니다.',
      caution: '박스권 내에서 반등 매수 유혹이 있을 수 있지만, 하락 추세 중 박스권은 하락 지속의 전조인 경우가 많습니다.',
      tip: '⭐ 보유 중인 종목이 하락 후 박스권을 형성하면 주의가 필요합니다. 반등 시 비중을 줄이는 기회로 활용하세요.',
    },
  },
  cup_handle: {
    name: '컵 앤 핸들', signal: 'buy', category: '지속',
    description: '둥근 바닥(컵)과 짧은 조정(핸들) 뒤 상방 돌파를 노립니다.',
    guide: {
      visual: '넓고 둥근 U자 형태의 바닥이 먼저 나오고, 오른쪽 끝에서 짧게 눌리는 손잡이(handle) 구간이 붙습니다. 전체적으로 찻잔처럼 보이는 패턴입니다.',
      meaning: '상승 추세 중 건강한 조정과 재축적이 끝나가며, 매수세가 다시 주도권을 되찾고 있음을 뜻합니다. 핸들 상단 돌파는 추세 재개 신호로 해석합니다.',
      action: '핸들 상단 또는 컵의 오른쪽 림을 종가 기준으로 돌파할 때 매수를 고려합니다. 목표가는 컵 깊이만큼 위로 계산합니다.',
      caution: '컵이 너무 뾰족한 V자면 전형적인 컵 앤 핸들로 보기 어렵습니다. 핸들 조정이 컵 깊이의 절반을 크게 넘지 않는지 확인하세요.',
      tip: '⭐ 오른쪽 림 부근에서 거래량이 줄고, 돌파 시 거래량이 커지면 더 좋은 신호입니다.',
    },
  },
  inverted_cup_handle: {
    name: '인버티드 컵 앤 핸들', signal: 'sell', category: '지속',
    description: '둥근 천장(역컵)과 짧은 반등(핸들) 뒤 하방 이탈을 노립니다.',
    guide: {
      visual: '둥근 역U자 형태의 천장이 먼저 나오고, 오른쪽 끝에서 짧게 반등하는 손잡이 구간이 붙습니다. 찻잔을 뒤집어 놓은 모양처럼 보입니다.',
      meaning: '하락 추세 중 일시적 반등이 마무리되고, 매도세가 다시 주도권을 되찾는 과정을 뜻합니다. 핸들 하단 이탈은 하락 추세 재개 신호입니다.',
      action: '핸들 하단 또는 역컵 오른쪽 림 아래로 종가가 내려갈 때 매도를 고려합니다. 목표가는 역컵 높이만큼 아래로 계산합니다.',
      caution: '핸들이 과도하게 깊거나 반등이 너무 강하면 패턴 신뢰도가 떨어집니다. 하방 이탈 확인 전 섣부른 진입은 피하세요.',
      tip: '⭐ 거래량이 반등 구간에서 줄어들고 이탈 시 다시 커지는지 보면 신뢰도 판단에 도움이 됩니다.',
    },
  },
};

export interface PatternCriteria {
  [key: string]: boolean;
}

/** 차트 오버레이에 그릴 선 하나 */
export interface PatternLine {
  points: Array<{ time: string; value: number }>;
  color: string;
  width: 1 | 2 | 3;
  style: 'solid' | 'dashed' | 'dotted';
  label?: string;
}

/** 패턴 핵심 포인트 마커 */
export interface PatternMarker {
  time: string;
  value: number;
  label: string;
  position: 'above' | 'below';
  color: string;
}

/** 패턴 채우기 영역 (폴리곤) */
export interface PatternFillArea {
  points: { time: string; value: number }[];
  outlinePoints?: { time: string; value: number }[];
  color: string;       // 채우기 색상 (rgba 권장)
  borderColor: string; // 테두리 색상
  borderWidth: number; // 테두리 두께
}

export interface PatternResult {
  type: ChartPatternType;
  name: string;
  signal: 'buy' | 'sell';
  syncRate: number;
  detectedAt: string;
  keyLevels: {
    support?: number;
    resistance?: number;
    neckline?: number;
    target?: number;
  };
  patternBars: {
    startIdx: number;
    endIdx: number;
  };
  criteria: PatternCriteria;
  /** 오버레이 선 (패턴 윤곽, 추세선, 채널 등) */
  overlayLines?: PatternLine[];
  /** 핵심 포인트 마커 (Left Shoulder, Head 등) */
  patternMarkers?: PatternMarker[];
  /** 패턴 채우기 영역 (폴리곤) */
  fillArea?: PatternFillArea;
}

export type PriceBar = {
  date: string;
  price: number;
  open?: number;
  high: number;
  low: number;
  volume: number;
};

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

function findPeaks(
  prices: number[],
  window = 5,
): { index: number; value: number }[] {
  const peaks: { index: number; value: number }[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const slice = prices.slice(i - window, i + window + 1);
    const max = Math.max(...slice);
    if (prices[i] >= max) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1].index >= window) {
        peaks.push({ index: i, value: prices[i] });
      } else if (prices[i] > peaks[peaks.length - 1].value) {
        peaks[peaks.length - 1] = { index: i, value: prices[i] };
      }
    }
  }
  return peaks;
}

function findTroughs(
  prices: number[],
  window = 5,
): { index: number; value: number }[] {
  const troughs: { index: number; value: number }[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const slice = prices.slice(i - window, i + window + 1);
    const min = Math.min(...slice);
    if (prices[i] <= min) {
      if (troughs.length === 0 || i - troughs[troughs.length - 1].index >= window) {
        troughs.push({ index: i, value: prices[i] });
      } else if (prices[i] < troughs[troughs.length - 1].value) {
        troughs[troughs.length - 1] = { index: i, value: prices[i] };
      }
    }
  }
  return troughs;
}

function linearRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

function pct(a: number, b: number) {
  return ((a - b) / b) * 100;
}

function avgVolume(volumes: number[], from: number, to: number) {
  const sl = volumes.slice(from, to + 1);
  return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : 0;
}

/** slice 내 최솟값 index */
function minIdx(arr: number[], from: number, to: number): number {
  let idx = from;
  for (let i = from + 1; i <= to; i++) if (arr[i] < arr[idx]) idx = i;
  return idx;
}

/** slice 내 최댓값 index */
function maxIdx(arr: number[], from: number, to: number): number {
  let idx = from;
  for (let i = from + 1; i <= to; i++) if (arr[i] > arr[idx]) idx = i;
  return idx;
}

function getProjectionEndIndex(lastIdx: number, patternEndIdx: number, patternWidth: number): number {
  return Math.min(lastIdx, patternEndIdx + Math.max(10, Math.round(patternWidth * 0.9)));
}

function buildSampledPathPoints(
  bars: PriceBar[],
  values: number[],
  startIdx: number,
  endIdx: number,
  targetPoints = 9,
) {
  if (endIdx <= startIdx) {
    return [{ time: bars[startIdx].date, value: values[startIdx] }];
  }

  const points: { time: string; value: number }[] = [];
  const span = endIdx - startIdx;
  const step = Math.max(1, Math.floor(span / Math.max(2, targetPoints - 1)));

  for (let idx = startIdx; idx <= endIdx; idx += step) {
    points.push({ time: bars[idx].date, value: values[idx] });
  }

  const lastPoint = points[points.length - 1];
  if (!lastPoint || lastPoint.time !== bars[endIdx].date) {
    points.push({ time: bars[endIdx].date, value: values[endIdx] });
  }

  return points;
}

const BUY_COLOR  = '#16a34a';
const SELL_COLOR = '#ef4444';
const NECK_COLOR = '#f59e0b';
const CHANNEL_COLOR = '#6366f1';

// ─────────────────────────────────────────────────────────────
// 1. 머리어깨형 (Head & Shoulders) — 매도
// ─────────────────────────────────────────────────────────────
function detectHeadAndShoulders(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const peaks = findPeaks(closes, 4);
  if (peaks.length < 3) return null;

  for (let i = 0; i < peaks.length - 2; i++) {
    const ls = peaks[i], head = peaks[i + 1], rs = peaks[i + 2];
    if (head.index - ls.index < 5 || rs.index - head.index < 5) continue;

    const headHigherThanLS = pct(head.value, ls.value) > 2;
    const headHigherThanRS = pct(head.value, rs.value) > 2;
    const shouldersSymmetric = Math.abs(pct(ls.value, rs.value)) < 6;

    if (!headHigherThanLS || !headHigherThanRS) continue;

    // Neckline troughs
    const t1 = Math.min(...closes.slice(ls.index, head.index));
    const t2 = Math.min(...closes.slice(head.index, rs.index));
    const neckline = (t1 + t2) / 2;

    const currentPrice = closes[closes.length - 1];
    const priceAtNeckline = currentPrice <= neckline * 1.03;
    const necklineFlat = Math.abs(pct(t1, t2)) < 8;
    const volPattern = avgVolume(volumes, ls.index, head.index) > avgVolume(volumes, head.index, rs.index);

    const criteria: PatternCriteria = {
      '3개 봉우리 확인': true,
      '머리 > 양 어깨': headHigherThanLS && headHigherThanRS,
      '어깨 대칭성': shouldersSymmetric,
      '넥라인 수평': necklineFlat,
      '가격 넥라인 근접/이탈': priceAtNeckline,
      '거래량 패턴': volPattern,
    };

    const score =
      40 +
      (shouldersSymmetric ? 15 : 0) +
      (necklineFlat ? 15 : 0) +
      (priceAtNeckline ? 20 : 0) +
      (volPattern ? 10 : 0);

    // 두 넥라인 골짜기의 실제 인덱스
    const t1Idx = minIdx(closes, ls.index, head.index);
    const t2Idx = minIdx(closes, head.index, rs.index);
    const lastIdx = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, rs.index, rs.index - ls.index);

    // 목표가 계산: 넥라인 - (머리 - 넥라인)
    const patternHeight = head.value - neckline;
    const targetPrice = neckline - patternHeight;

    return {
      type: 'head_and_shoulders',
      name: '머리어깨형',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[rs.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { neckline, resistance: head.value, target: targetPrice },
      patternBars: { startIdx: ls.index, endIdx: Math.min(rs.index + 5, closes.length - 1) },
      criteria,
      // 패턴 채우기 영역
      fillArea: {
        points: [
          { time: bars[ls.index].date, value: ls.value },
          { time: bars[t1Idx].date, value: closes[t1Idx] },
          { time: bars[head.index].date, value: head.value },
          { time: bars[t2Idx].date, value: closes[t2Idx] },
          { time: bars[rs.index].date, value: rs.value },
        ],
        outlinePoints: [
          { time: bars[ls.index].date, value: ls.value },
          { time: bars[t1Idx].date, value: closes[t1Idx] },
          { time: bars[head.index].date, value: head.value },
          { time: bars[t2Idx].date, value: closes[t2Idx] },
          { time: bars[rs.index].date, value: rs.value },
        ],
        color: 'rgba(239, 68, 68, 0.12)',
        borderColor: SELL_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        // 넥라인 (골짜기 연결 → 오른쪽으로 연장)
        {
          points: [
            { time: bars[t1Idx].date,   value: closes[t1Idx] },
            { time: bars[t2Idx].date,   value: closes[t2Idx] },
            { time: bars[projectionEndIdx].date, value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        // 목표가 라인
        {
          points: [
            { time: bars[rs.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date,  value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[ls.index].date, value: ls.value, label: '좌측 어깨', position: 'above', color: SELL_COLOR },
        { time: bars[head.index].date, value: head.value, label: '머리', position: 'above', color: SELL_COLOR },
        { time: bars[rs.index].date, value: rs.value, label: '우측 어깨', position: 'above', color: SELL_COLOR },
        { time: bars[projectionEndIdx].date, value: targetPrice, label: '목표가', position: 'below', color: '#a855f7' },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 2. 역머리어깨형 — 매수
// ─────────────────────────────────────────────────────────────
function detectInverseHeadAndShoulders(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const troughs = findTroughs(closes, 4);
  if (troughs.length < 3) return null;

  for (let i = 0; i < troughs.length - 2; i++) {
    const ls = troughs[i], head = troughs[i + 1], rs = troughs[i + 2];
    if (head.index - ls.index < 5 || rs.index - head.index < 5) continue;

    const headLowerThanLS = pct(head.value, ls.value) < -2;
    const headLowerThanRS = pct(head.value, rs.value) < -2;
    const shouldersSymmetric = Math.abs(pct(ls.value, rs.value)) < 6;

    if (!headLowerThanLS || !headLowerThanRS) continue;

    const t1 = Math.max(...closes.slice(ls.index, head.index));
    const t2 = Math.max(...closes.slice(head.index, rs.index));
    const neckline = (t1 + t2) / 2;

    const currentPrice = closes[closes.length - 1];
    const priceBreakout = currentPrice >= neckline * 0.97;
    const necklineFlat = Math.abs(pct(t1, t2)) < 8;
    const volPattern = avgVolume(volumes, head.index, rs.index) > avgVolume(volumes, ls.index, head.index);

    const criteria: PatternCriteria = {
      '3개 바닥 확인': true,
      '머리 < 양 어깨': headLowerThanLS && headLowerThanRS,
      '어깨 대칭성': shouldersSymmetric,
      '넥라인 수평': necklineFlat,
      '가격 넥라인 돌파': priceBreakout,
      '거래량 증가': volPattern,
    };

    const score =
      40 +
      (shouldersSymmetric ? 15 : 0) +
      (necklineFlat ? 15 : 0) +
      (priceBreakout ? 20 : 0) +
      (volPattern ? 10 : 0);

    const t1Idx = maxIdx(closes, ls.index, head.index);
    const t2Idx = maxIdx(closes, head.index, rs.index);
    const lastIdx = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, rs.index, rs.index - ls.index);

    // 목표가 계산: 넥라인 + (넥라인 - 머리)
    const patternHeight = neckline - head.value;
    const targetPrice = neckline + patternHeight;

    return {
      type: 'inverse_head_shoulders',
      name: '역머리어깨형',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[rs.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { neckline, support: head.value, target: targetPrice },
      patternBars: { startIdx: ls.index, endIdx: Math.min(rs.index + 5, closes.length - 1) },
      criteria,
      fillArea: {
        points: [
          { time: bars[ls.index].date, value: ls.value },
          { time: bars[t1Idx].date, value: closes[t1Idx] },
          { time: bars[head.index].date, value: head.value },
          { time: bars[t2Idx].date, value: closes[t2Idx] },
          { time: bars[rs.index].date, value: rs.value },
        ],
        outlinePoints: [
          { time: bars[ls.index].date, value: ls.value },
          { time: bars[t1Idx].date, value: closes[t1Idx] },
          { time: bars[head.index].date, value: head.value },
          { time: bars[t2Idx].date, value: closes[t2Idx] },
          { time: bars[rs.index].date, value: rs.value },
        ],
        color: 'rgba(22, 163, 74, 0.12)',
        borderColor: BUY_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        // 넥라인
        {
          points: [
            { time: bars[t1Idx].date,   value: closes[t1Idx] },
            { time: bars[t2Idx].date,   value: closes[t2Idx] },
            { time: bars[projectionEndIdx].date, value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        // 목표가 라인
        {
          points: [
            { time: bars[rs.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date,  value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[ls.index].date, value: ls.value, label: '좌측 어깨', position: 'below', color: BUY_COLOR },
        { time: bars[head.index].date, value: head.value, label: '머리', position: 'below', color: BUY_COLOR },
        { time: bars[rs.index].date, value: rs.value, label: '우측 어깨', position: 'below', color: BUY_COLOR },
        { time: bars[projectionEndIdx].date, value: targetPrice, label: '목표가', position: 'above', color: '#a855f7' },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 3. 쌍봉형 (Double Top) — 매도
// ─────────────────────────────────────────────────────────────
function detectDoubleTop(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const peaks = findPeaks(closes, 5);
  if (peaks.length < 2) return null;

  for (let i = peaks.length - 2; i >= 0; i--) {
    const p1 = peaks[i], p2 = peaks[i + 1];
    const gap = p2.index - p1.index;
    if (gap < 8 || gap > 50) continue;

    const heightSimilar = Math.abs(pct(p1.value, p2.value)) < 4;
    if (!heightSimilar) continue;

    const valleyMin = Math.min(...closes.slice(p1.index, p2.index + 1));
    const declineDepth = pct(valleyMin, p1.value) < -4;
    const neckline = valleyMin;

    const currentPrice = closes[closes.length - 1];
    const priceDecline = currentPrice < p2.value * 0.98;
    const atNeckline = currentPrice <= neckline * 1.03;
    const vol2Higher = avgVolume(volumes, p1.index - 3, p1.index + 3) >= avgVolume(volumes, p2.index - 3, p2.index + 3);
    const recentPattern = closes.length - 1 - p2.index <= 15;

    const criteria: PatternCriteria = {
      '두 봉우리 높이 유사': heightSimilar,
      '두 봉우리 사이 충분한 간격': gap >= 8,
      '중간 골이 충분히 깊음': declineDepth,
      '2차 봉 이후 하락 중': priceDecline,
      '넥라인 근접/이탈': atNeckline,
      '최근 형성된 패턴': recentPattern,
    };

    const score =
      30 +
      (declineDepth ? 15 : 0) +
      (priceDecline ? 20 : 0) +
      (atNeckline ? 15 : 0) +
      (vol2Higher ? 10 : 0) +
      (recentPattern ? 10 : 0);

    if (score < 50) continue;

    const valleyIdx = minIdx(closes, p1.index, p2.index);
    const lastIdx   = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, p2.index, p2.index - p1.index);
    const targetPrice = neckline - (p1.value - neckline);

    return {
      type: 'double_top',
      name: '쌍봉형',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[p2.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { resistance: Math.max(p1.value, p2.value), neckline, target: targetPrice },
      patternBars: { startIdx: p1.index, endIdx: closes.length - 1 },
      criteria,
      fillArea: {
        points: [
          { time: bars[p1.index].date, value: p1.value },
          { time: bars[valleyIdx].date, value: closes[valleyIdx] },
          { time: bars[p2.index].date, value: p2.value },
        ],
        outlinePoints: [
          { time: bars[p1.index].date, value: p1.value },
          { time: bars[valleyIdx].date, value: closes[valleyIdx] },
          { time: bars[p2.index].date, value: p2.value },
        ],
        color: 'rgba(239, 68, 68, 0.12)',
        borderColor: SELL_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        // 넥라인
        {
          points: [
            { time: bars[p1.index].date,  value: neckline },
            { time: bars[projectionEndIdx].date,   value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        // 목표가 라인
        {
          points: [
            { time: bars[p2.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date,  value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[p1.index].date, value: p1.value, label: '1차 봉', position: 'above', color: SELL_COLOR },
        { time: bars[p2.index].date, value: p2.value, label: '2차 봉', position: 'above', color: SELL_COLOR },
        { time: bars[projectionEndIdx].date, value: targetPrice, label: '목표가', position: 'below', color: '#a855f7' },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 4. 역쌍봉형 (Double Bottom) — 매수
// ─────────────────────────────────────────────────────────────
function detectDoubleBottom(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const troughs = findTroughs(closes, 5);
  if (troughs.length < 2) return null;

  for (let i = troughs.length - 2; i >= 0; i--) {
    const t1 = troughs[i], t2 = troughs[i + 1];
    const gap = t2.index - t1.index;
    if (gap < 8 || gap > 50) continue;

    const depthSimilar = Math.abs(pct(t1.value, t2.value)) < 4;
    if (!depthSimilar) continue;

    const peakMax = Math.max(...closes.slice(t1.index, t2.index + 1));
    const riseHeight = pct(peakMax, t1.value) > 4;
    const neckline = peakMax;

    const currentPrice = closes[closes.length - 1];
    const priceRise = currentPrice > t2.value * 1.02;
    const breakout = currentPrice >= neckline * 0.97;
    const vol2Higher = avgVolume(volumes, t2.index - 3, t2.index + 3) >= avgVolume(volumes, t1.index - 3, t1.index + 3);
    const recentPattern = closes.length - 1 - t2.index <= 15;

    const criteria: PatternCriteria = {
      '두 바닥 깊이 유사': depthSimilar,
      '두 바닥 사이 충분한 간격': gap >= 8,
      '중간 봉이 충분히 높음': riseHeight,
      '2차 바닥 이후 상승 중': priceRise,
      '넥라인 근접/돌파': breakout,
      '최근 형성된 패턴': recentPattern,
    };

    const score =
      30 +
      (riseHeight ? 15 : 0) +
      (priceRise ? 20 : 0) +
      (breakout ? 15 : 0) +
      (vol2Higher ? 10 : 0) +
      (recentPattern ? 10 : 0);

    if (score < 50) continue;

    const peakIdx = maxIdx(closes, t1.index, t2.index);
    const lastIdx = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, t2.index, t2.index - t1.index);
    const targetPrice = neckline + (neckline - Math.min(t1.value, t2.value));

    return {
      type: 'double_bottom',
      name: '역쌍봉형',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[t2.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { support: Math.min(t1.value, t2.value), neckline, target: targetPrice },
      patternBars: { startIdx: t1.index, endIdx: closes.length - 1 },
      criteria,
      fillArea: {
        points: [
          { time: bars[t1.index].date, value: t1.value },
          { time: bars[peakIdx].date, value: closes[peakIdx] },
          { time: bars[t2.index].date, value: t2.value },
        ],
        outlinePoints: [
          { time: bars[t1.index].date, value: t1.value },
          { time: bars[peakIdx].date, value: closes[peakIdx] },
          { time: bars[t2.index].date, value: t2.value },
        ],
        color: 'rgba(22, 163, 74, 0.12)',
        borderColor: BUY_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        // 넥라인
        {
          points: [
            { time: bars[t1.index].date, value: neckline },
            { time: bars[projectionEndIdx].date,  value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        // 목표가 라인
        {
          points: [
            { time: bars[t2.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date,  value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[t1.index].date, value: t1.value, label: '1차 바닥', position: 'below', color: BUY_COLOR },
        { time: bars[t2.index].date, value: t2.value, label: '2차 바닥', position: 'below', color: BUY_COLOR },
        { time: bars[projectionEndIdx].date, value: targetPrice, label: '목표가', position: 'above', color: '#a855f7' },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 5. 트리플 탑 — 매도
// ─────────────────────────────────────────────────────────────
function detectTripleTop(
  closes: number[], _highs: number[], _lows: number[], _volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const peaks = findPeaks(closes, 4);
  if (peaks.length < 3) return null;

  for (let i = peaks.length - 3; i >= 0; i--) {
    const p1 = peaks[i], p2 = peaks[i + 1], p3 = peaks[i + 2];
    const gap1 = p2.index - p1.index;
    const gap2 = p3.index - p2.index;
    if (gap1 < 6 || gap2 < 6 || gap1 > 40 || gap2 > 40) continue;

    const topAvg = (p1.value + p2.value + p3.value) / 3;
    const peaksAligned =
      Math.abs(pct(p1.value, topAvg)) < 5 &&
      Math.abs(pct(p2.value, topAvg)) < 5 &&
      Math.abs(pct(p3.value, topAvg)) < 5;
    if (!peaksAligned) continue;

    const v1Idx = minIdx(closes, p1.index, p2.index);
    const v2Idx = minIdx(closes, p2.index, p3.index);
    const neckline = Math.min(closes[v1Idx], closes[v2Idx]);
    const depthEnough = pct(neckline, topAvg) < -4;
    const currentPrice = closes[closes.length - 1];
    const necklineBreak = currentPrice <= neckline * 1.03;
    const recentPattern = closes.length - 1 - p3.index <= 20;

    const criteria: PatternCriteria = {
      '3개 고점 확인': true,
      '고점 높이 유사': peaksAligned,
      '두 골짜기 깊이 확보': depthEnough,
      '넥라인 근접/이탈': necklineBreak,
      '최근 형성된 패턴': recentPattern,
    };

    const score =
      35 +
      (peaksAligned ? 20 : 0) +
      (depthEnough ? 15 : 0) +
      (necklineBreak ? 20 : 0) +
      (recentPattern ? 10 : 0);

    if (score < 50) continue;

    const lastIdx = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, p3.index, p3.index - p1.index);
    const targetPrice = neckline - (topAvg - neckline);

    return {
      type: 'triple_top',
      name: '트리플 탑',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[p3.index]?.date ?? bars[lastIdx].date,
      keyLevels: { resistance: topAvg, neckline, target: targetPrice },
      patternBars: { startIdx: p1.index, endIdx: p3.index },
      criteria,
      fillArea: {
        points: [
          { time: bars[p1.index].date, value: p1.value },
          { time: bars[v1Idx].date, value: closes[v1Idx] },
          { time: bars[p2.index].date, value: p2.value },
          { time: bars[v2Idx].date, value: closes[v2Idx] },
          { time: bars[p3.index].date, value: p3.value },
        ],
        outlinePoints: [
          { time: bars[p1.index].date, value: p1.value },
          { time: bars[v1Idx].date, value: closes[v1Idx] },
          { time: bars[p2.index].date, value: p2.value },
          { time: bars[v2Idx].date, value: closes[v2Idx] },
          { time: bars[p3.index].date, value: p3.value },
        ],
        color: 'rgba(239, 68, 68, 0.12)',
        borderColor: SELL_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        {
          points: [
            { time: bars[v1Idx].date, value: neckline },
            { time: bars[projectionEndIdx].date, value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        {
          points: [
            { time: bars[p3.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date, value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[p1.index].date, value: p1.value, label: '1차 고점', position: 'above', color: SELL_COLOR },
        { time: bars[p2.index].date, value: p2.value, label: '2차 고점', position: 'above', color: SELL_COLOR },
        { time: bars[p3.index].date, value: p3.value, label: '3차 고점', position: 'above', color: SELL_COLOR },
      ],
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 6. 트리플 바텀 — 매수
// ─────────────────────────────────────────────────────────────
function detectTripleBottom(
  closes: number[], _highs: number[], _lows: number[], _volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const troughs = findTroughs(closes, 4);
  if (troughs.length < 3) return null;

  for (let i = troughs.length - 3; i >= 0; i--) {
    const t1 = troughs[i], t2 = troughs[i + 1], t3 = troughs[i + 2];
    const gap1 = t2.index - t1.index;
    const gap2 = t3.index - t2.index;
    if (gap1 < 6 || gap2 < 6 || gap1 > 40 || gap2 > 40) continue;

    const bottomAvg = (t1.value + t2.value + t3.value) / 3;
    const bottomsAligned =
      Math.abs(pct(t1.value, bottomAvg)) < 5 &&
      Math.abs(pct(t2.value, bottomAvg)) < 5 &&
      Math.abs(pct(t3.value, bottomAvg)) < 5;
    if (!bottomsAligned) continue;

    const p1Idx = maxIdx(closes, t1.index, t2.index);
    const p2Idx = maxIdx(closes, t2.index, t3.index);
    const neckline = Math.max(closes[p1Idx], closes[p2Idx]);
    const riseEnough = pct(neckline, bottomAvg) > 4;
    const currentPrice = closes[closes.length - 1];
    const necklineBreak = currentPrice >= neckline * 0.97;
    const recentPattern = closes.length - 1 - t3.index <= 20;

    const criteria: PatternCriteria = {
      '3개 저점 확인': true,
      '저점 깊이 유사': bottomsAligned,
      '두 반등 고점 확보': riseEnough,
      '넥라인 근접/돌파': necklineBreak,
      '최근 형성된 패턴': recentPattern,
    };

    const score =
      35 +
      (bottomsAligned ? 20 : 0) +
      (riseEnough ? 15 : 0) +
      (necklineBreak ? 20 : 0) +
      (recentPattern ? 10 : 0);

    if (score < 50) continue;

    const lastIdx = closes.length - 1;
    const projectionEndIdx = getProjectionEndIndex(lastIdx, t3.index, t3.index - t1.index);
    const targetPrice = neckline + (neckline - bottomAvg);

    return {
      type: 'triple_bottom',
      name: '트리플 바텀',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[t3.index]?.date ?? bars[lastIdx].date,
      keyLevels: { support: bottomAvg, neckline, target: targetPrice },
      patternBars: { startIdx: t1.index, endIdx: t3.index },
      criteria,
      fillArea: {
        points: [
          { time: bars[t1.index].date, value: t1.value },
          { time: bars[p1Idx].date, value: closes[p1Idx] },
          { time: bars[t2.index].date, value: t2.value },
          { time: bars[p2Idx].date, value: closes[p2Idx] },
          { time: bars[t3.index].date, value: t3.value },
        ],
        outlinePoints: [
          { time: bars[t1.index].date, value: t1.value },
          { time: bars[p1Idx].date, value: closes[p1Idx] },
          { time: bars[t2.index].date, value: t2.value },
          { time: bars[p2Idx].date, value: closes[p2Idx] },
          { time: bars[t3.index].date, value: t3.value },
        ],
        color: 'rgba(22, 163, 74, 0.12)',
        borderColor: BUY_COLOR,
        borderWidth: 2,
      },
      overlayLines: [
        {
          points: [
            { time: bars[p1Idx].date, value: neckline },
            { time: bars[projectionEndIdx].date, value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dotted', label: '넥라인',
        },
        {
          points: [
            { time: bars[t3.index].date, value: targetPrice },
            { time: bars[projectionEndIdx].date, value: targetPrice },
          ],
          color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
        },
      ],
      patternMarkers: [
        { time: bars[t1.index].date, value: t1.value, label: '1차 저점', position: 'below', color: BUY_COLOR },
        { time: bars[t2.index].date, value: t2.value, label: '2차 저점', position: 'below', color: BUY_COLOR },
        { time: bars[t3.index].date, value: t3.value, label: '3차 저점', position: 'below', color: BUY_COLOR },
      ],
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 7. 상승사각깃발형 (Bull Flag) — 매수
// ─────────────────────────────────────────────────────────────
function detectBullFlag(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  // Look back up to 50 bars for flagpole
  const lookback = Math.min(50, closes.length - 1);
  const n = closes.length;

  for (let poleEnd = n - 10; poleEnd >= n - lookback; poleEnd--) {
    for (let poleStart = poleEnd - 15; poleStart >= Math.max(0, poleEnd - 25); poleStart--) {
      const poleReturn = pct(closes[poleEnd], closes[poleStart]);
      if (poleReturn < 8) continue; // Need at least 8% rise

      // Flag: consolidation after poleEnd
      const flagBars = closes.slice(poleEnd, n);
      if (flagBars.length < 5) continue;

      const flagHigh = Math.max(...flagBars);
      const flagLow  = Math.min(...flagBars);
      const flagRange = pct(flagHigh, flagLow);
      const isFlat    = Math.abs(flagRange) < 6; // Tight consolidation

      // Flag should not retrace more than 50% of pole
      const retracement = pct(Math.min(...flagBars), closes[poleEnd]);
      const limitedRetracement = retracement > -poleReturn * 0.5;

      const strongPole   = poleReturn > 10;
      const recentFlag   = n - 1 - poleEnd <= 20;
      const volDecline   = avgVolume(volumes, poleEnd, n - 1) < avgVolume(volumes, poleStart, poleEnd);

      const criteria: PatternCriteria = {
        '강한 상승 깃대': strongPole,
        '횡보 구간(깃발)': isFlat,
        '눌림폭 50% 이내': limitedRetracement,
        '최근 형성된 패턴': recentFlag,
        '깃발 구간 거래량 감소': volDecline,
      };

      const score =
        25 +
        (strongPole ? 20 : 10) +
        (isFlat ? 20 : 0) +
        (limitedRetracement ? 15 : 0) +
        (volDecline ? 10 : 0) +
        (recentFlag ? 10 : 0);

      if (score < 50) continue;

      const targetPrice = flagHigh + (closes[poleEnd] - closes[poleStart]);

      return {
        type: 'bull_flag',
        name: '상승사각깃발형',
        signal: 'buy',
        syncRate: Math.min(100, score),
        detectedAt: bars[poleEnd]?.date ?? bars[n - 1].date,
        keyLevels: { support: flagLow, resistance: flagHigh, target: targetPrice },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        fillArea: {
          points: [
            { time: bars[poleEnd].date, value: flagHigh },
            { time: bars[n - 1].date, value: flagHigh },
            { time: bars[n - 1].date, value: flagLow },
            { time: bars[poleEnd].date, value: flagLow },
          ],
          color: 'rgba(22, 163, 74, 0.12)',
          borderColor: BUY_COLOR,
          borderWidth: 2,
        },
        overlayLines: [
          // 깃대 (수직 상승)
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: BUY_COLOR, width: 3, style: 'solid', label: '깃대' },
          // 목표가 라인
          { points: [
              { time: bars[poleEnd].date, value: targetPrice },
              { time: bars[n - 1].date,   value: targetPrice },
            ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
        ],
        patternMarkers: [
          { time: bars[poleStart].date, value: closes[poleStart], label: '깃대 시작', position: 'below', color: BUY_COLOR },
          { time: bars[poleEnd].date, value: closes[poleEnd], label: '깃대 끝', position: 'above', color: BUY_COLOR },
          { time: bars[n - 1].date, value: targetPrice, label: '목표가', position: 'above', color: '#a855f7' },
        ],
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 8. 하락사각깃발형 (Bear Flag) — 매도
// ─────────────────────────────────────────────────────────────
function detectBearFlag(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const lookback = Math.min(50, closes.length - 1);
  const n = closes.length;

  for (let poleEnd = n - 10; poleEnd >= n - lookback; poleEnd--) {
    for (let poleStart = poleEnd - 15; poleStart >= Math.max(0, poleEnd - 25); poleStart--) {
      const poleReturn = pct(closes[poleEnd], closes[poleStart]);
      if (poleReturn > -8) continue;

      const flagBars = closes.slice(poleEnd, n);
      if (flagBars.length < 5) continue;

      const flagHigh  = Math.max(...flagBars);
      const flagLow   = Math.min(...flagBars);
      const flagRange = pct(flagHigh, flagLow);
      const isFlat    = Math.abs(flagRange) < 6;
      const retracement = pct(Math.max(...flagBars), closes[poleEnd]);
      const limitedRetracement = retracement < Math.abs(poleReturn) * 0.5;

      const strongPole  = poleReturn < -10;
      const recentFlag  = n - 1 - poleEnd <= 20;
      const volDecline  = avgVolume(volumes, poleEnd, n - 1) < avgVolume(volumes, poleStart, poleEnd);

      const criteria: PatternCriteria = {
        '강한 하락 깃대': strongPole,
        '횡보 구간(깃발)': isFlat,
        '반등폭 50% 이내': limitedRetracement,
        '최근 형성된 패턴': recentFlag,
        '깃발 구간 거래량 감소': volDecline,
      };

      const score =
        25 +
        (strongPole ? 20 : 10) +
        (isFlat ? 20 : 0) +
        (limitedRetracement ? 15 : 0) +
        (volDecline ? 10 : 0) +
        (recentFlag ? 10 : 0);

      if (score < 50) continue;

      const targetPrice = flagLow - (closes[poleStart] - closes[poleEnd]);

      return {
        type: 'bear_flag',
        name: '하락사각깃발형',
        signal: 'sell',
        syncRate: Math.min(100, score),
        detectedAt: bars[poleEnd]?.date ?? bars[n - 1].date,
        keyLevels: { resistance: flagHigh, support: flagLow, target: targetPrice },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        fillArea: {
          points: [
            { time: bars[poleEnd].date, value: flagHigh },
            { time: bars[n - 1].date, value: flagHigh },
            { time: bars[n - 1].date, value: flagLow },
            { time: bars[poleEnd].date, value: flagLow },
          ],
          color: 'rgba(239, 68, 68, 0.12)',
          borderColor: SELL_COLOR,
          borderWidth: 2,
        },
        overlayLines: [
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: SELL_COLOR, width: 3, style: 'solid', label: '깃대' },
          // 목표가 라인
          { points: [
              { time: bars[poleEnd].date, value: targetPrice },
              { time: bars[n - 1].date,   value: targetPrice },
            ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
        ],
        patternMarkers: [
          { time: bars[poleStart].date, value: closes[poleStart], label: '깃대 시작', position: 'above', color: SELL_COLOR },
          { time: bars[poleEnd].date, value: closes[poleEnd], label: '깃대 끝', position: 'below', color: SELL_COLOR },
          { time: bars[n - 1].date, value: targetPrice, label: '목표가', position: 'below', color: '#a855f7' },
        ],
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 9. 상승삼각형 (Ascending Triangle) — 매수
// ─────────────────────────────────────────────────────────────
function detectAscendingTriangle(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(60, n - 1);
  const start = n - lookback;
  const slicedCloses = closes.slice(start);
  const slicedHighs  = highs.slice(start);
  const slicedLows   = lows.slice(start);

  const peaks   = findPeaks(slicedHighs, 4);
  const troughs = findTroughs(slicedLows, 4);

  if (peaks.length < 2 || troughs.length < 2) return null;

  // Flat resistance
  const peakValues = peaks.map(p => p.value);
  const avgPeakH = peakValues.reduce((a, b) => a + b, 0) / peakValues.length;
  const peakVariance = peakValues.every(v => Math.abs(pct(v, avgPeakH)) < 3);

  // Rising troughs
  let troughsRising = true;
  for (let i = 1; i < troughs.length; i++) {
    if (troughs[i].value <= troughs[i - 1].value) { troughsRising = false; break; }
  }

  if (!peakVariance || !troughsRising) return null;

  const resistance = avgPeakH;
  const support    = troughs[troughs.length - 1].value;
  const currentPrice = slicedCloses[slicedCloses.length - 1];
  const nearBreakout = currentPrice > resistance * 0.97;
  const hasBreakout  = currentPrice > resistance;
  const volDecline   = avgVolume(volumes, start + 5, n - 5) < avgVolume(volumes, start, start + 5);

  const criteria: PatternCriteria = {
    '수평 저항선': peakVariance,
    '상승하는 지지선': troughsRising,
    '2개 이상 접점': peaks.length >= 2 && troughs.length >= 2,
    '저항선 근접/돌파': nearBreakout,
    '거래량 수렴': volDecline,
  };

  const score =
    35 +
    (troughsRising ? 20 : 0) +
    (nearBreakout ? 20 : 0) +
    (hasBreakout ? 15 : 0) +
    (volDecline ? 10 : 0);

  if (score < 50) return null;

  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  // 상승 지지선: 첫 번째 trough → 마지막 trough
  const t0 = troughs[0], tLast = troughs[troughs.length - 1];
  const targetPrice = resistance + (resistance - support);
  const supportAtEnd = tLast.value + (tLast.value - t0.value) * 0.2;

  return {
    type: 'ascending_triangle',
    name: '상승삼각형',
    signal: 'buy',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance, support, target: targetPrice },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    fillArea: {
      points: [
        { time: bars[start + t0.index].date, value: t0.value },
        { time: firstBar.date, value: resistance },
        { time: lastBar.date, value: resistance },
        { time: lastBar.date, value: supportAtEnd },
      ],
      color: 'rgba(22, 163, 74, 0.12)',
      borderColor: BUY_COLOR,
      borderWidth: 2,
    },
    overlayLines: [
      // 목표가 라인
      { points: [
          { time: firstBar.date, value: targetPrice },
          { time: lastBar.date, value: targetPrice },
        ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
    ],
    patternMarkers: [
      { time: bars[start + t0.index].date, value: t0.value, label: '지지 시작', position: 'below', color: BUY_COLOR },
      { time: lastBar.date, value: resistance, label: '저항선', position: 'above', color: SELL_COLOR },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 10. 하락삼각형 (Descending Triangle) — 매도
// ─────────────────────────────────────────────────────────────
function detectDescendingTriangle(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(60, n - 1);
  const start = n - lookback;
  const slicedHighs = highs.slice(start);
  const slicedLows  = lows.slice(start);

  const peaks   = findPeaks(slicedHighs, 4);
  const troughs = findTroughs(slicedLows, 4);

  if (peaks.length < 2 || troughs.length < 2) return null;

  // Flat support
  const troughValues = troughs.map(t => t.value);
  const avgTroughL = troughValues.reduce((a, b) => a + b, 0) / troughValues.length;
  const troughVariance = troughValues.every(v => Math.abs(pct(v, avgTroughL)) < 3);

  // Declining peaks
  let peaksDecline = true;
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i].value >= peaks[i - 1].value) { peaksDecline = false; break; }
  }

  if (!troughVariance || !peaksDecline) return null;

  const support    = avgTroughL;
  const resistance = peaks[peaks.length - 1].value;
  const currentPrice = closes[closes.length - 1];
  const nearBreakdown = currentPrice < support * 1.03;
  const hasBreakdown  = currentPrice < support;
  const volDecline    = avgVolume(volumes, start + 5, n - 5) < avgVolume(volumes, start, start + 5);

  const criteria: PatternCriteria = {
    '수평 지지선': troughVariance,
    '하락하는 저항선': peaksDecline,
    '2개 이상 접점': peaks.length >= 2 && troughs.length >= 2,
    '지지선 근접/이탈': nearBreakdown,
    '거래량 수렴': volDecline,
  };

  const score =
    35 +
    (peaksDecline ? 20 : 0) +
    (nearBreakdown ? 20 : 0) +
    (hasBreakdown ? 15 : 0) +
    (volDecline ? 10 : 0);

  if (score < 50) return null;

  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  const p0 = peaks[0], pLast = peaks[peaks.length - 1];
  const targetPrice = support - (resistance - support);
  const resistanceAtEnd = pLast.value - (p0.value - pLast.value) * 0.2;

  return {
    type: 'descending_triangle',
    name: '하락삼각형',
    signal: 'sell',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { support, resistance, target: targetPrice },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    fillArea: {
      points: [
        { time: bars[start + p0.index].date, value: p0.value },
        { time: lastBar.date, value: resistanceAtEnd },
        { time: lastBar.date, value: support },
        { time: firstBar.date, value: support },
      ],
      color: 'rgba(239, 68, 68, 0.12)',
      borderColor: SELL_COLOR,
      borderWidth: 2,
    },
    overlayLines: [
      // 목표가 라인
      { points: [
          { time: firstBar.date, value: targetPrice },
          { time: lastBar.date, value: targetPrice },
        ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
    ],
    patternMarkers: [
      { time: bars[start + p0.index].date, value: p0.value, label: '저항 시작', position: 'above', color: SELL_COLOR },
      { time: lastBar.date, value: support, label: '지지선', position: 'below', color: BUY_COLOR },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 11. 이등변삼각형 공통 (Symmetrical Triangle)
// ─────────────────────────────────────────────────────────────
function detectSymmetricalTriangle(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
  signal: 'buy' | 'sell',
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(60, n - 1);
  const start = n - lookback;
  const slicedHighs = highs.slice(start);
  const slicedLows  = lows.slice(start);

  const peaks   = findPeaks(slicedHighs, 4);
  const troughs = findTroughs(slicedLows, 4);

  if (peaks.length < 2 || troughs.length < 2) return null;

  // High trendline declining
  const highReg = linearRegression(peaks.map(p => ({ x: p.index, y: p.value })));
  // Low trendline rising
  const lowReg  = linearRegression(troughs.map(t => ({ x: t.index, y: t.value })));

  const highDeclines = highReg.slope < 0;
  const lowRises     = lowReg.slope > 0;
  const converging   = highDeclines && lowRises;
  if (!converging) return null;

  // Triangle converging (apex within 20 bars from now)
  const apexX = (lowReg.intercept - highReg.intercept) / (highReg.slope - lowReg.slope);
  const apexClose = apexX <= lookback + 20;

  const resistance = highReg.slope * (lookback - 1) + highReg.intercept;
  const support    = lowReg.slope * (lookback - 1) + lowReg.intercept;
  const currentPrice = closes[n - 1];
  const withinTriangle = currentPrice > support && currentPrice < resistance;

  const prevTrend = signal === 'buy'
    ? pct(closes[start], closes[Math.max(0, start - 10)]) < 0  // preceded by decline
    : pct(closes[start], closes[Math.max(0, start - 10)]) > 0; // preceded by rise

  const criteria: PatternCriteria = {
    '고점 하향 추세선': highDeclines,
    '저점 상향 추세선': lowRises,
    '수렴하는 삼각형': apexClose,
    '삼각형 내 가격 위치': withinTriangle,
    '선행 추세 확인': prevTrend,
  };

  const score =
    35 +
    (apexClose ? 20 : 0) +
    (withinTriangle ? 20 : 0) +
    (prevTrend ? 15 : 0) +
    (highReg.r2 > 0.5 && lowReg.r2 > 0.5 ? 10 : 0);

  if (score < 50) return null;

  const type: ChartPatternType = signal === 'buy' ? 'symmetrical_triangle_bull' : 'symmetrical_triangle_bear';
  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  // 추세선 시작점 = 첫 번째 peak/trough, 끝점 = 현재 (회귀선으로 계산)
  const highStart = highReg.slope * 0 + highReg.intercept;
  const lowStart  = lowReg.slope  * 0 + lowReg.intercept;
  const triangleHeight = highStart - lowStart;
  const targetPrice = signal === 'buy'
    ? resistance + triangleHeight * 0.8
    : support - triangleHeight * 0.8;

  // 수렴점(apex) 계산
  const apexIdx = Math.min(lookback + 15, (lowReg.intercept - highReg.intercept) / (highReg.slope - lowReg.slope));
  const apexBarIdx = Math.min(n - 1, start + Math.floor(apexIdx));
  const apexValue = (resistance + support) / 2;

  const fillColor = signal === 'buy' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  const borderColor = signal === 'buy' ? BUY_COLOR : SELL_COLOR;

  return {
    type,
    name: signal === 'buy' ? '강세 이등변삼각형' : '약세 이등변삼각형',
    signal,
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { support, resistance, target: targetPrice },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    fillArea: {
      points: [
        { time: firstBar.date, value: highStart },
        { time: bars[apexBarIdx].date, value: apexValue },
        { time: firstBar.date, value: lowStart },
      ],
      color: fillColor,
      borderColor: borderColor,
      borderWidth: 2,
    },
    overlayLines: [
      // 목표가 라인
      { points: [
          { time: lastBar.date, value: targetPrice },
          { time: bars[Math.min(n - 1, apexBarIdx + 5)].date, value: targetPrice },
        ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
    ],
    patternMarkers: [
      { time: lastBar.date, value: signal === 'buy' ? resistance : support,
        label: signal === 'buy' ? '돌파 예상' : '이탈 예상',
        position: signal === 'buy' ? 'above' : 'below',
        color: signal === 'buy' ? BUY_COLOR : SELL_COLOR },
    ],
  };
}

function detectSymmetricalTriangleBull(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  return detectSymmetricalTriangle(closes, highs, lows, volumes, bars, 'buy');
}

function detectSymmetricalTriangleBear(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  return detectSymmetricalTriangle(closes, highs, lows, volumes, bars, 'sell');
}

// ─────────────────────────────────────────────────────────────
// 12. 컵 앤 핸들 — 매수
// ─────────────────────────────────────────────────────────────
function detectCupHandle(
  closes: number[], _highs: number[], _lows: number[], _volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(90, n);
  const start = n - lookback;
  const segment = closes.slice(start);
  if (segment.length < 35) return null;

  const smoothed = segment.map((_, idx, arr) => {
    const from = Math.max(0, idx - 2);
    const to = Math.min(arr.length - 1, idx + 2);
    const slice = arr.slice(from, to + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });

  const leftSearchEnd = Math.floor(segment.length * 0.35);
  const middleStart = Math.floor(segment.length * 0.2);
  const middleEnd = Math.floor(segment.length * 0.78);
  const rightSearchStart = Math.floor(segment.length * 0.55);
  const rightSearchEnd = Math.max(rightSearchStart + 6, segment.length - 8);

  const leftRimIdxLocal = smoothed
    .slice(0, leftSearchEnd)
    .indexOf(Math.max(...smoothed.slice(0, leftSearchEnd)));
  const bottomIdxLocal = middleStart + smoothed
    .slice(middleStart, middleEnd)
    .indexOf(Math.min(...smoothed.slice(middleStart, middleEnd)));
  const rightRimIdxLocal = rightSearchStart + smoothed
    .slice(rightSearchStart, rightSearchEnd)
    .indexOf(Math.max(...smoothed.slice(rightSearchStart, rightSearchEnd)));

  if (leftRimIdxLocal >= bottomIdxLocal || bottomIdxLocal >= rightRimIdxLocal) return null;

  const leftRim = smoothed[leftRimIdxLocal];
  const bottom = smoothed[bottomIdxLocal];
  const rightRim = smoothed[rightRimIdxLocal];
  const cupHeight = Math.min(leftRim, rightRim) - bottom;
  const rimsAligned = Math.abs(pct(leftRim, rightRim)) < 6;
  const cupDepthPct = (cupHeight / Math.min(leftRim, rightRim)) * 100;
  const cupDepthValid = cupDepthPct >= 8 && cupDepthPct <= 35;
  const leftSpan = bottomIdxLocal - leftRimIdxLocal;
  const rightSpan = rightRimIdxLocal - bottomIdxLocal;
  const balancedCup = leftSpan >= 6 && rightSpan >= 6 && Math.abs(leftSpan - rightSpan) <= Math.max(8, Math.round((leftSpan + rightSpan) * 0.45));

  const lowerBand = bottom + cupHeight * 0.35;
  const bottomDwellCount = smoothed
    .slice(leftRimIdxLocal, rightRimIdxLocal + 1)
    .filter((value) => value <= lowerBand)
    .length;
  const roundedBottom = bottomDwellCount >= 4;

  if (!rimsAligned || !cupDepthValid || !balancedCup || !roundedBottom) return null;

  const handleStartLocal = rightRimIdxLocal;
  const handleEndLocal = Math.min(segment.length - 1, rightRimIdxLocal + Math.max(5, Math.round((rightRimIdxLocal - leftRimIdxLocal) * 0.28)));
  if (handleEndLocal - handleStartLocal < 3) return null;

  const handleSlice = smoothed.slice(handleStartLocal, handleEndLocal + 1);
  const handleLowLocal = handleStartLocal + handleSlice.indexOf(Math.min(...handleSlice));
  const handleLow = smoothed[handleLowLocal];
  const handleDepth = rightRim - handleLow;
  const handleDepthValid = handleDepth > 0 && handleDepth <= cupHeight * 0.45;
  const handleInUpperHalf = handleLow >= bottom + cupHeight * 0.5;
  const handleSlopeDown = smoothed[handleStartLocal] >= smoothed[handleEndLocal] * 0.985;
  const currentPrice = closes[n - 1];
  const nearBreakout = currentPrice >= rightRim * 0.97;
  const recentPattern = segment.length - 1 - handleLowLocal <= 15;

  if (!handleDepthValid || !handleInUpperHalf || !handleSlopeDown) return null;

  const criteria: PatternCriteria = {
    '좌우 림 높이 유사': rimsAligned,
    '컵 깊이 적정': cupDepthValid,
    '둥근 바닥 형성': roundedBottom,
    '핸들 조정 얕음': handleDepthValid && handleInUpperHalf,
    '림 저항선 근접/돌파': nearBreakout,
    '최근 형성된 패턴': recentPattern,
  };

  const score =
    25 +
    (rimsAligned ? 15 : 0) +
    (cupDepthValid ? 15 : 0) +
    (roundedBottom ? 15 : 0) +
    (handleDepthValid && handleInUpperHalf ? 20 : 0) +
    (nearBreakout ? 20 : 0) +
    (recentPattern ? 10 : 0);

  if (score < 50) return null;

  const leftRimIdx = start + leftRimIdxLocal;
  const bottomIdx = start + bottomIdxLocal;
  const rightRimIdx = start + rightRimIdxLocal;
  const handleLowIdx = start + handleLowLocal;
  const handleEndIdx = start + handleEndLocal;
  const lastIdx = n - 1;
  const projectionEndIdx = getProjectionEndIndex(lastIdx, handleEndIdx, handleEndIdx - leftRimIdx);
  const targetPrice = rightRim + (rightRim - bottom);
  const cupPath = buildSampledPathPoints(bars, closes, leftRimIdx, rightRimIdx, 11);
  const handlePath = buildSampledPathPoints(bars, closes, rightRimIdx, handleEndIdx, 5);

  return {
    type: 'cup_handle',
    name: '컵 앤 핸들',
    signal: 'buy',
    syncRate: Math.min(100, score),
    detectedAt: bars[handleEndIdx]?.date ?? bars[lastIdx].date,
    keyLevels: { support: handleLow, resistance: rightRim, target: targetPrice },
    patternBars: { startIdx: leftRimIdx, endIdx: handleEndIdx },
    criteria,
    overlayLines: [
      {
        points: cupPath,
        color: BUY_COLOR, width: 3, style: 'solid', label: '컵',
      },
      {
        points: handlePath,
        color: BUY_COLOR, width: 3, style: 'solid', label: '핸들',
      },
      {
        points: [
          { time: bars[rightRimIdx].date, value: rightRim },
          { time: bars[projectionEndIdx].date, value: rightRim },
        ],
        color: NECK_COLOR, width: 2, style: 'dotted', label: '림 저항선',
      },
      {
        points: [
          { time: bars[handleEndIdx].date, value: targetPrice },
          { time: bars[projectionEndIdx].date, value: targetPrice },
        ],
        color: '#a855f7', width: 2, style: 'dotted', label: '목표가',
      },
    ],
    patternMarkers: [
      { time: bars[leftRimIdx].date, value: leftRim, label: '좌측 림', position: 'above', color: BUY_COLOR },
      { time: bars[bottomIdx].date, value: bottom, label: '컵 바닥', position: 'below', color: BUY_COLOR },
      { time: bars[rightRimIdx].date, value: rightRim, label: '우측 림', position: 'above', color: BUY_COLOR },
      { time: bars[handleLowIdx].date, value: handleLow, label: '핸들', position: 'below', color: BUY_COLOR },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 13. 인버티드 컵 앤 핸들 — 매도
// ─────────────────────────────────────────────────────────────
function detectInvertedCupHandle(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const inverted = closes.map((value) => -value);
  const result = detectCupHandle(inverted, highs.map((v) => -v), lows.map((v) => -v), volumes, bars);
  if (!result) return null;

  const toPositive = (value: number | undefined) => (value == null ? undefined : -value);

  return {
    ...result,
    type: 'inverted_cup_handle',
    name: '인버티드 컵 앤 핸들',
    signal: 'sell',
    keyLevels: {
      support: toPositive(result.keyLevels.resistance),
      resistance: toPositive(result.keyLevels.support),
      target: toPositive(result.keyLevels.target),
    },
    fillArea: result.fillArea ? {
      ...result.fillArea,
      points: result.fillArea.points.map((point) => ({ ...point, value: -point.value })),
      outlinePoints: result.fillArea.outlinePoints?.map((point) => ({ ...point, value: -point.value })),
      color: 'rgba(239, 68, 68, 0.12)',
      borderColor: SELL_COLOR,
    } : undefined,
    overlayLines: result.overlayLines?.map((line) => ({
      ...line,
      points: line.points.map((point) => ({ ...point, value: -point.value })),
      color: line.label === '목표가' ? '#a855f7' : NECK_COLOR,
      label: line.label === '림 저항선' ? '림 지지선' : line.label,
    })),
    patternMarkers: result.patternMarkers?.map((marker) => ({
      ...marker,
      value: -marker.value,
      position: marker.position === 'above' ? 'below' : 'above',
      color: SELL_COLOR,
      label:
        marker.label === '좌측 림' ? '좌측 림' :
        marker.label === '컵 바닥' ? '컵 천장' :
        marker.label === '우측 림' ? '우측 림' :
        '핸들',
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// 13. 상향쐐기형 (Rising Wedge) — 매도
// TradingView 스타일: 5/5 피벗 포인트 기반 정교한 추세선
// ─────────────────────────────────────────────────────────────
function detectRisingWedge(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(50, n - 1);
  const start = n - lookback;
  const slicedHighs = highs.slice(start);
  const slicedLows  = lows.slice(start);
  const slicedCloses = closes.slice(start);

  // 5/5 피벗 포인트 찾기 (TradingView 기준)
  const peaks   = findPeaks(slicedHighs, 5);
  const troughs = findTroughs(slicedLows, 5);

  if (peaks.length < 2 || troughs.length < 2) return null;

  // 최소 2개의 상승하는 고점과 저점 찾기
  const upperPivots: { index: number; value: number }[] = [];
  const lowerPivots: { index: number; value: number }[] = [];

  // 상승하는 고점들 선택 (최소 2개)
  for (let i = 0; i < peaks.length; i++) {
    if (upperPivots.length === 0 || peaks[i].value > upperPivots[upperPivots.length - 1].value) {
      upperPivots.push(peaks[i]);
    }
  }

  // 상승하는 저점들 선택 (최소 2개)
  for (let i = 0; i < troughs.length; i++) {
    if (lowerPivots.length === 0 || troughs[i].value > lowerPivots[lowerPivots.length - 1].value) {
      lowerPivots.push(troughs[i]);
    }
  }

  if (upperPivots.length < 2 || lowerPivots.length < 2) return null;

  // 추세선 기울기 계산 (첫 번째와 마지막 피벗 연결)
  const upperFirst = upperPivots[0];
  const upperLast = upperPivots[upperPivots.length - 1];
  const lowerFirst = lowerPivots[0];
  const lowerLast = lowerPivots[lowerPivots.length - 1];

  // 최소 간격 확인 (5봉 이상)
  const upperSpan = upperLast.index - upperFirst.index;
  const lowerSpan = lowerLast.index - lowerFirst.index;
  if (upperSpan < 5 || lowerSpan < 5) return null;

  // 기울기 계산
  const upperSlope = (upperLast.value - upperFirst.value) / upperSpan;
  const lowerSlope = (lowerLast.value - lowerFirst.value) / lowerSpan;

  // Rising Wedge 조건: 두 선 모두 상승, 하단선이 더 가파름 (수렴)
  const bothRising = upperSlope > 0 && lowerSlope > 0;
  const converging = lowerSlope > upperSlope; // 하단이 더 가파르면 위에서 수렴

  if (!bothRising || !converging) return null;

  // 추세선 방정식: y = slope * (x - x0) + y0
  const getUpperLine = (idx: number) => upperFirst.value + upperSlope * (idx - upperFirst.index);
  const getLowerLine = (idx: number) => lowerFirst.value + lowerSlope * (idx - lowerFirst.index);

  // 가격이 웻지 내에 있는지 검증 (70% 이상의 캔들이 웻지 내에 있어야 함)
  let insideCount = 0;
  const checkStart = Math.max(upperFirst.index, lowerFirst.index);
  const checkEnd = Math.min(upperLast.index, lowerLast.index);

  for (let i = checkStart; i <= checkEnd; i++) {
    const upper = getUpperLine(i);
    const lower = getLowerLine(i);
    if (slicedCloses[i] <= upper * 1.02 && slicedCloses[i] >= lower * 0.98) {
      insideCount++;
    }
  }
  const insideRatio = insideCount / (checkEnd - checkStart + 1);
  const priceContained = insideRatio >= 0.7;

  if (!priceContained) return null;

  // 거래량 감소 체크
  const volDecline = avgVolume(volumes, start + Math.floor(lookback / 2), n - 1) <
                     avgVolume(volumes, start, start + Math.floor(lookback / 2));

  // 수렴점(apex) 계산
  const apexIdx = (lowerFirst.value - upperFirst.value + upperSlope * upperFirst.index - lowerSlope * lowerFirst.index) /
                  (upperSlope - lowerSlope);
  const currentIdx = slicedCloses.length - 1;
  const progressToApex = (currentIdx - checkStart) / (apexIdx - checkStart);
  const nearApex = progressToApex >= 0.6 && progressToApex <= 1.0;

  // 추세선 품질 (피벗 개수)
  const goodPivotCount = upperPivots.length >= 2 && lowerPivots.length >= 2;

  const criteria: PatternCriteria = {
    '상단 추세선 상승': upperSlope > 0,
    '하단 추세선 상승': lowerSlope > 0,
    '수렴 구조 (하단 > 상단 기울기)': converging,
    '가격 웻지 내 유지': priceContained,
    '거래량 감소': volDecline,
    '수렴점 근접 (60%+)': nearApex,
  };

  const score =
    30 +
    (converging ? 20 : 0) +
    (priceContained ? 20 : 0) +
    (volDecline ? 10 : 0) +
    (nearApex ? 10 : 0) +
    (goodPivotCount ? 10 : 0);

  if (score < 50) return null;

  // 웻지의 공통 시작점과 끝점 계산 (동일한 x좌표에서 추세선 값 계산)
  const patternStartIdx = Math.min(upperFirst.index, lowerFirst.index);
  const patternEndIdx = Math.max(upperLast.index, lowerLast.index);

  // 추세선을 공통 시작점/끝점까지 연장
  const startUpperValue = getUpperLine(patternStartIdx);
  const startLowerValue = getLowerLine(patternStartIdx);
  const endUpperValue = getUpperLine(patternEndIdx);
  const endLowerValue = getLowerLine(patternEndIdx);

  // 실제 바 인덱스로 변환
  const patternStartBar = bars[start + patternStartIdx];
  const patternEndBar = bars[start + patternEndIdx];
  const lastBar = bars[n - 1];

  // 웻지 높이 및 목표가 계산
  const wedgeHeight = startUpperValue - startLowerValue;
  const targetPrice = endLowerValue - wedgeHeight;

  // 시작점과 끝점이 같으면 패턴 무효
  if (patternStartBar.date === patternEndBar.date) return null;

  return {
    type: 'rising_wedge',
    name: '상향쐐기형',
    signal: 'sell',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: {
      resistance: endUpperValue,
      support: endLowerValue,
      target: targetPrice
    },
    patternBars: { startIdx: start + patternStartIdx, endIdx: start + patternEndIdx },
    criteria,
    fillArea: {
      points: [
        { time: patternStartBar.date, value: startUpperValue },
        { time: patternEndBar.date, value: endUpperValue },
        { time: patternEndBar.date, value: endLowerValue },
        { time: patternStartBar.date, value: startLowerValue },
      ],
      color: 'rgba(239, 68, 68, 0.10)',
      borderColor: SELL_COLOR,
      borderWidth: 2,
    },
    overlayLines: [
      // 상단 추세선 (저항선)
      {
        points: [
          { time: patternStartBar.date, value: startUpperValue },
          { time: patternEndBar.date, value: endUpperValue },
        ],
        color: SELL_COLOR, width: 2 as const, style: 'solid' as const, label: '상단 추세선',
      },
      // 하단 추세선 (지지선)
      {
        points: [
          { time: patternStartBar.date, value: startLowerValue },
          { time: patternEndBar.date, value: endLowerValue },
        ],
        color: SELL_COLOR, width: 2 as const, style: 'solid' as const, label: '하단 추세선',
      },
      // 목표가 라인
      ...(patternEndBar.date !== lastBar.date ? [{
        points: [
          { time: patternEndBar.date, value: targetPrice },
          { time: lastBar.date, value: targetPrice },
        ],
        color: '#a855f7', width: 2 as const, style: 'dotted' as const, label: '목표가',
      }] : []),
    ],
    patternMarkers: [
      { time: bars[start + upperFirst.index].date, value: upperFirst.value, label: '1', position: 'above', color: SELL_COLOR },
      { time: bars[start + lowerFirst.index].date, value: lowerFirst.value, label: '2', position: 'below', color: SELL_COLOR },
      { time: bars[start + upperLast.index].date, value: upperLast.value, label: '3', position: 'above', color: SELL_COLOR },
      { time: bars[start + lowerLast.index].date, value: lowerLast.value, label: '4', position: 'below', color: SELL_COLOR },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 14. 하향쐐기형 (Falling Wedge) — 매수
// TradingView 스타일: 5/5 피벗 포인트 기반 정교한 추세선
// ─────────────────────────────────────────────────────────────
function detectFallingWedge(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(50, n - 1);
  const start = n - lookback;
  const slicedHighs = highs.slice(start);
  const slicedLows  = lows.slice(start);
  const slicedCloses = closes.slice(start);

  // 5/5 피벗 포인트 찾기 (TradingView 기준)
  const peaks   = findPeaks(slicedHighs, 5);
  const troughs = findTroughs(slicedLows, 5);

  if (peaks.length < 2 || troughs.length < 2) return null;

  // 하락하는 고점과 저점들 선택 (최소 2개)
  const upperPivots: { index: number; value: number }[] = [];
  const lowerPivots: { index: number; value: number }[] = [];

  // 하락하는 고점들 선택
  for (let i = 0; i < peaks.length; i++) {
    if (upperPivots.length === 0 || peaks[i].value < upperPivots[upperPivots.length - 1].value) {
      upperPivots.push(peaks[i]);
    }
  }

  // 하락하는 저점들 선택
  for (let i = 0; i < troughs.length; i++) {
    if (lowerPivots.length === 0 || troughs[i].value < lowerPivots[lowerPivots.length - 1].value) {
      lowerPivots.push(troughs[i]);
    }
  }

  if (upperPivots.length < 2 || lowerPivots.length < 2) return null;

  // 추세선 기울기 계산
  const upperFirst = upperPivots[0];
  const upperLast = upperPivots[upperPivots.length - 1];
  const lowerFirst = lowerPivots[0];
  const lowerLast = lowerPivots[lowerPivots.length - 1];

  // 최소 간격 확인 (5봉 이상)
  const upperSpan = upperLast.index - upperFirst.index;
  const lowerSpan = lowerLast.index - lowerFirst.index;
  if (upperSpan < 5 || lowerSpan < 5) return null;

  const upperSlope = (upperLast.value - upperFirst.value) / upperSpan;
  const lowerSlope = (lowerLast.value - lowerFirst.value) / lowerSpan;

  // Falling Wedge 조건: 두 선 모두 하락, 상단선이 더 가파름 (아래에서 수렴)
  const bothFalling = upperSlope < 0 && lowerSlope < 0;
  const converging = Math.abs(upperSlope) > Math.abs(lowerSlope); // 상단이 더 가파르면 아래에서 수렴

  if (!bothFalling || !converging) return null;

  // 추세선 방정식
  const getUpperLine = (idx: number) => upperFirst.value + upperSlope * (idx - upperFirst.index);
  const getLowerLine = (idx: number) => lowerFirst.value + lowerSlope * (idx - lowerFirst.index);

  // 가격이 웻지 내에 있는지 검증 (70% 이상)
  let insideCount = 0;
  const checkStart = Math.max(upperFirst.index, lowerFirst.index);
  const checkEnd = Math.min(upperLast.index, lowerLast.index);

  for (let i = checkStart; i <= checkEnd; i++) {
    const upper = getUpperLine(i);
    const lower = getLowerLine(i);
    if (slicedCloses[i] <= upper * 1.02 && slicedCloses[i] >= lower * 0.98) {
      insideCount++;
    }
  }
  const insideRatio = insideCount / (checkEnd - checkStart + 1);
  const priceContained = insideRatio >= 0.7;

  if (!priceContained) return null;

  // 거래량 감소 체크
  const volDecline = avgVolume(volumes, start + Math.floor(lookback / 2), n - 1) <
                     avgVolume(volumes, start, start + Math.floor(lookback / 2));

  // 수렴점 및 진행도 계산
  const currentIdx = slicedCloses.length - 1;
  const apexIdx = (lowerFirst.value - upperFirst.value + upperSlope * upperFirst.index - lowerSlope * lowerFirst.index) /
                  (upperSlope - lowerSlope);
  const progressToApex = (currentIdx - checkStart) / (apexIdx - checkStart);
  const nearApex = progressToApex >= 0.6 && progressToApex <= 1.0;

  // 상방 돌파 근접 체크
  const currentUpper = getUpperLine(currentIdx);
  const currentPrice = slicedCloses[currentIdx];
  const nearBreakout = currentPrice >= currentUpper * 0.97;

  const criteria: PatternCriteria = {
    '상단 추세선 하락': upperSlope < 0,
    '하단 추세선 하락': lowerSlope < 0,
    '수렴 구조 (상단 > 하단 기울기)': converging,
    '가격 웻지 내 유지': priceContained,
    '거래량 감소': volDecline,
    '저항선 근접/돌파': nearBreakout,
  };

  const score =
    30 +
    (converging ? 20 : 0) +
    (priceContained ? 20 : 0) +
    (volDecline ? 10 : 0) +
    (nearBreakout ? 15 : 0) +
    (nearApex ? 5 : 0);

  if (score < 50) return null;

  // 웻지의 공통 시작점과 끝점 계산 (동일한 x좌표에서 추세선 값 계산)
  const patternStartIdx = Math.min(upperFirst.index, lowerFirst.index);
  const patternEndIdx = Math.max(upperLast.index, lowerLast.index);

  // 추세선을 공통 시작점/끝점까지 연장
  const startUpperValue = getUpperLine(patternStartIdx);
  const startLowerValue = getLowerLine(patternStartIdx);
  const endUpperValue = getUpperLine(patternEndIdx);
  const endLowerValue = getLowerLine(patternEndIdx);

  // 실제 바 인덱스로 변환
  const patternStartBar = bars[start + patternStartIdx];
  const patternEndBar = bars[start + patternEndIdx];
  const lastBar = bars[n - 1];

  // 웻지 높이 및 목표가 계산
  const wedgeHeight = startUpperValue - startLowerValue;
  const targetPrice = endUpperValue + wedgeHeight;

  // 시작점과 끝점이 같으면 패턴 무효
  if (patternStartBar.date === patternEndBar.date) return null;

  return {
    type: 'falling_wedge',
    name: '하향쐐기형',
    signal: 'buy',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: {
      resistance: endUpperValue,
      support: endLowerValue,
      target: targetPrice
    },
    patternBars: { startIdx: start + patternStartIdx, endIdx: start + patternEndIdx },
    criteria,
    fillArea: {
      points: [
        { time: patternStartBar.date, value: startUpperValue },
        { time: patternEndBar.date, value: endUpperValue },
        { time: patternEndBar.date, value: endLowerValue },
        { time: patternStartBar.date, value: startLowerValue },
      ],
      color: 'rgba(22, 163, 74, 0.10)',
      borderColor: BUY_COLOR,
      borderWidth: 2,
    },
    overlayLines: [
      // 상단 추세선 (저항선)
      {
        points: [
          { time: patternStartBar.date, value: startUpperValue },
          { time: patternEndBar.date, value: endUpperValue },
        ],
        color: BUY_COLOR, width: 2 as const, style: 'solid' as const, label: '상단 추세선',
      },
      // 하단 추세선 (지지선)
      {
        points: [
          { time: patternStartBar.date, value: startLowerValue },
          { time: patternEndBar.date, value: endLowerValue },
        ],
        color: BUY_COLOR, width: 2 as const, style: 'solid' as const, label: '하단 추세선',
      },
      // 목표가 라인
      ...(patternEndBar.date !== lastBar.date ? [{
        points: [
          { time: patternEndBar.date, value: targetPrice },
          { time: lastBar.date, value: targetPrice },
        ],
        color: '#a855f7', width: 2 as const, style: 'dotted' as const, label: '목표가',
      }] : []),
    ],
    patternMarkers: [
      { time: bars[start + upperFirst.index].date, value: upperFirst.value, label: '1', position: 'above', color: BUY_COLOR },
      { time: bars[start + lowerFirst.index].date, value: lowerFirst.value, label: '2', position: 'below', color: BUY_COLOR },
      { time: bars[start + upperLast.index].date, value: upperLast.value, label: '3', position: 'above', color: BUY_COLOR },
      { time: bars[start + lowerLast.index].date, value: lowerLast.value, label: '4', position: 'below', color: BUY_COLOR },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 15. 상승삼각깃발형 (Bull Pennant) — 매수
// ─────────────────────────────────────────────────────────────
function detectBullPennant(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(50, n - 1);

  for (let poleEnd = n - 8; poleEnd >= n - lookback; poleEnd--) {
    for (let poleStart = poleEnd - 15; poleStart >= Math.max(0, poleEnd - 25); poleStart--) {
      const poleReturn = pct(closes[poleEnd], closes[poleStart]);
      if (poleReturn < 8) continue;

      const flagSlice = { h: highs.slice(poleEnd, n), l: lows.slice(poleEnd, n) };
      if (flagSlice.h.length < 5) continue;

      const peaksF   = findPeaks(flagSlice.h, 2);
      const troughsF = findTroughs(flagSlice.l, 2);

      if (peaksF.length < 2 || troughsF.length < 2) continue;

      const highReg = linearRegression(peaksF.map(p => ({ x: p.index, y: p.value })));
      const lowReg  = linearRegression(troughsF.map(t => ({ x: t.index, y: t.value })));

      const converging  = highReg.slope < 0 && lowReg.slope > 0;
      if (!converging) continue;

      const volDecline  = avgVolume(volumes, poleEnd, n - 1) < avgVolume(volumes, poleStart, poleEnd);
      const strongPole  = poleReturn > 10;

      const criteria: PatternCriteria = {
        '강한 상승 깃대': strongPole,
        '수렴하는 삼각형(페넌트)': converging,
        '깃발 거래량 감소': volDecline,
      };

      const score =
        30 +
        (strongPole ? 25 : 10) +
        (converging ? 25 : 0) +
        (volDecline ? 20 : 0);

      if (score < 50) continue;

      const pennantStartDate = bars[poleEnd]?.date ?? bars[n - 1].date;
      const pennantEndDate   = bars[n - 1].date;
      const highEnd = highReg.slope * (flagSlice.h.length - 1) + highReg.intercept;
      const lowEnd  = lowReg.slope  * (flagSlice.l.length - 1) + lowReg.intercept;
      const poleHeight = closes[poleEnd] - closes[poleStart];
      const targetPrice = Math.max(...flagSlice.h) + poleHeight;

      return {
        type: 'bull_pennant',
        name: '상승삼각깃발형',
        signal: 'buy',
        syncRate: Math.min(100, score),
        detectedAt: pennantStartDate,
        keyLevels: { support: Math.min(...flagSlice.l), resistance: Math.max(...flagSlice.h), target: targetPrice },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          // 깃대
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: BUY_COLOR, width: 3, style: 'solid', label: '깃대' },
          // 페넌트 상단 (수렴)
          { points: [
              { time: pennantStartDate, value: highReg.intercept },
              { time: pennantEndDate,   value: highEnd },
            ], color: CHANNEL_COLOR, width: 2, style: 'dashed', label: '페넌트 상단' },
          // 페넌트 하단 (수렴)
          { points: [
              { time: pennantStartDate, value: lowReg.intercept },
              { time: pennantEndDate,   value: lowEnd },
            ], color: CHANNEL_COLOR, width: 2, style: 'dashed', label: '페넌트 하단' },
          // 목표가 라인
          { points: [
              { time: pennantStartDate, value: targetPrice },
              { time: pennantEndDate, value: targetPrice },
            ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
        ],
        patternMarkers: [
          { time: bars[poleStart].date, value: closes[poleStart], label: '깃대 시작', position: 'below', color: BUY_COLOR },
          { time: bars[poleEnd].date, value: closes[poleEnd], label: '깃대 끝', position: 'above', color: BUY_COLOR },
        ],
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 16. 하락삼각깃발형 (Bear Pennant) — 매도
// ─────────────────────────────────────────────────────────────
function detectBearPennant(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(50, n - 1);

  for (let poleEnd = n - 8; poleEnd >= n - lookback; poleEnd--) {
    for (let poleStart = poleEnd - 15; poleStart >= Math.max(0, poleEnd - 25); poleStart--) {
      const poleReturn = pct(closes[poleEnd], closes[poleStart]);
      if (poleReturn > -8) continue;

      const flagSlice = { h: highs.slice(poleEnd, n), l: lows.slice(poleEnd, n) };
      if (flagSlice.h.length < 5) continue;

      const peaksF   = findPeaks(flagSlice.h, 2);
      const troughsF = findTroughs(flagSlice.l, 2);

      if (peaksF.length < 2 || troughsF.length < 2) continue;

      const highReg = linearRegression(peaksF.map(p => ({ x: p.index, y: p.value })));
      const lowReg  = linearRegression(troughsF.map(t => ({ x: t.index, y: t.value })));

      const converging  = highReg.slope < 0 && lowReg.slope > 0;
      if (!converging) continue;

      const volDecline  = avgVolume(volumes, poleEnd, n - 1) < avgVolume(volumes, poleStart, poleEnd);
      const strongPole  = poleReturn < -10;

      const criteria: PatternCriteria = {
        '강한 하락 깃대': strongPole,
        '수렴하는 삼각형(페넌트)': converging,
        '깃발 거래량 감소': volDecline,
      };

      const score =
        30 +
        (strongPole ? 25 : 10) +
        (converging ? 25 : 0) +
        (volDecline ? 20 : 0);

      if (score < 50) continue;

      const pennantStartDate = bars[poleEnd]?.date ?? bars[n - 1].date;
      const pennantEndDate   = bars[n - 1].date;
      const highEnd = highReg.slope * (flagSlice.h.length - 1) + highReg.intercept;
      const lowEnd  = lowReg.slope  * (flagSlice.l.length - 1) + lowReg.intercept;
      const poleHeight = closes[poleStart] - closes[poleEnd];
      const targetPrice = Math.min(...flagSlice.l) - poleHeight;

      return {
        type: 'bear_pennant',
        name: '하락삼각깃발형',
        signal: 'sell',
        syncRate: Math.min(100, score),
        detectedAt: pennantStartDate,
        keyLevels: { support: Math.min(...flagSlice.l), resistance: Math.max(...flagSlice.h), target: targetPrice },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: SELL_COLOR, width: 3, style: 'solid', label: '깃대' },
          { points: [
              { time: pennantStartDate, value: highReg.intercept },
              { time: pennantEndDate,   value: highEnd },
            ], color: CHANNEL_COLOR, width: 2, style: 'dashed', label: '페넌트 상단' },
          { points: [
              { time: pennantStartDate, value: lowReg.intercept },
              { time: pennantEndDate,   value: lowEnd },
            ], color: CHANNEL_COLOR, width: 2, style: 'dashed', label: '페넌트 하단' },
          // 목표가 라인
          { points: [
              { time: pennantStartDate, value: targetPrice },
              { time: pennantEndDate, value: targetPrice },
            ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
        ],
        patternMarkers: [
          { time: bars[poleStart].date, value: closes[poleStart], label: '깃대 시작', position: 'above', color: SELL_COLOR },
          { time: bars[poleEnd].date, value: closes[poleEnd], label: '깃대 끝', position: 'below', color: SELL_COLOR },
        ],
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 17 & 18. 직사각형 (Rectangle Bull / Bear)
// ─────────────────────────────────────────────────────────────
function detectRectangle(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
  signal: 'buy' | 'sell',
): PatternResult | null {
  const n = closes.length;
  const lookback = Math.min(60, n - 1);
  const start = n - lookback;
  const slicedHighs = highs.slice(start);
  const slicedLows  = lows.slice(start);

  const peaks   = findPeaks(slicedHighs, 4);
  const troughs = findTroughs(slicedLows, 4);

  if (peaks.length < 2 || troughs.length < 2) return null;

  const peakValues   = peaks.map(p => p.value);
  const troughValues = troughs.map(t => t.value);
  const avgPeak   = peakValues.reduce((a, b) => a + b, 0) / peakValues.length;
  const avgTrough = troughValues.reduce((a, b) => a + b, 0) / troughValues.length;

  const peaksFlat   = peakValues.every(v => Math.abs(pct(v, avgPeak)) < 3);
  const troughsFlat = troughValues.every(v => Math.abs(pct(v, avgTrough)) < 3);

  if (!peaksFlat || !troughsFlat) return null;

  const rangeRatio = pct(avgPeak, avgTrough);
  const meaningfulRange = rangeRatio > 3;

  // Preceding trend
  const preTrendBars = closes.slice(Math.max(0, start - 20), start);
  const preTrend = preTrendBars.length > 0
    ? pct(preTrendBars[preTrendBars.length - 1], preTrendBars[0])
    : 0;
  const correctTrend = signal === 'buy' ? preTrend > 3 : preTrend < -3;

  const currentPrice = closes[n - 1];
  const nearBreakout = signal === 'buy'
    ? currentPrice > avgPeak * 0.97
    : currentPrice < avgTrough * 1.03;

  const criteria: PatternCriteria = {
    '수평 저항선': peaksFlat,
    '수평 지지선': troughsFlat,
    '의미있는 박스권 폭': meaningfulRange,
    '선행 추세 확인': correctTrend,
    '돌파 근접': nearBreakout,
  };

  const score =
    35 +
    (meaningfulRange ? 15 : 0) +
    (correctTrend ? 20 : 0) +
    (nearBreakout ? 20 : 0) +
    (peaks.length >= 3 ? 10 : 0);

  if (score < 50) return null;

  const type: ChartPatternType = signal === 'buy' ? 'rectangle_bull' : 'rectangle_bear';
  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  const boxColor = signal === 'buy' ? BUY_COLOR : SELL_COLOR;
  const boxHeight = avgPeak - avgTrough;
  const targetPrice = signal === 'buy' ? avgPeak + boxHeight : avgTrough - boxHeight;

  return {
    type,
    name: signal === 'buy' ? '상승직사각형' : '하락직사각형',
    signal,
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance: avgPeak, support: avgTrough, target: targetPrice },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      // 박스 상단
      { points: [
          { time: firstBar.date, value: avgPeak },
          { time: lastBar.date,  value: avgPeak },
        ], color: SELL_COLOR, width: 2, style: 'dashed', label: '저항선' },
      // 박스 하단
      { points: [
          { time: firstBar.date, value: avgTrough },
          { time: lastBar.date,  value: avgTrough },
        ], color: BUY_COLOR, width: 2, style: 'dashed', label: '지지선' },
      // 박스 왼쪽 수직선
      { points: [
          { time: firstBar.date, value: avgPeak },
          { time: firstBar.date, value: avgTrough },
        ], color: boxColor, width: 1, style: 'dotted', label: '' },
      // 목표가 라인
      { points: [
          { time: firstBar.date, value: targetPrice },
          { time: lastBar.date, value: targetPrice },
        ], color: '#a855f7', width: 2, style: 'dotted', label: '목표가' },
    ],
    patternMarkers: [
      { time: lastBar.date, value: signal === 'buy' ? avgPeak : avgTrough,
        label: signal === 'buy' ? '돌파 예상' : '이탈 예상',
        position: signal === 'buy' ? 'above' : 'below',
        color: boxColor },
    ],
  };
}

function detectRectangleBull(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  return detectRectangle(closes, highs, lows, volumes, bars, 'buy');
}

function detectRectangleBear(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  return detectRectangle(closes, highs, lows, volumes, bars, 'sell');
}

// ─────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────
type Detector = (
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
) => PatternResult | null;

const DETECTORS: Detector[] = [
  detectHeadAndShoulders,
  detectInverseHeadAndShoulders,
  detectDoubleTop,
  detectDoubleBottom,
  detectTripleTop,
  detectTripleBottom,
  detectBullFlag,
  detectBearFlag,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectSymmetricalTriangleBull,
  detectSymmetricalTriangleBear,
  detectCupHandle,
  detectInvertedCupHandle,
  detectRisingWedge,
  detectFallingWedge,
  detectBullPennant,
  detectBearPennant,
  detectRectangleBull,
  detectRectangleBear,
];

/**
 * history: newest-first (same convention as other strategies)
 * Returns detected patterns sorted by syncRate descending
 */
export function detectAllPatterns(history: PriceBar[]): PatternResult[] {
  if (!history || history.length < 20) return [];

  // Convert to chronological order
  const bars = [...history].reverse();
  // 최근 3개월 (약 63 거래일)만 분석
  const lookback = Math.min(63, bars.length);
  const recent = bars.slice(bars.length - lookback);

  const closes  = recent.map(b => b.price);
  const highs   = recent.map(b => b.high);
  const lows    = recent.map(b => b.low);
  const volumes = recent.map(b => b.volume);

  const results: PatternResult[] = [];

  for (const detect of DETECTORS) {
    try {
      const r = detect(closes, highs, lows, volumes, recent);
      if (r && r.syncRate >= 50) results.push(r);
    } catch { /* skip on error */ }
  }

  return results.sort((a, b) => b.syncRate - a.syncRate);
}
