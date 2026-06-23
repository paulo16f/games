import { Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { toadJumpConfig } from "./config";

export interface BurnAndTransferResult {
  txSignature: string;
  netAmount: number;
  burnedAmount: number;
}

function treasuryKeypair(): Keypair | null {
  if (!toadJumpConfig.treasuryPrivateKey) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(toadJumpConfig.treasuryPrivateKey)));
  } catch {
    return null;
  }
}

export async function burnAndTransfer(
  toWallet: string,
  grossAmountUi: number,
  burnRateBps: number,
  decimals: number,
): Promise<BurnAndTransferResult> {
  const { isProduction, tokenMint, treasuryPrivateKey } = toadJumpConfig;

  if (!isProduction && (!tokenMint || !treasuryPrivateKey)) {
    const scale = Math.pow(10, decimals);
    const burnedRaw = Math.floor(grossAmountUi * burnRateBps / 10_000 * scale);
    const burnedAmount = burnedRaw / scale;
    return {
      txSignature: `local-dev-${Date.now()}`,
      netAmount: grossAmountUi - burnedAmount,
      burnedAmount,
    };
  }

  const treasury = treasuryKeypair();
  if (!treasury) throw new Error("Treasury private key is not configured");
  if (!tokenMint) throw new Error("Toad Jump token mint is not configured");

  const { Connection } = await import("@solana/web3.js");
  const connection = new Connection(toadJumpConfig.rpcUrl, "confirmed");
  const mint = new PublicKey(tokenMint);
  const recipient = new PublicKey(toWallet);
  const scale = Math.pow(10, decimals);

  const grossRaw = BigInt(Math.floor(grossAmountUi * scale));
  const burnRaw = BigInt(Math.floor(Number(grossRaw) * burnRateBps / 10_000));
  const netRaw = grossRaw - burnRaw;

  const fromAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const toAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, recipient);

  const tx = new Transaction();
  if (burnRaw > BigInt(0)) {
    tx.add(createBurnCheckedInstruction(
      fromAta.address, mint, treasury.publicKey, burnRaw, decimals, [], TOKEN_PROGRAM_ID
    ));
  }
  tx.add(createTransferCheckedInstruction(
    fromAta.address, mint, toAta.address, treasury.publicKey, netRaw, decimals, [], TOKEN_PROGRAM_ID
  ));

  try {
    const txSignature = await sendAndConfirmTransaction(connection, tx, [treasury], { commitment: "confirmed" });
    return {
      txSignature,
      netAmount: Number(netRaw) / scale,
      burnedAmount: Number(burnRaw) / scale,
    };
  } catch (err) {
    console.error("[treasury-transfer] burnAndTransfer failed", { toWallet, grossAmountUi, burnRateBps, err });
    throw err;
  }
}

export async function transferRewardTokens(toWallet: string, amountUi: number): Promise<string> {
  const result = await burnAndTransfer(toWallet, amountUi, 0, toadJumpConfig.tokenDecimals);
  return result.txSignature;
}
