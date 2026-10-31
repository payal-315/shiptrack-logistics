import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import DriverSignup from "./DriverSignup";

vi.mock("../../api", () => ({ API_ENDPOINTS: { DRIVERS: { SIGNUP: "/drivers/signup" } }, apiClient: { post: vi.fn() } }));

describe("driver signup location requirement", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("requires a base city and gives the requested example", async () => {
    render(<MemoryRouter><DriverSignup /></MemoryRouter>);
    const baseCity = screen.getByLabelText("Base city");
    expect(baseCity).toHaveAttribute("placeholder", "Bangalore");
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(baseCity).toHaveAttribute("aria-invalid", "true");
  });
});
