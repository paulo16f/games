<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Game Economy Architecture

For any task involving token economy design, game loop design, Solana integration, or building new game types, use the `web3-game-economy` agent defined at `.claude/agents/web3-game-economy.md`.

That agent encodes:
- The 5 economic laws (shared pool, burn split, idle settlement, earn gate, power weight)
- Solana/SPL token patterns (gate check, treasury transfer, on-chain burn)
- Per-genre game loop templates (idle, battle, clicker, farming, racing, RPG)
- Architecture guidance: Next.js/Vercel vs Express/Replit
- Replit setup (Replit DB, always-on background settlement loop)
