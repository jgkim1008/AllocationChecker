// chart-pattern-calculator.ts
// 일봉 기준 19개 차트 패턴 감지 엔진

export type ChartPatternType =
  | 'head_and_shoulders'
  | 'inverse_head_shoulders'
  | 'double_top'
  | 'double_bottom'
  | 'symmetrical_triangle_bull'
  | 'symmetrical_triangle_bear'
  | 'ascending_triangle'
  | 'descending_triangle'
  | 'broadening_triangle'
  | 'rising_wedge'
  | 'falling_wedge'
  | 'bull_flag'
  | 'bear_flag'
  | 'bull_pennant'
  | 'bear_pennant'
  | 'rectangle_bull'
  | 'rectangle_bear'
  | 'v_bottom'
  | 'v_top';

export interface PatternGuide {
  visual: string;    // 차트가 어떻게 생겼는지 (그림으로 묘사)
  meaning: string;   // 이 패턴이 의미하는 것
  action: string;    // 실제 어떻게 대응하면 되는지
  caution: string;   // 주의할 점
  tip: string;       // 초보자를 위한 꿀팁
}

export const PATTERN_INFO: Record<
  ChartPatternType,
  { name: string; signal: 'buy' | 'sell'; description: string; category: string; guide: PatternGuide }
> = {
  head_and_shoulders: {
    name: '머리어깨형', signal: 'sell', category: '반전',
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
    name: '역머리어깨형', signal: 'buy', category: '반전',
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
    name: '쌍봉형', signal: 'sell', category: '반전',
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
    name: '역쌍봉형', signal: 'buy', category: '반전',
    description: '두 개의 골짜기가 비슷한 깊이에 형성된 후 상승합니다.',
    guide: {
      visual: '차트에서 비슷한 깊이의 두 골짜기가 나타나며 영어 알파벳 "W" 모양처럼 보입니다. 첫 번째 저점 → 중간 반등 → 두 번째 저점(첫 번째와 비슷한 깊이) 순으로 형성됩니다.',
      meaning: '같은 가격대에서 두 번 지지를 받았다는 의미입니다. 매도세가 그 가격 아래로 끌어내릴 힘이 없다는 신호로, 상승 반전 가능성이 높습니다.',
      action: '중간 반등의 고점(넥라인)을 종가가 돌파할 때 매수를 고려합니다. 목표가는 "넥라인 + (넥라인 - 두 바닥 평균)"으로 계산합니다.',
      caution: '두 바닥의 깊이 차이가 3% 이내일 때 더 신뢰할 수 있습니다. 두 번째 바닥에서 매수하는 것은 위험하며, 넥라인 돌파를 확인한 후 진입하는 것이 안전합니다.',
      tip: '⭐ 넥라인 돌파 후 다시 넥라인 부근으로 되돌아오는 경우(눌림목)가 많습니다. 이때 지지받으면 추가 매수 기회가 될 수 있습니다.',
    },
  },
  symmetrical_triangle_bull: {
    name: '강세 이등변삼각형', signal: 'buy', category: '삼각형',
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
    name: '약세 이등변삼각형', signal: 'sell', category: '삼각형',
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
    name: '상승삼각형', signal: 'buy', category: '삼각형',
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
    name: '하락삼각형', signal: 'sell', category: '삼각형',
    description: '지지선이 수평이고 저항선이 하향합니다.',
    guide: {
      visual: '아래쪽은 일정한 지지선(수평선)에서 계속 받치지만, 위쪽 고점은 점점 낮아지는 패턴입니다. 매수세가 점점 힘을 잃어가는 모습입니다.',
      meaning: '매도세가 점점 강해지고 있다는 신호입니다. 고점이 낮아진다는 것은 매수 의지가 줄고 있음을 의미합니다. 지지선 이탈 시 강한 하락이 예상됩니다.',
      action: '수평 지지선을 종가 기준으로 하향 이탈할 때 매도(또는 손절)합니다. 보유 중이라면 지지선 근처에서 매도 주문을 준비하는 것이 좋습니다.',
      caution: '지지선이 여러 번 지지에 성공한 이력이 있을수록 이탈 시 더 큰 하락이 올 수 있습니다. 반대로 거짓 이탈도 잦으니 종가 기준으로 판단하세요.',
      tip: '⭐ 하락삼각형에서 보유 중인 경우, 지지선 이탈 전에 비중을 줄이는 것이 현명합니다. 미리 손절 라인을 설정해 두세요.',
    },
  },
  broadening_triangle: {
    name: '확장삼각형', signal: 'sell', category: '삼각형',
    description: '저항선이 상향하고 지지선이 하향하며 변동성이 확대됩니다.',
    guide: {
      visual: '일반 삼각형과 반대로 가격이 점점 넓게 퍼지는 나팔 모양(메가폰)입니다. 고점은 계속 높아지고 저점은 계속 낮아지면서 변동성이 커집니다.',
      meaning: '시장이 불안정해지고 있다는 신호입니다. 매수세와 매도세가 격렬하게 싸우면서 변동폭이 커지는 상황으로, 이런 불확실성은 결국 하락으로 이어지는 경우가 많습니다.',
      action: '저항선 근처에서 매도를 고려하거나, 지지선 이탈 시 추가 매도를 생각할 수 있습니다. 이 패턴에서는 리스크 관리가 최우선입니다.',
      caution: '확장삼각형은 예측하기 가장 어려운 패턴 중 하나입니다. 변동성이 크기 때문에 레버리지 투자는 특히 위험합니다.',
      tip: '⭐ 이 패턴이 나타날 때는 포지션 크기를 줄이고 관망하는 것도 좋은 전략입니다. 급하게 움직이지 말고 추세가 확정될 때까지 기다리세요.',
    },
  },
  rising_wedge: {
    name: '상향쐐기형', signal: 'sell', category: '쐐기',
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
    name: '하향쐐기형', signal: 'buy', category: '쐐기',
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
    name: '상승사각깃발형', signal: 'buy', category: '깃발',
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
    name: '하락사각깃발형', signal: 'sell', category: '깃발',
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
    name: '상승삼각깃발형', signal: 'buy', category: '깃발',
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
    name: '하락삼각깃발형', signal: 'sell', category: '깃발',
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
    name: '상승직사각형', signal: 'buy', category: '직사각형',
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
    name: '하락직사각형', signal: 'sell', category: '직사각형',
    description: '하락추세 중 직사각형 보합 구간이 나타난 후 하락합니다.',
    guide: {
      visual: '하락 추세 중 일정 가격대에서 박스권을 형성합니다. 상승직사각형과 모양은 같지만 하락 추세 중에 나타나 하락 지속 신호로 봅니다.',
      meaning: '하락 추세 중 잠시 숨고르는 구간입니다. 보유 물량이 정리되는 시간으로, 박스권 하단 이탈 시 하락 추세가 재개됩니다.',
      action: '박스권 하단을 종가가 이탈할 때 매도 또는 손절을 고려합니다.',
      caution: '박스권 내에서 반등 매수 유혹이 있을 수 있지만, 하락 추세 중 박스권은 하락 지속의 전조인 경우가 많습니다.',
      tip: '⭐ 보유 중인 종목이 하락 후 박스권을 형성하면 주의가 필요합니다. 반등 시 비중을 줄이는 기회로 활용하세요.',
    },
  },
  v_bottom: {
    name: 'V Bottom형', signal: 'buy', category: 'V형',
    description: '급격한 하락 후 급격히 상승하는 V자 형태입니다.',
    guide: {
      visual: '차트가 갑자기 급격히 하락했다가 바닥에서 빠르게 반등해 V자 모양을 만듭니다. 하락과 상승 모두 빠르고 가파른 것이 특징입니다.',
      meaning: '공황적 매도(패닉 셀)가 끝나고 강력한 매수세가 유입되고 있음을 나타냅니다. 급격한 반전이 일어났다는 의미로, 단기적으로 강한 상승이 지속될 수 있습니다.',
      action: 'V자 바닥 형성 후 이전 고점을 돌파하거나 거래량이 크게 늘어날 때 매수를 고려합니다. 바닥 근처에서 직접 진입하는 것은 위험합니다.',
      caution: 'V자 패턴은 빠른 반등처럼 보이지만, 반등 후 다시 하락(더블딥)하는 경우도 많습니다. 섣부른 판단보다는 상승이 지속되는지 확인이 필요합니다.',
      tip: '⭐ V자 바닥 직후 매수보다는 어느 정도 상승이 확인된 후 눌림목(첫 조정)에서 매수하는 것이 더 안전합니다.',
    },
  },
  v_top: {
    name: 'V Top형', signal: 'sell', category: 'V형',
    description: '급격한 상승 후 급격히 하락하는 역V자 형태입니다.',
    guide: {
      visual: '차트가 갑자기 급격히 상승했다가 고점에서 빠르게 하락해 역V자(산) 모양을 만듭니다. 오를 때와 내릴 때 모두 가파른 것이 특징입니다.',
      meaning: '강한 상승 후 갑작스러운 매도 압력이 몰려 급락이 발생하고 있습니다. 고점에서 많은 투자자들이 손실을 보고 있는 상황으로, 추세 전환의 가능성이 높습니다.',
      action: '고점 확인 후 빠르게 매도하거나 하락 추세 확인 시 손절합니다. V Top은 반등을 기대하며 버티기보다 빠른 대응이 중요합니다.',
      caution: '급상승 중에는 고점을 예측하기 어렵습니다. 무작정 역V자를 예상하고 공매도하는 것은 위험하며, 실제 하락이 확인된 후 대응하세요.',
      tip: '⭐ 보유 중인 종목에서 V Top이 나타나면 미련 없이 매도하는 것이 현명합니다. "다시 오르겠지"라는 생각이 더 큰 손실로 이어질 수 있습니다.',
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

    return {
      type: 'head_and_shoulders',
      name: '머리어깨형',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[rs.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { neckline, resistance: head.value },
      patternBars: { startIdx: ls.index, endIdx: Math.min(rs.index + 5, closes.length - 1) },
      criteria,
      overlayLines: [
        // 패턴 윤곽 (어깨 → 골 → 머리 → 골 → 어깨)
        {
          points: [
            { time: bars[ls.index].date,   value: ls.value },
            { time: bars[t1Idx].date,       value: closes[t1Idx] },
            { time: bars[head.index].date,  value: head.value },
            { time: bars[t2Idx].date,       value: closes[t2Idx] },
            { time: bars[rs.index].date,    value: rs.value },
          ],
          color: SELL_COLOR, width: 2, style: 'solid', label: '머리어깨 윤곽',
        },
        // 넥라인 (골짜기 연결 → 오른쪽으로 연장)
        {
          points: [
            { time: bars[t1Idx].date,   value: closes[t1Idx] },
            { time: bars[t2Idx].date,   value: closes[t2Idx] },
            { time: bars[lastIdx].date, value: closes[t2Idx] },
          ],
          color: NECK_COLOR, width: 2, style: 'dashed', label: '넥라인',
        },
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

    return {
      type: 'inverse_head_shoulders',
      name: '역머리어깨형',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[rs.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { neckline, support: head.value },
      patternBars: { startIdx: ls.index, endIdx: Math.min(rs.index + 5, closes.length - 1) },
      criteria,
      overlayLines: [
        {
          points: [
            { time: bars[ls.index].date,   value: ls.value },
            { time: bars[t1Idx].date,       value: closes[t1Idx] },
            { time: bars[head.index].date,  value: head.value },
            { time: bars[t2Idx].date,       value: closes[t2Idx] },
            { time: bars[rs.index].date,    value: rs.value },
          ],
          color: BUY_COLOR, width: 2, style: 'solid', label: '역머리어깨 윤곽',
        },
        {
          points: [
            { time: bars[t1Idx].date,   value: closes[t1Idx] },
            { time: bars[t2Idx].date,   value: closes[t2Idx] },
            { time: bars[lastIdx].date, value: closes[t2Idx] },
          ],
          color: NECK_COLOR, width: 2, style: 'dashed', label: '넥라인',
        },
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

    return {
      type: 'double_top',
      name: '쌍봉형',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[p2.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { resistance: Math.max(p1.value, p2.value), neckline, target: neckline - (p1.value - neckline) },
      patternBars: { startIdx: p1.index, endIdx: closes.length - 1 },
      criteria,
      overlayLines: [
        // M자 윤곽
        {
          points: [
            { time: bars[p1.index].date,     value: p1.value },
            { time: bars[valleyIdx].date,     value: closes[valleyIdx] },
            { time: bars[p2.index].date,      value: p2.value },
            { time: bars[lastIdx].date,       value: closes[lastIdx] },
          ],
          color: SELL_COLOR, width: 2, style: 'solid', label: '쌍봉 윤곽',
        },
        // 넥라인
        {
          points: [
            { time: bars[p1.index].date,  value: neckline },
            { time: bars[lastIdx].date,   value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dashed', label: '넥라인',
        },
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

    return {
      type: 'double_bottom',
      name: '역쌍봉형',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[t2.index]?.date ?? bars[bars.length - 1].date,
      keyLevels: { support: Math.min(t1.value, t2.value), neckline, target: neckline + (neckline - t1.value) },
      patternBars: { startIdx: t1.index, endIdx: closes.length - 1 },
      criteria,
      overlayLines: [
        // W자 윤곽
        {
          points: [
            { time: bars[t1.index].date,  value: t1.value },
            { time: bars[peakIdx].date,   value: closes[peakIdx] },
            { time: bars[t2.index].date,  value: t2.value },
            { time: bars[lastIdx].date,   value: closes[lastIdx] },
          ],
          color: BUY_COLOR, width: 2, style: 'solid', label: '쌍바닥 윤곽',
        },
        // 넥라인
        {
          points: [
            { time: bars[t1.index].date, value: neckline },
            { time: bars[lastIdx].date,  value: neckline },
          ],
          color: NECK_COLOR, width: 2, style: 'dashed', label: '넥라인',
        },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 5. V Bottom형 — 매수
// ─────────────────────────────────────────────────────────────
function detectVBottom(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  // Look for sharp decline then sharp rise within last 40 bars
  const window = Math.min(40, closes.length - 1);
  const recentStart = closes.length - window;

  for (let pivot = recentStart + 5; pivot < closes.length - 5; pivot++) {
    const left  = closes.slice(recentStart, pivot + 1);
    const right = closes.slice(pivot);

    const leftHigh  = Math.max(...left);
    const rightHigh = Math.max(...right);
    const bottom    = closes[pivot];

    const dropPct   = pct(bottom, leftHigh);
    const recoverPct = pct(rightHigh, bottom);

    if (dropPct > -10 || recoverPct < 8) continue; // Need meaningful V

    const sharpDrop    = dropPct < -10;
    const sharpRecover = recoverPct > 10;
    const symmetry     = Math.abs(Math.abs(dropPct) - recoverPct) < Math.abs(dropPct) * 0.5;
    const recovery80   = recoverPct >= Math.abs(dropPct) * 0.7;
    const recentBottom = closes.length - 1 - pivot <= 20;
    const volAtBottom  = volumes[pivot] > avgVolume(volumes, recentStart, pivot - 1);

    const criteria: PatternCriteria = {
      '급격한 하락': sharpDrop,
      '급격한 회복': sharpRecover,
      'V형 대칭성': symmetry,
      '하락폭의 70% 이상 회복': recovery80,
      '최근 형성된 패턴': recentBottom,
      '바닥 거래량 증가': volAtBottom,
    };

    const score =
      20 +
      (sharpDrop ? 20 : 0) +
      (sharpRecover ? 20 : 0) +
      (symmetry ? 15 : 0) +
      (recovery80 ? 15 : 0) +
      (volAtBottom ? 10 : 0);

    if (score < 50) continue;

    // 왼쪽 고점 인덱스, 오른쪽 고점 인덱스
    const leftPeakIdx  = recentStart + left.indexOf(leftHigh);
    const rightPeakIdx = pivot + right.indexOf(rightHigh);
    const lastIdx      = closes.length - 1;

    return {
      type: 'v_bottom',
      name: 'V Bottom형',
      signal: 'buy',
      syncRate: Math.min(100, score),
      detectedAt: bars[pivot]?.date ?? bars[bars.length - 1].date,
      keyLevels: { support: bottom, resistance: rightHigh },
      patternBars: { startIdx: recentStart, endIdx: closes.length - 1 },
      criteria,
      overlayLines: [
        // V 윤곽: 왼쪽 고점 → 바닥 → 오른쪽 고점
        {
          points: [
            { time: bars[leftPeakIdx].date,  value: leftHigh },
            { time: bars[pivot].date,         value: bottom },
            { time: bars[Math.min(rightPeakIdx, lastIdx)].date, value: rightHigh },
          ],
          color: BUY_COLOR, width: 2, style: 'solid', label: 'V 윤곽',
        },
        // 바닥 지지선
        {
          points: [
            { time: bars[pivot].date,    value: bottom },
            { time: bars[lastIdx].date,  value: bottom },
          ],
          color: BUY_COLOR, width: 1, style: 'dashed', label: '바닥 지지선',
        },
      ],
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 6. V Top형 — 매도
// ─────────────────────────────────────────────────────────────
function detectVTop(
  closes: number[], highs: number[], lows: number[], volumes: number[], bars: PriceBar[],
): PatternResult | null {
  const window = Math.min(40, closes.length - 1);
  const recentStart = closes.length - window;

  for (let pivot = recentStart + 5; pivot < closes.length - 5; pivot++) {
    const left  = closes.slice(recentStart, pivot + 1);
    const right = closes.slice(pivot);

    const leftLow   = Math.min(...left);
    const rightLow  = Math.min(...right);
    const peak      = closes[pivot];

    const risePct  = pct(peak, leftLow);
    const dropPct  = pct(rightLow, peak);

    if (risePct < 10 || dropPct > -8) continue;

    const sharpRise   = risePct > 10;
    const sharpDrop   = dropPct < -8;
    const symmetry    = Math.abs(risePct - Math.abs(dropPct)) < risePct * 0.5;
    const decline70   = Math.abs(dropPct) >= risePct * 0.7;
    const recentPeak  = closes.length - 1 - pivot <= 20;
    const volAtPeak   = volumes[pivot] > avgVolume(volumes, recentStart, pivot - 1);

    const criteria: PatternCriteria = {
      '급격한 상승': sharpRise,
      '급격한 하락': sharpDrop,
      '역V형 대칭성': symmetry,
      '상승폭의 70% 이상 하락': decline70,
      '최근 형성된 패턴': recentPeak,
      '고점 거래량 증가': volAtPeak,
    };

    const score =
      20 +
      (sharpRise ? 20 : 0) +
      (sharpDrop ? 20 : 0) +
      (symmetry ? 15 : 0) +
      (decline70 ? 15 : 0) +
      (volAtPeak ? 10 : 0);

    if (score < 50) continue;

    const leftTroughIdx  = recentStart + left.indexOf(leftLow);
    const rightTroughIdx = pivot + right.indexOf(rightLow);
    const lastIdx        = closes.length - 1;

    return {
      type: 'v_top',
      name: 'V Top형',
      signal: 'sell',
      syncRate: Math.min(100, score),
      detectedAt: bars[pivot]?.date ?? bars[bars.length - 1].date,
      keyLevels: { resistance: peak, support: rightLow },
      patternBars: { startIdx: recentStart, endIdx: closes.length - 1 },
      criteria,
      overlayLines: [
        // 역V 윤곽: 왼쪽 저점 → 고점 → 오른쪽 저점
        {
          points: [
            { time: bars[leftTroughIdx].date,  value: leftLow },
            { time: bars[pivot].date,           value: peak },
            { time: bars[Math.min(rightTroughIdx, lastIdx)].date, value: rightLow },
          ],
          color: SELL_COLOR, width: 2, style: 'solid', label: '역V 윤곽',
        },
        // 고점 저항선
        {
          points: [
            { time: bars[pivot].date,    value: peak },
            { time: bars[lastIdx].date,  value: peak },
          ],
          color: SELL_COLOR, width: 1, style: 'dashed', label: '고점 저항선',
        },
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

      return {
        type: 'bull_flag',
        name: '상승사각깃발형',
        signal: 'buy',
        syncRate: Math.min(100, score),
        detectedAt: bars[poleEnd]?.date ?? bars[n - 1].date,
        keyLevels: { support: flagLow, resistance: flagHigh, target: flagHigh + (closes[poleEnd] - closes[poleStart]) },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          // 깃대 (수직 상승)
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: BUY_COLOR, width: 2, style: 'solid', label: '깃대' },
          // 깃발 상단 채널
          { points: [
              { time: bars[poleEnd].date, value: flagHigh },
              { time: bars[n - 1].date,   value: flagHigh },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '채널 상단' },
          // 깃발 하단 채널
          { points: [
              { time: bars[poleEnd].date, value: flagLow },
              { time: bars[n - 1].date,   value: flagLow },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '채널 하단' },
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

      return {
        type: 'bear_flag',
        name: '하락사각깃발형',
        signal: 'sell',
        syncRate: Math.min(100, score),
        detectedAt: bars[poleEnd]?.date ?? bars[n - 1].date,
        keyLevels: { resistance: flagHigh, support: flagLow, target: flagLow - (closes[poleStart] - closes[poleEnd]) },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: SELL_COLOR, width: 2, style: 'solid', label: '깃대' },
          { points: [
              { time: bars[poleEnd].date, value: flagHigh },
              { time: bars[n - 1].date,   value: flagHigh },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '채널 상단' },
          { points: [
              { time: bars[poleEnd].date, value: flagLow },
              { time: bars[n - 1].date,   value: flagLow },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '채널 하단' },
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

  return {
    type: 'ascending_triangle',
    name: '상승삼각형',
    signal: 'buy',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance, support, target: resistance + (resistance - support) },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      // 수평 저항선
      { points: [
          { time: firstBar.date, value: resistance },
          { time: lastBar.date,  value: resistance },
        ], color: SELL_COLOR, width: 2, style: 'dashed', label: '저항선' },
      // 상승 지지선
      { points: [
          { time: bars[start + t0.index].date,   value: t0.value },
          { time: bars[start + tLast.index].date, value: tLast.value },
          { time: lastBar.date,                   value: tLast.value + (tLast.value - t0.value) * 0.2 },
        ], color: BUY_COLOR, width: 2, style: 'solid', label: '지지선' },
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

  return {
    type: 'descending_triangle',
    name: '하락삼각형',
    signal: 'sell',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { support, resistance, target: support - (resistance - support) },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      // 수평 지지선
      { points: [
          { time: firstBar.date, value: support },
          { time: lastBar.date,  value: support },
        ], color: BUY_COLOR, width: 2, style: 'dashed', label: '지지선' },
      // 하락 저항선
      { points: [
          { time: bars[start + p0.index].date,   value: p0.value },
          { time: bars[start + pLast.index].date, value: pLast.value },
          { time: lastBar.date,                   value: pLast.value - (p0.value - pLast.value) * 0.2 },
        ], color: SELL_COLOR, width: 2, style: 'solid', label: '저항선' },
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

  return {
    type,
    name: signal === 'buy' ? '강세 이등변삼각형' : '약세 이등변삼각형',
    signal,
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { support, resistance },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      // 하향 저항선
      { points: [
          { time: firstBar.date, value: highStart },
          { time: lastBar.date,  value: resistance },
        ], color: SELL_COLOR, width: 2, style: 'solid', label: '저항 추세선' },
      // 상향 지지선
      { points: [
          { time: firstBar.date, value: lowStart },
          { time: lastBar.date,  value: support },
        ], color: BUY_COLOR, width: 2, style: 'solid', label: '지지 추세선' },
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
// 12. 확장삼각형 (Broadening Triangle) — 매도
// ─────────────────────────────────────────────────────────────
function detectBroadeningTriangle(
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

  const highReg = linearRegression(peaks.map(p => ({ x: p.index, y: p.value })));
  const lowReg  = linearRegression(troughs.map(t => ({ x: t.index, y: t.value })));

  const highRises = highReg.slope > 0;
  const lowFalls  = lowReg.slope < 0;
  if (!highRises || !lowFalls) return null;

  const diverging      = highRises && lowFalls;
  const volatilityRise = peaks.length >= 2 && troughs.length >= 2;
  const currentPrice   = closes[n - 1];
  const resistance     = highReg.slope * (lookback - 1) + highReg.intercept;
  const support        = lowReg.slope * (lookback - 1) + lowReg.intercept;
  const nearResistance = currentPrice > resistance * 0.95;

  const criteria: PatternCriteria = {
    '고점 상향 추세선': highRises,
    '저점 하향 추세선': lowFalls,
    '발산하는 구조': diverging,
    '2개 이상 고점/저점': volatilityRise,
    '저항선 근접': nearResistance,
  };

  const score =
    40 +
    (diverging ? 20 : 0) +
    (volatilityRise ? 15 : 0) +
    (nearResistance ? 15 : 0) +
    (highReg.r2 > 0.4 ? 10 : 0);

  if (score < 50) return null;

  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  return {
    type: 'broadening_triangle',
    name: '확장삼각형',
    signal: 'sell',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance, support },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      { points: [
          { time: firstBar.date, value: highReg.slope * 0 + highReg.intercept },
          { time: lastBar.date,  value: resistance },
        ], color: SELL_COLOR, width: 2, style: 'solid', label: '상향 저항선' },
      { points: [
          { time: firstBar.date, value: lowReg.slope * 0 + lowReg.intercept },
          { time: lastBar.date,  value: support },
        ], color: BUY_COLOR, width: 2, style: 'solid', label: '하향 지지선' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 13. 상향쐐기형 (Rising Wedge) — 매도
// ─────────────────────────────────────────────────────────────
function detectRisingWedge(
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

  const highReg = linearRegression(peaks.map(p => ({ x: p.index, y: p.value })));
  const lowReg  = linearRegression(troughs.map(t => ({ x: t.index, y: t.value })));

  // Both lines rise, but lower line steeper
  const bothRise       = highReg.slope > 0 && lowReg.slope > 0;
  const lowerSteeper   = lowReg.slope > highReg.slope;
  const converging     = lowerSteeper; // converges upward

  if (!bothRise || !lowerSteeper) return null;

  const resistance  = highReg.slope * (lookback - 1) + highReg.intercept;
  const support     = lowReg.slope * (lookback - 1) + lowReg.intercept;
  const currentPrice = closes[n - 1];
  const nearApex     = (resistance - support) < (resistance - support) * 1.3;
  const volDecline   = avgVolume(volumes, start + 10, n - 1) < avgVolume(volumes, start, start + 10);

  const criteria: PatternCriteria = {
    '두 추세선 모두 상향': bothRise,
    '하단선 기울기 > 상단선': lowerSteeper,
    '수렴 구조': converging,
    '거래량 감소': volDecline,
    '추세선 R² 양호': highReg.r2 > 0.4 || lowReg.r2 > 0.4,
  };

  const score =
    40 +
    (converging ? 20 : 0) +
    (volDecline ? 15 : 0) +
    (nearApex ? 15 : 0) +
    (highReg.r2 > 0.4 ? 10 : 0);

  if (score < 50) return null;

  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  return {
    type: 'rising_wedge',
    name: '상향쐐기형',
    signal: 'sell',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance, support },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      { points: [
          { time: firstBar.date, value: highReg.slope * 0 + highReg.intercept },
          { time: lastBar.date,  value: resistance },
        ], color: SELL_COLOR, width: 2, style: 'solid', label: '상단 쐐기선' },
      { points: [
          { time: firstBar.date, value: lowReg.slope * 0 + lowReg.intercept },
          { time: lastBar.date,  value: support },
        ], color: SELL_COLOR, width: 2, style: 'dashed', label: '하단 쐐기선' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// 14. 하향쐐기형 (Falling Wedge) — 매수
// ─────────────────────────────────────────────────────────────
function detectFallingWedge(
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

  const highReg = linearRegression(peaks.map(p => ({ x: p.index, y: p.value })));
  const lowReg  = linearRegression(troughs.map(t => ({ x: t.index, y: t.value })));

  // Both lines fall, upper line steeper
  const bothFall     = highReg.slope < 0 && lowReg.slope < 0;
  const upperSteeper = Math.abs(highReg.slope) > Math.abs(lowReg.slope);

  if (!bothFall || !upperSteeper) return null;

  const resistance  = highReg.slope * (lookback - 1) + highReg.intercept;
  const support     = lowReg.slope * (lookback - 1) + lowReg.intercept;
  const volDecline  = avgVolume(volumes, start + 10, n - 1) < avgVolume(volumes, start, start + 10);
  const currentPrice = closes[n - 1];
  const nearBreakout = currentPrice > resistance * 0.97;

  const criteria: PatternCriteria = {
    '두 추세선 모두 하향': bothFall,
    '상단선 기울기 > 하단선': upperSteeper,
    '수렴 구조': true,
    '거래량 감소': volDecline,
    '저항선 근접/돌파': nearBreakout,
  };

  const score =
    40 +
    (volDecline ? 15 : 0) +
    (nearBreakout ? 20 : 0) +
    (highReg.r2 > 0.4 ? 10 : 0) +
    (lowReg.r2 > 0.4 ? 15 : 0);

  if (score < 50) return null;

  const firstBar = bars[start];
  const lastBar  = bars[n - 1];
  return {
    type: 'falling_wedge',
    name: '하향쐐기형',
    signal: 'buy',
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance, support },
    patternBars: { startIdx: 0, endIdx: lookback - 1 },
    criteria,
    overlayLines: [
      { points: [
          { time: firstBar.date, value: highReg.slope * 0 + highReg.intercept },
          { time: lastBar.date,  value: resistance },
        ], color: BUY_COLOR, width: 2, style: 'dashed', label: '상단 쐐기선' },
      { points: [
          { time: firstBar.date, value: lowReg.slope * 0 + lowReg.intercept },
          { time: lastBar.date,  value: support },
        ], color: BUY_COLOR, width: 2, style: 'solid', label: '하단 쐐기선' },
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

      return {
        type: 'bull_pennant',
        name: '상승삼각깃발형',
        signal: 'buy',
        syncRate: Math.min(100, score),
        detectedAt: pennantStartDate,
        keyLevels: { support: Math.min(...flagSlice.l), resistance: Math.max(...flagSlice.h) },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          // 깃대
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: BUY_COLOR, width: 2, style: 'solid', label: '깃대' },
          // 페넌트 상단 (수렴)
          { points: [
              { time: pennantStartDate, value: highReg.intercept },
              { time: pennantEndDate,   value: highEnd },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '페넌트 상단' },
          // 페넌트 하단 (수렴)
          { points: [
              { time: pennantStartDate, value: lowReg.intercept },
              { time: pennantEndDate,   value: lowEnd },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '페넌트 하단' },
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

      return {
        type: 'bear_pennant',
        name: '하락삼각깃발형',
        signal: 'sell',
        syncRate: Math.min(100, score),
        detectedAt: pennantStartDate,
        keyLevels: { support: Math.min(...flagSlice.l), resistance: Math.max(...flagSlice.h) },
        patternBars: { startIdx: poleStart, endIdx: n - 1 },
        criteria,
        overlayLines: [
          { points: [
              { time: bars[poleStart].date, value: closes[poleStart] },
              { time: bars[poleEnd].date,   value: closes[poleEnd] },
            ], color: SELL_COLOR, width: 2, style: 'solid', label: '깃대' },
          { points: [
              { time: pennantStartDate, value: highReg.intercept },
              { time: pennantEndDate,   value: highEnd },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '페넌트 상단' },
          { points: [
              { time: pennantStartDate, value: lowReg.intercept },
              { time: pennantEndDate,   value: lowEnd },
            ], color: CHANNEL_COLOR, width: 1, style: 'dashed', label: '페넌트 하단' },
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

  return {
    type,
    name: signal === 'buy' ? '상승직사각형' : '하락직사각형',
    signal,
    syncRate: Math.min(100, score),
    detectedAt: bars[n - 1]?.date ?? '',
    keyLevels: { resistance: avgPeak, support: avgTrough },
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
  detectVBottom,
  detectVTop,
  detectBullFlag,
  detectBearFlag,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectSymmetricalTriangleBull,
  detectSymmetricalTriangleBear,
  detectBroadeningTriangle,
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
  const lookback = Math.min(90, bars.length);
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
