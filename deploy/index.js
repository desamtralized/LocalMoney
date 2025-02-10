import dotenv from 'dotenv';
dotenv.config();

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import fs from "fs";
import findFilesInDir from "./findFilesInDir.js";

let rpcEndpoint = process.env.RPC || "http://localhost:26657";
let seed = process.env.ADMIN_SEED || "";

const gasPrice = GasPrice.fromString(process.env.GAS_PRICE);
const wallet = await DirectSecp256k1HdWallet.fromMnemonic(seed, { prefix: process.env.ADDR_PREFIX });
const accounts = await wallet.getAccounts();
const walletAddr = accounts[0].address;
const codeIdsPath = '../app/tests/fixtures/codeIds.json';
console.log('Wallet Address:', walletAddr);

const cwClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, wallet, {
  broadcastTimeoutMs: 60 * 1000,
  gasPrice: gasPrice
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getContractNameFromPath(path) {
  const regex = /artifacts\/(.*?)\.wasm/i;
  const match = path.match(regex);
  return match ? match[1] : "";
}

async function deploy(contract) {
  let codeIds = {};
  const contracts = findFilesInDir("../contracts/cosmwasm/artifacts", ".wasm");

  if (contract.toLowerCase() === "all") {
    for (const c of contracts) {
      codeIds[getContractNameFromPath(c)] = await uploadContract(c, walletAddr);
    }
    fs.writeFileSync(codeIdsPath, JSON.stringify(codeIds, null, 2), "utf8");
  } else {
    try {
      codeIds = JSON.parse(fs.readFileSync(codeIdsPath, "utf8"));
    } catch (err) {
      console.warn("No existing codeIds file found, starting fresh.");
    }
    // Use proper check for comma-separated names.
    const names = contract.indexOf(",") !== -1 ? contract.split(",") : [contract];
    for (const name of names) {
      for (const c of contracts) {
        if (c.includes(name)) {
          codeIds[getContractNameFromPath(c)] = await uploadContract(c, walletAddr);
        }
      }
    }
    fs.writeFileSync(codeIdsPath, JSON.stringify(codeIds, null, 2), "utf8");
  }
  console.log("Deploy Finished!", JSON.stringify(codeIds, null, 2));
}

async function uploadContract(filePath, addr) {
  await sleep(1000);
  const wasm = fs.readFileSync(filePath);
  const uploadResult = await cwClient.upload(addr, wasm, "auto");
  console.log('upload result:', uploadResult);
  return uploadResult.codeId;
}

if (process.env.DEPLOY) {
  await deploy(process.env.DEPLOY);
} else {
  console.log('DEPLOY env var is missing.');
  console.log('Please specify which contract to deploy or "all" to deploy all contracts.');
}
