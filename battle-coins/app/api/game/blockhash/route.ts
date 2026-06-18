import { NextResponse } from "next/server";

// Always use the official devnet for blockhash — its response format is correct
// for web3.js and a single getLatestBlockhash per user action won't be rate-limited.
const RPCS = [
  "https://api.devnet.solana.com",
  "https://rpc.ankr.com/solana_devnet",
];

async function tryRpc(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestBlockhash",
        params: [{ commitment: "confirmed" }],
      }),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    const blockhash = data?.result?.value?.blockhash;
    return typeof blockhash === "string" ? blockhash : null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  for (const url of RPCS) {
    const blockhash = await tryRpc(url);
    if (blockhash) return NextResponse.json({ blockhash });
  }
  return NextResponse.json(
    { error: "All RPC endpoints unavailable" },
    { status: 503 }
  );
}
