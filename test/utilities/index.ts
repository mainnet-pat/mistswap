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
      1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // Mainnet
      3: "0xc778417E063141139Fce010982780140Aa0cD5Ab", // Ropsten
      4: "0xc778417E063141139Fce010982780140Aa0cD5Ab", // Rinkeby
      5: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // Gorli
      42: "0xd0A1E359811322d97991E03f863a0C30C2cF029C", // Kovan
      56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // Binance
      88: "0xB1f66997A5760428D3a87D68b90BfE0aE64121cC", // TomoChain
      89: "0xB837c744A16A7f133A750254270Dce792dBBAE77", // TomoChain Testnet
      97: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // Binance Testnet
      100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // xDAI
      128: "0x5545153ccfca01fbd7dd11c0b23ba694d9509a6f", // Huobi ECO Chain
      137: "0x084666322d3ee89aAbDBBCd084323c9AF705C7f5", // Matic
      250: "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83", // Fantom
      256: "0x7af326b6351c8a9b8fb8cd205cbe11d4ac5fa836", // Huobi ECO Testnet
      4002: "0xf1277d1ed8ad466beddf92ef448a132661956621", // Fantom Testnet
      1287: "0x1Ff68A3621C17a38E689E5332Efcab9e6bE88b5D", // Moonbeam Testnet
      31337: "", // Hardhat
      43113: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c", // Fuji Testnet (Avalanche)
      43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // Avalanche
      80001: "0x5B67676a984807a212b1c59eBFc9B3568a474F0a", // Mumbai Testnet (MATIC)
      79377087078960: "0xf8456e5e6A225C2C1D74D8C9a4cB2B1d5dc1153b", // Arbitrum Testnet
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
