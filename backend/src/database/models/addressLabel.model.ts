import { getDatabase } from "../connection.js";

export type AddressLabelChain = "stellar" | "ethereum" | "polygon" | "avalanche" | "bsc" | "other";

export type AddressLabelCategory =
  | "exchange"
  | "bridge_contract"
  | "contract"
  | "individual"
  | "suspicious"
  | "internal"
  | "other";

export interface AddressLabel {
  id: string;
  address: string;
  chain: AddressLabelChain;
  label: string;
  category: AddressLabelCategory;
  notes: string | null;
  confidence: number;
  source: string;
  created_by: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAddressLabelRow {
  id: string;
  address: string;
  chain: AddressLabelChain;
  label: string;
  category: AddressLabelCategory;
  notes?: string | null;
  confidence?: number;
  source?: string;
  created_by: string;
}

export class AddressLabelModel {
  private db = getDatabase();
  private table = "address_labels";

  async findByAddressChain(address: string, chain: string): Promise<AddressLabel | undefined> {
    return this.db(this.table).where({ address, chain }).first();
  }

  async findById(id: string): Promise<AddressLabel | undefined> {
    return this.db(this.table).where({ id }).first();
  }

  async findByAddresses(addresses: string[], chain?: string): Promise<AddressLabel[]> {
    if (addresses.length === 0) return [];
    const query = this.db(this.table).whereIn("address", addresses).andWhere("is_active", true);
    if (chain) {
      query.andWhere("chain", chain);
    }
    return query;
  }

  async search(filters: {
    category?: string;
    chain?: string;
    query?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AddressLabel[]> {
    const query = this.db(this.table).select("*");
    if (!filters.includeInactive) {
      query.andWhere("is_active", true);
    }
    if (filters.category) {
      query.andWhere("category", filters.category);
    }
    if (filters.chain) {
      query.andWhere("chain", filters.chain);
    }
    if (filters.query) {
      query.andWhere((builder: any) => {
        builder.whereILike("address", `%${filters.query}%`).orWhereILike("label", `%${filters.query}%`);
      });
    }
    return query
      .orderBy("updated_at", "desc")
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);
  }

  async create(data: CreateAddressLabelRow): Promise<AddressLabel> {
    const [row] = await this.db(this.table)
      .insert({
        ...data,
        confidence: data.confidence ?? 100,
        source: data.source ?? "manual",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return row;
  }

  async update(
    id: string,
    data: Partial<Pick<AddressLabel, "label" | "category" | "notes" | "confidence" | "is_active">>
  ): Promise<AddressLabel | undefined> {
    const [row] = await this.db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db(this.table).where({ id }).del();
    return count > 0;
  }
}
