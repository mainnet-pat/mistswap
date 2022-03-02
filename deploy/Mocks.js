const { getBigNumber } = require("../test/utilities")

module.exports = async function ({ ethers, getNamedAccounts, deployments }) {
  const { deploy } = deployments
  const { getContract } = ethers;

  const { deployer } = await getNamedAccounts()
  const fakeUserAddress = process.env.USER_ADDRESS //Address used to simulate users locally
  const pairAddress = process.env.PAIR_ADDRESS //Address of pair created locally
  
  //Deploy WETH9Mock ERC20
  await deploy("WETH9Mock", {
    from: deployer,
    log: true,
  })

  //Deploy Asset Token ERC20
  await deploy("AssetToken", {
    from: deployer,
    log: true,
    deterministicDeployment: false
  })
  //Deploy Collateral Token ERC20
  await deploy("CollateralToken", {
    from: deployer,
    log: true,
    deterministicDeployment: false
  })

  const AssetToken = await getContract("AssetToken")
  const CollateralToken = await getContract("CollateralToken")

  //Mint to test address
  AssetToken.mint(fakeUserAddress, getBigNumber(1000)); //Minting 1000 assets to user
  CollateralToken.mint(fakeUserAddress, getBigNumber(3000)); //Minting 3000 collateral to user
  
  //Mint to pair address
  AssetToken.mint(pairAddress, getBigNumber(1000)); //Minting 1000 assets to user
  CollateralToken.mint(pairAddress, getBigNumber(3000)); //Minting 3000 collateral to user
    
  //Mint to uniswapPair Contract
  const UniswapV2Pair = await getContract("UniswapV2Pair")
  AssetToken.mint(UniswapV2Pair.address, getBigNumber(15000)); //Minting 15000 assets to uniswap pair contract
  CollateralToken.mint(UniswapV2Pair.address, getBigNumber(5000)); //Minting 5000 collateral to uniswap pair contract


}

module.exports.skip = ({ getChainId }) =>
  new Promise(async (resolve, reject) => {
    try {
      const chainId = await getChainId()
      resolve(chainId !== "31337")
    } catch (error) {
      reject(error)
    }
  })

  module.exports.tags = ["Mocks"]
  module.exports.dependencies = ["UniswapV2Factory","UniswapV2Pair"]
