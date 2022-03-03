import { ethers } from "hardhat"
const {
  BigNumber,
  utils: { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack },
} = require("ethers")
const { ecsign } = require("ethereumjs-util")
const { BN } = require("bn.js")

const { KashiPair } = require("./kashipair")

export const BASE_TEN = 10
export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"
export const BENTOBOX_MASTER_APPROVAL_TYPEHASH = keccak256(
  toUtf8Bytes("SetMasterContractApproval(string warning,address user,address masterContract,bool approved,uint256 nonce)")
)

const contracts = {}


export function encodePrice(reserve0, reserve1) {
  return [reserve1.mul(getBigNumber(1)).div(reserve0), reserve0.mul(getBigNumber(1)).div(reserve1)]
}

export function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder()
  return abi.encode(types, values)
}

export async function prepare(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract] = await ethers.getContractFactory(contract)
  }
  thisObject.signers = await ethers.getSigners()
  thisObject.alice = thisObject.signers[0]
  thisObject.bob = thisObject.signers[1]
  thisObject.carol = thisObject.signers[2]
  thisObject.dev = thisObject.signers[3]
  thisObject.alicePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  thisObject.bobPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  thisObject.carolPrivateKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
}

export async function deploy(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract[0]] = await contract[1].deploy(...(contract[2] || []))
    await thisObject[contract[0]].deployed()
  }
}

function addContract(thisObject, name, contract) {
  thisObject[name] = contract
  contract.thisName = name
  contracts[contract.address] = contract
}

export async function createSLP(thisObject, name, tokenA, tokenB, amount) {
  const createPairTx = await thisObject.factory.createPair(tokenA.address, tokenB.address)

  const _pair = (await createPairTx.wait()).events[0].args.pair

  thisObject[name] = await thisObject.UniswapV2Pair.attach(_pair)

  await tokenA.transfer(thisObject[name].address, amount)
  await tokenB.transfer(thisObject[name].address, amount)

  await thisObject[name].mint(thisObject.alice.address)
}


export function weth(chainId) {
  return {
      10000: "0x3743eC0673453E5009310C727Ba4eaF7b3a1cc04", // Mainnet
      31337: "", // Hardhat

  }[chainId.toString()]
}

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(BASE_TEN).pow(decimals))
}

export * from "./time"

export function roundBN(number) {
  return new BN(number.toString()).divRound(new BN("10000000000000000")).toString()
}

export async function setMasterContractApproval(bentoBox, from, user, privateKey, masterContractAddress, approved, fallback = null) {
  if (!fallback) {
      const nonce = await bentoBox.nonces(user.address)

      const digest = getBentoBoxApprovalDigest(bentoBox, user, masterContractAddress, approved, nonce, user.provider._network.chainId)
      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(privateKey.replace("0x", ""), "hex"))

      return await bentoBox.connect(user).setMasterContractApproval(from.address, masterContractAddress, approved, v, r, s)
  }
  return await bentoBox
      .connect(user)
      .setMasterContractApproval(
          from.address,
          masterContractAddress,
          approved,
          0,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000"
      )
}
function getBentoBoxApprovalDigest(bentoBox, user, masterContractAddress, approved, nonce, chainId = 1) {
  const DOMAIN_SEPARATOR = getBentoBoxDomainSeparator(bentoBox.address, chainId)
  const msg = defaultAbiCoder.encode(
      ["bytes32", "bytes32", "address", "address", "bool", "uint256"],
      [
          BENTOBOX_MASTER_APPROVAL_TYPEHASH,
          keccak256(toUtf8Bytes(approved ? "Give FULL access to funds in (and approved to) BentoBox?" : "Revoke access to BentoBox?")),
          user.address,
          masterContractAddress,
          approved,
          nonce,
      ]
  )
  const pack = solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", DOMAIN_SEPARATOR, keccak256(msg)])
  return keccak256(pack)
}
function getBentoBoxDomainSeparator(address, chainId) {
  return keccak256(
      defaultAbiCoder.encode(
          ["bytes32", "bytes32", "uint256", "address"],
          [keccak256(toUtf8Bytes("EIP712Domain(string name,uint256 chainId,address verifyingContract)")), keccak256(toUtf8Bytes("BentoBox V1")), chainId, address]
      )
  )
}
export function sansBorrowFee(amount) {
  return amount.mul(BigNumber.from(2000)).div(BigNumber.from(2001))
}
export function sansSafetyAmount(amount) {
  return amount.sub(BigNumber.from(100000))
}
