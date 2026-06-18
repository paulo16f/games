import {
  Transaction,
  TransactionInstruction,
  PublicKey,
} from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export function buildMemoTx(memo: string): Transaction {
  const ix = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8"),
  });
  return new Transaction().add(ix);
}

// Raw RPC call that bypasses @solana/web3.js superstruct validation.
// The wallet adapter calls connection.getLatestBlockhash() before signing,
// but some RPCs (e.g. Ankr devnet) return a format the validator rejects.
// Pre-setting recentBlockhash on the tx tells the adapter to skip that fetch.
// Routes through our own Next.js API to avoid browser CORS restrictions and
// bypass @solana/web3.js superstruct validation on third-party RPC responses.
export async function getBlockhash(_rpcUrl: string): Promise<string> {
  const res = await fetch("/api/game/blockhash");
  if (!res.ok) throw new Error("Blockhash API unavailable");
  const data = await res.json();
  if (!data.blockhash) throw new Error(data.error ?? "No blockhash returned");
  return data.blockhash as string;
}
