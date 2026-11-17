import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceCard } from "./ui";

describe("SourceCard", () => {
  it("shows the number, the title and a short trust reason that agree", () => {
    render(<SourceCard n={2} title="CAPMAS report" url="https://capmas.gov.eg/a" trust="high" backs="x" reason="Government site" />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /capmas report/i })).toBeInTheDocument();
    expect(screen.getByText(/government site/i)).toBeInTheDocument();
  });
  it("falls back to a reason for the trust level when none is given", () => {
    render(<SourceCard n={1} title="T" url="https://a.org" trust="low" backs="x" />);
    expect(screen.getByText(/unverified/i, { selector: "[data-testid='trust-reason']" })).toBeInTheDocument();
  });
});
