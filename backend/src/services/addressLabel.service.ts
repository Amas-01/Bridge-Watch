import crypto from "crypto";
import {
  AddressLabelModel,
  type AddressLabel,
  type AddressLabelCategory,
  type AddressLabelChain,
} from "../database/models/addressLabel.model.js";
import { auditService } from "./audit.service.js";
import { logger } from "../utils/logger.js";

const VALID_CHAINS: AddressLabelChain[] = ["stellar", "ethereum", "polygon", "avalanche", "bsc", "other"];
const VALID_CATEGORIES: AddressLabelCategory[] = [
  "exchange",
  "bridge_contract",
  "contract",
  "individual",
  "suspicious",
  "internal",
  "other",
];

export interface CreateAddressLabelParams {
  address: string;
  chain?: string;
  label: string;
  category?: string;
  notes?: string | null;
  confidence?: number;
  source?: string;
  performedBy: string;
}

export interface UpdateAddressLabelParams {
  label?: string;
  category?: string;
  notes?: string | null;
  confidence?: number;
  isActive?: boolean;
}

export interface AddressLabelSearchParams {
  category?: string;
  chain?: string;
  query?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Transaction address labeling service (#1152).
 *
 * Attaches human-readable metadata (exchange, bridge contract, suspicious,
 * etc.) to on-chain addresses so transaction lists, alerts, and investigation
 * tooling can surface "who" an address belongs to instead of a raw hash.
 */
export class AddressLabelService {
  private model = new AddressLabelModel();

  private normalizeAddress(address: string): string {
    return address.trim();
  }

  private assertValidChain(chain: string): asserts chain is AddressLabelChain {
    if (!VALID_CHAINS.includes(chain as AddressLabelChain)) {
      throw new Error(`Unsupported chain "${chain}". Expected one of: ${VALID_CHAINS.join(", ")}`);
    }
  }

  private assertValidCategory(category: string): asserts category is AddressLabelCategory {
    if (!VALID_CATEGORIES.includes(category as AddressLabelCategory)) {
      throw new Error(`Unsupported category "${category}". Expected one of: ${VALID_CATEGORIES.join(", ")}`);
    }
  }

  private assertValidConfidence(confidence: number): void {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new Error("Confidence must be a number between 0 and 100");
    }
  }

  async createLabel(params: CreateAddressLabelParams): Promise<AddressLabel> {
    const address = this.normalizeAddress(params.address);
    if (!address) {
      throw new Error("Address is required");
    }
    if (!params.label || !params.label.trim()) {
      throw new Error("Label is required");
    }

    const chain = (params.chain ?? "stellar").toLowerCase();
    this.assertValidChain(chain);

    const category = (params.category ?? "other").toLowerCase();
    this.assertValidCategory(category);

    const confidence = params.confidence ?? 100;
    this.assertValidConfidence(confidence);

    const existing = await this.model.findByAddressChain(address, chain);
    if (existing) {
      throw new Error(`Address "${address}" on chain "${chain}" is already labeled`);
    }

    const label = await this.model.create({
      id: crypto.randomUUID(),
      address,
      chain,
      label: params.label.trim(),
      category,
      notes: params.notes ?? null,
      confidence,
      source: params.source ?? "manual",
      created_by: params.performedBy,
    });

    await auditService.log({
      action: "address_label.created",
      actorId: params.performedBy,
      actorType: "user",
      resourceType: "address_label",
      resourceId: label.id,
      after: label as any,
      metadata: { address: label.address, chain: label.chain, category: label.category },
    });

    logger.info({ addressLabelId: label.id, address, chain }, "Address label created");
    return label;
  }

  async getLabel(id: string): Promise<AddressLabel | null> {
    const label = await this.model.findById(id);
    return label ?? null;
  }

  async lookupAddress(address: string, chain = "stellar"): Promise<AddressLabel | null> {
    const label = await this.model.findByAddressChain(this.normalizeAddress(address), chain.toLowerCase());
    return label ?? null;
  }

  /**
   * Bulk lookup used to enrich a page of transactions in a single query
   * instead of one lookup per row.
   */
  async lookupAddresses(addresses: string[], chain?: string): Promise<Map<string, AddressLabel>> {
    const unique = Array.from(new Set(addresses.map((a) => this.normalizeAddress(a)).filter(Boolean)));
    const labels = await this.model.findByAddresses(unique, chain);
    const byAddress = new Map<string, AddressLabel>();
    for (const label of labels) {
      byAddress.set(label.address, label);
    }
    return byAddress;
  }

  async searchLabels(params: AddressLabelSearchParams): Promise<AddressLabel[]> {
    if (params.category) this.assertValidCategory(params.category.toLowerCase());
    if (params.chain) this.assertValidChain(params.chain.toLowerCase());

    return this.model.search({
      category: params.category?.toLowerCase(),
      chain: params.chain?.toLowerCase(),
      query: params.query?.trim(),
      includeInactive: params.includeInactive,
      limit: params.limit,
      offset: params.offset,
    });
  }

  async updateLabel(
    id: string,
    params: UpdateAddressLabelParams,
    performedBy: string
  ): Promise<AddressLabel> {
    const existing = await this.model.findById(id);
    if (!existing) {
      throw new Error(`Address label "${id}" not found`);
    }

    const updateData: Partial<Pick<AddressLabel, "label" | "category" | "notes" | "confidence" | "is_active">> = {};

    if (params.label !== undefined) {
      if (!params.label.trim()) {
        throw new Error("Label cannot be empty");
      }
      updateData.label = params.label.trim();
    }
    if (params.category !== undefined) {
      const category = params.category.toLowerCase();
      this.assertValidCategory(category);
      updateData.category = category;
    }
    if (params.notes !== undefined) {
      updateData.notes = params.notes;
    }
    if (params.confidence !== undefined) {
      this.assertValidConfidence(params.confidence);
      updateData.confidence = params.confidence;
    }
    if (params.isActive !== undefined) {
      updateData.is_active = params.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    const updated = await this.model.update(id, updateData);
    if (!updated) {
      throw new Error("Failed to update address label");
    }

    await auditService.log({
      action: "address_label.updated",
      actorId: performedBy,
      actorType: "user",
      resourceType: "address_label",
      resourceId: id,
      before: existing as any,
      after: updated as any,
      metadata: { changes: updateData },
    });

    logger.info({ addressLabelId: id, performedBy }, "Address label updated");
    return updated;
  }

  async deleteLabel(id: string, performedBy: string): Promise<boolean> {
    const existing = await this.model.findById(id);
    if (!existing) {
      throw new Error(`Address label "${id}" not found`);
    }

    const deleted = await this.model.delete(id);

    if (deleted) {
      await auditService.log({
        action: "address_label.deleted",
        actorId: performedBy,
        actorType: "user",
        resourceType: "address_label",
        resourceId: id,
        before: existing as any,
        metadata: { address: existing.address, chain: existing.chain },
      });
      logger.info({ addressLabelId: id, performedBy }, "Address label deleted");
    }

    return deleted;
  }
}

export const addressLabelService = new AddressLabelService();
