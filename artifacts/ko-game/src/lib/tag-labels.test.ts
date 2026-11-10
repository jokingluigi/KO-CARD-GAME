import assert from "node:assert/strict";
import test from "node:test";
import { displayTagReferences, tagLabel } from "./tag-labels";
test("renamed tag labels preserve keys and do not rename card references", () => {
  const labels = { 좀비: "언데드 부대" };
  assert.equal(tagLabel("좀비", labels), "언데드 부대");
  assert.equal(tagLabel("용병", labels), "용병");
  assert.equal(
    displayTagReferences(
      "'좀비' 태그가 있으면 '좀비' 카드를 소환합니다.",
      labels,
    ),
    "'언데드 부대' 태그가 있으면 '좀비' 카드를 소환합니다.",
  );
});
test("tag names containing regex punctuation match literally", () => {
  assert.equal(
    displayTagReferences("'A+B' 태그. 'AAAB' 태그.", { "A+B": "기계" }),
    "'기계' 태그. 'AAAB' 태그.",
  );
});
