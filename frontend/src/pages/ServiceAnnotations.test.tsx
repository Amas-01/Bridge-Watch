import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ServiceAnnotations from "./ServiceAnnotations";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ServiceAnnotations />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ServiceAnnotations", () => {
  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Service Annotations" })).toBeInTheDocument();
  });

  it("shows the description text", () => {
    renderPage();
    expect(
      screen.getByText(/Create and manage annotations tied to services and time ranges/)
    ).toBeInTheDocument();
  });

  it("shows the + New Annotation button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "+ New Annotation" })).toBeInTheDocument();
  });

  it("displays the author input field", () => {
    renderPage();
    expect(screen.getByLabelText("Author:")).toBeInTheDocument();
  });

  it("opens the creation form when + New Annotation is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "+ New Annotation" }));

    expect(screen.getByRole("heading", { name: "New Annotation" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Service Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Entity Type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Content/)).toBeInTheDocument();
  });

  it("allows creating a new annotation and shows it in the table", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "+ New Annotation" }));

    await user.type(screen.getByLabelText(/Service Name/), "test-service");
    await user.type(screen.getByLabelText(/Content/), "Test annotation content");

    await user.click(screen.getByRole("button", { name: "Create Annotation" }));

    await waitFor(() => {
      expect(screen.getByText("test-service")).toBeInTheDocument();
    });
    expect(screen.getByText("Test annotation content")).toBeInTheDocument();
  });

  it("shows the annotations table with existing data", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("price-service")).toBeInTheDocument();
    });
    expect(screen.getByText("horizon")).toBeInTheDocument();
  });

  it("shows active and inactive status badges", async () => {
    renderPage();

    await waitFor(() => {
      const activeBadges = screen.getAllByText("Active");
      expect(activeBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows edit and delete buttons for each annotation", async () => {
    renderPage();

    await waitFor(() => {
      const editButtons = screen.getAllByRole("button", { name: /Edit annotation for/ });
      expect(editButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole("button", { name: /Delete annotation for/ });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("opens edit form when Edit is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("price-service")).toBeInTheDocument();
    });

    const editButton = screen.getByRole("button", { name: /Edit annotation for price-service/ });
    await user.click(editButton);

    expect(screen.getByRole("heading", { name: "Edit Annotation" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("price-service")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Scheduled maintenance window")).toBeInTheDocument();
  });

  it("shows the refresh button", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Refresh annotations" })).toBeInTheDocument();
  });
});
