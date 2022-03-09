
module.exports = async function ({ ethers, ...hre }) {
  const [ deployer, funder ] = await ethers.getSigners()
  
  //Getting/Setting gas price for deployments
  const gasPrice = await funder.provider.getGasPrice()
  const multiplier = hre.network.tags && hre.network.tags.staging ? 2 : 1
  const finalGasPrice = gasPrice.mul(multiplier)
  let gasLimit = 5700000

  //Deploy SimpleSLPTWAP0Oracle
  console.log("Deploying SimpleSLPTWAP0Oracle contract")
  await hre.deployments.deploy("SimpleSLPTWAP0Oracle", {
      from: deployer.address,
      args: [],
      log: true,
      deterministicDeployment: false,
      gasLimit: gasLimit,
      gasPrice: finalGasPrice,
  })

  //Deploy SimpleSLPTWAP1Oracle
  console.log("Deploying SimpleSLPTWAP1Oracle contract")
  await hre.deployments.deploy("SimpleSLPTWAP1Oracle", {
      from: deployer.address,
      args: [],
      log: true,
      deterministicDeployment: false,
      gasLimit: gasLimit,
      gasPrice: finalGasPrice,
  })


}

  module.exports.tags = ["TWAPOracles"]
  module.exports.dependencies = ["UniswapV2Factory", "Mocks"];
