import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

type ServiceAnnotationRecord = {
  id: string;
  serviceName: string;
  entityType: string;
  entityId: string | null;
  content: string;
  author: string;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

let serviceAnnotations: ServiceAnnotationRecord[] = [];

function createAnnotation(overrides: Partial<ServiceAnnotationRecord> = {}): ServiceAnnotationRecord {
  return {
    id: overrides.id ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    serviceName: overrides.serviceName ?? "price-service",
    entityType: overrides.entityType ?? "source",
    entityId: overrides.entityId ?? null,
    content: overrides.content ?? "Initial annotation content",
    author: overrides.author ?? "operator",
    startTime: overrides.startTime ?? null,
    endTime: overrides.endTime ?? null,
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

test.beforeEach(async ({ page }) => {
  serviceAnnotations = [createAnnotation({ id: "ann-seed", content: "Seed annotation" })];

  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true })
    );
  });

  await mockCoreApi(page);

  await page.route("**/api/v1/service-annotations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "GET") {
      if (url.pathname.startsWith("/api/v1/service-annotations/")) {
        const id = url.pathname.split("/").pop();
        if (id === "audit") {
          await route.fulfill({
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify([]),
          });
          return;
        }

        const annotation = serviceAnnotations.find((item) => item.id === id);
        if (!annotation) {
          await route.fulfill({ status: 404, body: "Not found" });
          return;
        }

        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(annotation),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceAnnotations),
      });
      return;
    }

    if (method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const annotation = createAnnotation({
        serviceName: String(body.serviceName ?? ""),
        entityType: String(body.entityType ?? "source"),
        entityId: typeof body.entityId === "string" ? body.entityId : null,
        content: String(body.content ?? ""),
        author: String(body.author ?? "operator"),
        startTime: typeof body.startTime === "string" ? body.startTime : null,
        endTime: typeof body.endTime === "string" ? body.endTime : null,
      });
      serviceAnnotations = [annotation, ...serviceAnnotations];
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(annotation),
      });
      return;
    }

    if (method === "PATCH") {
      const id = url.pathname.split("/").pop();
      const body = request.postDataJSON() as Record<string, unknown>;
      const index = serviceAnnotations.findIndex((item) => item.id === id);
      if (index === -1) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      serviceAnnotations[index] = {
        ...serviceAnnotations[index],
        ...(typeof body.content === "string" ? { content: body.content } : {}),
        ...(typeof body.startTime === "string" ? { startTime: body.startTime } : {}),
        ...(typeof body.endTime === "string" ? { endTime: body.endTime } : {}),
        updatedAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceAnnotations[index]),
      });
      return;
    }

    if (method === "DELETE") {
      const id = url.pathname.split("/").pop();
      serviceAnnotations = serviceAnnotations.filter((item) => item.id !== id);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.continue();
  });
});

test("creates, edits, and deletes service annotations", async ({ page }) => {
  await page.goto("/service-annotations");
  await expect(page.getByRole("heading", { name: "Service Annotations" })).toBeVisible();

  await page.getByRole("button", { name: "\+ New Annotation" }).click();
  await page.getByLabel("Service Name *").fill("price-service");
  await page.getByLabel("Content *").fill("Initial annotation for testing");
  await page.getByRole("button", { name: "Create Annotation" }).click();

  await expect(page.getByText("Initial annotation for testing")).toBeVisible();

  const createdRow = page.getByRole("row").filter({ hasText: "Initial annotation for testing" });
  await expect(createdRow).toBeVisible();
  await createdRow.getByRole("button", { name: /Edit annotation/i }).click();
  await page.getByLabel("Content *").fill("Updated annotation note");
  await page.getByRole("button", { name: "Update Annotation" }).click();

  await expect(page.getByText("Updated annotation note")).toBeVisible();
  await expect(page.getByText("Initial annotation for testing")).not.toBeVisible();

  const updatedRow = page.getByRole("row").filter({ hasText: "Updated annotation note" });
  await expect(updatedRow).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await updatedRow.getByRole("button", { name: /Delete annotation/i }).click();

  await expect(page.getByText("Updated annotation note")).not.toBeVisible();
  await expect(page.getByText("Seed annotation")).toBeVisible();
});
