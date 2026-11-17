import { describe, expect, it } from "vitest";

import { emotionFor } from "./parody";
import { checkReason } from "./ui";

describe("checkReason (no bare yes)", () => {
  it.each(["yes", "Yes.", "ok", "LGTM", "looks good", "sure!"])("rejects %s", (t) => {
    expect(checkReason(t, 15).state).toBe("bare");
  });
  it("is empty for blank input", () => expect(checkReason("   ", 15).state).toBe("empty"));
  it("is short under the word minimum", () => {
    const r = checkReason("because students like it", 15);
    expect(r).toMatchObject({ state: "short", words: 4 });
  });
  it("accepts a real reason", () => {
    const r = checkReason("Students already pay for printed notes so a one page sheet tests price with less work for me", 15);
    expect(r.state).toBe("valid");
  });
});

describe("emotionFor", () => {
  it("maps verdict lines to faces", () => {
    expect(emotionFor("Until then, I'm out.")).toBe("im_out");
    expect(emotionFor("12 sign-ups from people who know you?")).toBe("skeptical");
    expect(emotionFor("Well done, I'm in.")).toBe("pleased");
    expect(emotionFor("Go sell 50 sheets. Then we talk numbers.")).toBe("talking");
  });
});
