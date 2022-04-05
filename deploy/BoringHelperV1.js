const { getBigNumber, weth } = require("../test/utilities")

module.exports = async function ({ ethers, getNamedAccounts, deployments, getChainId }) {
  const { deploy } = deployments
  const { getContract } = ethers;

  const { deployer } = await getNamedAccounts()

  const chainId = await getChainId()

  const MasterChef = await getContract("MasterChef")
  const SushiMaker = await getContract("SushiMaker")
  const SushiToken = await getContract("SushiToken")
  const WETH = {address: weth(chainId)}
  const WBTC = {address: ethers.constants.AddressZero}
  const SushiFactory = await getContract("UniswapV2Factory")
  const UniV2Factory = {address: ethers.constants.AddressZero}
  const SushiBar = await getContract("SushiBar")
  const BentoBox = await getContract("BentoBoxV1")

  //Deploy Asset Token ERC20
  await deploy("BoringHelperV1", {
    from: deployer,
    args: [
      MasterChef.address,
      SushiMaker.address,
      SushiToken.address,
      WETH.address,
      WBTC.address,
      SushiFactory.address,
      UniV2Factory.address,
      SushiBar.address,
      BentoBox.address
    ],
    log: true,
    deterministicDeployment: false
  })
}

module.exports.tags = ["BoringHelper"]
module.exports.dependencies = ["MasterChef", "SushiMaker", "SushiToken",
                               "UniswapV2Factory", "SushiBar", "KashiPairMediumRiskV1"]
