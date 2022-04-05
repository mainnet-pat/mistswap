const { weth } = require("../test/utilities")

module.exports = async function ({ ethers, ...hre }) {
    const { deployer } = await ethers.getNamedSigners()
    const { dev } = await getNamedAccounts();

    const funder = deployer;
    const { deployments: { deploy } } = hre

    const chainId = await hre.getChainId()

    
    console.log("----------- KashiPairMediumRiskV1 --------------")
    console.log("Chain:", chainId)
    console.log("Funder Balance:", (await funder.getBalance()).div("1000000000000000000").toString())
    const deployerBalance = await deployer.getBalance()

    //Get Sushi Contract
    const sushiContract = await ethers.getContract("SushiToken")

    //SushiToken Contract Address
    let sushiOwner = sushiContract.address
   
    //Getting/Setting gas price for deployments
    const gasPrice = await funder.provider.getGasPrice()
    const multiplier = hre.network.tags && hre.network.tags.staging ? 2 : 1
    const finalGasPrice = gasPrice.mul(multiplier)
    let gasLimit = 5700000

    console.log("Gasprice:", gasPrice.toString(), " with multiplier ", multiplier, "final", finalGasPrice.toString())


    //Get UniswapV2Factory Contract
    const uniswapV2Factory = await ethers.getContract("UniswapV2Factory")
    
    //Get WETH9 Address
    let wethAddress = weth(chainId);
    if (chainId == "31337" || hre.network.config.forking) {
        wethAddress = (await ethers.getContract("WETH9Mock")).address
    }
    if (!wethAddress) { //No Weth address found
        return
    }



    //Deployment Part 
    const initCodeHash = await uniswapV2Factory.pairCodeHash()
    console.log("InitCodeHash is", initCodeHash)
    console.log("Deployer balance", deployerBalance.toString())
    console.log("Needed", finalGasPrice.mul(gasLimit).toString(), finalGasPrice.toString(), gasLimit.toString())

    //Funding deployer address with funder account
    if (deployerBalance.lt(finalGasPrice.mul(gasLimit))) {
        console.log("Sending native token to fund deployment:", finalGasPrice.mul(gasLimit).sub(deployerBalance).toString())
        let tx = await funder.sendTransaction({
            to: deployer.address,
            value: finalGasPrice.mul(gasLimit).sub(deployerBalance),
            gasPrice: gasPrice.mul(multiplier),
        })
        await tx.wait()
    }
    
    //Deploy BentoBox
    tx = await deploy("BentoBoxV1", {
        from: deployer.address,
        args: [wethAddress],
        log: true,
        deterministicDeployment: false,
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })

    //Getting contracts
    const bentoBoxContract = await ethers.getContract("BentoBoxV1")
    const sushiBarContract = await ethers.getContract("SushiBar");

    //Deploying Sushi Strategy
    tx = await deploy("SushiStrategy", {
        from: deployer.address,
        args: [sushiBarContract.address, sushiContract.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })

    //Deploying KashiPair contract, using BentoBox
    console.log("Deploying KashiPair contract, using BentoBox", bentoBoxContract.address)

    tx = await deploy("KashiPairMediumRiskV1", {
        from: deployer.address,
        args: [bentoBoxContract.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })

    const kashiPairContract = await ethers.getContract("KashiPairMediumRiskV1"); 

   

    //Deploy SushiSwapSwapper
    tx = await deploy("SushiSwapSwapper", {
        from: deployer.address,
        args: [bentoBoxContract.address, uniswapV2Factory.address, initCodeHash],
        log: true,
        deterministicDeployment: false,
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })
    const sushiSwapSwapperContract = await ethers.getContract("SushiSwapSwapper")

    // do not reconfigure
    if (tx.skipped)
        return;

    console.log("Whitelisting Swapper")
    tx = await kashiPairContract.connect(deployer).setSwapper(sushiSwapSwapperContract.address, true, {
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })

    console.log("Setting Swapper fee to dev")
    tx = await kashiPairContract.connect(deployer).setFeeTo(dev, {
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    console.log("Update KashiPair Owner")
    tx = await kashiPairContract.connect(deployer).transferOwnership(sushiOwner, true, false, {
        gasLimit: gasLimit,
        gasPrice: finalGasPrice,
    })
    await tx.wait()
    console.log("----------- KashiPairMediumRiskV1 --------------")

}
module.exports.tags = ["KashiPairMediumRiskV1"]
module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "SushiSwapSwapper",
                               "SushiToken", "SushiBar", "Mocks"]


