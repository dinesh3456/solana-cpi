import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from '@solana/spl-token';
import { assert } from 'chai';

// Fix the program type import issue
type TokenTransferCpi = any; // Using any as a workaround for now

describe('token_transfer_cpi', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Fix the program import
  const program = anchor.workspace.TokenTransferCpi as Program<any>;
  const payer = anchor.web3.Keypair.generate();
  let mint: PublicKey;
  let sourceAccount: PublicKey;
  let destinationAccount: PublicKey;
  let pdaSourceAccount: PublicKey;
  let pdaAuthority: PublicKey;
  let pdaBump: number;

  before(async () => {
    // Airdrop SOL to payer
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create mint
    mint = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Create token accounts
    sourceAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      provider.wallet.publicKey
    );

    destinationAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // Mint some tokens to source account
    await mintTo(
      provider.connection,
      payer,
      mint,
      sourceAccount,
      provider.wallet.publicKey,
      1000 * 10**9
    );

    // Derive PDA and bump
    const [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("token-auth"), sourceAccount.toBuffer()],
      program.programId
    );
    pdaAuthority = pda;
    pdaBump = bump;

    // Create and fund PDA source account
    pdaSourceAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      pdaAuthority
    );
    
    await mintTo(
      provider.connection,
      payer,
      mint,
      pdaSourceAccount,
      provider.wallet.publicKey,
      1000 * 10**9
    );
  });

  it("Can transfer tokens", async () => {
    const amount = new anchor.BN(100 * 10**9);
    
    const initialSourceBalance = (await getAccount(provider.connection, sourceAccount)).amount;
    const initialDestBalance = (await getAccount(provider.connection, destinationAccount)).amount;
    
    await program.methods.transferTokens(amount)
      .accounts({
        source: sourceAccount,
        destination: destinationAccount,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    const newSourceBalance = (await getAccount(provider.connection, sourceAccount)).amount;
    const newDestBalance = (await getAccount(provider.connection, destinationAccount)).amount;
    
    // Fix the BigInt comparison
    assert(initialSourceBalance - newSourceBalance === BigInt(amount.toString()));
    assert(newDestBalance - initialDestBalance === BigInt(amount.toString()));
  });

  it("Can transfer tokens with PDA authority", async () => {
    const amount = new anchor.BN(50 * 10**9);
    
    const initialSourceBalance = (await getAccount(provider.connection, pdaSourceAccount)).amount;
    const initialDestBalance = (await getAccount(provider.connection, destinationAccount)).amount;
    
    await program.methods.transferTokensWithPda(amount, pdaBump)
      .accounts({
        source: pdaSourceAccount,
        destination: destinationAccount,
        pdaAuthority: pdaAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    const newSourceBalance = (await getAccount(provider.connection, pdaSourceAccount)).amount;
    const newDestBalance = (await getAccount(provider.connection, destinationAccount)).amount;
    
    // Fix the BigInt comparison
    assert(initialSourceBalance - newSourceBalance === BigInt(amount.toString()));
    assert(newDestBalance - initialDestBalance === BigInt(amount.toString()));
  });
});