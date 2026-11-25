import { emptyScore, type Gray, type ReadScore } from "./types.ts";

/** 쪽 이미지들에서 악보를 읽는다. */
export async function readScore(_pages: Gray[]): Promise<ReadScore> {
  return emptyScore();
}
