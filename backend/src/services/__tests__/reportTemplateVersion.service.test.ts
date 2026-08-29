import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReportTemplateVersionService } from "../reportTemplateVersion.service.js";

vi.mock("../../database/connection.js", () => {
  const mockTemplate = {
    id: "template-uuid-1",
    name: "Monthly Audit Template",
    type: "compliance_audit",
    description: "Monthly audit description",
    version: 1,
    sections: JSON.stringify([{ id: "s1", title: "Overview" }]),
    includes: JSON.stringify({ summary: true }),
    filters: JSON.stringify([]),
  };

  const mockVersions: any[] = [];
  const mockDb: any = vi.fn().mockImplementation((table?: string) => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: "ver-uuid-1", ...data, created_at: new Date() };
        mockVersions.push(record);
        return Promise.resolve([record]);
      }),
      select: vi.fn().mockImplementation(() => builder),
      where: vi.fn().mockImplementation(() => builder),
      orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockVersions)),
      first: vi.fn().mockImplementation(() => {
        if (table === "report_templates") return Promise.resolve(mockTemplate);
        return Promise.resolve(mockVersions[0] ?? null);
      }),
      update: vi.fn().mockImplementation((data) => {
        Object.assign(mockTemplate, data);
        return Promise.resolve(1);
      }),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

describe("ReportTemplateVersionService", () => {
  let service: ReportTemplateVersionService;

  beforeEach(() => {
    service = new ReportTemplateVersionService();
    vi.clearAllMocks();
  });

  it("creates a new version for an existing report template", async () => {
    const version = await service.createVersion(
      "template-uuid-1",
      {
        name: "Monthly Audit Template v2",
        changeSummary: "Added section for risk metrics",
      },
      "user_admin"
    );

    expect(version.version).toBe(2);
    expect(version.name).toBe("Monthly Audit Template v2");
    expect(version.change_summary).toBe("Added section for risk metrics");
    expect(version.created_by).toBe("user_admin");
  });

  it("lists all created version snapshots for a template", async () => {
    const versions = await service.listVersions("template-uuid-1");
    expect(Array.isArray(versions)).toBe(true);
  });

  it("restores a previous template version by incrementing version number", async () => {
    const restored = await service.restoreVersion("template-uuid-1", 1, "user_admin");
    expect(restored.version).toBeGreaterThan(1);
    expect(restored.change_summary).toContain("Restored from version 1");
  });
});
