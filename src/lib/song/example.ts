import { parseSong } from "./text.ts";

/** 이 프로젝트를 위해 직접 지은 짧은 예제 */
export const EXAMPLE_TEXT = `@id example
@title 아침 걸음
@artist beat-note 예제
@credits 이 사이트를 위해 지은 예제
@bpm 84
@time 4/4

# 전주
- 연주 2마디
> .4|.4|.4|창2 을2
# 1절
열2 면2|바1 람2 이1|~2 먼2|저2 와2
인2 사1 를1|~4|.4|오2 늘2
도2 천1 천1|~2 히2|한2 걸2|음3 씩1
~4|~2 .2|.4|나2 는2
# 후렴 / 셋잇단음표가 나오는 부분
걸4|어4|3:가1 는1 길1|마4
다2 노1 래1|~2 가2|흐4|르2 고2
[2/4] 숨2 을2|쉬4 * 2/4 마디: 2박만 세고 다음 줄로
면4|~4|~4|~2 .2
# 후주
- 연주 2마디
`;

export const exampleSong = () => parseSong(EXAMPLE_TEXT);
