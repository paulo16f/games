import { localDevGateUnlocked, toadJumpConfig } from "./config";
import { normalizePublicKey, rpcCall } from "./solana-lite";

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

interface ParsedTokenAccounts {
  value: Array<{
    account: {
      data: {
        parsed?: {
          info?: {
            tokenAmount?: {
              amount?: string;
              decimals?: number;
            };
          };
        };
      };
    };
  }>;
}

export async function checkToadJumpGate(wallet: string): Promise<TokenGateResult> {
  const walletLabel = wallet.trim();

  if (localDevGateUnlocked()) {
    const balance = toadJumpConfig.gateAmount;
    return {
      wallet: walletLabel || "local-dev-wallet",
      balance,
      rawBalance: Math.floor(balance * 1_000_000),
      decimals: 6,
      symbol: toadJumpConfig.tokenSymbol,
      gateAmount: toadJumpConfig.gateAmount,
      gated: true,
      configured: true,
      devMode: true,
    };
  }

  if (!walletLabel) throw new Error("wallet is required");
  const normalizedWallet = normalizePublicKey(walletLabel);

  if (!toadJumpConfig.isProduction && toadJumpConfig.mockTokenBalance !== undefined) {
    const balance = Number(toadJumpConfig.mockTokenBalance);
    return {
      wallet: normalizedWallet,
      balance,
      rawBalance: Math.floor(balance * 1_000_000),
      decimals: 6,
      symbol: toadJumpConfig.tokenSymbol,
      gateAmount: toadJumpConfig.gateAmount,
      gated: balance >= toadJumpConfig.gateAmount,
      configured: true,
      devMode: false,
    };
  }

  if (!toadJumpConfig.tokenMint) {
    return {
      wallet: normalizedWallet,
      balance: 0,
      rawBalance: 0,
      decimals: 6,
      symbol: toadJumpConfig.tokenSymbol,
      gateAmount: toadJumpConfig.gateAmount,
      gated: false,
      configured: false,
      devMode: false,
    };
  }

  if (!toadJumpConfig.rpcUrl) {
    throw new Error("Token gate RPC error: RPC_URL is not configured");
  }

  let rawBalance = 0;
  let decimals = 6;
  try {
    const accounts = await rpcCall<ParsedTokenAccounts>(toadJumpConfig.rpcUrl, "getTokenAccountsByOwner", [
      normalizedWallet,
      { mint: normalizePublicKey(toadJumpConfig.tokenMint) },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    for (const { account } of accounts.value) {
      const tokenAmount = account.data.parsed?.info?.tokenAmount;
      rawBalance += Number(tokenAmount?.amount ?? 0);
      decimals = tokenAmount?.decimals ?? decimals;
    }
  } catch (err) {
    throw new Error(`Token gate RPC error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  const balance = rawBalance / Math.pow(10, decimals);
  return {
    wallet: normalizedWallet,
    balance,
    rawBalance,
    decimals,
    symbol: toadJumpConfig.tokenSymbol,
    gateAmount: toadJumpConfig.gateAmount,
    gated: balance >= toadJumpConfig.gateAmount,
    configured: true,
    devMode: false,
  };
}

export async function requireToadJumpGate(wallet: string): Promise<{ gate: TokenGateResult; error: string; status: number }> {
  try {
    const gate = await checkToadJumpGate(wallet);
    if (!gate.configured) {
      return { gate, error: "Toad Jump token mint is not configured", status: 503 };
    }
    if (!gate.gated) {
      return {
        gate,
        error: `Hold ${gate.gateAmount.toLocaleString()}+ ${gate.symbol} to play`,
        status: 403,
      };
    }
    return { gate, error: "", status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const isRpcError = message.startsWith("Token gate RPC error");
    const fallback: TokenGateResult = {
      wallet,
      balance: 0,
      rawBalance: 0,
      decimals: 6,
      symbol: toadJumpConfig.tokenSymbol,
      gateAmount: toadJumpConfig.gateAmount,
      gated: false,
      configured: Boolean(toadJumpConfig.tokenMint),
      devMode: false,
    };
    return {
      gate: fallback,
      error: isRpcError ? "Token gate temporarily unavailable — try again" : "Invalid wallet address",
      status: isRpcError ? 503 : 400,
    };
  }
}
