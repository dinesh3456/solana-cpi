import * as anchor from '@project-serum/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import fs from 'fs';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  createAssociatedTokenAccount,
} from '@solana/spl-token';

// Load your wallet keypair
const keypairFile = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync(keypairFile, 'utf-8')))
);

// Load the program IDL and keypair
const programId = new PublicKey("GLXr68cskBzbotdDkfHsVe9hqJDBz4DKApLDu2mJy7NB");
const idl = JSON.parse(fs.readFileSync('./target/idl/token_transfer_cpi.json', 'utf-8'));

async function main() {
  // Connect to the network
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  // Create anchor provider
  const provider = new anchor.AnchorProvider(
    connection, 
    new anchor.Wallet(payer),
    { commitment: 'confirmed' }
  );
  
  // Create program interface
  const program = new anchor.Program(idl, programId, provider);
  
  console.log("1. Creating test token mint...");
  // Create mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    9
  );
  console.log(`   Mint created: ${mint.toBase58()}`);
  
  console.log("2. Creating token accounts...");
  // Create token accounts
  const sourceAccount = await createAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  console.log(`   Source account: ${sourceAccount.toBase58()}`);
  
  const destinationAccount = await createAssociatedTokenAccount(
    connection,
    payer,
    mint,
    Keypair.generate().publicKey  // Some other account
  );
  console.log(`   Destination account: ${destinationAccount.toBase58()}`);
  
  console.log("3. Minting tokens to source account...");
  // Mint some tokens to source account
  await mintTo(
    connection,
    payer,
    mint,
    sourceAccount,
    payer.publicKey,
    1000_000_000_000  // 1000 tokens with 9 decimals
  );
  
  let sourceBalance = await getAccount(connection, sourceAccount);
  console.log(`   Source initial balance: ${sourceBalance.amount}`);
  
  console.log("4. Making a token transfer...");
  // Transfer tokens using our program
  const amount = new anchor.BN(100_000_000_000);  // 100 tokens with 9 decimals
  
  const tx = await program.methods.transferTokens(amount)
    .accounts({
      source: sourceAccount,
      destination: destinationAccount,
      authority: payer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  
  console.log(`   Transaction signature: ${tx}`);
  
  console.log("5. Verifying balances after transfer...");
  // Verify the balances
  sourceBalance = await getAccount(connection, sourceAccount);
  const destBalance = await getAccount(connection, destinationAccount);
  
  console.log(`   Source balance after: ${sourceBalance.amount}`);
  console.log(`   Destination balance after: ${destBalance.amount}`);
  
  console.log("6. Testing PDA transfer...");
  // Find PDA for the token authority
  const [pdaAuthority, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("token-auth"), sourceAccount.toBuffer()],
    programId
  );
  console.log(`   PDA authority: ${pdaAuthority.toBase58()}, bump: ${bump}`);
  
  // Create and fund a token account owned by the PDA
  console.log("7. Creating PDA-owned token account...");
  const pdaSourceAccount = await createAssociatedTokenAccount(
    connection,
    payer,
    mint,
    pdaAuthority
  );
  console.log(`   PDA source account: ${pdaSourceAccount.toBase58()}`);
  
  console.log("8. Minting tokens to PDA account...");
  await mintTo(
    connection,
    payer,
    mint,
    pdaSourceAccount,
    payer.publicKey,
    500_000_000_000  // 500 tokens with 9 decimals
  );
  
  let pdaBalance = await getAccount(connection, pdaSourceAccount);
  console.log(`   PDA source initial balance: ${pdaBalance.amount}`);
  
  console.log("9. Making a PDA token transfer...");
  // Transfer tokens using our program with PDA authority
  const pdaAmount = new anchor.BN(50_000_000_000);  // 50 tokens with 9 decimals
  
  const pdaTx = await program.methods.transferTokensWithPda(pdaAmount, bump)
    .accounts({
      source: pdaSourceAccount,
      destination: destinationAccount,
      pdaAuthority: pdaAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  
  console.log(`   PDA transaction signature: ${pdaTx}`);
  
  console.log("10. Verifying balances after PDA transfer...");
  // Verify the balances
  pdaBalance = await getAccount(connection, pdaSourceAccount);
  const destBalanceAfterPda = await getAccount(connection, destinationAccount);
  
  console.log(`   PDA source balance after: ${pdaBalance.amount}`);
  console.log(`   Destination balance after: ${destBalanceAfterPda.amount}`);
  
  console.log("Tests completed successfully!");
}

main().catch(err => {
  console.error("Error running client:", err);
});