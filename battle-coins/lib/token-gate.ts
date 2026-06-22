import { Connection, PublicKey } from "@solana/web3.js";
import { localDevGateUnlocked, runningToadsConfig } from "./config";

export interface TokenGateResult {
  wallet: string;
  balance: number;
  rawBalance: number;
  decimals: number;
  symbol: string;
  gateAmount: number;
  gated: boolean;
  configured: boolean;
  devMode: boolean;
}

export function parseWallet(wallet: string): PublicKey {
  return new PublicKey(wallet);
}

export async function checkRunningToadsGate(wallet: string): Promise<TokenGateResult> {
  const walletLabel = wallet.trim();

  if (localDevGateUnlocked()) {
    const balance = runningToadsConfig.gateAmount;
    return {
      wallet: walletLabel || "local-dev-wallet",
      balance,
      rawBalance: Math.floor(balance * 1_000_000),
      decimals: 6,
      symbol: runningToadsConfig.tokenSymbol,
      gateAmount: runningToadsConfig.gateAmount,
      gated: true,
      configured: true,
      devMode: true,
    };
  }

  if (!walletLabel) throw new Error("wallet is required");
  const pubkey = parseWallet(walletLabel);

  if (!runningToadsConfig.isProduction && runningToadsConfig.mockTokenBalance !== undefined) {
    const balance = Number(runningToadsConfig.mockTokenBalance);
    return {
      wallet: pubkey.toBase58(),
      balance,
      rawBalance: Math.floor(balance * 1_000_000),
      decimals: 6,
      symbol: runningToadsConfig.tokenSymbol,
      gateAmount: runningToadsConfig.gateAmount,
      gated: balance >= runningToadsConfig.gateAmount,
      configured: true,
      devMode: false,
    };
  }

  if (!runningToadsConfig.tokenMint) {
    return {
      wallet: pubkey.toBase58(),
      balance: 0,
      rawBalance: 0,
      decimals: 6,
      symbol: runningToadsConfig.tokenSymbol,
      gateAmount: runningToadsConfig.gateAmount,
      gated: false,
      configured: false,
      devMode: false,
    };
  }

  const connection = new Connection(runningToadsConfig.rpcUrl, "confirmed");
  const mint = new PublicKey(runningToadsConfig.tokenMint);
  const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, { mint });

  let rawBalance = 0;
  let decimals = 6;
  for (const { account } of accounts.value) {
    const info = account.data.parsed.info;
    rawBalance += Number(info.tokenAmount.amount);
    decimals = info.tokenAmount.decimals;
  }

  const balance = rawBalance / Math.pow(10, decimals);
  return {
    wallet: pubkey.toBase58(),
    balance,
    rawBalance,
    decimals,
    symbol: runningToadsConfig.tokenSymbol,
    gateAmount: runningToadsConfig.gateAmount,
    gated: balance >= runningToadsConfig.gateAmount,
    configured: true,
    devMode: false,
  };
}

export async function requireRunningToadsGate(wallet: string): Promise<{ gate: TokenGateResult; error: string; status: number }> {
  try {
    const gate = await checkRunningToadsGate(wallet);
    if (!gate.configured) {
      return { gate, error: "RunningToads token mint is not configured", status: 503 };
    }
    if (!gate.gated) {
      return {
        gate,
        error: `Hold ${gate.gateAmount.toLocaleString()}+ ${gate.symbol} to play`,
        status: 403,
      };
    }
    return { gate, error: "", status: 200 };
  } catch {
    const fallback: TokenGateResult = {
      wallet,
      balance: 0,
      rawBalance: 0,
      decimals: 6,
      symbol: runningToadsConfig.tokenSymbol,
      gateAmount: runningToadsConfig.gateAmount,
      gated: false,
      configured: Boolean(runningToadsConfig.tokenMint),
      devMode: false,
    };
    return { gate: fallback, error: "Invalid wallet address", status: 400 };
  }
}
