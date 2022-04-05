const { MIST_ADDRESS, WNATIVE_ADDRESS, Token } = require("@mistswapdex/sdk")
const { weth } = require("../test/utilities")
const { keccak256, pack } = require('@ethersproject/solidity')

module.exports = async function ({ ethers, ...hre }) {
    const { deployer } = await ethers.getNamedSigners()
    const { deployments: { deploy } } = hre
    const { getContract, getContractAt } = ethers;
    const chainId = await hre.getChainId()
    console.log(chainId, typeof chainId)

    const factory = await getContract("UniswapV2Factory")

    const computePairAddress = async (asset, collateral) => {
        const params = asset.toLowerCase() < collateral.toLowerCase() ?
            [asset, collateral] : [collateral, asset]
        return ethers.utils.getCreate2Address(
            factory.address,
            keccak256(['bytes'], [pack(['address', 'address'], params)]),
            await factory.pairCodeHash()
        )
    }

    const deployKashiPair = async (asset, collateral) => {
        const pairAddress = await computePairAddress(asset, collateral);
        const pair = await getContractAt("UniswapV2Pair", pairAddress);
        console.log(pairAddress)
        const token0 = await pair.token0();

        const oracleData = await ethers.utils.defaultAbiCoder.encode(['address'], [pairAddress])
        const oracleContract = await getContract(token0 == asset ? "SimpleSLPTWAP0Oracle" : "SimpleSLPTWAP1Oracle");
        const oracleAddress = oracleContract.address;
        const kashiData = ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'bytes'],
            [collateral, asset, oracleAddress, oracleData]
        )

        const bentoBoxContract = await getContract("BentoBoxV1");
        const kashiPairContract = await getContract("KashiPairMediumRiskV1");
        const tx = await bentoBoxContract.deploy(kashiPairContract.address, kashiData, false, { gasLimit: 5700000 });
        const kashiPair = (await tx.wait()).events[0].args.cloneAddress;
        console.log("KashiPair deployed", kashiPair);

        // bootstrap oracle with the first call to update price
        await oracleContract.get(oracleData);
    }

    const sushiContract = await getContract("SushiToken");

    let wethAddress = weth(chainId);
    if (chainId == "31337" || hre.network.config.forking) {
        wethAddress = (await ethers.getContract("WETH9Mock")).address
    }

    await deployKashiPair(wethAddress, sushiContract.address); // deploy BCH/MIST
    await deployKashiPair(sushiContract.address, wethAddress); // deploy MIST/BCH
}
module.exports.tags = ["KashiTWAPPairs"]
module.exports.dependencies = ["KashiPairMediumRiskV1", "TWAPOracles"]


