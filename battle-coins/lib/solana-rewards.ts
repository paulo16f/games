import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import { PUMP_TOKEN_MINT } from "./constants";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
const DECIMALS = 6;

function getTreasury(): Keypair | null {
  const raw = process.env.TREASURY_PRIVATE_KEY;
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    console.error("Invalid TREASURY_PRIVATE_KEY");
    return null;
  }
}

export async function rewardTokens(toWallet: string, amountUi: number): Promise<string | null> {
  const treasury = getTreasury();
  if (!treasury) return null;

  try {
    const connection = new Connection(RPC, "confirmed");
    const mint = new PublicKey(PUMP_TOKEN_MINT);
    const recipient = new PublicKey(toWallet);

    const fromAta = await getOrCreateAssociatedTokenAccount(
      connection, treasury, mint, treasury.publicKey
    );
    const toAta = await getOrCreateAssociatedTokenAccount(
      connection, treasury, mint, recipient
    );

    const amount = BigInt(Math.round(amountUi * Math.pow(10, DECIMALS)));
    const ix = createTransferCheckedInstruction(
      fromAta.address, mint, toAta.address, treasury.publicKey, amount, DECIMALS, [], TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(treasury);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log(`Rewarded ${amountUi} TOKEN to ${toWallet}: ${sig}`);
    return sig;
  } catch (e) {
    console.error("rewardTokens failed:", e);
    return null;
  }
}
