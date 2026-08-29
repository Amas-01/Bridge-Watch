import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface SimulationConstraints {
  maxHops?: number;
  maxSlippagePct?: number;
  excludedPools?: string[];
  minLiquidity?: number;
}

export interface SimulationResult {
  id: string;
  ownerAddress: string;
  status: "pending" | "completed" | "failed";
  sourceAsset: string;
  targetAsset: string;
  inputAmount: number;
  constraints: SimulationConstraints | null;
  result: RouteStep[] | null;
  outputAmount: number | null;
  priceImpactPct: number | null;
  routeHops: number | null;
  estimatedFeeStroops: number | null;
  errorMessage: string | null;
  simulatedAt: Date;
}

export interface RouteStep {
  poolId: string;
  dexName: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  fee: number;
}

export class LiquidityRouteSimulationService {
  async simulate(
    ownerAddress: string,
    sourceAsset: string,
    targetAsset: string,
    inputAmount: number,
    constraints?: SimulationConstraints,
  ): Promise<SimulationResult> {
    const db = getDatabase();
    const [row] = await db("liquidity_simulations")
      .insert({
        owner_address: ownerAddress,
        source_asset: sourceAsset,
        target_asset: targetAsset,
        input_amount: inputAmount,
        constraints: constraints ? JSON.stringify(constraints) : null,
      })
      .returning("*");

    // Process synchronously for now (can be made async with BullMQ later)
    try {
      const result = await this.findBestRoute(sourceAsset, targetAsset, inputAmount, constraints);
      await db("liquidity_simulations")
        .where("id", row.id)
        .update({
          status: "completed",
          result: JSON.stringify(result.steps),
          output_amount: result.outputAmount,
          price_impact_pct: result.priceImpactPct,
          route_hops: result.steps.length,
          estimated_fee_stroops: result.totalFee,
        });

      return { ...this.mapRow(row), status: "completed", result: result.steps, outputAmount: result.outputAmount, priceImpactPct: result.priceImpactPct, routeHops: result.steps.length, estimatedFeeStroops: result.totalFee };
    } catch (error) {
      await db("liquidity_simulations")
        .where("id", row.id)
        .update({ status: "failed", error_message: error instanceof Error ? error.message : "Simulation failed" });
      throw error;
    }
  }

  async getSimulation(id: string): Promise<SimulationResult | null> {
    const db = getDatabase();
    const row = await db("liquidity_simulations").where("id", id).first();
    return row ? this.mapRow(row) : null;
  }

  async listSimulations(ownerAddress: string, limit = 20, offset = 0): Promise<{ simulations: SimulationResult[]; total: number }> {
    const db = getDatabase();
    const query = db("liquidity_simulations").where("owner_address", ownerAddress);
    const [countResult] = await query.clone().count("id as count");
    const rows = await query.orderBy("simulated_at", "desc").limit(limit).offset(offset);
    return { simulations: rows.map(this.mapRow), total: Number(countResult?.count ?? 0) };
  }

  private async findBestRoute(
    sourceAsset: string,
    targetAsset: string,
    inputAmount: number,
    constraints?: SimulationConstraints,
  ): Promise<{ steps: RouteStep[]; outputAmount: number; priceImpactPct: number; totalFee: number }> {
    const db = getDatabase();
    const maxHops = constraints?.maxHops ?? 3;

    // Fetch available pools from liquidity snapshots
    const pools = await db("liquidity_snapshots")
      .where(function () {
        this.where("asset_code", sourceAsset).orWhere("asset_code", targetAsset);
      })
      .orderBy("time", "desc")
      .limit(100);

    // Simple greedy routing (in production, use a proper pathfinding algorithm)
    const steps: RouteStep[] = [];
    let currentAsset = sourceAsset;
    let remaining = inputAmount;
    let totalFee = 0;

    for (let hop = 0; hop < maxHops && currentAsset !== targetAsset; hop++) {
      const pool = pools.find(
        (p) =>
          (p.asset_code === currentAsset || p.counter_asset === currentAsset) &&
          (p.asset_code === targetAsset || p.counter_asset === targetAsset) &&
          !(constraints?.excludedPools ?? []).includes(p.pool_id),
      );

      if (!pool) break;

      const fee = Math.floor(remaining * 0.003); // 0.3% default fee
      const amountOut = remaining - fee;

      steps.push({
        poolId: pool.pool_id,
        dexName: pool.dex_name || "unknown",
        assetIn: currentAsset,
        assetOut: targetAsset,
        amountIn: remaining,
        amountOut,
        fee,
      });

      totalFee += fee;
      currentAsset = targetAsset;
      remaining = amountOut;
    }

    if (steps.length === 0) throw new Error("No route found");

    const outputAmount = remaining;
    const priceImpactPct = ((inputAmount - outputAmount) / inputAmount) * 100;

    return { steps, outputAmount, priceImpactPct, totalFee };
  }

  private mapRow(row: Record<string, unknown>): SimulationResult {
    return {
      id: row.id as string,
      ownerAddress: row.owner_address as string,
      status: row.status as SimulationResult["status"],
      sourceAsset: row.source_asset as string,
      targetAsset: row.target_asset as string,
      inputAmount: Number(row.input_amount),
      constraints: row.constraints ? JSON.parse(row.constraints as string) : null,
      result: row.result ? JSON.parse(row.result as string) : null,
      outputAmount: row.output_amount != null ? Number(row.output_amount) : null,
      priceImpactPct: row.price_impact_pct != null ? Number(row.price_impact_pct) : null,
      routeHops: row.route_hops as number | null,
      estimatedFeeStroops: row.estimated_fee_stroops as number | null,
      errorMessage: row.error_message as string | null,
      simulatedAt: row.simulated_at as Date,
    };
  }
}

export const liquidityRouteSimulationService = new LiquidityRouteSimulationService();
