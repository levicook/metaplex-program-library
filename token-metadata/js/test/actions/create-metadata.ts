import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { logDebug } from '../utils/log';
import { assertConfirmedTransaction, TransactionHandler } from '@metaplex-foundation/amman';
import { strict as assert } from 'assert';
import {
  CreateMetadata,
  CreateMasterEditionV3,
  CreateMetadataV2,
  DataV2,
  MasterEdition,
  Metadata,
  MetadataDataData,
} from '../../src/deprecated';
import BN from 'bn.js';
import { CreateMint } from './create-mint-account';
import { amman } from '../utils/amman';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore these exports actually exist but aren't setup correctly so TypeScript gets confused
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
// -----------------
// Create Metadata
// -----------------
// src/actions/createMetadata.ts
type CreateMetadataParams = {
  transactionHandler: TransactionHandler;
  publicKey: PublicKey;
  editionMint: PublicKey;
  metadataData: MetadataDataData;
  updateAuthority?: PublicKey;
};

type CreateMetadataV2Params = {
  transactionHandler: TransactionHandler;
  publicKey: PublicKey;
  mint: PublicKey;
  metadataData: DataV2;
  updateAuthority?: PublicKey;
};

export async function createMetadataV2({
  transactionHandler,
  publicKey,
  mint,
  metadataData,
  updateAuthority,
}: CreateMetadataV2Params) {
  const metadata = await Metadata.getPDA(mint);
  const createMetadataTx = new CreateMetadataV2(
    { feePayer: publicKey },
    {
      metadata,
      metadataData,
      updateAuthority: updateAuthority ?? publicKey,
      mint: mint,
      mintAuthority: publicKey,
    },
  );

  const createTxDetails = await transactionHandler.sendAndConfirmTransaction(
    createMetadataTx,
    [],
    {
      skipPreflight: false,
    },
    'Create Metadata V2',
  );

  return { metadata, createTxDetails };
}

export async function createMetadata({
  transactionHandler,
  publicKey,
  editionMint,
  metadataData,
  updateAuthority,
}: CreateMetadataParams) {
  const metadata = await Metadata.getPDA(editionMint);
  const createMetadataTx = new CreateMetadata(
    { feePayer: publicKey },
    {
      metadata,
      metadataData,
      updateAuthority: updateAuthority ?? publicKey,
      mint: editionMint,
      mintAuthority: publicKey,
    },
  );

  const createTxDetails = await transactionHandler.sendAndConfirmTransaction(
    createMetadataTx,
    [],
    'CreateMetadata',
  );

  return { metadata, createTxDetails };
}

// -----------------
// Prepare Mint and Create Metaata
// -----------------
export async function mintAndCreateMetadata(
  connection: Connection,
  transactionHandler: TransactionHandler,
  payer: Keypair,
  args: ConstructorParameters<typeof MetadataDataData>[0],
) {
  const { mint, createMintTx } = await CreateMint.createMintAccount(connection, payer.publicKey);
  const mintRes = await transactionHandler.sendAndConfirmTransaction(
    createMintTx,
    [mint],
    'Create Mint',
  );
  amman.addr.addLabel('mint', mint);

  assertConfirmedTransaction(assert, mintRes.txConfirmed);

  const initMetadataData = new MetadataDataData(args);

  const { createTxDetails, metadata } = await createMetadata({
    transactionHandler,
    publicKey: payer.publicKey,
    editionMint: mint.publicKey,
    metadataData: initMetadataData,
  });

  amman.addr.addLabel('metadata', metadata);
  logDebug(createTxDetails.txSummary.logMessages.join('\n'));

  return { mint, metadata };
}

// -----------------
// Prepare Mint and Create Metaata
// -----------------
export async function mintAndCreateMetadataV2(
  connection: Connection,
  transactionHandler: TransactionHandler,
  payer: Keypair,
  args: DataV2,
) {
  const mint = await createMint(connection, payer, payer.publicKey, null, 0);
  const dstTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  await mintTo(connection, payer, mint, dstTokenAccount.address, payer, 1);
  amman.addr.addLabel('mint', mint);
  const initMetadataData = args;
  const { createTxDetails, metadata } = await createMetadataV2({
    transactionHandler,
    publicKey: payer.publicKey,
    mint,
    metadataData: initMetadataData,
  });

  amman.addr.addLabel('metadata', metadata);
  logDebug(createTxDetails.txSummary.logMessages.join('\n'));
  return { mint, metadata };
}

// -----------------
// Create A Master Edition
// -----------------
export async function createMasterEdition(
  connection: Connection,
  transactionHandler: TransactionHandler,
  payer: Keypair,
  args: DataV2,
  maxSupply: number,
) {
  const { mint, metadata } = await mintAndCreateMetadataV2(
    connection,
    transactionHandler,
    payer,
    args,
  );

  const masterEditionPubkey = await MasterEdition.getPDA(mint);
  const createMev3 = new CreateMasterEditionV3(
    { feePayer: payer.publicKey },
    {
      edition: masterEditionPubkey,
      metadata: metadata,
      updateAuthority: payer.publicKey,
      mint,
      mintAuthority: payer.publicKey,
      maxSupply: new BN(maxSupply),
    },
  );

  const createTxDetails = await transactionHandler.sendAndConfirmTransaction(
    createMev3,
    [],
    {
      skipPreflight: true,
    },
    'Create MasterEdition',
  );

  return { mint, metadata, masterEditionPubkey, createTxDetails };
}
