import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_TOKEN_MINT } from "@/lib/constants";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
const SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || "TOKEN";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const mock = process.env.MOCK_TOKEN_BALANCE;
  if (mock !== undefined) {
    const balance = Number(mock);
    return NextResponse.json({ balance, rawBalance: balance * 1e6, decimals: 6, symbol: SYMBOL });
  }

  try {
    const connection = new Connection(RPC, "confirmed");
    const pubkey = new PublicKey(wallet);
    const mint = new PublicKey(PUMP_TOKEN_MINT);

    const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, { mint });

    let rawBalance = 0;
    let decimals = 6;

    for (const { account } of accounts.value) {
      const info = account.data.parsed.info;
      rawBalance += Number(info.tokenAmount.amount);
      decimals = info.tokenAmount.decimals;
    }

    const balance = rawBalance / Math.pow(10, decimals);
    return NextResponse.json({ balance, rawBalance, decimals, symbol: SYMBOL });
  } catch (e) {
    console.error("Token balance error:", e);
    return NextResponse.json({ balance: 0, rawBalance: 0, decimals: 6, symbol: SYMBOL });
  }
}
