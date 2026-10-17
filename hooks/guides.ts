import type { Target, TargetChoice } from '../types'

/**
 * `about` is what the pane says of the guide when asked; `rules` is what the
 * polisher reads; `sources` are the published pages the rules were written from.
 */
export type Guide = {
  label: string
  about: string
  sources?: readonly string[]
  rules: string
}

export const CHOICES: readonly TargetChoice[] = [
  'auto',
  'opus-5.5',
  'sonnet-5.5',
  'gpt-6-astra',
  'gpt-5.6',
]

export const GUIDES: Record<Target, Guide> = {
  'opus-5.5': {
    label: 'Opus 5.5',
    about:
      'Prompting tips for Claude Opus 5.5. Give the whole task with a clear finish line, say which stops you want, and drop "think step by step" phrases.',
    sources: [
      'https://claude.dev/blog/getting-the-most-out-of-opus-5-5/',
      'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5',
    ],
    rules: `대상 모델: Claude Opus 5.5

보강할 것
- 작업 전체를 한 메시지에 담고, 끝나는 지점("테스트 통과", "모든 엔드포인트 마이그레이션 완료" 같은 완료 기준)을 명시한다.
- 여러 단계에 걸친 작업이면 멈춤 규칙을 적는다: 사용자 입력이 필요 없는 단계는 계속 진행하고 상태 보고는 다음 작업과 같은 메시지에 쓴다. 사용자 없이는 진행할 수 없을 때와 파괴적 작업(데이터 삭제, force-push, 저장소 밖 변경) 직전에만 멈춘다.
- 대규모 코드베이스 감사·마이그레이션·리뷰면 서브에이전트에 나눠 맡기고, 각 결과의 근거를 확인한 뒤 받아들이라고 적는다. 결과를 한 표로 모아야 하면 표의 열을 지정한다.
- 길게 이어질 작업이면 작업 목록을 파일(예: TASKS.md 체크리스트)로 관리하고, 끝낸 항목은 체크하고 새로 발견한 항목은 추가하라고 적는다.
- 코드 리뷰 요청이면 머지를 막을 문제만 나열하고, 문제마다 파일과 줄, 틀린 이유, 실패를 재현하는 방법을 적으라고 한다.
- 조사·분석 요청이면 확인하지 못한 것을 표시하고 어디를 찾아봤는지 적으라고 한다.
- 긴 문서·계획·발표자료 검토 요청이면 무엇을 찾을지(서로 어긋나는 숫자, 날짜, 이름)를 지정하고, 문제마다 원문을 인용하고 위치를 적으라고 한다.
- 파일 산출물(스프레드시트, 문서)을 원하면 개요가 아니라 완성된 파일을 요청하고, 행과 열 구성을 적는다.
- 디자인 요청이면 피할 스타일을 구체적인 패턴으로 나열한다. 초안에 단서가 없으면 크림색·미색 배경, 제목의 이탤릭 강조 단어, "01/02/03" 번호 섹션 라벨, 모노스페이스 라벨, 알약 모양 버튼을 예로 든다.
- 이메일, 문서, 스프레드시트처럼 여러 앱에 걸친 작업인데 어디를 볼지 정해져 있지 않으면, 손대기 전에 관련 자료를 먼저 폭넓게 찾아 읽으라고 적는다.
- 진행 보고를 원하는 초안이면 시점을 정한다: 시작 전 한 줄 계획, 끝난 뒤 짧은 요약.

지우거나 바꿀 것
- "think carefully", "think step by step", "신중하게 생각해" 같은 문구는 지운다. 간단한 질문에 빠른 답을 원하는 초안이면 "바로 답해줘"로 바꾼다.
- 내부 추론 과정을 답변에 그대로 쓰라는 요청은 "이 접근을 고른 이유를 세 문장으로 설명해줘"처럼 짧은 설명이나 수행한 작업 요약을 묻는 요청으로 바꾼다.
- "뻔한 AI 느낌 피해줘" 같은 막연한 지시는 구체적인 패턴 나열로 바꾼다.`,
  },
  'sonnet-5.5': {
    label: 'Sonnet 5.5',
    about:
      'Prompting tips for Claude Sonnet 5.5. Give a clear spec and a way to check it, ask for real checks before "done", and drop workarounds made for older models.',
    sources: [
      'https://claude.dev/blog/building-with-claude-sonnet-5-5/',
      'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5',
    ],
    rules: `대상 모델: Claude Sonnet 5.5

보강할 것
- 작업의 스펙과 결과를 확인할 방법을 명시한다. 이 모델은 범위가 분명하고 결과를 검증할 수 있는 작업에 가장 잘 맞는다.
- 여러 부분으로 된 코딩 작업이면 요청한 것이 모두 끝날 때까지 계속 진행하고, 사용자 없이 진행할 수 없거나 위험한 단계 직전에만 멈춰 물으라고 적는다.
- 코딩 작업이면 실행·빌드·타입체크할 수 있는 변경은 그 변경을 실제로 거치는 검증(프로젝트의 테스트, 타입체커, 빌드, 또는 바꾼 명령 자체)을 돌린 뒤에 완료를 보고하라고 적는다. 검증을 돌릴 수 없으면 무엇을 왜 돌리지 못했는지 말하라고 적는다.
- 초안이 변경 범위를 한정하면 범위를 명시한다: 요청한 작업이 끝나고 검증되면 멈추고 보고하며, 요청하지 않은 기능·테스트·파일·문서·리팩터링은 추가하지 말고 필요해 보이면 끝에 언급만 하라고 적는다. 추가 리뷰나 리뷰용 서브에이전트도 요청이 없으면 시작하지 말라고 적는다.
- 아이디어·선택지·계획만 원하는 열린 요청이면 그것만 주고 멈추며, 진행하라는 말이 있기 전에는 결과물(발표자료, 보고서, 코드)을 만들거나 바꾸지 말라고 명시한다.
- 허용 여부, 요건, 요금처럼 바뀌었을 수 있는 사실이나 보고서·비교 같은 조사 작업이면, 기억에 의존하지 말고 검색으로 최신 출처를 확인하라고 적는다.
- 진행 보고를 원하는 초안이면 시점을 정한다: 첫 도구 호출 전 한 줄 계획, 끝난 뒤 짧은 요약.

지우거나 바꿀 것
- "do not be lazy", 거절을 피하려는 유도 문구, 도구 호출 재시도 지시 같은 이전 모델용 우회 문구는 지운다.
- "덜 생각해", "빨리 답해", "생각하지 마" 같은 생각량 조절 문구는 지운다. 프롬프트의 이런 지시는 생각량을 안정적으로 줄이지 못한다.
- "꼭 필요할 때만 도구 사용", "도구 호출 최소화" 같은 도구 사용 억제 문구는 지운다.
- "결과는 마지막 답변에 한꺼번에 보고" 같은 중간 보고 억제 문구는 지운다.
- 내부 추론 과정을 답변에 그대로 쓰라는 요청은 짧은 설명이나 수행한 작업 요약을 묻는 요청으로 바꾼다.`,
  },
  'gpt-6-astra': {
    label: 'GPT-6 Astra',
    about:
      'Prompting tips for OpenAI GPT-6 Astra. Say what "done" means up front, give direct orders instead of "can you", and cut step-by-step recipes.',
    rules: `대상 모델: OpenAI GPT-6 Astra

보강할 것
- 완료 기준을 미리 정한다. 실행 확인, 결과 점검, 실패 수정까지가 작업이면 처음부터 요청에 넣는다.
- "~해줄 수 있어?", "도와줘"는 직접 지시문으로 바꾸고, 가능 여부만 답하거나 계획만 제안하고 멈추지 말라고 적는다.
- 배포, PR 머지, 게시처럼 승인이 필요한 일이 있으면 필요한 작업을 먼저 끝내고 승인을 마지막 단계로 두라고 적는다. 되돌릴 수 있는 작업과 읽기 전용 작업은 허락 없이 진행하게 한다.
- skill이나 AGENTS.md가 걸릴 만한 작업이면 사용자 지시가 우선한다고 적고, 지침 때문에 멈추면 원인이 된 파일과 문장을 인용하라고 적는다.
- 나눠서 처리할 수 있는 큰 작업이면 서브에이전트에 위임할 시점을 지정한다.
- 글 결과물을 요청하면서 산문이 필요하면 산문으로 쓰라고 지정한다.

지우거나 바꿀 것
- "테스트 꼭 돌려라" 같은 지시는 지운다. 작은 변경이면 테스트 범위를 좁히라고 적는다.
- "모든 편집 전에 문서를 전부 읽어" 같은 지시는 상황별로 어떤 문서를 볼지만 남긴다.
- "먼저 물어봐" 같은 이전 모델용 경계 문구는 지운다.
- 첫 구현 후 리뷰를 위해 멈추라는 요구는 지운다.
- 단계별 레시피처럼 지나치게 상세한 지침은 목표와 제약만 남긴다.`,
  },
  'gpt-5.6': {
    label: 'GPT-5.6',
    about:
      'Prompting tips for OpenAI GPT-5.6. Keep it short, say what needs approval, and remove repeated or clashing rules.',
    rules: `대상 모델: OpenAI GPT-5.6

보강할 것
- 간결하게 만든다: 반복되는 지시와 불필요한 예시를 지우고, 각 지시는 한 번만 쓴다.
- 자율성과 승인 경계를 정의한다: 변경 요청이면 범위 내 로컬 변경과 비파괴 검증은 묻지 않고 진행하고, 외부 쓰기·파괴적 작업·구매·범위 확장만 확인을 받게 한다. 답변·설명·리뷰·계획 요청이면 결과만 보고하게 한다.
- 짧은 답을 원하면 무엇을 남길지 지정한다: 결론, 근거, 주요 주의사항, 다음 행동.
- 톤 요청은 "친근하게" 같은 라벨 대신 구체적인 행동(답을 얼마나 직접 말할지, 문제를 언제 인정할지)으로 적는다.

지우거나 바꿀 것
- "Be concise" 같은 포괄적인 간결성 지시는 지운다.
- "먼저 물어봐", "변경하지 마", "승인 기다려"가 여러 번 나오면 한 번만 남기고, 안전한 작업에 걸린 것은 지운다.
- 서로 충돌하는 규칙은 하나로 정리한다.
- "더 깊게 생각해"나 여러 후보 답안을 만들라는 요청은 지운다.`,
  },
}

/**
 * The guide a session's model reads best: by the id `/model` shows, Opus 5.5
 * for one that names none of the four.
 */
export const targetOf = (model: string): Target => {
  const id = model.toLowerCase()

  if (id.includes('sonnet')) {
    return 'sonnet-5.5'
  }

  if (id.includes('gpt-6') || id.includes('astra')) {
    return 'gpt-6-astra'
  }

  if (id.includes('gpt-5')) {
    return 'gpt-5.6'
  }

  return 'opus-5.5'
}

export const isChoice = (value: unknown): value is TargetChoice =>
  CHOICES.some(choice => choice === value)
