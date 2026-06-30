import crypto from "crypto";
import { toadJumpConfig } from "./config";

export function creatorKeyConfigured(): boolean {
  return Boolean(toadJumpConfig.creatorDashboardKey);
}

export function hasCreatorKey(provided: unknown): boolean {
  if (!toadJumpConfig.creatorDashboardKey || typeof provided !== "string") return false;
  if (provided.length !== toadJumpConfig.creatorDashboardKey.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(toadJumpConfig.creatorDashboardKey)
  );
}
