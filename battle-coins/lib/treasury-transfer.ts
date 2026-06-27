export interface BurnAndTransferResult {
  txSignature: string;
  netAmount: number;
  burnedAmount: number;
}

export async function burnAndTransfer(
  _toWallet: string,
  _grossAmountUi: number,
  _burnRateBps: number,
  _decimals: number,
): Promise<BurnAndTransferResult> {
  throw new Error("On-chain SPL payout transport is not installed in this clean base project");
}

export async function transferRewardTokens(_toWallet: string, _amountUi: number): Promise<string> {
  throw new Error("On-chain SPL payout transport is not installed in this clean base project");
}
