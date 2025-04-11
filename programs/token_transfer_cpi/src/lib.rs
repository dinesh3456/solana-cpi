use anchor_lang::prelude::*;
use anchor_spl::token;
use anchor_spl::token::{ Token, Transfer };

declare_id!("GLXr68cskBzbotdDkfHsVe9hqJDBz4DKApLDu2mJy7NB");

#[program]
pub mod token_transfer_cpi {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        // Perform the token transfer via CPI
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                from: ctx.accounts.source.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            }),
            amount
        )?;

        msg!("Transferred {} tokens", amount);
        Ok(())
    }

    pub fn transfer_tokens_with_pda(
        ctx: Context<TransferTokensWithPda>,
        amount: u64,
        bump: u8
    ) -> Result<()> {
        // Create the seeds for PDA signing
        let source_key = ctx.accounts.source.key();
        let seeds = &[b"token-auth", source_key.as_ref(), &[bump]];
        // Perform the token transfer via CPI with PDA signer
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.source.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.pda_authority.to_account_info(),
                },
                &[seeds]
            ),
            amount
        )?;

        msg!("Transferred {} tokens with PDA authority", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    /// CHECK: This is a token account that we'll validate in the instruction
    #[account(mut)]
    pub source: AccountInfo<'info>,
    /// CHECK: This is a token account that we'll validate in the instruction
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferTokensWithPda<'info> {
    /// CHECK: This is a token account that we'll validate in the instruction
    #[account(mut)]
    pub source: AccountInfo<'info>,
    /// CHECK: This is a token account that we'll validate in the instruction
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    /// CHECK: This is the PDA that will act as the authority
    #[account(seeds = [b"token-auth", source.key().as_ref()], bump)]
    pub pda_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The authority is not the owner of the token account")]
    InvalidAuthority,
    #[msg("Token account mismatch")]
    TokenAccountMismatch,
    #[msg("Amount exceeds available balance")]
    InsufficientFunds,
}
