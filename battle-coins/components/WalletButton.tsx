"use client";
import dynamic from "next/dynamic";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function WalletButton() {
  return (
    <WalletMultiButtonDynamic
      style={{
        background: "linear-gradient(135deg, #7c3aed, #2563eb)",
        borderRadius: "0.75rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        padding: "0.5rem 1rem",
        height: "auto",
      }}
    />
  );
}
