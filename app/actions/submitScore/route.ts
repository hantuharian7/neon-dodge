import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { MONAD_GAMES_ID_ABI } from '@/lib/abi/monadGamesId';

const RPC      = process.env.MONAD_RPC_URL!;
const PK       = process.env.GAME_PRIVATE_KEY!;
const CONTRACT = process.env.MONAD_GAMES_ID_CONTRACT!;

const provider = new ethers.JsonRpcProvider(RPC);
const signer   = new ethers.Wallet(PK, provider);
const contract = new ethers.Contract(CONTRACT, MONAD_GAMES_ID_ABI, signer);

const seen = new Set<string>();

export async function POST(req: Request) {
  try {
    const { address, delta, nonce } = await req.json() as { address: string; delta: number; nonce?: string };

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ ok: false, error: 'Bad address' }, { status: 400 });
    }
    if (typeof delta !== 'number' || !Number.isFinite(delta)) {
      return NextResponse.json({ ok: false, error: 'Bad delta' }, { status: 400 });
    }
    if (delta <= 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const n = nonce && nonce.length ? nonce : crypto.randomUUID();
    if (seen.has(n)) return NextResponse.json({ ok: true, duplicate: true });
    seen.add(n); setTimeout(() => seen.delete(n), 5 * 60 * 1000);

    const tx = await contract.updatePlayerData(address, BigInt(delta), 0n);
    const r  = await tx.wait();

    return NextResponse.json({ ok: true, txHash: tx.hash, blockNumber: r.blockNumber });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message ?? 'Unhandled error' }, { status: 500 });
  }
}
