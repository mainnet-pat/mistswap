const { weth, getBigNumber } = require("../test/utilities")

module.exports = async function ({ ethers, ...hre }) {
    const [ deployer, funder ] = await ethers.getSigners()

    const chainId = await hre.getChainId()

    // console.log("Chain:", chainId)
    // console.log("Balance:", (await funder.getBalance()).div("1000000000000000000").toString())
    const deployerBalance = await deployer.getBalance()

    //Get Sushi Contract
    const sushi = await ethers.getContract("SushiToken")

    //SushiToken Contract Address
    let sushiOwner = sushi.address
   

    let gasPrice = await funder.provider.getGasPrice()
    let multiplier = hre.network.tags && hre.network.tags.staging ? 2 : 1
    let finalGasPrice = gasPrice.mul(multiplier)
    gasLimit = 5700000
    // console.log("Gasprice:", gasPrice.toString(), " with multiplier ", multiplier, "final", finalGasPrice.toString())


     //Get UniswapV2Factory Contract
    const uniswapV2Factory = await ethers.getContract("UniswapV2Factory")
    
    //Get WETH9 Address
    let wethAddress = weth(chainId);
    if (chainId == "31337" || hre.network.config.forking) {
        wethAddress = (await deployments.get("WETH9Mock")).address
    }

    if (!wethAddress) { //No Weth address found
        return
    }



    //Deployment Part 


    const initCodeHash = await uniswapV2Factory.pairCodeHash()
    // console.log("InitCodeHash is", initCodeHash)
    // console.log("Deployer balance", deployerBalance.toString())
    // console.log("Needed", finalGasPrice.mul(gasLimit).toString(), finalGasPrice.toString(), gasLimit.toString())

    if (deployerBalance.lt(finalGasPrice.mul(gasLimit))) {
        // console.log("Sending native token to fund deployment:", finalGasPrice.mul(gasLimit).sub(deployerBalance).toString())
        let tx = await funder.sendTransaction({
            to: deployer.address,
            value: finalGasPrice.mul(gasLimit).sub(deployerBalance),
            gasPrice: gasPrice.mul(multiplier),
        })
        await tx.wait()
    }
    
    //Deploy BentoBox
    const BentoBox = await ethers.getContractFactory("BentoBoxV1");
    const bentoBox = await BentoBox.deploy(wethAddress)

    // console.log("Deploying KashiPair contract, using BentoBox", bentoBox.address)

    tx = await hre.deployments.deploy("KashiPairMediumRiskV1", {
        from: deployer.address,
        args: [bentoBox.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })

    const kashipair = (await ethers.getContractFactory("KashiPairMediumRiskV1")).attach(
        (await deployments.get("KashiPairMediumRiskV1")).address
    )

    //Deploy SimpleSLPTWAP0Oracle
    console.log("Deploying SimpleSLPTWAP0Oracle contract")
    tx = await hre.deployments.deploy("SimpleSLPTWAP0Oracle", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying SimpleSLPTWAP1Oracle contract")
    tx = await hre.deployments.deploy("SimpleSLPTWAP1Oracle", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })


    //Deploy SushiSwapSwapper
    tx = await hre.deployments.deploy("SushiSwapSwapper", {
        from: deployer.address,
        args: [bentoBox.address, uniswapV2Factory.address, initCodeHash],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })
    const sushiSwapSwapper = (await deployments.get("SushiSwapSwapper"))

    //console.log("Whitelisting Swapper")
    tx = await kashipair.connect(deployer).setSwapper(sushiSwapSwapper.address, true, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    //console.log("Update KashiPair Owner")
    tx = await kashipair.connect(deployer).transferOwnership(sushiOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()


}
module.exports.tags = ["KashiPairMediumRiskV1"]
module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "SushiSwapSwapper" ,"SushiToken", "WETH9Mock"]


